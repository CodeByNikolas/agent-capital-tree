"use client";

import { capitalControllerAbi, financeRoles, narrowPolicy, type Capability, type Policy as SdkPolicy } from "@agent-capital-tree/sdk";
import {
  createPublicClient,
  createWalletClient,
  custom,
  erc20Abi,
  getAddress,
  isAddress,
  parseEventLogs,
  parseAbiItem,
  parseUnits,
  toHex,
  zeroAddress,
  type Address,
  type Hash,
} from "viem";
import { sepolia } from "viem/chains";
import { purchaseOnce } from "./purchase-once";
import { useRef, useState } from "react";
import type { DashboardActions, DashboardData, Permission, Policy, PolicyDraft } from "@/lib/dashboard-types";
import type { PublicDeployment } from "@/lib/deployment";
import {
  encodePaymentHeader,
  USDC_SEPOLIA,
  X402_VERSION,
  type X402Challenge,
  type X402PurchaseResult,
} from "@/lib/x402";

export type WalletActionStage = "simulating" | "awaiting-wallet" | "confirming" | "confirmed" | "error";

export interface WalletActionNotice {
  stage: WalletActionStage;
  label: string;
  message: string;
  transactionHash?: Hash;
}

const permissionCapabilities: Record<Permission, Capability> = {
  delegate: "delegate",
  swap: "swap",
  "manage-liquidity": "lpManage",
  "collect-fees": "collectFees",
  "exit-liquidity": "exit",
  pay: "pay",
  restrict: "restrict",
  reclaim: "reclaim",
};

const permissionBits: Record<Permission, bigint> = {
  delegate: financeRoles.delegate,
  swap: financeRoles.swap,
  "manage-liquidity": financeRoles.lpManage,
  "collect-fees": financeRoles.collectFees,
  "exit-liquidity": financeRoles.exit,
  pay: financeRoles.pay,
  restrict: financeRoles.restrict,
  reclaim: financeRoles.reclaim,
};

const zeroPoolId = `0x${"0".repeat(64)}` as const;
const demoQuoteAbi = [
  parseAbiItem("function claimed(address account) view returns (bool)"),
  parseAbiItem("function mint()"),
];
const ownerEmergencyClosePositionAbi = [
  parseAbiItem("function ownerEmergencyClosePosition(uint256 nodeId, uint128[2] minAmounts, uint256 deadline)"),
];
const vaultPositionAbi = [
  parseAbiItem("function positionTokenId() view returns (uint256)"),
  parseAbiItem("function positionLiquidity() view returns (uint128)"),
];
function policyToSdk(policy: Policy, tokens: readonly [Address, Address]): SdkPolicy {
  const capabilities = policy.permissions.reduce((mask, permission) => mask | permissionBits[permission], 0n);
  const tokenMask = tokens.reduce((mask, token, index) =>
    mask | (policy.allowedTokens.some((symbol) => symbol === policy.maxActionAmounts[index]?.symbol) ? 1 << index : 0), 0);

  return {
    capabilities,
    maxAmounts: [BigInt(policy.maxActionAmounts[0]?.rawAmount ?? "0"), BigInt(policy.maxActionAmounts[1]?.rawAmount ?? "0")],
    expiry: BigInt(Math.floor(Date.parse(policy.expiresAt) / 1000)),
    tokenMask,
    poolId: policy.poolId,
  };
}

function makePolicy(draft: PolicyDraft, decimals: readonly [number, number], deployment: PublicDeployment) {
  const expiryMilliseconds = Date.parse(`${draft.expiresAt}T23:59:59.000Z`);
  if (!Number.isFinite(expiryMilliseconds) || expiryMilliseconds <= Date.now()) {
    throw new Error("Choose a future policy expiry date.");
  }
  const expiry = BigInt(Math.floor(expiryMilliseconds / 1000));
  if (expiry > (1n << 64n) - 1n) throw new Error("The policy expiry exceeds uint64.");

  const maxAmounts: [bigint, bigint] = [
    parseUnits(draft.maxAmounts[0].trim() || "0", decimals[0]),
    parseUnits(draft.maxAmounts[1].trim() || "0", decimals[1]),
  ];
  const tokenMask = (draft.allowedTokens[0] ? 1 : 0) | (draft.allowedTokens[1] ? 2 : 0);
  for (const index of [0, 1] as const) {
    if (!draft.allowedTokens[index] && maxAmounts[index] !== 0n) {
      throw new Error("A token maximum must be zero when that token is not allowed.");
    }
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(draft.poolId)) throw new Error("The pool ID is invalid.");
  const requestsPoolCapability = draft.permissions.some((permission) =>
    ["swap", "manage-liquidity", "collect-fees", "exit-liquidity"].includes(permission),
  );
  if (draft.permissions.includes("pay") && !deployment.paymentsSupported) {
    throw new Error("Companion payment permissions require the USDC deployment.");
  }
  if (requestsPoolCapability && !deployment.poolConfigured) {
    throw new Error("Swap and LP permissions stay unavailable until the USDC pool is initialized and seeded.");
  }
  if (draft.poolId !== zeroPoolId && draft.poolId !== deployment.poolId) {
    throw new Error("The mandate can only use the pool recorded in the public deployment manifest.");
  }

  const capabilities = draft.permissions.reduce((mask, permission) => mask | permissionBits[permission], 0n);
  return { capabilities, maxAmounts, expiry, tokenMask, poolId: draft.poolId } as const;
}

function assertPolicyIsNarrower(parent: SdkPolicy, next: ReturnType<typeof makePolicy>, tokens: readonly [Address, Address]) {
  if (next.poolId !== zeroPoolId && next.poolId !== parent.poolId) {
    throw new Error("A child policy cannot change the configured pool.");
  }
  const permissions = (Object.keys(permissionCapabilities) as Permission[])
    .filter((permission) => (next.capabilities & permissionBits[permission]) !== 0n)
    .map((permission) => permissionCapabilities[permission]);
  const candidate = narrowPolicy(parent, {
    capabilities: permissions,
    expiresAt: Number(next.expiry),
    allowedAssets: tokens.filter((_, index) => (next.tokenMask & (1 << index)) !== 0),
    maxPerAction: {
      [tokens[0]]: next.maxAmounts[0].toString(),
      [tokens[1]]: next.maxAmounts[1].toString(),
    },
  }, tokens);
  if (
    candidate.capabilities !== next.capabilities || candidate.tokenMask !== next.tokenMask ||
    candidate.maxAmounts[0] !== next.maxAmounts[0] || candidate.maxAmounts[1] !== next.maxAmounts[1] ||
    candidate.expiry !== next.expiry
  ) {
    throw new Error("The requested policy would expand an existing mandate.");
  }
}

function errorMessage(cause: unknown): string {
  if (cause && typeof cause === "object" && "shortMessage" in cause && typeof cause.shortMessage === "string") {
    return cause.shortMessage;
  }
  return cause instanceof Error ? cause.message : "The wallet action failed.";
}

export function useWalletActions({
  data,
  deployment,
  address,
  chainId,
  onConfirmed,
}: {
  data: DashboardData;
  deployment: PublicDeployment;
  address: Address | null;
  chainId: number | null;
  onConfirmed: () => void;
}): { actions: DashboardActions; notice: WalletActionNotice | null } {
  const [notice, setNotice] = useState<WalletActionNotice | null>(null);
  const busy = useRef(false);

  async function createContext() {
    if (!deployment.contractsConfigured || !deployment.controllerAddress || !deployment.tokenAddresses) {
      throw new Error("Contract deployment is still pending in the public manifest.");
    }
    if (!address) throw new Error("Connect the wallet that owns this action.");
    if (!window.ethereum) throw new Error("No injected wallet was found.");

    const walletClient = createWalletClient({ account: address, chain: sepolia, transport: custom(window.ethereum) });
    const publicClient = createPublicClient({ chain: sepolia, transport: custom(window.ethereum) });
    if (await walletClient.getChainId() !== sepolia.id || chainId !== sepolia.id) {
      throw new Error("Switch the connected wallet to Ethereum Sepolia before continuing.");
    }
    const activeAccounts = await walletClient.getAddresses();
    if (activeAccounts[0]?.toLowerCase() !== address.toLowerCase()) {
      throw new Error("The connected wallet account changed. Reconnect and retry.");
    }
    const [controllerCode, ...tokenCodes] = await Promise.all([
      publicClient.getCode({ address: deployment.controllerAddress }),
      ...deployment.tokenAddresses.map((tokenAddress) => publicClient.getCode({ address: tokenAddress })),
    ]);
    if (!controllerCode || controllerCode === "0x") throw new Error("No controller bytecode exists at the configured address.");
    if (tokenCodes.some((code) => !code || code === "0x")) throw new Error("A configured token has no deployed bytecode.");

    return {
      account: address,
      controller: deployment.controllerAddress,
      tokens: deployment.tokenAddresses,
      publicClient,
      walletClient,
    };
  }

  async function readTokenDecimals(context: Awaited<ReturnType<typeof createContext>>) {
    const values = await Promise.all(context.tokens.map((tokenAddress) => context.publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "decimals",
    })));
    return values as unknown as readonly [number, number];
  }

  async function requireOwner(context: Awaited<ReturnType<typeof createContext>>, rootId: string) {
    const owner = await context.publicClient.readContract({
      address: context.controller,
      abi: capitalControllerAbi,
      functionName: "rootOwner",
      args: [BigInt(rootId)],
    });
    if (owner.toLowerCase() !== context.account.toLowerCase()) {
      throw new Error("The connected account is not the owner recorded for this root.");
    }
  }

  async function requireNodeAgent(context: Awaited<ReturnType<typeof createContext>>, nodeId: string) {
    const node = await context.publicClient.readContract({
      address: context.controller,
      abi: capitalControllerAbi,
      functionName: "getNode",
      args: [BigInt(nodeId)],
    });
    if (node.agent.toLowerCase() !== context.account.toLowerCase()) {
      throw new Error("The connected account is not the agent bound to this vault.");
    }
  }

  async function submitWithContext<T>(
    context: Awaited<ReturnType<typeof createContext>>,
    label: string,
    submit: (
      context: Awaited<ReturnType<typeof createContext>>,
      awaitingWallet: () => void,
    ) => Promise<Hash>,
    refresh = true,
  ): Promise<T> {
    setNotice({ stage: "simulating", label, message: "Checking the exact transaction against Sepolia." });
    const hash = await submit(context, () => setNotice({
      stage: "awaiting-wallet",
      label,
      message: "Review and approve this transaction in your wallet.",
    }));
    setNotice({ stage: "confirming", label, message: "Transaction sent; waiting for a receipt.", transactionHash: hash });
    const receipt = await context.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("The transaction reverted before confirmation.");
    setNotice({
      stage: "confirmed",
      label,
      message: "Confirmed on Ethereum Sepolia.",
      transactionHash: hash,
    });
    if (refresh) onConfirmed();
    return receipt as T;
  }

  async function transact<T>(
    label: string,
    submit: (
      context: Awaited<ReturnType<typeof createContext>>,
      awaitingWallet: () => void,
    ) => Promise<Hash>,
    refresh = true,
  ): Promise<T> {
    if (busy.current) throw new Error("Another wallet action is still in progress.");
    busy.current = true;
    try {
      const context = await createContext();
      return await submitWithContext<T>(context, label, submit, refresh);
    } catch (cause) {
      const message = errorMessage(cause);
      setNotice({ stage: "error", label, message });
      throw cause;
    } finally {
      busy.current = false;
    }
  }

  const actions: DashboardActions = {
    async completeRootSetup(label, operatorInput, budgetRaw, draft) {
      if (busy.current) throw new Error("Setup is already running.");
      if (deployment.recoveryOnly) throw new Error("New setup requires the current Kanoki deployment.");
      if (!/^[a-z][a-z0-9-]{0,30}$/.test(label) || !isAddress(operatorInput) || operatorInput === zeroAddress || !/^[1-9]\d{0,5}$/.test(budgetRaw) || BigInt(budgetRaw) > 100000n) throw new Error("Invalid prepared setup link.");
      busy.current = true;
      try {
        const context = await createContext();
        const operator = getAddress(operatorInput);
        if (operator.toLowerCase() === context.account.toLowerCase()) throw new Error("The local agent must be separate from your owner wallet.");
        const policy = makePolicy(draft, await readTokenDecimals(context), deployment);
        const journalKey = `kanoki-setup:11155111:${context.controller.toLowerCase()}:${context.account.toLowerCase()}:${label}`;
        const fingerprint = JSON.stringify({ operator, budgetRaw });
        const saved = localStorage.getItem(journalKey);
        const journal: { fingerprint: string; pendingHash?: Hash; submitting?: boolean; funded?: boolean; gasFunded?: boolean } = saved ? JSON.parse(saved) : { fingerprint };
        if (journal.fingerprint !== fingerprint) throw new Error("This setup already started with different parameters. Reopen its original link; do not create a replacement.");
        const persist = () => localStorage.setItem(journalKey, JSON.stringify(journal));
        persist(); // Prove durable storage works before the first wallet request.
        if (journal.submitting && !journal.pendingHash) throw new Error("A previous wallet request has an unknown outcome. Check your wallet activity before any retry; no replacement transaction will be sent.");
        const reconcile = async () => {
          if (!journal.pendingHash) return;
          setNotice({ stage: "confirming", label: "Resume wallet setup", message: "Checking the previously submitted transaction. No replacement will be sent.", transactionHash: journal.pendingHash });
          const receipt = await context.publicClient.waitForTransactionReceipt({ hash: journal.pendingHash });
          delete journal.pendingHash; delete journal.submitting; persist();
          if (receipt.status !== "success") throw new Error("The previous setup transaction reverted. Resume setup to retry that step.");
        };
        await reconcile();
        const send = async (label: string, submit: () => Promise<Hash>) => {
          const accounts = await context.walletClient.getAddresses();
          if (accounts[0]?.toLowerCase() !== context.account.toLowerCase() || await context.walletClient.getChainId() !== sepolia.id) throw new Error("Wallet account or network changed; setup stopped.");
          setNotice({ stage: "awaiting-wallet", label, message: "Confirm this setup transaction in your wallet. Remaining steps continue automatically." });
          journal.submitting = true; persist();
          try { journal.pendingHash = await submit(); persist(); }
          catch (error) {
            // Only a positively identified user rejection proves no broadcast.
            let cause: unknown = error;
            for (let depth = 0; depth < 8 && cause && typeof cause === "object"; depth++) {
              if (("code" in cause && cause.code === 4001) || ("name" in cause && cause.name === "UserRejectedRequestError")) { delete journal.submitting; persist(); break; }
              cause = "cause" in cause ? cause.cause : null;
            }
            throw error;
          }
          await reconcile();
        };
        const contract = { address: context.controller, abi: capitalControllerAbi } as const;
        const next = await context.publicClient.readContract({ ...contract, functionName: "nextNodeId" });
        if (next > 513n) throw new Error("Vault directory exceeds the supported lookup size.");
        let root: Awaited<ReturnType<typeof readNode>> | undefined;
        async function readNode(id: bigint) { return context.publicClient.readContract({ ...contract, functionName: "getNode", args: [id] }); }
        for (let id = 1n; id < next; id++) {
          const node = await readNode(id);
          if (node.parentId === 0n && node.label === label) { root = node; break; }
        }
        if (!root) {
          const { request } = await context.publicClient.simulateContract({ ...contract, account: context.account, functionName: "createRoot", args: [label, policy] });
          await send("1/4 · Create your vault", () => context.walletClient.writeContract(request));
          const end = await context.publicClient.readContract({ ...contract, functionName: "nextNodeId" });
          for (let id = next; id < end; id++) { const node = await readNode(id); if (node.parentId === 0n && node.label === label) { root = node; break; } }
        }
        if (!root) throw new Error("Confirmed root could not be found. Resume this same setup; do not choose a new name.");
        if (root.revoked) throw new Error("This vault is permanently revoked. Setup stopped without funding.");
        await requireOwner(context, String(root.id));
        const bound = await context.publicClient.readContract({ ...contract, functionName: "rootOperator", args: [root.id] });
        if (bound !== zeroAddress && bound.toLowerCase() !== operator.toLowerCase()) throw new Error("A different operator is already bound. Setup will not replace it.");
        if (bound === zeroAddress) {
          const { request } = await context.publicClient.simulateContract({ ...contract, account: context.account, functionName: "setRootOperator", args: [root.id, operator, root.policy] });
          await send("2/4 · Authorize your local Kanoki agent", () => context.walletClient.writeContract(request));
        }
        const missingFunding = async () => {
          const blockNumber = await context.publicClient.getBlockNumber();
          const ids = await context.publicClient.readContract({ ...contract, functionName: "getRootNodeIds", args: [root!.id], blockNumber });
          let total = 0n;
          for (const id of ids) { const node = await context.publicClient.readContract({ ...contract, functionName: "getNode", args: [id], blockNumber }); total += await context.publicClient.readContract({ address: context.tokens[0], abi: erc20Abi, functionName: "balanceOf", args: [node.vault], blockNumber }); }
          return BigInt(budgetRaw) > total ? BigInt(budgetRaw) - total : 0n;
        };
        let missing = await missingFunding();
        if (!journal.funded && missing > 0n) {
          const allowance = await context.publicClient.readContract({ address: context.tokens[0], abi: erc20Abi, functionName: "allowance", args: [context.account, context.controller] });
          if (allowance < missing) {
            const { request } = await context.publicClient.simulateContract({ address: context.tokens[0], abi: erc20Abi, account: context.account, functionName: "approve", args: [context.controller, missing] });
            await send("3/4 · Approve the exact USDC deposit", () => context.walletClient.writeContract(request));
          }
          missing = await missingFunding();
          if (missing > 0n) {
            const { request } = await context.publicClient.simulateContract({ ...contract, account: context.account, functionName: "fundRoot", args: [root.id, [missing, 0n]] });
            await send("3/4 · Fund your shared vault budget", () => context.walletClient.writeContract(request));
          }
        }
        journal.funded = true; persist();
        const gasBalance = await context.publicClient.getBalance({ address: operator });
        const reserve = 10_000_000_000_000_000n;
        if (!journal.gasFunded && gasBalance < reserve) {
          const value = reserve - gasBalance;
          const gas = await context.publicClient.estimateGas({ account: context.account, to: operator, value });
          await send("4/4 · Fund the agent's Sepolia gas reserve", () => context.walletClient.sendTransaction({ account: context.account, chain: sepolia, to: operator, value, gas }));
        }
        journal.gasFunded = true; persist();
        setNotice({ stage: "confirmed", label: "Kanoki setup completed", message: "Return to your chat. Kanoki recognizes this vault automatically and checks its current balance and gas. Completed deposits are never repeated." });
        return root.vault;
      } catch (cause) {
        setNotice({ stage: "error", label: "Resume Kanoki setup", message: errorMessage(cause) });
        throw cause;
      } finally { busy.current = false; }
    },
    async claimDemoQuote() {
      if (busy.current) throw new Error("Another wallet action is still in progress.");
      const quoteAddress = deployment.demoQuoteAddress;
      if (!quoteAddress || !deployment.tokenAddresses || quoteAddress.toLowerCase() !== deployment.tokenAddresses[1].toLowerCase()) {
        throw new Error("The valueless DEMO-USD quote token is not configured at token index 1.");
      }
      busy.current = true;
      try {
        const context = await createContext();
        if (context.tokens[1].toLowerCase() !== quoteAddress.toLowerCase() || context.tokens[0].toLowerCase() === quoteAddress.toLowerCase()) {
          throw new Error("DEMO-USD must be isolated at token index 1; USDC cannot be minted here.");
        }
        const alreadyClaimed = await context.publicClient.readContract({
          address: quoteAddress,
          abi: demoQuoteAbi,
          functionName: "claimed",
          args: [context.account],
        });
        if (alreadyClaimed) {
          setNotice({ stage: "confirmed", label: "Get DEMO-USD", message: "This wallet has already claimed its one-time DEMO-USD amount; no transaction was sent." });
          return;
        }
        await submitWithContext(context, "Get DEMO-USD", async (tx, awaitingWallet) => {
          const { request } = await tx.publicClient.simulateContract({
            account: tx.account,
            address: quoteAddress,
            abi: demoQuoteAbi,
            functionName: "mint",
            args: [],
          });
          awaitingWallet();
          return tx.walletClient.writeContract(request);
        });
      } catch (cause) {
        const message = errorMessage(cause);
        setNotice({ stage: "error", label: "Get DEMO-USD", message });
        throw cause;
      } finally {
        busy.current = false;
      }
    },

    async createRoot(label, draft) {
      if (deployment.recoveryOnly) throw new Error("This deployment is only for existing-vault recovery. Create new roots on the current canonical app.");
      const normalizedLabel = label.trim().toLowerCase();
      if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(normalizedLabel)) {
        throw new Error("Use a lowercase ENS label with letters, numbers, or interior hyphens.");
      }
      const receipt = await transact<Awaited<ReturnType<Awaited<ReturnType<typeof createContext>>["publicClient"]["waitForTransactionReceipt"]>>>(
        "Create root vault",
        async (context, awaitingWallet) => {
          const policy = makePolicy(draft, await readTokenDecimals(context), deployment);
          if (deployment.namespaceExpiry && policy.expiry > BigInt(deployment.namespaceExpiry)) {
            throw new Error("The policy expiry exceeds the registered ENS namespace expiry.");
          }
          const { request } = await context.publicClient.simulateContract({
            account: context.account,
            address: context.controller,
            abi: capitalControllerAbi,
            functionName: "createRoot",
            args: [normalizedLabel, policy],
          });
          awaitingWallet();
          return context.walletClient.writeContract(request);
        },
        false,
      );
      const created = parseEventLogs({ abi: capitalControllerAbi, logs: receipt.logs, eventName: "NodeCreated" })
        .find((event) => event.args.parentId === 0n);
      if (!created) throw new Error("The confirmed receipt did not include a root creation event.");
      return created.args.vault;
    },

    async fundRoot(rootId, amountInputs, demoTotalBudgetRaw) {
      if (busy.current) throw new Error("Another wallet action is still in progress.");
      busy.current = true;
      try {
        const context = await createContext();
        await requireOwner(context, rootId);
        const decimals = await readTokenDecimals(context);
        const amounts: [bigint, bigint] = [
          parseUnits(amountInputs[0].trim() || "0", decimals[0]),
          parseUnits(amountInputs[1].trim() || "0", decimals[1]),
        ];
        if (amounts[0] === 0n && amounts[1] === 0n) throw new Error("Enter a positive amount for at least one token.");

        const checkDemoFunding = async () => {
          if (demoTotalBudgetRaw === undefined) return; // The demo cap is NOT a general contract balance limit.
          if (!/^[1-9]\d{0,5}$/.test(demoTotalBudgetRaw) || BigInt(demoTotalBudgetRaw) > 100000n) throw new Error("Demo total budget must be at most 100000 raw units = 0.10 Test-USDC.");
          const blockNumber = await context.publicClient.getBlockNumber();
          const ids = await context.publicClient.readContract({ address: context.controller, abi: capitalControllerAbi, functionName: "getRootNodeIds", args: [BigInt(rootId)], blockNumber });
          let total = 0n;
          for (const id of ids) {
            const node = await context.publicClient.readContract({ address: context.controller, abi: capitalControllerAbi, functionName: "getNode", args: [id], blockNumber });
            total += await context.publicClient.readContract({ address: context.tokens[0], abi: erc20Abi, functionName: "balanceOf", args: [node.vault], blockNumber });
          }
          const missing = BigInt(demoTotalBudgetRaw) > total ? BigInt(demoTotalBudgetRaw) - total : 0n;
          if (missing === 0n) throw new Error("This tree is already funded to the requested demo total. No additional deposit or approval is needed.");
          if (amounts[1] !== 0n || amounts[0] > missing) throw new Error(`Only ${missing} raw Test-USDC units are still missing across this tree. Do not fund the budget again for each child.`);
        };
        await checkDemoFunding();

        for (const index of [0, 1] as const) {
          if (amounts[index] === 0n) continue;
          const tokenAddress = context.tokens[index];
          const allowance = await context.publicClient.readContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: "allowance",
            args: [context.account, context.controller],
          });
          if (allowance >= amounts[index]) continue;
          await submitWithContext(context, `Approve ${index === 0 ? "token 1" : "token 2"}`, async (tx, awaitingWallet) => {
            const { request } = await tx.publicClient.simulateContract({
              account: tx.account,
              address: tokenAddress,
              abi: erc20Abi,
              functionName: "approve",
              args: [tx.controller, amounts[index]],
            });
            awaitingWallet();
            return tx.walletClient.writeContract(request);
          }, false);
        }

        await submitWithContext(context, "Fund root vault", async (tx, awaitingWallet) => {
          await checkDemoFunding(); // Re-read after any wallet approval; do not reuse stale balances.
          const { request } = await tx.publicClient.simulateContract({
            account: tx.account,
            address: tx.controller,
            abi: capitalControllerAbi,
            functionName: "fundRoot",
            args: [BigInt(rootId), amounts],
          });
          awaitingWallet();
          return tx.walletClient.writeContract(request);
        });
      } catch (cause) {
        setNotice({ stage: "error", label: "Fund root vault", message: errorMessage(cause) });
        throw cause;
      } finally {
        busy.current = false;
      }
    },

    async fundOperatorGas(rootId, operatorInput) {
      if (!isAddress(operatorInput)) throw new Error("Expected the prepared local agent address.");
      const operator = getAddress(operatorInput);
      await transact("Top up local agent gas", async (context, awaitingWallet) => {
        await requireOwner(context, rootId);
        const bound = await context.publicClient.readContract({ address: context.controller, abi: capitalControllerAbi, functionName: "rootOperator", args: [BigInt(rootId)] });
        if (bound.toLowerCase() !== operator.toLowerCase() || operator === zeroAddress) throw new Error("Authorize this exact local agent for this root before funding its gas.");
        const balance = await context.publicClient.getBalance({ address: operator });
        const reserve = 10_000_000_000_000_000n; // 0.01 native Sepolia ETH; not a fee guarantee.
        if (balance >= reserve) throw new Error("The local agent already has at least 0.01 Sepolia ETH. No top-up is needed.");
        const value = reserve - balance;
        const gas = await context.publicClient.estimateGas({ account: context.account, to: operator, value });
        awaitingWallet();
        return context.walletClient.sendTransaction({ account: context.account, chain: sepolia, to: operator, value, gas });
      });
    },

    async setRootOperator(rootId, operatorInput, draft) {
      const operator = isAddress(operatorInput.trim()) ? getAddress(operatorInput.trim()) : null;
      if (!operator || operator === zeroAddress) throw new Error("Enter a valid nonzero Sepolia operator address.");
      await transact("Set root operator", async (context, awaitingWallet) => {
        await requireOwner(context, rootId);
        const policy = makePolicy(draft, await readTokenDecimals(context), deployment);
        if (deployment.namespaceExpiry && policy.expiry > BigInt(deployment.namespaceExpiry)) {
          throw new Error("The operator policy exceeds the namespace expiry.");
        }
        const { request } = await context.publicClient.simulateContract({
          account: context.account,
          address: context.controller,
          abi: capitalControllerAbi,
          functionName: "setRootOperator",
          args: [BigInt(rootId), operator, policy],
        });
        awaitingWallet();
        return context.walletClient.writeContract(request);
      });
    },

    async spawnChild(parentId, label, agentInput, draft, amountInputs) {
      const agent = isAddress(agentInput.trim()) ? getAddress(agentInput.trim()) : null;
      if (!agent || agent === zeroAddress) throw new Error("Enter a valid nonzero agent address.");
      const normalizedLabel = label.trim().toLowerCase();
      if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(normalizedLabel)) {
        throw new Error("Use a lowercase ENS label with letters, numbers, or interior hyphens.");
      }
      const receipt = await transact<Awaited<ReturnType<Awaited<ReturnType<typeof createContext>>["publicClient"]["waitForTransactionReceipt"]>>>(
        "Create child vault",
        async (context, awaitingWallet) => {
          await requireNodeAgent(context, parentId);
          const decimals = await readTokenDecimals(context);
          const policy = makePolicy(draft, decimals, deployment);
          const parentPolicy = policyToSdk(data.nodes.find((node) => node.id === parentId)?.effectivePolicy ?? data.nodes[0].effectivePolicy, context.tokens);
          assertPolicyIsNarrower(parentPolicy, policy, context.tokens);
          const amounts: [bigint, bigint] = [parseUnits(amountInputs[0].trim() || "0", decimals[0]), parseUnits(amountInputs[1].trim() || "0", decimals[1])];
          const operationKey = toHex(crypto.getRandomValues(new Uint8Array(32)));
          const { request } = await context.publicClient.simulateContract({
            account: context.account,
            address: context.controller,
            abi: capitalControllerAbi,
            functionName: "spawnChild",
            args: [BigInt(parentId), normalizedLabel, agent, policy, amounts, operationKey],
          });
          awaitingWallet();
          return context.walletClient.writeContract(request);
        },
      );
      const created = parseEventLogs({ abi: capitalControllerAbi, logs: receipt.logs, eventName: "NodeCreated" })
        .find((event) => event.args.parentId === BigInt(parentId));
      if (!created) throw new Error("The confirmed receipt did not include a child creation event.");
      return created.args.nodeId.toString();
    },

    async tightenPolicy(nodeId, draft) {
      await transact("Tighten vault policy", async (context, awaitingWallet) => {
        const node = await context.publicClient.readContract({
          address: context.controller,
          abi: capitalControllerAbi,
          functionName: "getNode",
          args: [BigInt(nodeId)],
        });
        const uiNode = data.nodes.find((candidate) => candidate.id === nodeId);
        if (node.parentId === 0n) await requireOwner(context, node.rootId.toString());
        else if (uiNode?.parentId) await requireNodeAgent(context, uiNode.parentId);
        const policy = makePolicy(draft, await readTokenDecimals(context), deployment);
        const currentPolicy = policyToSdk(uiNode?.localPolicy ?? data.nodes[0].localPolicy, context.tokens);
        assertPolicyIsNarrower(currentPolicy, policy, context.tokens);
        const { request } = await context.publicClient.simulateContract({
          account: context.account,
          address: context.controller,
          abi: capitalControllerAbi,
          functionName: "tightenPolicy",
          args: [BigInt(nodeId), policy],
        });
        awaitingWallet();
        return context.walletClient.writeContract(request);
      });
    },

    async revokeSubtree(nodeId) {
      await transact("Revoke subtree", async (context, awaitingWallet) => {
        const uiNode = data.nodes.find((candidate) => candidate.id === nodeId);
        if (!uiNode?.parentId) throw new Error("The root vault cannot be revoked through the subtree action.");
        await requireNodeAgent(context, uiNode.parentId);
        const { request } = await context.publicClient.simulateContract({
          account: context.account,
          address: context.controller,
          abi: capitalControllerAbi,
          functionName: "revokeSubtree",
          args: [BigInt(nodeId)],
        });
        awaitingWallet();
        return context.walletClient.writeContract(request);
      });
    },

    async ownerEmergencyRecover(nodeId) {
      await transact("Owner emergency recovery", async (context, awaitingWallet) => {
        const node = await context.publicClient.readContract({
          address: context.controller,
          abi: capitalControllerAbi,
          functionName: "getNode",
          args: [BigInt(nodeId)],
        });
        await requireOwner(context, node.rootId.toString());
        const { request } = await context.publicClient.simulateContract({
          account: context.account,
          address: context.controller,
          abi: capitalControllerAbi,
          functionName: "ownerEmergencyRecover",
          args: [BigInt(nodeId)],
        });
        awaitingWallet();
        return context.walletClient.writeContract(request);
      });
    },

    async ownerEmergencyClosePosition(nodeId, minimumOutputInputs, deadlineInput) {
      await transact("Close LP position for owner recovery", async (context, awaitingWallet) => {
        const node = await context.publicClient.readContract({
          address: context.controller,
          abi: capitalControllerAbi,
          functionName: "getNode",
          args: [BigInt(nodeId)],
        });
        await requireOwner(context, node.rootId.toString());
        const [tokenId] = await Promise.all([
          context.publicClient.readContract({
            address: node.vault,
            abi: vaultPositionAbi,
            functionName: "positionTokenId",
          }),
          context.publicClient.readContract({
            address: node.vault,
            abi: vaultPositionAbi,
            functionName: "positionLiquidity",
          }),
        ]);
        if (tokenId === 0n) throw new Error("This vault has no LP position to close.");
        const decimals = await readTokenDecimals(context);
        const minimums: [bigint, bigint] = [
          parseUnits(minimumOutputInputs[0].trim() || "0", decimals[0]),
          parseUnits(minimumOutputInputs[1].trim() || "0", decimals[1]),
        ];
        const maxUint128 = (1n << 128n) - 1n;
        if (minimums.some((amount) => amount > maxUint128)) throw new Error("A minimum output exceeds uint128.");
        if (!/^\d+$/.test(deadlineInput)) throw new Error("Enter a valid recovery deadline.");
        const deadline = BigInt(deadlineInput);
        const latestBlock = await context.publicClient.getBlock();
        if (deadline <= latestBlock.timestamp) throw new Error("Choose a recovery deadline in the future.");
        const { request } = await context.publicClient.simulateContract({
          account: context.account,
          address: context.controller,
          abi: ownerEmergencyClosePositionAbi,
          functionName: "ownerEmergencyClosePosition",
          args: [BigInt(nodeId), minimums, deadline],
        });
        awaitingWallet();
        return context.walletClient.writeContract(request);
      });
    },

    async payForService(nodeId, serviceId) {
      const node = data.nodes.find(value => value.id === nodeId);
      if (!node?.authorizedPermissions.includes("pay")) throw new Error("Cannot purchase: this node has no PAY role.");
      const key = ["kanoki-receipt", sepolia.id, deployment.controllerAddress, node.vaultAddress, address, serviceId].join(":").toLowerCase();
      const execute = async () => {
      if (busy.current) throw new Error("Another wallet action is still in progress.");
      busy.current = true;
      try {
        const context = await createContext();
        // ENS identity gate: only the agent bound to this vault may spend under its mandate.
        await requireNodeAgent(context, nodeId);
        const agentEnsName = data.nodes.find((node) => node.id === nodeId)?.ensName ?? "";

        // x402 handshake: an unpaid request returns the 402 payment terms.
        setNotice({ stage: "simulating", label: "Load service price", message: "Requesting x402 payment terms." });
        const challengeResponse = await fetch(`/api/x402/services/${encodeURIComponent(serviceId)}`, { cache: "no-store" });
        if (challengeResponse.status !== 402) {
          throw new Error("The service did not return x402 payment terms.");
        }
        const challenge = (await challengeResponse.json()) as X402Challenge;
        const requirements = challenge.accepts?.[0];
        if (!requirements) throw new Error("The service advertised no payment requirements.");
        const asset = getAddress(requirements.asset);
        if (asset !== USDC_SEPOLIA.address) throw new Error("This service must be paid in Sepolia USDC.");
        const payTo = getAddress(requirements.payTo);
        const amount = BigInt(requirements.maxAmountRequired);
        if (amount <= 0n) throw new Error("The service returned a non-positive price.");

        // Settlement: transfer USDC from the agent wallet to the service recipient.
        const settlement = await submitWithContext<{ transactionHash: Hash }>(
          context,
          "Pay service in USDC",
          async (tx, awaitingWallet) => {
            const { request } = await tx.publicClient.simulateContract({
              account: tx.account,
              address: asset,
              abi: erc20Abi,
              functionName: "transfer",
              args: [payTo, amount],
            });
            awaitingWallet();
            return tx.walletClient.writeContract(request);
          },
          false,
        );
        const txHash = settlement.transactionHash;

        // Redeem: resend the request with proof of payment + the agent's ENS identity.
        setNotice({
          stage: "confirming",
          label: "Unlock service",
          message: "Submitting payment proof to the service.",
          transactionHash: txHash,
        });
        const header = encodePaymentHeader({
          x402Version: X402_VERSION,
          scheme: "exact",
          network: requirements.network,
          resource: serviceId,
          payload: { txHash, from: context.account, payTo, asset, amount: amount.toString(), nodeId, agentEnsName },
        });
        const paidResponse = await fetch(`/api/x402/services/${encodeURIComponent(serviceId)}`, {
          cache: "no-store",
          headers: { "X-PAYMENT": header },
        });
        if (!paidResponse.ok) {
          const detail = (await paidResponse.json().catch(() => null)) as { error?: { message?: string } } | null;
          throw new Error(detail?.error?.message ?? "The service rejected the payment proof.");
        }
        const result = (await paidResponse.json()) as X402PurchaseResult;
        setNotice({
          stage: "confirmed",
          label: "Service unlocked",
          message: `Paid in USDC; ${result.service.name} delivered to ${result.paidBy}.`,
          transactionHash: txHash,
        });
        onConfirmed();
        return result;
      } catch (cause) {
        setNotice({ stage: "error", label: "Pay for service", message: errorMessage(cause) });
        throw cause;
      } finally {
        busy.current = false;
      }
      };
      const run = () => purchaseOnce(window.localStorage, key, execute);
      const receipt = navigator.locks ? await navigator.locks.request(key, run) : await run();
      return { ...receipt.result, alreadySettled: receipt.repeated };

    },
  };

  return { actions, notice };
}
