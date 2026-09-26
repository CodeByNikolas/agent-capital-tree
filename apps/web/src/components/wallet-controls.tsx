"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowUpRight, Check, ShieldAlert, ShieldCheck } from "lucide-react";
import type {
  DashboardActions,
  DashboardData,
  Permission,
  Policy,
  PolicyDraft,
  TokenAmount,
  VaultNode,
} from "@/lib/dashboard-types";
import type { PublicDeployment } from "@/lib/deployment";
import type { WalletActionNotice } from "@/lib/use-wallet-actions";
import { generateRootLabel } from "@/lib/root-label";
import { InfoHint } from "@/components/info-hint";

export type WalletActionMode =
  | "create-root"
  | "fund-root"
  | "set-root-operator"
  | "fund-operator-gas"
  | "spawn-child"
  | "tighten-policy"
  | "revoke-subtree"
  | "owner-recovery"
  | null;

const permissions: readonly Permission[] = [
  "delegate",
  "swap",
  "manage-liquidity",
  "collect-fees",
  "exit-liquidity",
  "pay",
  "restrict",
  "reclaim",
];

const permissionLabels: Record<Permission, string> = {
  delegate: "Delegate capital",
  swap: "Swap assets",
  "manage-liquidity": "Manage LP",
  "collect-fees": "Collect fees",
  "exit-liquidity": "Exit LP",
  pay: "Companion x402 payment",
  restrict: "Tighten or revoke children",
  reclaim: "Reclaim child assets",
};

const zeroPoolId = `0x${"0".repeat(64)}` as const;

function formatRaw(rawAmount: string, decimals: number): string {
  const raw = BigInt(rawAmount);
  const scale = 10n ** BigInt(decimals);
  const whole = raw / scale;
  const fraction = (raw % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function policyDate(policy: Policy | null): string {
  if (policy) return new Date(policy.expiresAt).toISOString().slice(0, 10);
  return "";
}

function expiryDateBeforeNamespace(expiry: string | null): string {
  if (!expiry) return "";
  const timestamp = Number(BigInt(expiry)) * 1000 - 24 * 60 * 60 * 1000;
  return new Date(timestamp).toISOString().slice(0, 10);
}

function shortAddress(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function defaultDeadlineLocal(): string {
  const deadline = new Date(Date.now() + 15 * 60_000);
  return new Date(deadline.getTime() - deadline.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function tokenLabels(data: DashboardData, deployment: PublicDeployment): readonly [string, string] {
  if (data.source === "direct-rpc") {
    const assets = data.nodes[0]?.tokenHoldings ?? [];
    if (assets.length >= 2) return [assets[0].symbol === "USDC" ? "USDC" : assets[0].symbol, assets[1].symbol];
  }
  return deployment.id === "usdc" ? ["USDC", "DEMO-USD"] : ["Token 1", "Token 2"];
}

function defaultAmounts(policy: Policy | null): readonly [string, string] {
  if (!policy) return ["0", "0"];
  return [
    formatRaw(policy.maxActionAmounts[0]?.rawAmount ?? "0", policy.maxActionAmounts[0]?.decimals ?? 0),
    formatRaw(policy.maxActionAmounts[1]?.rawAmount ?? "0", policy.maxActionAmounts[1]?.decimals ?? 0),
  ];
}

function PolicyFields({
  initialPolicy,
  createRoot = false,
  demoBudget,
  deployment,
  data,
  children,
  submitLabel,
  disabled,
  onSubmit,
}: {
  initialPolicy: Policy | null;
  createRoot?: boolean;
  demoBudget?: string | null;
  deployment: PublicDeployment;
  data: DashboardData;
  children?: ReactNode;
  submitLabel: string;
  disabled: boolean;
  onSubmit: (draft: PolicyDraft) => Promise<void>;
}) {
  const labels = tokenLabels(data, deployment);
  const poolId = initialPolicy?.poolId ?? (demoBudget ? zeroPoolId : deployment.poolId ?? zeroPoolId);
  const canUsePoolCapabilities = deployment.poolConfigured && poolId !== zeroPoolId;
  const defaultPermissions = createRoot ? permissions.filter(permission =>
    (permission !== "pay" || deployment.paymentsSupported) &&
    (!["swap", "manage-liquidity", "collect-fees", "exit-liquidity"].includes(permission) || canUsePoolCapabilities)) : [];
  const [selectedPermissions, setSelectedPermissions] = useState<Permission[]>([...(initialPolicy?.permissions ?? (demoBudget ? ["delegate", "restrict", "reclaim"] : defaultPermissions))]);
  const [allowedTokens, setAllowedTokens] = useState<[boolean, boolean]>([
    initialPolicy ? initialPolicy.allowedTokens.includes(initialPolicy.maxActionAmounts[0]?.symbol ?? "") : true,
    initialPolicy ? initialPolicy.allowedTokens.includes(initialPolicy.maxActionAmounts[1]?.symbol ?? "") : !demoBudget,
  ]);
  const [maxAmounts, setMaxAmounts] = useState<[string, string]>(demoBudget && !initialPolicy ? [(Number(demoBudget) / 1_000_000).toString(), "0"] : !initialPolicy && createRoot ? ["20", "20"] : [...defaultAmounts(initialPolicy)]);
  const [expiresAt, setExpiresAt] = useState(policyDate(initialPolicy) || expiryDateBeforeNamespace(deployment.namespaceExpiry));
  const [error, setError] = useState<string | null>(null);

  function togglePermission(permission: Permission) {
    setSelectedPermissions((current) => current.includes(permission)
      ? current.filter((item) => item !== permission)
      : [...current, permission]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await onSubmit({
        permissions: selectedPermissions,
        allowedTokens,
        maxAmounts,
        expiresAt,
        poolId,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The form could not be submitted.");
    }
  }

  return (
    <form className="wallet-action-form" onSubmit={(event) => void submit(event)}>
      {children}
      <div className="wallet-form-grid">
        {labels.map((label, index) => (
          <label className="wallet-field wallet-token-field" key={label}>
            <span>{label}</span>
            <span className="wallet-token-toggle">
              <input
                type="checkbox"
                checked={allowedTokens[index]}
                disabled={disabled}
                onChange={(event) => setAllowedTokens((current) => {
                  const next: [boolean, boolean] = [...current];
                  next[index] = event.target.checked;
                  if (!event.target.checked) setMaxAmounts((values) => {
                    const updated: [string, string] = [...values];
                    updated[index] = "0";
                    return updated;
                  });
                  return next;
                })}
              />
              <span>Allowed</span>
            </span>
            <span>Maximum per action</span>
            <input
              aria-label={`Maximum ${label} per action`}
              type="text"
              inputMode="decimal"
              value={maxAmounts[index]}
              disabled={disabled || !allowedTokens[index]}
              onChange={(event) => setMaxAmounts((current) => {
                const next: [string, string] = [...current];
                next[index] = event.target.value;
                return next;
              })}
              placeholder="0"
            />
          </label>
        ))}
        <label className="wallet-field">
          <span>Policy expires</span>
          <input
            type="date"
            value={expiresAt}
            max={expiryDateBeforeNamespace(deployment.namespaceExpiry) || undefined}
            disabled={disabled}
            onChange={(event) => setExpiresAt(event.target.value)}
            required
          />
        </label>
      </div>
      <fieldset className="wallet-permission-fields" disabled={disabled}>
        <legend>Allowed capabilities <InfoHint term="mandate" /></legend>
        <div>
          {permissions.filter((permission) => permission !== "pay" || deployment.paymentsSupported).map((permission) => {
            const needsPool = ["swap", "manage-liquidity", "collect-fees", "exit-liquidity"].includes(permission);
            return (
              <label key={permission} title={needsPool && !canUsePoolCapabilities ? "No pool is configured in the deployment manifest." : undefined}>
                <input
                  type="checkbox"
                  checked={selectedPermissions.includes(permission)}
                  disabled={needsPool && !canUsePoolCapabilities}
                  onChange={() => togglePermission(permission)}
                />
                <span>{permissionLabels[permission]}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      {error && <p className="wallet-form-error" role="alert">{error}</p>}
      <p className="wallet-form-hint">Amounts are entered as token decimals and converted to exact raw units before simulation.</p>
      <button className="button button-primary button-small" type="submit" disabled={disabled || !expiresAt}>{submitLabel}<ArrowUpRight size={13} aria-hidden="true" /></button>
    </form>
  );
}

export function WalletControlsPanel({
  data,
  deployment,
  selectedNode,
  walletAddress,
  walletOnSepolia,
  liveStateReady,
  actions,
  notice,
  mode,
  onModeChange,
  onRootCreated,
  demoLabel,
  demoBudget,
  setupOperator,
  creationOnly = false,
}: {
  data: DashboardData;
  deployment: PublicDeployment;
  selectedNode: VaultNode;
  walletAddress: string | null;
  walletOnSepolia: boolean;
  liveStateReady: boolean;
  actions: DashboardActions;
  notice: WalletActionNotice | null;
  mode: WalletActionMode;
  onModeChange: (mode: WalletActionMode) => void;
  onRootCreated: (rootId: string) => void;
  demoLabel?: string | null;
  demoBudget?: string | null;
  setupOperator?: string | null;
  creationOnly?: boolean;
}) {
  const [rootLabel, setRootLabel] = useState(demoLabel ?? "");
  useEffect(() => {
    if (!demoLabel) setRootLabel(current => current || generateRootLabel());
  }, [demoLabel]);
  const [operatorAddress, setOperatorAddress] = useState(setupOperator ?? data.rootOperator ?? "");
  const budgetUSDC = demoBudget ? (Number(demoBudget) / 1_000_000).toString() : "0";
  const [fundAmounts, setFundAmounts] = useState<[string, string]>([budgetUSDC, "0"]);
  const [childLabel, setChildLabel] = useState("");
  const [childAgent, setChildAgent] = useState("");
  const [childAmounts, setChildAmounts] = useState<[string, string]>(["0", "0"]);
  const [minimumOutputs, setMinimumOutputs] = useState<[string, string]>(["0", "0"]);
  const [deadlineLocal, setDeadlineLocal] = useState(defaultDeadlineLocal);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const labels = tokenLabels(data, deployment);
  const busy = notice?.stage === "simulating" || notice?.stage === "awaiting-wallet" || notice?.stage === "confirming";
  const ownerConnected = Boolean(
    liveStateReady && data.source === "direct-rpc" && data.contractsConfigured && walletOnSepolia && walletAddress &&
    data.rootOwner && walletAddress.toLowerCase() === data.rootOwner.toLowerCase(),
  );
  const selectedParent = selectedNode.parentId ? data.nodes.find((node) => node.id === selectedNode.parentId) : undefined;
  const parentAgentConnected = Boolean(liveStateReady && walletAddress && walletOnSepolia && selectedParent?.agentAddress.toLowerCase() === walletAddress.toLowerCase());
  const selectedOwnerOrParentAgent = selectedNode.parentId
    ? parentAgentConnected
    : ownerConnected;
  const selectedAgentConnected = Boolean(liveStateReady && walletAddress && walletOnSepolia && selectedNode.agentAddress.toLowerCase() === walletAddress.toLowerCase());
  const canCreateRoot = !deployment.recoveryOnly && deployment.contractsConfigured && walletOnSepolia && walletAddress !== null && Boolean(actions.createRoot);
  const canManageRoot = ownerConnected && Boolean(actions.fundRoot && actions.setRootOperator);
  const treeUsdcRaw = data.nodes.reduce((total, node) => total + BigInt(node.tokenHoldings[0]?.rawAmount ?? "0"), 0n);
  const demoAlreadyFunded = Boolean(demoBudget && liveStateReady && data.source === "direct-rpc" && treeUsdcRaw >= BigInt(demoBudget));
  const agentMatches = Boolean(setupOperator && data.rootOperator?.toLowerCase() === setupOperator.toLowerCase());
  const canSpawn = selectedNode.state === "active" && selectedNode.authorizedPermissions.includes("delegate") && data.source === "direct-rpc" && data.contractsConfigured && selectedAgentConnected && Boolean(actions.spawnChild);
  const canTighten = selectedNode.state !== "revoked" && selectedNode.state !== "expired" && data.source === "direct-rpc" && data.contractsConfigured &&
    (selectedNode.parentId ? parentAgentConnected && Boolean(selectedParent?.authorizedPermissions.includes("restrict")) : ownerConnected) && Boolean(actions.tightenPolicy);
  const canRevoke = Boolean(selectedNode.parentId && selectedNode.state !== "revoked" && selectedNode.state !== "expired" && data.source === "direct-rpc" && data.contractsConfigured && parentAgentConnected && selectedParent?.authorizedPermissions.includes("restrict") && actions.revokeSubtree);
  const canCloseForRecovery = ownerConnected && selectedNode.position !== null && Boolean(actions.ownerEmergencyClosePosition);
  const canRecover = ownerConnected && !selectedNode.position && Boolean(actions.ownerEmergencyRecover);
  const canOpenRecovery = canCloseForRecovery || canRecover;
  const canDoSelectedAction = canSpawn || canTighten || canRevoke || canCloseForRecovery || canRecover;

  function toggle(modeName: Exclude<WalletActionMode, null>) {
    setConfirming(false);
    onModeChange(mode === modeName ? null : modeName);
  }

  function setAmount(index: 0 | 1, value: string, child = false) {
    if (child) setChildAmounts((current) => {
      const next: [string, string] = [...current];
      next[index] = value;
      return next;
    });
    else setFundAmounts((current) => {
      const next: [string, string] = [...current];
      next[index] = value;
      return next;
    });
  }

  function runAndClose(action: (() => void | Promise<void>) | undefined) {
    void Promise.resolve().then(() => action?.()).then(() => onModeChange(null)).catch(() => undefined);
  }

  const displayedNotice = notice && (
    <div className={`wallet-action-notice wallet-action-notice-${notice.stage}`} role="status" aria-live="polite">
      <strong>{notice.label}</strong>
      <span>{notice.message}</span>
      {notice.transactionHash && (
        <a href={`https://sepolia.etherscan.io/tx/${notice.transactionHash}`} target="_blank" rel="noreferrer">
          View Sepolia receipt <ArrowUpRight size={11} aria-hidden="true" />
        </a>
      )}
    </div>
  );

  return (
    <section className={`panel wallet-controls-panel${creationOnly ? " wallet-controls-create" : ""}`} id="wallet-controls" aria-labelledby="wallet-controls-title">
      <div className="panel-heading">
        <div>
          {!creationOnly && <div className="panel-overline">OWNER &amp; VAULT MANAGEMENT</div>}
          <h2 id="wallet-controls-title">{creationOnly ? "Name your vault and set its limits" : "Wallet actions"}</h2>
        </div>
        {!creationOnly && <span className={`wallet-control-source${deployment.contractsConfigured ? " wallet-control-source-ready" : ""}`}>
          {deployment.contractsConfigured ? deployment.poolConfigured ? "Sepolia pool ready" : "Contracts ready · pool pending" : "Contract deployment pending"}
        </span>}
      </div>
      {creationOnly ? <p className="wallet-controls-intro">Your connected wallet will own this vault. Choose its public name and the limits for your agents, then confirm creation in your wallet. You only need Sepolia ETH for the network fee now. Add USDC and authorize an agent from the dashboard afterwards.</p> : <p className="wallet-controls-intro">Every action is simulated before your wallet is asked to sign. Get USDC from Circle’s faucet; this dashboard never mints USDC. DEMO-USD is valueless.</p>}
      {deployment.recoveryOnly && <p className="wallet-controls-pending">Existing-vault recovery deployment · {deployment.namespaceName} · Controller {deployment.controllerAddress}. This is NOT the newer agentcapitalvault.eth controller. New root creation is disabled here; existing funds are not migrated.</p>}
      {demoBudget && <div className="wallet-action-notice" role="status">
        <strong>Chat demo · {budgetUSDC} Test-USDC shared across the entire tree</strong>
        <span>{demoAlreadyFunded ? "USDC funding is complete. No additional deposit is needed, including after child allocation." : "Fund only the remaining difference after root creation. Child budgets come from this same capital."}</span>
        {setupOperator ? <><span>Local agent: {setupOperator}. {agentMatches ? "Onchain binding matches." : "Owner must review and sign the operator change. This invalidates previous mandates, but does not move vault funds."}</span>
          <span>Then top up this agent to 0.01 native Sepolia ETH for gas. The live balance is rechecked before signing. This is a reserve, not a guaranteed fee quote.</span>
          <div className="wallet-action-shortcuts">
            <button type="button" className="button button-secondary button-small" disabled={busy || agentMatches} onClick={() => toggle("set-root-operator")}>1. Review agent authorization</button>
            <button type="button" className="button button-secondary button-small" disabled={busy || !agentMatches} onClick={() => toggle("fund-operator-gas")}>2. Review native ETH gas</button>
          </div></> : <span>After root creation, return to chat: selectCapitalRoot with this ENS, then prepareCapitalSetup. Do not bind your owner wallet as the MCP signer.</span>}
        <span>Return to the same chat and call getCapitalSetup. createChildVault creates a capital vault, not an autonomous AI worker.</span>
      </div>}
      {!creationOnly && <div className="wallet-action-shortcuts">
        <a className="button button-secondary button-small" href="https://faucet.circle.com/" target="_blank" rel="noreferrer">Get test USDC <ArrowUpRight size={13} aria-hidden="true" /></a>
        {deployment.demoQuoteAddress && <button className="button button-secondary button-small" type="button" disabled={!walletAddress || !walletOnSepolia || busy || !actions.claimDemoQuote} onClick={() => void actions.claimDemoQuote?.().catch(() => undefined)}>Get DEMO-USD</button>}
        <button className="button button-secondary button-small" type="button" disabled={!canCreateRoot || busy} onClick={() => toggle("create-root")}>Create root</button>
        <button className="button button-secondary button-small" type="button" disabled={!canManageRoot || busy} onClick={() => toggle("fund-root")}>Fund root</button>
        <button className="button button-secondary button-small" type="button" disabled={!canManageRoot || busy} onClick={() => toggle("set-root-operator")}>Bind operator</button>
        <button className="button button-secondary button-small" type="button" disabled={!canSpawn || busy} onClick={() => toggle("spawn-child")}>Add child vault</button>
        <button className="button button-secondary button-small" type="button" disabled={!canTighten || busy} onClick={() => toggle("tighten-policy")}>Tighten mandate</button>
        <button className="button button-danger button-small" type="button" disabled={!canRevoke || busy} onClick={() => toggle("revoke-subtree")}>Revoke subtree</button>
        <button className="button button-danger button-small" type="button" disabled={!canOpenRecovery || busy} onClick={() => toggle("owner-recovery")}>Owner recovery</button>
      </div>}
      {!deployment.contractsConfigured && <p className="wallet-controls-pending">Wallet actions unlock when the USDC controller and both configured tokens are deployed.</p>}
      {deployment.contractsConfigured && !deployment.poolConfigured && <p className="wallet-controls-pending">Root creation, funding, operator binding, and capital controls are available. Swap and LP capabilities remain disabled until the USDC pool is initialized and seeded.</p>}
      {!walletAddress && <p className="wallet-controls-pending">{creationOnly ? "Connect your wallet using the button at the top of the page, then switch to Sepolia to create your vault." : "Connect an injected wallet on Sepolia. Owner and agent actions stay unavailable until the connected account matches on-chain authority."}</p>}
      {walletAddress && !walletOnSepolia && <p className="wallet-controls-pending">Switch your wallet to Sepolia to enable wallet actions. The connected account is not checked for vault authority on another network.</p>}
      {data.source === "direct-rpc" && walletAddress && walletOnSepolia && !ownerConnected && !selectedAgentConnected && !selectedOwnerOrParentAgent && (
        <p className="wallet-controls-pending">This account is neither the recorded root owner nor an authorized agent for the selected vault.</p>
      )}

      {mode === "create-root" && (
        <PolicyFields
          key="create-root"
          createRoot
          initialPolicy={null}
          demoBudget={demoBudget}
          deployment={deployment}
          data={data}
          submitLabel="Create root vault"
          disabled={!canCreateRoot || busy}
          onSubmit={async (draft) => {
            const rootId = await actions.createRoot?.(rootLabel, draft);
            if (!rootId) throw new Error("Root creation is not configured.");
            onRootCreated(rootId);
          }}
        >
          <div className="root-name-field">
            <label className="wallet-field" htmlFor="root-ens-label">Root ENS label</label>
            <div className="root-name-input">
              <input id="root-ens-label" aria-describedby="root-name-help" value={rootLabel} onChange={(event) => setRootLabel(event.target.value)} placeholder="Generating a name…" disabled={busy} pattern="[a-z][a-z0-9-]{0,30}" maxLength={31} required />
              <button className="button button-secondary button-small" type="button" disabled={busy} onClick={() => setRootLabel(generateRootLabel())}>New suggestion</button>
            </div>
            <p id="root-name-help" className="wallet-form-hint">Your vault’s public name. Keep this suggestion or enter your own lowercase name. The name is permanent once created.</p>
            {rootLabel && <p className="root-name-preview">{rootLabel}.{deployment.namespaceName}</p>}
          </div>
          <p className="wallet-form-context root-policy-help">Choose which assets and actions your agents may use. A per-action limit caps each transaction; 0 blocks spending that asset. These limits do not deposit any funds. DEMO-USD is an optional, valueless test token for Uniswap. The expiry sets when agent permissions end; you retain owner recovery.</p>
        </PolicyFields>
      )}

      {mode === "fund-root" && (
        <form className="wallet-action-form" onSubmit={(event) => {
          event.preventDefault();
          void actions.fundRoot?.(data.rootId, fundAmounts, demoBudget ?? undefined).catch(() => undefined);
        }}>
          <p className="wallet-form-context">Fund <strong>{data.nodes.find((node) => node.depth === 0)?.ensName ?? "the selected root"}</strong> from the recorded root-owner wallet. Each approval is exact to the entered amount.</p>
          <div className="wallet-form-grid wallet-form-grid-two">
            {labels.map((label, index) => (
              <label className="wallet-field" key={label}>
                <span>{label} amount</span>
                <input type="text" inputMode="decimal" value={fundAmounts[index]} onChange={(event) => setAmount(index as 0 | 1, event.target.value)} placeholder="0" disabled={!canManageRoot || busy} />
              </label>
            ))}
          </div>
          <button className="button button-primary button-small" type="submit" disabled={!canManageRoot || busy || demoAlreadyFunded}>{demoAlreadyFunded ? "Demo funding already complete" : "Approve and fund root"} <ArrowUpRight size={13} aria-hidden="true" /></button>
        </form>
      )}

      {mode === "fund-operator-gas" && <form className="wallet-action-form" onSubmit={(event) => {
        event.preventDefault();
        if (setupOperator) void actions.fundOperatorGas?.(data.rootId, setupOperator).catch(() => undefined);
      }}>
        <p className="wallet-form-context">Send native <strong>Sepolia ETH</strong> from the owner wallet to the bound local signer. Only the difference up to <strong>0.01 ETH</strong> is requested. This is separate from the 0.10 Test-USDC vault budget. No USDC approval is involved.</p>
        <label className="wallet-field"><span>Bound local signer · verify this address</span><input value={setupOperator ?? "No local signer provided"} readOnly /></label>
        <p className="field-help">Unused gas stays with this local key. The MCP estimates fees again before each child transaction. If this page is stale or binding differs, the transaction is blocked.</p>
        <button type="submit" className="button button-primary button-small" disabled={!canManageRoot || !agentMatches || !actions.fundOperatorGas || busy}>Review gas top-up in wallet</button>
      </form>}

      {mode === "set-root-operator" && (
        <PolicyFields
          key={`operator-${data.rootId}`}
          initialPolicy={setupOperator && demoBudget ? null : data.source === "direct-rpc" ? data.nodes.find((node) => node.depth === 0)?.localPolicy ?? null : null}
          demoBudget={setupOperator ? demoBudget : null}
          deployment={deployment}
          data={data}
          submitLabel="Authorize agent for this vault"
          disabled={!canManageRoot || busy}
          onSubmit={async (draft) => {
            await actions.setRootOperator?.(data.rootId, operatorAddress, draft);
          }}
        >
          <label className="wallet-field">
            <span>Agent signing address (operator)</span>
            <input value={operatorAddress} onChange={(event) => setOperatorAddress(event.target.value)} placeholder="0x…" disabled={!canManageRoot || busy} required />
          </label>
          <p className="field-help">Your wallet remains the owner. This separate local key can sign only within the vault mandate. Verify the address and limits before authorizing. Authorizing again changes the generation and invalidates existing agents. The agent also needs native Sepolia-ETH for gas; a USDC approval does not provide gas.</p>
        </PolicyFields>
      )}

      {mode === "spawn-child" && (
        <PolicyFields
          key={`spawn-${selectedNode.id}`}
          initialPolicy={selectedNode.effectivePolicy}
          deployment={deployment}
          data={data}
          submitLabel="Create and allocate child"
          disabled={!canSpawn || busy}
          onSubmit={async (draft) => {
            const childId = await actions.spawnChild?.(selectedNode.id, childLabel, childAgent, draft, childAmounts);
            if (!childId) throw new Error("Child creation is not configured.");
            onModeChange(null);
          }}
        >
          <label className="wallet-field">
            <span>Child ENS label</span>
            <input value={childLabel} onChange={(event) => setChildLabel(event.target.value)} placeholder="market-maker" disabled={!canSpawn || busy} required />
          </label>
          <label className="wallet-field">
            <span>Child agent address</span>
            <input value={childAgent} onChange={(event) => setChildAgent(event.target.value)} placeholder="0x…" disabled={!canSpawn || busy} required />
          </label>
          <div className="wallet-form-grid wallet-form-grid-two">
            {labels.map((label, index) => (
              <label className="wallet-field" key={label}>
                <span>Initial {label} allocation</span>
                <input type="text" inputMode="decimal" value={childAmounts[index]} onChange={(event) => setAmount(index as 0 | 1, event.target.value, true)} placeholder="0" disabled={!canSpawn || busy} />
              </label>
            ))}
          </div>
        </PolicyFields>
      )}

      {mode === "tighten-policy" && (
        <PolicyFields
          key={`tighten-${selectedNode.id}`}
          initialPolicy={selectedNode.localPolicy}
          deployment={deployment}
          data={data}
          submitLabel="Simulate and tighten"
          disabled={!canTighten || busy}
          onSubmit={async (draft) => {
            await actions.tightenPolicy?.(selectedNode.id, draft);
            onModeChange(null);
          }}
        />
      )}

      {mode === "revoke-subtree" && (
        <div className="wallet-confirm-action">
          <div><ShieldAlert size={16} aria-hidden="true" /><p><strong>Revoke {selectedNode.ensName} and its delegated authority?</strong><span>This permanently marks the vault revoked. Its descendants stop passing the controller’s ancestor authorization checks.</span></p></div>
          {confirming ? (
            <div className="wallet-confirm-buttons">
              <button className="button button-danger button-small" type="button" disabled={busy} onClick={() => runAndClose(() => actions.revokeSubtree?.(selectedNode.id))}>Confirm revoke</button>
              <button className="button button-secondary button-small" type="button" onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          ) : <button className="button button-danger button-small" type="button" disabled={!canRevoke || busy} onClick={() => setConfirming(true)}>Review permanent revoke</button>}
        </div>
      )}

      {mode === "owner-recovery" && (
        selectedNode.position ? (
          <form className="wallet-action-form wallet-recovery-form" onSubmit={(event) => {
            event.preventDefault();
            setCloseError(null);
            const deadline = Math.floor(new Date(deadlineLocal).getTime() / 1000);
            if (!Number.isFinite(deadline) || deadline <= 0) {
              setCloseError("Choose a valid deadline.");
              return;
            }
            void actions.ownerEmergencyClosePosition?.(selectedNode.id, minimumOutputs, deadline.toString()).catch((cause) => {
              setCloseError(cause instanceof Error ? cause.message : "The LP close could not be submitted.");
            });
          }}>
            <div className="wallet-confirm-action wallet-confirm-owner">
              <div><ShieldCheck size={16} aria-hidden="true" /><p><strong>Close the LP position before recovery?</strong><span>Vault-owned position #{selectedNode.position.tokenId} has {selectedNode.position.liquidity} liquidity units. This owner-only close enforces your minimum outputs and deadline, then permanently revokes the vault. Run owner recovery as a separate transaction afterward.</span></p></div>
            </div>
            <div className="wallet-form-grid wallet-form-grid-two">
              {labels.map((label, index) => (
                <label className="wallet-field" key={label}>
                  <span>Minimum {label} output</span>
                  <input type="text" inputMode="decimal" value={minimumOutputs[index]} onChange={(event) => setMinimumOutputs((current) => {
                    const next: [string, string] = [...current];
                    next[index] = event.target.value;
                    return next;
                  })} disabled={!canCloseForRecovery || busy} required />
                </label>
              ))}
              <label className="wallet-field wallet-field-deadline">
                <span>Close deadline</span>
                <input type="datetime-local" value={deadlineLocal} onChange={(event) => setDeadlineLocal(event.target.value)} disabled={!canCloseForRecovery || busy} required />
              </label>
            </div>
            {closeError && <p className="wallet-form-error" role="alert">{closeError}</p>}
            <p className="wallet-form-hint">The live policy/rate is not used to invent a minimum. Set the lowest acceptable output for each token; the wallet simulates the exact close transaction before signing.</p>
            <button className="button button-danger button-small" type="submit" disabled={!canCloseForRecovery || busy}>Simulate and close LP position <ArrowUpRight size={13} aria-hidden="true" /></button>
          </form>
        ) : (
          <div className="wallet-confirm-action wallet-confirm-owner">
            <div><ShieldCheck size={16} aria-hidden="true" /><p><strong>Recover {selectedNode.ensName} to its bound destination?</strong><span>This owner-only path ignores ENS, indexer, and runtime state. The required LP close has completed; recovery now transfers remaining supported token balances to the bound parent vault or root-owner wallet.</span></p></div>
            {confirming ? (
              <div className="wallet-confirm-buttons">
                <button className="button button-danger button-small" type="button" disabled={!canRecover || busy} onClick={() => runAndClose(() => actions.ownerEmergencyRecover?.(selectedNode.id))}>Confirm recovery</button>
                <button className="button button-secondary button-small" type="button" onClick={() => setConfirming(false)}>Cancel</button>
              </div>
            ) : <button className="button button-danger button-small" type="button" disabled={!canRecover || busy} onClick={() => setConfirming(true)}>Review recovery</button>}
          </div>
        )
      )}

      {!canDoSelectedAction && !canCloseForRecovery && mode !== "create-root" && mode !== "fund-root" && mode !== "set-root-operator" && mode !== "owner-recovery" && (
        <span className="wallet-control-disabled-hint">Select an active vault and connect its recorded owner or parent agent to unlock the matching actions.</span>
      )}
      {displayedNotice}
    </section>
  );
}
