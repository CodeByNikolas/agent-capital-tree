"use client";

import { useState, type FormEvent, type ReactNode } from "react";
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
import { InfoHint } from "@/components/info-hint";

export type WalletActionMode =
  | "create-root"
  | "fund-root"
  | "set-root-operator"
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
    if (assets.length >= 2) return [assets[0].symbol === "USDC" ? "Test USDC" : assets[0].symbol, assets[1].symbol];
  }
  return deployment.id === "usdc" ? ["Test USDC", "DEMO-USD"] : ["Token 1", "Token 2"];
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
  deployment,
  data,
  children,
  submitLabel,
  disabled,
  onSubmit,
}: {
  initialPolicy: Policy | null;
  deployment: PublicDeployment;
  data: DashboardData;
  children?: ReactNode;
  submitLabel: string;
  disabled: boolean;
  onSubmit: (draft: PolicyDraft) => Promise<void>;
}) {
  const labels = tokenLabels(data, deployment);
  const [selectedPermissions, setSelectedPermissions] = useState<Permission[]>([...(initialPolicy?.permissions ?? [])]);
  const [allowedTokens, setAllowedTokens] = useState<[boolean, boolean]>([
    initialPolicy ? initialPolicy.allowedTokens.includes(initialPolicy.maxActionAmounts[0]?.symbol ?? "") : true,
    initialPolicy ? initialPolicy.allowedTokens.includes(initialPolicy.maxActionAmounts[1]?.symbol ?? "") : true,
  ]);
  const [maxAmounts, setMaxAmounts] = useState<[string, string]>([...defaultAmounts(initialPolicy)]);
  const [expiresAt, setExpiresAt] = useState(policyDate(initialPolicy) || expiryDateBeforeNamespace(deployment.namespaceExpiry));
  const [error, setError] = useState<string | null>(null);
  const poolId = initialPolicy?.poolId ?? deployment.poolId ?? zeroPoolId;
  const canUsePoolCapabilities = deployment.poolConfigured && poolId !== zeroPoolId;

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
}) {
  const [rootLabel, setRootLabel] = useState("");
  const [operatorAddress, setOperatorAddress] = useState(data.rootOperator ?? "");
  const [fundAmounts, setFundAmounts] = useState<[string, string]>(["0", "0"]);
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
  const canCreateRoot = deployment.contractsConfigured && walletOnSepolia && walletAddress !== null && Boolean(actions.createRoot);
  const canManageRoot = ownerConnected && Boolean(actions.fundRoot && actions.setRootOperator);
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
    <section className="panel wallet-controls-panel" id="wallet-controls" aria-labelledby="wallet-controls-title">
      <div className="panel-heading">
        <div>
          <div className="panel-overline">OWNER &amp; VAULT MANAGEMENT</div>
          <h2 id="wallet-controls-title">Wallet actions</h2>
        </div>
        <span className={`wallet-control-source${deployment.contractsConfigured ? " wallet-control-source-ready" : ""}`}>
          {deployment.contractsConfigured ? deployment.poolConfigured ? "Sepolia pool ready" : "Contracts ready · pool pending" : "Contract deployment pending"}
        </span>
      </div>
      <p className="wallet-controls-intro">Every action is simulated before your wallet is asked to sign. Get Test USDC from Circle’s faucet; this dashboard never mints USDC. DEMO-USD is valueless.</p>
      <div className="wallet-action-shortcuts">
        <a className="button button-secondary button-small" href="https://faucet.circle.com/" target="_blank" rel="noreferrer">Get test USDC <ArrowUpRight size={13} aria-hidden="true" /></a>
        {deployment.demoQuoteAddress && <button className="button button-secondary button-small" type="button" disabled={!walletAddress || !walletOnSepolia || busy || !actions.claimDemoQuote} onClick={() => void actions.claimDemoQuote?.().catch(() => undefined)}>Get DEMO-USD</button>}
        <button className="button button-secondary button-small" type="button" disabled={!canCreateRoot || busy} onClick={() => toggle("create-root")}>Create root</button>
        <button className="button button-secondary button-small" type="button" disabled={!canManageRoot || busy} onClick={() => toggle("fund-root")}>Fund root</button>
        <button className="button button-secondary button-small" type="button" disabled={!canManageRoot || busy} onClick={() => toggle("set-root-operator")}>Bind operator</button>
        <button className="button button-secondary button-small" type="button" disabled={!canSpawn || busy} onClick={() => toggle("spawn-child")}>Add child vault</button>
        <button className="button button-secondary button-small" type="button" disabled={!canTighten || busy} onClick={() => toggle("tighten-policy")}>Tighten mandate</button>
        <button className="button button-danger button-small" type="button" disabled={!canRevoke || busy} onClick={() => toggle("revoke-subtree")}>Revoke subtree</button>
        <button className="button button-danger button-small" type="button" disabled={!canOpenRecovery || busy} onClick={() => toggle("owner-recovery")}>Owner recovery</button>
      </div>
      {!deployment.contractsConfigured && <p className="wallet-controls-pending">Wallet actions unlock when the USDC controller and both configured tokens are deployed.</p>}
      {deployment.contractsConfigured && !deployment.poolConfigured && <p className="wallet-controls-pending">Root creation, funding, operator binding, and capital controls are available. Swap and LP capabilities remain disabled until the USDC pool is initialized and seeded.</p>}
      {!walletAddress && <p className="wallet-controls-pending">Connect an injected wallet on Sepolia. Owner and agent actions stay unavailable until the connected account matches on-chain authority.</p>}
      {walletAddress && !walletOnSepolia && <p className="wallet-controls-pending">Switch your wallet to Sepolia to enable wallet actions. The connected account is not checked for vault authority on another network.</p>}
      {data.source === "direct-rpc" && walletAddress && walletOnSepolia && !ownerConnected && !selectedAgentConnected && !selectedOwnerOrParentAgent && (
        <p className="wallet-controls-pending">This account is neither the recorded root owner nor an authorized agent for the selected vault.</p>
      )}

      {mode === "create-root" && (
        <PolicyFields
          key="create-root"
          initialPolicy={null}
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
          <label className="wallet-field">
            <span>Root ENS label</span>
            <input value={rootLabel} onChange={(event) => setRootLabel(event.target.value)} placeholder="my-agent" disabled={!canCreateRoot || busy} required />
          </label>
        </PolicyFields>
      )}

      {mode === "fund-root" && (
        <form className="wallet-action-form" onSubmit={(event) => {
          event.preventDefault();
          void actions.fundRoot?.(data.rootId, fundAmounts).catch(() => undefined);
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
          <button className="button button-primary button-small" type="submit" disabled={!canManageRoot || busy}>Approve and fund root <ArrowUpRight size={13} aria-hidden="true" /></button>
        </form>
      )}

      {mode === "set-root-operator" && (
        <PolicyFields
          key={`operator-${data.rootId}`}
          initialPolicy={data.source === "direct-rpc" ? data.nodes.find((node) => node.depth === 0)?.localPolicy ?? null : null}
          deployment={deployment}
          data={data}
          submitLabel="Set root operator"
          disabled={!canManageRoot || busy}
          onSubmit={async (draft) => {
            await actions.setRootOperator?.(data.rootId, operatorAddress, draft);
          }}
        >
          <label className="wallet-field">
            <span>Root operator address</span>
            <input value={operatorAddress} onChange={(event) => setOperatorAddress(event.target.value)} placeholder="0x…" disabled={!canManageRoot || busy} required />
          </label>
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
