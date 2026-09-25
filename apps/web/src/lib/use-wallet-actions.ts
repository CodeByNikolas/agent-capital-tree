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
import { useRef, useState } from "react";
import type { DashboardActions, DashboardData, Permission, Policy, PolicyDraft } from "@/lib/dashboard-types";
import type { PublicDeployment } from "@/lib/deployment";

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
  restrict: "restrict",
  reclaim: "reclaim",
};

const permissionBits: Record<Permission, bigint> = {
  delegate: financeRoles.delegate,
  swap: financeRoles.swap,
  "manage-liquidity": financeRoles.lpManage,
  "collect-fees": financeRoles.collectFees,
  "exit-liquidity": financeRoles.exit,
  restrict: financeRoles.restrict,
  reclaim: financeRoles.reclaim,
};

const zeroPoolId = `0x${"0".repeat(64)}` as const;
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
  if (requestsPoolCapability && !deployment.poolConfigured) {
    throw new Error("Swap and LP permissions stay unavailable until the configured pool is initialized and seeded.");
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
    if (tokenCodes.some((code) => !code || code === "0x")) throw new Error("A configured demo token has no deployed bytecode.");

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
    async createRoot(label, draft) {
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
      return created.args.rootId.toString();
    },

    async fundRoot(rootId, amountInputs) {
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
  };

  return { actions, notice };
}
