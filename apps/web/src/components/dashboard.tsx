"use client";

import {
  AlertCircle,
  Activity as ActivityIcon,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleDashed,
  CircleHelp,
  Clock3,
  Coins,
  Command,
  Copy,
  ExternalLink,
  Fingerprint,
  GitBranch,
  Layers3,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  Network,
  Plus,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Unplug,
  WalletCards,
  Zap,
} from "lucide-react";
import {
  createWalletClient,
  custom,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WalletControlsPanel, type WalletActionMode } from "@/components/wallet-controls";
import { useWalletActions } from "@/lib/use-wallet-actions";
import type {
  ActivityFeedResult,
  ActivityKind,
  CapitalActivity,
  DashboardActions,
  DashboardData,
  DataSource,
  IndexedCapitalActivity,
  Permission,
  TokenAmount,
  VaultNode,
  VaultState,
} from "@/lib/dashboard-types";
import type { PublicDeployment } from "@/lib/deployment";

type InjectedProvider = Parameters<typeof custom>[0] & {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: InjectedProvider;
  }
}

interface DashboardProps {
  data: DashboardData;
  deployment: PublicDeployment;
  rootQuery: string | null;
}

const permissionLabels: Record<Permission, string> = {
  delegate: "Delegate capital",
  swap: "Swap assets",
  "manage-liquidity": "Manage LP position",
  "collect-fees": "Collect fees",
  "exit-liquidity": "Exit LP position",
  restrict: "Tighten or revoke child",
  reclaim: "Reclaim assets",
};

const activityLabels: Record<ActivityKind, string> = {
  "capital-assigned": "Capital assigned",
  "capital-funded": "Root funded",
  "capital-reclaimed": "Capital returned",
  "node-created": "Vault created",
  "operator-changed": "Operator bound",
  swap: "Swap",
  "position-opened": "Position opened",
  "position-increased": "Position increased",
  "position-closed": "Position closed",
  "fees-collected": "Fees collected",
  "policy-tightened": "Policy narrowed",
  "subtree-revoked": "Subtree revoked",
  "owner-recovered": "Owner recovery",
  "assets-reclaimed": "Assets reclaimed",
};

const vaultStateLabels: Record<VaultState, string> = {
  active: "Active",
  blocked: "No live authority",
  revoked: "Revoked",
  expired: "Expired",
  "setup-pending": "Setup pending",
};

function getWalletClient() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No injected wallet was found. Install a browser wallet to connect.");
  }

  return createWalletClient({
    chain: sepolia,
    transport: custom(window.ethereum),
  });
}

interface InjectedWalletState {
  address: Address | null;
  chainId: number | null;
  pending: boolean;
  error: string | null;
  connect: () => Promise<void>;
  switchToSepolia: () => Promise<void>;
}

function useInjectedWallet(): InjectedWalletState {
  const [address, setAddress] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const provider = window.ethereum;
    if (!provider) return;

    const wallet = createWalletClient({ chain: sepolia, transport: custom(provider) });
    void Promise.all([wallet.getAddresses(), wallet.getChainId()]).then(([accounts, activeChain]) => {
      setAddress(accounts[0] ?? null);
      setChainId(activeChain);
    }).catch(() => undefined);
    if (!provider.on) return;

    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0];
      setAddress(Array.isArray(accounts) && typeof accounts[0] === "string" ? (accounts[0] as Address) : null);
      setError(null);
    };
    const onChainChanged = (...args: unknown[]) => {
      const chain = args[0];
      if (typeof chain === "string") setChainId(Number.parseInt(chain, 16));
    };

    provider.on("accountsChanged", onAccountsChanged);
    provider.on("chainChanged", onChainChanged);

    return () => {
      provider.removeListener?.("accountsChanged", onAccountsChanged);
      provider.removeListener?.("chainChanged", onChainChanged);
    };
  }, []);

  async function connect() {
    setPending(true);
    setError(null);
    try {
      const wallet = getWalletClient();
      const [account, activeChain] = await Promise.all([
        wallet.requestAddresses(),
        wallet.getChainId(),
      ]);
      setAddress(account[0] ?? null);
      setChainId(activeChain);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Wallet connection was not completed.");
    } finally {
      setPending(false);
    }
  }

  async function switchToSepolia() {
    setPending(true);
    setError(null);
    try {
      const wallet = getWalletClient();
      await wallet.switchChain({ id: sepolia.id });
      setChainId(await wallet.getChainId());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The network switch was not completed.");
    } finally {
      setPending(false);
    }
  }

  return { address, chainId, pending, error, connect, switchToSepolia };
}

function formatAmount(amount: TokenAmount): string {
  const raw = BigInt(amount.rawAmount);
  const scale = 10n ** BigInt(amount.decimals);
  const whole = raw / scale;
  const fraction = (raw % scale).toString().padStart(amount.decimals, "0");
  const groupedWhole = whole.toLocaleString("en-US");
  const visibleFraction = fraction.replace(/0+$/, "");
  return visibleFraction ? `${groupedWhole}.${visibleFraction}` : groupedWhole;
}

interface AssetIdentity {
  key: string;
  symbol: string;
  decimals: number;
  tokenAddress?: `0x${string}`;
}

function assetKey(amount: TokenAmount): string {
  return amount.tokenAddress?.toLowerCase() ?? `${amount.symbol}:${amount.decimals}`;
}

function uniqueAssets(amounts: readonly TokenAmount[]): AssetIdentity[] {
  const assets = new Map<string, AssetIdentity>();
  for (const amount of amounts) {
    const key = assetKey(amount);
    if (!assets.has(key)) assets.set(key, { key, symbol: amount.symbol, decimals: amount.decimals, tokenAddress: amount.tokenAddress });
  }
  return Array.from(assets.values());
}

function sumAsset(amounts: readonly TokenAmount[], asset: AssetIdentity): TokenAmount {
  const rawAmount = amounts
    .filter((amount) => assetKey(amount) === asset.key)
    .reduce((sum, amount) => sum + BigInt(amount.rawAmount), 0n);
  return { rawAmount: rawAmount.toString(), decimals: asset.decimals, symbol: asset.symbol, tokenAddress: asset.tokenAddress };
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function sourceLabel(source: DataSource): string {
  switch (source) {
    case "preview":
      return "Preview record";
    case "direct-rpc":
      return "Direct Sepolia RPC";
    case "local-diagnostic":
      return "Local diagnostic";
  }
}

function policyAmountLabel(policy: VaultNode["effectivePolicy"]): string {
  const amounts = policy.maxActionAmounts.filter((amount) => policy.allowedTokens.includes(amount.symbol));
  return amounts.length > 0
    ? amounts.map((amount) => `≤ ${formatAmount(amount)} ${amount.symbol}`).join(" · ")
    : "No asset allowance";
}

function nodeById(data: DashboardData, id: string): VaultNode | undefined {
  return data.nodes.find((node) => node.id === id);
}

function indexedTokenAmount(data: DashboardData, tokenAddress: string, rawAmount: string): TokenAmount | undefined {
  const token = data.nodes.find((node) => node.depth === 0)?.tokenHoldings.find(
    (amount) => amount.tokenAddress?.toLowerCase() === tokenAddress.toLowerCase(),
  );
  return token ? { ...token, rawAmount } : undefined;
}

function formatIndexedRaw(data: DashboardData, tokenAddress: string, rawAmount: string): string {
  const amount = indexedTokenAmount(data, tokenAddress, rawAmount);
  return amount ? `${formatAmount(amount)} ${amount.symbol}` : `${rawAmount} raw units of ${shortAddress(tokenAddress)}`;
}

function indexedActivityLabel(data: DashboardData, nodeId: string): string {
  return nodeById(data, nodeId)?.ensName ?? `Vault ${nodeId}`;
}

function mapIndexedActivity(data: DashboardData, item: IndexedCapitalActivity): CapitalActivity {
  const rootName = indexedActivityLabel(data, data.rootId);
  let nodeId = data.rootId;
  let description = "";
  let amount: TokenAmount | undefined;
  const rawAmount = "amount" in item ? item.amount : undefined;
  const tokenAddress = "token" in item ? item.token : undefined;

  switch (item.kind) {
    case "node_created":
      nodeId = item.nodeId;
      description = `Created ${indexedActivityLabel(data, item.nodeId)} for agent ${shortAddress(item.agent)}.`;
      break;
    case "root_funded":
      description = `Owner funded ${rootName} from the bound wallet.`;
      break;
    case "capital_allocated":
      nodeId = item.childId;
      description = `Assigned capital from ${indexedActivityLabel(data, item.parentId)} to ${indexedActivityLabel(data, item.childId)}.`;
      break;
    case "capital_reclaimed":
      nodeId = item.childId;
      description = `Returned capital from ${indexedActivityLabel(data, item.childId)} to ${indexedActivityLabel(data, item.parentId)}.`;
      break;
    case "emergency_recovered":
      nodeId = item.nodeId;
      description = `Owner recovery returned assets to ${shortAddress(item.recipient)}.`;
      break;
    case "policy_tightened":
      nodeId = item.nodeId;
      description = `The mandate for ${indexedActivityLabel(data, item.nodeId)} was narrowed.`;
      break;
    case "operator_changed":
      description = `Root operator bound to ${shortAddress(item.operator)} (generation ${item.generation}).`;
      break;
    case "node_revoked":
      nodeId = item.nodeId;
      description = `Revoked ${indexedActivityLabel(data, item.nodeId)} and its delegated authority.`;
      break;
    case "swap_executed":
      nodeId = item.nodeId;
      amount = indexedTokenAmount(data, item.inputToken, item.amountIn);
      description = `Swapped ${formatIndexedRaw(data, item.inputToken, item.amountIn)} for ${formatIndexedRaw(data, item.outputToken, item.amountOut)}.`;
      break;
    case "position_opened":
    case "position_increased":
    case "position_closed":
      nodeId = item.nodeId;
      amount = indexedTokenAmount(data, data.nodes[0]?.tokenHoldings[0]?.tokenAddress ?? "", item.amount0);
      description = `Position #${item.tokenId} · liquidity ${item.liquidity} · ${formatIndexedRaw(data, data.nodes[0]?.tokenHoldings[0]?.tokenAddress ?? "", item.amount0)} and ${formatIndexedRaw(data, data.nodes[0]?.tokenHoldings[1]?.tokenAddress ?? "", item.amount1)}.`;
      break;
    case "fees_collected":
      nodeId = item.nodeId;
      description = `Collected fees from position #${item.tokenId}: ${formatIndexedRaw(data, data.nodes[0]?.tokenHoldings[0]?.tokenAddress ?? "", item.amount0)} and ${formatIndexedRaw(data, data.nodes[0]?.tokenHoldings[1]?.tokenAddress ?? "", item.amount1)}.`;
      break;
  }

  if (rawAmount !== undefined && tokenAddress) {
    amount = indexedTokenAmount(data, tokenAddress, rawAmount);
    if (!amount) description += ` Amount: ${rawAmount} raw units of ${shortAddress(tokenAddress)}.`;
  }

  return {
    id: item.id,
    kind: item.kind === "node_created" ? "node-created"
      : item.kind === "root_funded" ? "capital-funded"
        : item.kind === "capital_allocated" ? "capital-assigned"
                  : item.kind === "capital_reclaimed" ? "capital-reclaimed"
                    : item.kind === "emergency_recovered" ? "owner-recovered"
                      : item.kind === "policy_tightened" ? "policy-tightened"
                        : item.kind === "operator_changed" ? "operator-changed"
                          : item.kind === "swap_executed" ? "swap"
                            : item.kind === "position_opened" ? "position-opened"
                              : item.kind === "position_increased" ? "position-increased"
                                : item.kind === "position_closed" ? "position-closed"
                                  : item.kind === "fees_collected" ? "fees-collected"
                                    : "subtree-revoked",
    nodeId,
    nodeLabel: indexedActivityLabel(data, nodeId),
    description,
    amount,
    source: "multi-baas",
    transactionHash: item.provenance.transactionHash,
    blockNumber: item.provenance.blockNumber,
    transactionIndex: item.provenance.transactionIndex,
    logIndex: item.provenance.logIndex,
    finality: item.provenance.finality,
  };
}

async function requestActivity(rootId: string, cursor?: string, signal?: AbortSignal): Promise<ActivityFeedResult> {
  const params = new URLSearchParams({ root: rootId });
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(`/api/activity?${params}`, { cache: "no-store", signal });
  const body = await response.json() as ActivityFeedResult | { error?: { message?: unknown } };
  if (!response.ok || !("source" in body)) {
    const message = "error" in body && typeof body.error?.message === "string"
      ? body.error.message
      : "MultiBaas activity is unavailable.";
    return { source: "unavailable", reason: "upstream_error", message };
  }
  if (body.source === "multi-baas" && (body.page.rootId !== rootId || body.page.items.some((item) => item.rootId !== rootId))) {
    return { source: "unavailable", reason: "upstream_error", message: "MultiBaas returned activity for a different root." };
  }
  return body;
}

async function requestLiveTree(rootId: string, signal?: AbortSignal): Promise<DashboardData> {
  const response = await fetch(`/api/tree?root=${encodeURIComponent(rootId)}`, { cache: "no-store", signal });
  const body = await response.json() as Partial<DashboardData> & { error?: { message?: unknown } };
  if (!response.ok || body.source !== "direct-rpc") {
    throw new Error(typeof body.error?.message === "string" ? body.error.message : "The live Sepolia root could not be loaded.");
  }
  if (body.rootId !== rootId || !Array.isArray(body.nodes) || !Array.isArray(body.positions)) {
    throw new Error("The live read returned an incomplete or mismatched root snapshot.");
  }
  return body as DashboardData;
}

function IconButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button className="icon-button" type="button" aria-label={label} title="This control is not integrated yet" disabled>
      {children}
    </button>
  );
}

function PreviewFlag({ source, compact = false }: { source: DataSource; compact?: boolean }) {
  if (source !== "preview") return null;
  return (
    <span className={`preview-flag${compact ? " preview-flag-compact" : ""}`}>
      <span className="preview-flag-dot" aria-hidden="true" />
      {compact ? "Preview" : "Illustrative preview data"}
    </span>
  );
}

function WalletControl({ wallet }: { wallet: InjectedWalletState }) {
  const { address, chainId, pending, error, connect, switchToSepolia } = wallet;
  if (address) {
    const wrongNetwork = chainId !== sepolia.id;
    return (
      <div className="wallet-control">
        {wrongNetwork ? (
          <button className="network-button network-button-warning" onClick={switchToSepolia} disabled={pending} type="button">
            <span className="network-dot network-dot-warning" />
            {pending ? "Switching…" : "Switch to Sepolia"}
          </button>
        ) : (
          <span className="network-button" aria-label="Connected to Sepolia">
            <span className="network-dot" />
            Sepolia
          </span>
        )}
        <span className="wallet-address" aria-label={`Connected wallet ${shortAddress(address)}`}>
          <WalletCards size={15} aria-hidden="true" />
          <span>{shortAddress(address)}</span>
        </span>
        {error && <span className="wallet-error" role="status">{error}</span>}
      </div>
    );
  }

  return (
    <div className="wallet-control">
      <button className="button button-primary button-connect" onClick={connect} disabled={pending} type="button">
        <WalletCards size={16} aria-hidden="true" />
        {pending ? "Connecting…" : "Connect wallet"}
      </button>
      {error && <span className="wallet-error" role="status">{error}</span>}
    </div>
  );
}

function Sidebar({
  mobileOpen,
  onNavigate,
  workspaceLabel,
  workspaceInitial,
  runtimeLabel,
}: {
  mobileOpen: boolean;
  onNavigate: () => void;
  workspaceLabel: string;
  workspaceInitial: string;
  runtimeLabel: string;
}) {
  return (
    <aside className={`sidebar${mobileOpen ? " sidebar-mobile-open" : ""}`}>
      <a className="brand" href="#overview" aria-label="Agent Capital Tree overview">
        <span className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </span>
        <span className="brand-wordmark">agent capital<span>tree</span></span>
      </a>

      <div className="workspace-picker">
        <span className="workspace-avatar">{workspaceInitial}</span>
        <span className="workspace-copy">
          <span className="workspace-kicker">Workspace</span>
          <strong>{workspaceLabel}</strong>
        </span>
      </div>

      <div className="sidebar-group-label">Control room</div>
      <nav className="primary-nav" aria-label="Primary navigation">
        <a className="nav-link nav-link-active" href="#overview" aria-current="page" onClick={onNavigate}>
          <Layers3 size={17} aria-hidden="true" /> Overview
          <span className="nav-active-mark" />
        </a>
        <a className="nav-link" href="#capital-tree" onClick={onNavigate}><GitBranch size={17} aria-hidden="true" /> Capital tree</a>
        <a className="nav-link" href="#activity" onClick={onNavigate}><ActivityIcon size={17} aria-hidden="true" /> Activity</a>
      </nav>

      <div className="sidebar-group-label sidebar-group-spaced">Workspace</div>
      <nav className="primary-nav" aria-label="Workspace navigation">
        <a className="nav-link" href="#positions" onClick={onNavigate}><Coins size={17} aria-hidden="true" /> Positions</a>
        <a className="nav-link" href="#setup" onClick={onNavigate}><Command size={17} aria-hidden="true" /> Plugin setup</a>
      </nav>

      <div className="sidebar-spacer" />
      <div className="runtime-card">
        <div className="runtime-card-icon"><Unplug size={15} aria-hidden="true" /></div>
        <div>
          <strong>{runtimeLabel}</strong>
          <span>Wallet authority and agent runtime are separate.</span>
        </div>
        <span className={`runtime-status-dot${runtimeLabel === "Runtime connected" ? " runtime-status-dot-active" : runtimeLabel === "Runtime status unknown" ? " runtime-status-dot-unknown" : ""}`} aria-label={runtimeLabel} />
      </div>
      <div className="sidebar-footer">
        <span className="version-label">SEP · TEST NETWORK</span>
        <IconButton label="Help and documentation"><CircleHelp size={17} aria-hidden="true" /></IconButton>
      </div>
    </aside>
  );
}

function Topbar({ mobileOpen, onMenuToggle, source, wallet }: { mobileOpen: boolean; onMenuToggle: () => void; source: DataSource; wallet: InjectedWalletState }) {
  return (
    <header className="topbar">
      <div className="breadcrumb">
        <span>Workspace</span><span className="breadcrumb-divider">/</span><strong>Treasury overview</strong>
      </div>
      <div className="topbar-actions">
        <span className="topbar-environment"><span />{source === "preview" ? "Preview workspace" : source === "direct-rpc" ? "Direct RPC view" : "Local diagnostics"}</span>
        <a className="topbar-wallet-actions" href="#wallet-controls" aria-label="Wallet actions" title="Create or fund roots, spawn a child vault, or recover owner control">
          <ShieldCheck size={15} aria-hidden="true" />
          <span>Wallet actions</span>
        </a>
        <WalletControl wallet={wallet} />
        <button className="mobile-menu icon-button" type="button" aria-label={mobileOpen ? "Close menu" : "Open menu"} aria-expanded={mobileOpen} onClick={onMenuToggle}><Menu size={19} /></button>
      </div>
    </header>
  );
}

function PreviewNotice({ data, deployment }: { data: DashboardData; deployment: PublicDeployment }) {
  if (data.source !== "preview") return null;
  return (
    <div className="preview-notice" role="note">
      <span className="notice-symbol"><CircleDashed size={16} aria-hidden="true" /></span>
      <p><strong>Preview workspace.</strong> Balances, ENS labels, policies, LP positions and activity below are illustrative sample records. {deployment.contractsConfigured ? "Preview records cannot be used for wallet actions; use the Root ID control below to load live chain state." : "Controller deployment is still pending."}</p>
      <a href="#setup">Why preview data? <ArrowRight size={13} aria-hidden="true" /></a>
    </div>
  );
}

function RootAccessBar({ rootId, defaultRootId }: { rootId: string | null; defaultRootId: string | null }) {
  const alternateHref = rootId
    ? "/?preview=1"
    : defaultRootId
      ? `/?root=${encodeURIComponent(defaultRootId)}`
      : null;
  return (
    <div className="root-access-bar" aria-label="Root navigation">
      <form action="/" method="get" className="root-access-form">
        <label htmlFor="root-id">Root ID</label>
        <input
          id="root-id"
          name="root"
          type="text"
          inputMode="numeric"
          pattern="[1-9][0-9]*"
          maxLength={78}
          defaultValue={rootId ?? ""}
          placeholder={defaultRootId ?? "e.g. 1"}
          aria-label="Root ID to load"
          autoComplete="off"
          required
        />
        <button className="button button-secondary button-small" type="submit">Load root</button>
      </form>
      {alternateHref && (
        <a className="root-preview-link" href={alternateHref}>
          {rootId ? "Preview sample" : "Open live root"}
        </a>
      )}
    </div>
  );
}

function LiveReadNotice({
  rootId,
  data,
  loading,
  error,
  onRetry,
}: {
  rootId: string;
  data: DashboardData;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const isStale = data.source === "direct-rpc" && error !== null;
  return (
    <div className={`live-read-notice${error ? " live-read-notice-error" : loading ? " live-read-notice-loading" : ""}`} role={error ? "alert" : "status"} aria-live={error ? "assertive" : "polite"}>
      <span className="live-read-icon">{error ? <AlertCircle size={16} aria-hidden="true" /> : <CircleDashed size={16} aria-hidden="true" />}</span>
      <p>
        <strong>{error ? "Sepolia read unavailable." : loading ? "Reading live root." : `Live root ${rootId}.`}</strong>{" "}
        {error
          ? `${error} ${isStale ? "The last live snapshot remains visible, but wallet actions are locked until it refreshes." : "The dashboard is showing clearly labeled preview records."}`
          : loading
            ? isStale
              ? "Refreshing balances, current EAC permissions, and LP state. The last snapshot remains visible and wallet actions are locked."
              : "Loading balances, current EAC permissions, and LP state from the server-side Sepolia RPC."
            : `Current state was read from Sepolia${data.snapshot ? ` at block ${data.snapshot.blockNumber}` : ""}. Activity history is fetched from MultiBaas separately.`}
      </p>
      <button className="button button-secondary button-small" type="button" disabled={loading} onClick={onRetry}>{loading ? "Refreshing…" : "Refresh"}</button>
    </div>
  );
}

function OverviewHeader({ activeVaults, positions, source }: { activeVaults: number; positions: number; source: DataSource }) {
  return (
    <section className="overview-heading" id="overview">
      <div>
        <div className="eyebrow"><span className="eyebrow-dash" /> SEPOLIA · CAPITAL CONTROL</div>
        <h1>Capital, on a<br className="heading-break" /> shorter leash.</h1>
        <p className="hero-copy">One clear view of delegated capital, agent mandates, and owner control.</p>
        <div className="hero-meta">
          <span className="hero-meta-item"><GitBranch size={14} aria-hidden="true" /> {activeVaults}{source === "preview" ? " example vaults" : " active vaults"}</span>
          <span className="hero-meta-separator" />
          <span className="hero-meta-item"><Layers3 size={14} aria-hidden="true" /> {positions}{source === "preview" ? " example LP position" : " LP positions"}</span>
        </div>
      </div>
      <div className="hero-emblem" aria-hidden="true">
        <div className="orbit orbit-outer" />
        <div className="orbit orbit-inner" />
        <div className="orbit-node orbit-node-root" />
        <div className="orbit-node orbit-node-left" />
        <div className="orbit-node orbit-node-right" />
        <div className="orbit-node orbit-node-bottom" />
        <span className="orbit-label">capital<br />flows down</span>
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  unit,
  detail,
  icon,
  accent = false,
  source,
}: {
  label: string;
  value: string;
  unit: string;
  detail: string;
  icon: React.ReactNode;
  accent?: boolean;
  source: DataSource;
}) {
  return (
    <article className={`metric-card${accent ? " metric-card-accent" : ""}`}>
      <div className="metric-card-top"><span>{label}</span><span className="metric-icon">{icon}</span></div>
      <div className="metric-value">{value}<span>{unit}</span></div>
      <div className="metric-detail"><PreviewFlag source={source} compact /> <span>{detail}</span></div>
    </article>
  );
}

function SummaryMetrics({ data }: { data: DashboardData }) {
  const activeVaults = data.nodes.filter((node) => node.state === "active").length;
  const totalVaults = data.nodes.length;
  const assets = uniqueAssets(data.nodes.flatMap((node) => node.tokenHoldings));
  const allHoldings = data.nodes.flatMap((node) => node.tokenHoldings);
  const primaryAsset = assets[0] ? sumAsset(allHoldings, assets[0]) : { rawAmount: "0", decimals: 0, symbol: "" };
  const secondaryAsset = assets[1] ? sumAsset(allHoldings, assets[1]) : null;

  return (
    <section className="metrics-grid" aria-label={data.source === "preview" ? "Preview summary" : "Capital summary"}>
      <MetricCard
        label="Assets across vaults"
        value={formatAmount(primaryAsset)}
        unit={primaryAsset.symbol ? ` ${primaryAsset.symbol}` : ""}
        detail={secondaryAsset ? `${formatAmount(secondaryAsset)} ${secondaryAsset.symbol} also shown` : "Current vault token balances"}
        icon={<Coins size={17} aria-hidden="true" />}
        accent
        source={data.source}
      />
      <MetricCard
        label="Vaults in tree"
        value={String(totalVaults).padStart(2, "0")}
        unit=" / 32"
        detail={`${activeVaults} active · MVP root limit`}
        icon={<GitBranch size={17} aria-hidden="true" />}
        source={data.source}
      />
      <MetricCard
        label="Open LP positions"
        value={String(data.positions.filter((position) => position.state === "open").length).padStart(2, "0")}
        unit=""
        detail="Management and exit separate"
        icon={<Layers3 size={17} aria-hidden="true" />}
        source={data.source}
      />
      <MetricCard
        label="Runtime links"
        value={String(data.nodes.filter((node) => node.runtime === "connected").length).padStart(2, "0")}
        unit=" connected"
        detail="No agent process implied"
        icon={<Zap size={17} aria-hidden="true" />}
        source={data.source}
      />
    </section>
  );
}

function TreeCard({
  node,
  selected,
  onSelect,
  parentLabel,
}: {
  node: VaultNode;
  selected: boolean;
  onSelect: (id: string) => void;
  parentLabel?: string;
}) {
  const firstAvailable = node.freeCapital[0];
  const baseState = vaultStateLabels[node.state];
  const stateLabel = node.source === "preview" ? `Example ${baseState.toLowerCase()}` : baseState;
  const stateClass = node.state === "active" ? "node-state-active" : "node-state-inactive";

  return (
    <button
      className={`tree-node${selected ? " tree-node-selected" : ""}`}
      type="button"
      onClick={() => onSelect(node.id)}
      aria-pressed={selected}
      aria-description={parentLabel ? `Delegated by ${parentLabel}` : "Human owner root vault"}
      aria-label={`${node.label}, ${node.ensName}, ${stateLabel}`}
    >
      <div className="tree-node-head">
        <span className={`node-avatar node-avatar-${node.depth}`}>
          {node.depth === 0 ? <Fingerprint size={16} aria-hidden="true" /> : node.label.slice(0, 1)}
        </span>
        <span className={`node-state ${stateClass}`}><span />{stateLabel}</span>
        <MoreHorizontal size={16} className="node-more" aria-hidden="true" />
      </div>
      <strong className="tree-node-name">{node.label}</strong>
      <span className="tree-node-ens">{node.ensName}</span>
      <div className="tree-node-foot">
        <span><span className="capital-dot" />{firstAvailable ? <>{formatAmount(firstAvailable)} <i>{firstAvailable.symbol}</i></> : "No free balance"}</span>
        <span className="node-depth">L{node.depth}</span>
      </div>
    </button>
  );
}

interface PositionedTreeNode {
  node: VaultNode;
  left: number;
  centerY: number;
}

interface TreeEdge {
  id: string;
  path: string;
  junctionX: number;
  sourceY: number;
  targetY: number;
}

function layoutTree(nodes: readonly VaultNode[]) {
  const maxNodes = 32;
  const maxDepth = 2;
  const validNodes = nodes.filter((node) => node.depth <= maxDepth).slice(0, maxNodes);
  const validIds = new Set(validNodes.map((node) => node.id));
  const childrenById = new Map<string, VaultNode[]>();
  for (const node of validNodes) {
    if (node.parentId && validIds.has(node.parentId)) {
      const siblings = childrenById.get(node.parentId) ?? [];
      siblings.push(node);
      childrenById.set(node.parentId, siblings);
    }
  }

  const positions = new Map<string, number>();
  let leafIndex = 0;
  const visit = (node: VaultNode, path = new Set<string>()): number => {
    if (path.has(node.id)) {
      const centerY = 72 + leafIndex * 116;
      leafIndex += 1;
      positions.set(node.id, centerY);
      return centerY;
    }

    const nextPath = new Set(path);
    nextPath.add(node.id);
    const children = childrenById.get(node.id) ?? [];
    const childCenters = children.map((child) => visit(child, nextPath));
    const centerY = childCenters.length > 0
      ? childCenters.reduce((sum, center) => sum + center, 0) / childCenters.length
      : 72 + leafIndex++ * 116;
    positions.set(node.id, centerY);
    return centerY;
  };

  const roots = validNodes.filter((node) => !node.parentId || !validIds.has(node.parentId));
  for (const root of roots) visit(root);
  for (const node of validNodes) {
    if (!positions.has(node.id)) visit(node);
  }

  const positioned: PositionedTreeNode[] = validNodes.map((node) => ({
    node,
    left: 16 + node.depth * 205,
    centerY: positions.get(node.id) ?? 72,
  }));
  const byId = new Map(positioned.map((item) => [item.node.id, item]));
  const edges: TreeEdge[] = [];
  for (const child of positioned) {
    const parent = child.node.parentId ? byId.get(child.node.parentId) : undefined;
    if (!parent) continue;
    const fromX = parent.left + 176;
    const toX = child.left;
    const junctionX = (fromX + toX) / 2;
    edges.push({
      id: `${parent.node.id}-${child.node.id}`,
      path: `M ${fromX} ${parent.centerY} H ${junctionX} V ${child.centerY} H ${toX}`,
      junctionX,
      sourceY: parent.centerY,
      targetY: child.centerY,
    });
  }

  const levels = Math.max(1, ...positioned.map((item) => item.node.depth + 1));
  const width = Math.max(450, 16 + (levels - 1) * 205 + 176 + 16);
  positioned.sort((left, right) => left.node.depth - right.node.depth);
  const height = Math.max(364, 98 + Math.max(1, leafIndex) * 116);
  return {
    nodes: positioned,
    edges,
    levels,
    width,
    height,
    omittedCount: nodes.length - validNodes.length,
  };
}

function CapitalTree({ data, selectedId, onSelect, canSpawnVault, onRequestSpawn }: { data: DashboardData; selectedId: string; onSelect: (id: string) => void; canSpawnVault: boolean; onRequestSpawn: () => void }) {
  const tree = layoutTree(data.nodes);
  const nodes = tree.nodes.map((item) => item.node);

  return (
    <section className="panel tree-panel" id="capital-tree" aria-labelledby="tree-title">
      <div className="panel-heading">
        <div>
          <div className="panel-overline">CAPITAL HIERARCHY <PreviewFlag source={data.source} compact /></div>
          <h2 id="tree-title">Your agent tree</h2>
        </div>
        <div className="panel-heading-actions">
          <button className="button button-secondary button-small" disabled={!canSpawnVault} onClick={onRequestSpawn} title={canSpawnVault ? "Create a child vault with a narrower policy and initial allocation" : "Connect the active agent assigned to this vault on Sepolia"}>
            <Plus size={14} aria-hidden="true" /> Add a vault
          </button>
          <IconButton label="Tree options"><MoreHorizontal size={18} aria-hidden="true" /></IconButton>
        </div>
      </div>

      <div className="tree-scroll">
        <div
          className="tree-canvas-desktop"
          role="group"
          aria-label={data.source === "preview" ? "Preview capital tree" : "Capital tree"}
          style={{ width: tree.width, height: tree.height }}
        >
          <svg className="tree-connectors" viewBox={`0 0 ${tree.width} ${tree.height}`} aria-hidden="true">
            {tree.edges.map((edge) => (
              <g key={edge.id}>
                <path d={edge.path} />
                <circle cx={edge.junctionX} cy={edge.sourceY} r="2.1" />
                <circle cx={edge.junctionX} cy={edge.targetY} r="2.1" />
              </g>
            ))}
          </svg>
          {tree.nodes.map(({ node, left, centerY }) => (
            <div className="tree-position" role="none" key={node.id} style={{ left, top: centerY - 49 }}>
              <TreeCard node={node} selected={node.id === selectedId} onSelect={onSelect} parentLabel={node.parentId ? nodeById(data, node.parentId)?.label : undefined} />
            </div>
          ))}
          {Array.from({ length: tree.levels }, (_, depth) => (
            <div className="tree-column-label" key={depth} style={{ left: 16 + depth * 205 }}>
              {depth === 0 ? "OWNER · ROOT" : `LEVEL ${depth}`}
            </div>
          ))}
        </div>
      </div>

      <div className="tree-canvas-mobile" role="group" aria-label={data.source === "preview" ? "Preview capital tree" : "Capital tree"}>
        {tree.nodes.map(({ node }) => {
          const parent = node.parentId ? nodeById(data, node.parentId) : undefined;
          return (
            <div className={`mobile-tree-row mobile-tree-depth-${node.depth}`} role="none" key={node.id}>
              {node.depth > 0 && <span className="mobile-tree-branch" aria-hidden="true" />}
              <TreeCard node={node} selected={node.id === selectedId} onSelect={onSelect} parentLabel={parent?.label} />
              <span className="mobile-tree-parent">{parent ? `Delegated by ${parent.label}` : "Human owner · Root vault"}</span>
            </div>
          );
        })}
      </div>

      {tree.omittedCount > 0 && <p className="tree-limit-warning" role="status">{tree.omittedCount} node{tree.omittedCount === 1 ? "" : "s"} exceed the 32-node or three-level display limit.</p>}

      <div className="tree-legend">
        <span><span className="legend-line legend-line-active" />{data.source === "preview" ? "Example active authority path" : "Active authority path"}</span>
        <span><span className="legend-node" /> Select a vault to inspect its mandate</span>
      </div>
    </section>
  );
}

function PermissionList({ permissions }: { permissions: readonly Permission[] }) {
  return (
    <ul className="permission-list">
      {permissions.map((permission) => (
        <li key={permission}><Check size={13} aria-hidden="true" /><span>{permissionLabels[permission]}</span></li>
      ))}
    </ul>
  );
}

function AddressLine({ label, value, source }: { label: string; value: string; source: DataSource }) {
  const [copied, setCopied] = useState(false);

  async function copyPreviewValue() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div>
      <span>{label}</span>
      <code>{value}</code>
      <button type="button" onClick={copyPreviewValue} aria-label={`Copy ${source === "preview" ? "preview " : ""}${label.toLowerCase()}`} title={source === "preview" ? "Copy preview string" : "Copy address"}>
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </div>
  );
}

function CapitalLedger({ data, node }: { data: DashboardData; node: VaultNode }) {
  const children = data.nodes.filter((candidate) => candidate.parentId === node.id);
  const allocationHistoryAvailable = children.every((child) => child.capitalReceivedFromParent !== null);
  const outgoing = children.flatMap((child) => child.capitalReceivedFromParent ?? []);
  const assets = uniqueAssets([...node.tokenHoldings, ...node.freeCapital, ...outgoing]);

  const parent = node.parentId ? nodeById(data, node.parentId) : undefined;

  return (
    <section className="capital-ledger" aria-label={`${data.source === "preview" ? "Preview " : ""}vault holdings and allocations`}>
      <div className="capital-ledger-heading"><strong>Vault holdings &amp; flow</strong><PreviewFlag source={data.source} compact /></div>
      <div className="capital-ledger-table" role="table" aria-label="Current holdings compared with free and directly allocated capital">
        <div className="capital-ledger-row capital-ledger-header" role="row">
          <span role="columnheader">Asset</span><span role="columnheader">Held now</span><span role="columnheader">Free</span><span role="columnheader">Allocated out</span>
        </div>
        {assets.map((asset) => (
          <div className="capital-ledger-row" role="row" key={asset.key}>
            <span className="capital-ledger-asset" role="cell"><i />{asset.symbol}</span>
            <strong role="cell">{formatAmount(sumAsset(node.tokenHoldings, asset))}</strong>
            <span role="cell">{formatAmount(sumAsset(node.freeCapital, asset))}</span>
            <span role="cell">{allocationHistoryAvailable ? formatAmount(sumAsset(outgoing, asset)) : "—"}</span>
          </div>
        ))}
      </div>
      <div className="capital-origin">
        <span>{parent ? `Gross assigned in by ${parent.label}` : "Root funding origin"}</span>
        <strong>{parent ? node.capitalReceivedFromParent === null ? "Not indexed" : node.capitalReceivedFromParent.map(formatAmount).join(" · ") || "0" : "Owner wallet · no parent vault"}</strong>
      </div>
      <p className="capital-ledger-note">{allocationHistoryAvailable ? "Assignments are transfers between vaults. They are tracked separately from current holdings." : "Balances come from direct RPC. Allocation totals require the separate MultiBaas activity source."}</p>
    </section>
  );
}

function MandatePanel({ data, node, canTighten, canRevoke, canRecover, onRequestAction }: { data: DashboardData; node: VaultNode; canTighten: boolean; canRevoke: boolean; canRecover: boolean; onRequestAction: (mode: Exclude<WalletActionMode, null>) => void }) {
  const actionCeiling = policyAmountLabel(node.effectivePolicy);
  const notCurrentlyAuthorized = node.effectivePolicy.permissions.filter((permission) => !node.authorizedPermissions.includes(permission));

  return (
    <section className="panel mandate-panel" aria-labelledby="mandate-title">
      <div className="panel-heading panel-heading-compact">
        <div>
          <div className="panel-overline">SELECTED VAULT <PreviewFlag source={node.source} compact /></div>
          <h2 id="mandate-title">Effective mandate</h2>
        </div>
        <IconButton label="Mandate details"><MoreHorizontal size={18} aria-hidden="true" /></IconButton>
      </div>

      <div className="selected-vault-summary">
        <span className="selected-vault-avatar">{node.depth === 0 ? <Fingerprint size={18} /> : node.label.slice(0, 1)}</span>
        <span><strong>{node.label}</strong><small>{node.ensName}</small></span>
        <span className={`vault-state-pill vault-state-${node.state}`}><span />{node.source === "preview" ? `Example ${vaultStateLabels[node.state].toLowerCase()}` : vaultStateLabels[node.state]}</span>
      </div>

      <CapitalLedger data={data} node={node} />

      <div className="address-pair">
        <AddressLine label="Agent address" value={node.agentAddress} source={node.source} />
        <AddressLine label="Bound vault" value={node.vaultAddress} source={node.source} />
      </div>

      <div className="mandate-divider" />
      <div className="policy-section-heading">
        <span className="policy-heading-icon"><ShieldCheck size={15} aria-hidden="true" /></span>
        <div><strong>Live authorized capabilities</strong><small>Current EAC roles at this vault</small></div>
        <span className="permission-count">{node.authorizedPermissions.length}</span>
      </div>
      <PermissionList permissions={node.authorizedPermissions} />
      {notCurrentlyAuthorized.length > 0 && <p className="authorization-gap">Policy lists {notCurrentlyAuthorized.map((permission) => permissionLabels[permission]).join(" · ")}, but current EAC state does not authorize those actions.</p>}

      <div className="inherited-box">
        <div className="inherited-box-heading"><Network size={14} aria-hidden="true" /><strong>Inherited limits</strong><span>{node.inheritedConstraints.length} ancestors</span></div>
        <p>This mandate is capped by every parent on the path to the owner.</p>
        <div className="inherited-limit-row"><span>Allowed assets</span><strong>{node.effectivePolicy.allowedTokens.join(" · ")}</strong></div>
        <div className="inherited-limit-row"><span>Maximum per token</span><strong>{actionCeiling}</strong></div>
        <div className="inherited-limit-row"><span>Authorized now</span><strong>{node.authorizedPermissions.length} capabilities</strong></div>
        {node.inheritedConstraints.length > 0 && (
          <div className="ancestor-rules">
            {node.inheritedConstraints.map((constraint) => (
              <div className="ancestor-rule" key={constraint.ancestorId}>
                <strong>{constraint.ancestorLabel}</strong>
                <span>{constraint.policy.permissions.map((permission) => permissionLabels[permission]).join(" · ")}</span>
                <small>{policyAmountLabel(constraint.policy)} per token</small>
              </div>
            ))}
          </div>
        )}
        {node.inheritedConstraints.length === 0 && <div className="root-mandate-note">Root mandate · no parent constraints above this vault.</div>}
      </div>

      <div className="mandate-footnote"><Clock3 size={13} aria-hidden="true" /> Expires {new Date(node.effectivePolicy.expiresAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}<span>·</span><span className="source-label">{sourceLabel(node.source)}</span></div>
      <div className="mandate-actions">
        <button className="button button-secondary button-small" disabled={!canTighten} onClick={() => onRequestAction("tighten-policy")} title="Connect the recorded root owner or parent agent on Sepolia"><Shield size={14} /> Tighten policy</button>
        <button className="button button-danger button-small" disabled={!canRevoke} onClick={() => onRequestAction("revoke-subtree")} title="Connect the parent agent with current EAC restriction authority"><ShieldAlert size={14} /> Revoke subtree</button>
      </div>
      <div className="owner-recovery-callout">
        <div><strong>Owner emergency recovery</strong><span>ENS-independent recovery remains separate from agent permissions.</span></div>
        <button className="button button-danger button-small" disabled={!canRecover} onClick={() => onRequestAction("owner-recovery")} title="Only the recorded root owner can use emergency recovery">Review exit</button>
      </div>
    </section>
  );
}

function ActivityPanel({
  data,
  feed,
  loading,
  loadingMore,
  loadMoreError,
  onRetry,
  onLoadMore,
}: {
  data: DashboardData;
  feed: ActivityFeedResult | null;
  loading: boolean;
  loadingMore: boolean;
  loadMoreError: string | null;
  onRetry: () => void;
  onLoadMore: () => void;
}) {
  const page = feed?.source === "multi-baas" ? feed.page : null;
  const indexLag = page?.indexing.indexGapBlocks;
  const provenance = data.activitySource === "preview"
    ? "This is sample history. Transaction links appear only after an indexed on-chain receipt exists."
    : data.activitySource === "multi-baas" && page
      ? `MultiBaas ${page.indexing.state.replaceAll("_", " ")} · ${indexLag === 0 ? "caught up" : `${Math.abs(indexLag ?? 0).toLocaleString()} blocks ${indexLag && indexLag < 0 ? "ahead" : "behind"}`} · ${page.verification ? `RPC verified at block ${page.verification.checkedAtBlock}; ${page.verification.orphanedItems} orphaned record${page.verification.orphanedItems === 1 ? "" : "s"} removed.` : "Canonical receipt verification pending."}`
      : data.activitySource === "unavailable"
        ? feed?.source === "unavailable" ? feed.message : "Activity history is not configured. Direct RPC data is not used as an activity-history fallback."
        : "Activity is reported by a local diagnostic source.";
  const activitySource = data.activitySource === "preview" ? "preview" : data.source;

  return (
    <section className="panel activity-panel" id="activity" aria-labelledby="activity-title">
      <div className="panel-heading">
        <div>
          <div className="panel-overline">CAPITAL & POLICY LOG <PreviewFlag source={activitySource} compact /></div>
          <h2 id="activity-title">Recent activity</h2>
        </div>
        <div className="activity-heading-actions">
          <span className="activity-count">{data.activity.length}{data.activitySource === "preview" ? " preview" : ""} records</span>
          {(feed?.source === "unavailable" || loadMoreError) && <button className="button button-secondary button-small" type="button" disabled={loading} onClick={onRetry}>{loading ? "Checking…" : "Retry history"}</button>}
        </div>
      </div>
      <ol className="activity-list" id="activity-list">
        {data.activity.map((activity, index) => {
          const icon = activity.kind === "capital-assigned"
            ? <ArrowDownLeft size={15} />
            : activity.kind === "swap"
              ? <ArrowLeftRight size={15} />
              : activity.kind === "position-opened" || activity.kind === "position-increased" || activity.kind === "position-closed" || activity.kind === "node-created"
                ? <Layers3 size={15} />
                : activity.kind === "policy-tightened" || activity.kind === "subtree-revoked" || activity.kind === "operator-changed" || activity.kind === "owner-recovered"
                  ? <ShieldCheck size={15} />
                  : <Coins size={15} />;
          return (
            <li className="activity-row" key={activity.id}>
              <span className={`activity-icon activity-icon-${index}`}>{icon}</span>
              <div className="activity-copy">
                <strong>{activityLabels[activity.kind]} <span>· {activity.nodeLabel}</span></strong>
                <small>{activity.description}</small>
              </div>
              <div className="activity-meta">
                {activity.amount && <strong>{formatAmount(activity.amount)} <span>{activity.amount.symbol}</span></strong>}
                <time dateTime={activity.timestamp}>{activity.timestamp ? `${new Date(activity.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC` : activity.blockNumber !== undefined ? `Block ${activity.blockNumber.toLocaleString()}` : ""}</time>
                {activity.finality && <small className={`activity-finality activity-finality-${activity.finality}`}>{activity.finality.replaceAll("_", " ")}</small>}
                {activity.transactionHash && activity.source === "multi-baas" && data.chainId === sepolia.id && (
                  <a className="activity-transaction-link" href={`https://sepolia.etherscan.io/tx/${activity.transactionHash}`} target="_blank" rel="noreferrer">
                    Receipt <ExternalLink size={9} aria-hidden="true" />
                  </a>
                )}
              </div>
              <span className="activity-source">{activity.source === "preview" ? "PREVIEW" : activity.source === "multi-baas" ? "INDEXED" : "LOCAL"}</span>
            </li>
          );
        })}
      </ol>
      {data.activity.length === 0 && <p className="activity-empty">{loading ? "Loading activity history…" : data.activitySource === "preview" ? "Preview records are shown above when available." : feed?.source === "unavailable" ? "Indexed activity is unavailable for this root." : "No activity records are available for this root yet."}</p>}
      {loadMoreError && feed?.source !== "unavailable" && <p className="activity-load-error" role="alert">{loadMoreError}</p>}
      {page?.hasMore && <button className="button button-secondary button-small activity-load-more" type="button" disabled={loadingMore} onClick={onLoadMore}>{loadingMore ? "Loading…" : "Load earlier activity"}</button>}
      <div className="activity-provenance"><span className="provenance-dot" />{loading && data.activitySource !== "preview" ? "Refreshing MultiBaas activity…" : provenance}</div>
    </section>
  );
}

function PositionsPanel({ data, actions, walletOnSepolia }: { data: DashboardData; actions?: DashboardActions; walletOnSepolia: boolean }) {
  return (
    <section className="panel positions-panel" id="positions" aria-labelledby="positions-title">
      <div className="panel-heading">
        <div>
          <div className="panel-overline">LIQUIDITY BOOK <PreviewFlag source={data.source} compact /></div>
          <h2 id="positions-title">LP positions</h2>
        </div>
        <IconButton label="Position options"><MoreHorizontal size={18} aria-hidden="true" /></IconButton>
      </div>
      {data.positions.length > 0 ? data.positions.map((position) => (
        <div className="position-record" key={position.id}>
          <div className="position-pool-row">
            <span className="token-pair-icon"><span>{position.token0?.symbol.slice(0, 1) ?? "?"}</span><span>{position.token1?.symbol.slice(0, 1) ?? "?"}</span></span>
            <div><strong>{position.poolLabel}</strong><small>Vault-owned NFT · {position.source === "preview" ? "example " : ""}position {position.id}</small></div>
            <span className={`position-open-pill position-state-${position.state}`}><span />{position.source === "preview" ? `Example ${position.state}` : position.state === "unknown" ? "Status unknown" : position.state}</span>
          </div>
      <div className="position-stats">
            <div><span>Liquidity</span><strong>{position.liquidity}<small> units</small></strong></div>
            <div><span>Position principal</span><strong>{position.token0 ? `${formatAmount(position.token0)} ${position.token0.symbol}` : "Not queried"}</strong><strong>{position.token1 ? `${formatAmount(position.token1)} ${position.token1.symbol}` : "Not queried"}</strong></div>
            <div><span>Uncollected fees</span><strong>{position.fees0 ? `${formatAmount(position.fees0)} ${position.fees0.symbol}` : "Not queried"}</strong><strong>{position.fees1 ? `${formatAmount(position.fees1)} ${position.fees1.symbol}` : "Not queried"}</strong></div>
          </div>
          <div className="position-separation"><LockKeyhole size={13} aria-hidden="true" /><span>{position.source === "direct-rpc" ? "Position NFT and liquidity are read from Sepolia; principal and fees are not queried." : "Fee collection, routine exit, and owner recovery are separate permissions."}</span></div>
          <div className="position-actions">
            <button className="button button-secondary button-small" disabled={data.source === "preview" || !data.contractsConfigured || !walletOnSepolia || !actions?.collectFees} onClick={() => void actions?.collectFees?.(position.id)} title="Available after live Sepolia wallet and fee integration">Collect fees</button>
            <button className="button button-secondary button-small" disabled={data.source === "preview" || !data.contractsConfigured || !walletOnSepolia || !actions?.closePosition} onClick={() => void actions?.closePosition?.(position.id)} title="Available after live Sepolia wallet and exit integration">Close position</button>
          </div>
        </div>
      )) : (
        <div className="empty-position"><Layers3 size={18} /><span>No position is present in this data source.</span></div>
      )}
    </section>
  );
}

function ContractSetupPanel({ data, deployment, actions, wallet, liveStateReady }: { data: DashboardData; deployment: PublicDeployment; actions: DashboardActions; wallet: InjectedWalletState; liveStateReady: boolean }) {
  const { contractsConfigured } = deployment;
  const indexerConnected = data.activitySource === "multi-baas";
  const walletOnSepolia = wallet.address !== null && wallet.chainId === sepolia.id;
  const ownerRecoveryReady = liveStateReady && data.source === "direct-rpc" && contractsConfigured && walletOnSepolia &&
    wallet.address?.toLowerCase() === data.rootOwner?.toLowerCase() && Boolean(actions?.ownerEmergencyRecover);
  const walletStepReady = walletOnSepolia;
  const setupDescription = ownerRecoveryReady
    ? "The recorded root owner is connected. Each owner recovery transaction is simulated against Sepolia before wallet approval."
    : contractsConfigured
      ? liveStateReady
        ? "Live state is available. Root and child actions unlock only for the recorded owner or an agent with current parent authority."
        : "Load a root ID to read current balances and EAC authority. Creating a new root remains available from Wallet actions."
      : "The Sepolia controller and demo-token addresses are not configured. Wallet actions remain locked until deployment is recorded.";
  return (
    <section className="setup-panel" id="setup" aria-labelledby="setup-title">
      <div className="setup-orbit" aria-hidden="true"><span /><span /><span /></div>
      <div className="setup-copy">
        <div className="setup-status"><span className="setup-status-dot" /> {ownerRecoveryReady ? "OWNER CONTROLS READY" : contractsConfigured ? "CONTRACTS CONFIGURED" : "DEPLOYMENT PENDING"}</div>
        <h2 id="setup-title">Owner control<br />starts on-chain.</h2>
        <p>{setupDescription}</p>
        {contractsConfigured ? <a className="button button-setup" href="#wallet-controls">Review wallet actions<ArrowUpRight size={15} aria-hidden="true" /></a> : <button className="button button-setup" disabled title="Available after the controller and demo tokens are deployed">Setup is pending<ArrowUpRight size={15} aria-hidden="true" /></button>}
      </div>
      <div className="setup-steps" aria-label="Setup status">
        <div className={walletStepReady ? "setup-step setup-step-complete" : "setup-step setup-step-pending"}><span>{walletStepReady ? <Check size={12} /> : "1"}</span><div><strong>{walletStepReady ? "Wallet connected" : wallet.address ? "Switch to Sepolia" : "Connect wallet"}</strong><small>{walletStepReady ? shortAddress(wallet.address ?? "") : wallet.address ? "Connected on another network" : "Injected wallet · Sepolia"}</small></div></div>
        <div className={contractsConfigured ? "setup-step setup-step-complete" : "setup-step setup-step-pending"}><span>{contractsConfigured ? <Check size={12} /> : "2"}</span><div><strong>Controller deploy</strong><small>{contractsConfigured ? "Address configuration present" : "Contract address pending"}</small></div></div>
        <div className={indexerConnected ? "setup-step setup-step-complete" : "setup-step setup-step-pending"}><span>{indexerConnected ? <Check size={12} /> : "3"}</span><div><strong>Indexer connect</strong><small>{indexerConnected ? "MultiBaas activity source active" : "MultiBaas activity source pending"}</small></div></div>
        <div className="setup-step setup-step-pending"><span>4</span><div><strong>Codex plugin</strong><small>Independent setup pending</small></div></div>
      </div>
      <div className="setup-border" aria-hidden="true" />
    </section>
  );
}

function Footer({ source, walletConnected }: { source: DataSource; walletConnected: boolean }) {
  return (
    <footer className="dashboard-footer">
      <span><span className="footer-indicator" /> CONTROL PANEL · {source === "preview" ? "READ-ONLY PREVIEW" : source === "direct-rpc" ? "DIRECT RPC VIEW" : "LOCAL DIAGNOSTICS"}</span>
      <span>{walletConnected ? "Owner authority remains with your connected wallet" : "Connect your wallet to review owner controls"}</span>
      <a href="#setup">Integration status <ArrowUpRight size={12} aria-hidden="true" /></a>
    </footer>
  );
}

export function Dashboard({ data: initialData, deployment, rootQuery }: DashboardProps) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(initialData.rootId);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [walletActionMode, setWalletActionMode] = useState<WalletActionMode>(null);
  const [liveSnapshot, setLiveSnapshot] = useState<{ rootId: string; data: DashboardData } | null>(null);
  const [readState, setReadState] = useState<{ rootId: string | null; status: "idle" | "loading" | "ready" | "error"; error: string | null }>({ rootId: null, status: "idle", error: null });
  const [activityState, setActivityState] = useState<{ rootId: string | null; feed: ActivityFeedResult | null; loading: boolean; loadingMore: boolean; loadMoreError: string | null }>({ rootId: null, feed: null, loading: false, loadingMore: false, loadMoreError: null });
  const [treeRetry, setTreeRetry] = useState(0);
  const [activityRetry, setActivityRetry] = useState(0);
  const wallet = useInjectedWallet();
  const walletOnSepolia = wallet.address !== null && wallet.chainId === sepolia.id;
  const currentSnapshot = rootQuery && liveSnapshot?.rootId === rootQuery ? liveSnapshot.data : null;
  const currentReadState = rootQuery && readState.rootId === rootQuery
    ? readState
    : { rootId: rootQuery, status: rootQuery ? "loading" as const : "idle" as const, error: null };
  const liveStateReady = Boolean(rootQuery && currentSnapshot && currentReadState.status === "ready");
  const data = currentSnapshot ?? initialData;
  const activeActivityState = rootQuery && activityState.rootId === rootQuery
    ? activityState
    : { rootId: rootQuery, feed: null, loading: Boolean(rootQuery), loadingMore: false, loadMoreError: null };
  const activityFeed = rootQuery ? activeActivityState.feed : null;
  const activityItems = activityFeed?.source === "multi-baas"
    ? activityFeed.page.items.map((item) => mapIndexedActivity({ ...data, rootId: rootQuery ?? data.rootId }, item))
    : [];
  const dashboardData: DashboardData = rootQuery
    ? {
      ...data,
      rootId: rootQuery,
      activitySource: activityFeed?.source === "multi-baas" ? "multi-baas" : "unavailable",
      activity: activityItems,
    }
    : data;
  const selectedNode = nodeById(data, selectedId) ?? nodeById(data, data.rootId) ?? data.nodes[0];
  const rootNode = nodeById(data, data.rootId);
  const walletAddress = wallet.address?.toLowerCase();
  const ownerConnected = Boolean(liveStateReady && walletOnSepolia && walletAddress && data.rootOwner && walletAddress === data.rootOwner.toLowerCase());
  const selectedAgentConnected = Boolean(liveStateReady && walletOnSepolia && walletAddress && selectedNode?.agentAddress.toLowerCase() === walletAddress);
  const selectedParent = selectedNode?.parentId ? nodeById(data, selectedNode.parentId) : undefined;
  const parentCanRestrict = Boolean(liveStateReady && walletOnSepolia && walletAddress && selectedParent?.agentAddress.toLowerCase() === walletAddress && selectedParent.authorizedPermissions.includes("restrict"));
  const canSpawnVault = Boolean(liveStateReady && selectedNode && selectedNode.state === "active" && selectedNode.authorizedPermissions.includes("delegate") && selectedAgentConnected);
  const canTighten = Boolean(liveStateReady && selectedNode && (selectedNode.parentId ? parentCanRestrict : ownerConnected));
  const canRevoke = Boolean(liveStateReady && selectedNode?.parentId && selectedNode.state !== "revoked" && selectedNode.state !== "expired" && parentCanRestrict);
  const canRecover = Boolean(liveStateReady && ownerConnected);
  const activeVaults = data.nodes.filter((node) => node.state === "active").length;
  const runtimeConnected = data.nodes.some((node) => node.runtime === "connected");
  const runtimeUnknown = data.nodes.some((node) => node.runtime === "unknown");
  const runtimeLabel = runtimeConnected ? "Runtime connected" : runtimeUnknown ? "Runtime status unknown" : "Runtime not linked";

  const refreshConfirmedState = useCallback(() => {
    setTreeRetry((value) => value + 1);
    setActivityRetry((value) => value + 1);
  }, []);
  const { actions, notice } = useWalletActions({
    data,
    deployment,
    address: wallet.address,
    chainId: wallet.chainId,
    onConfirmed: refreshConfirmedState,
  });

  useEffect(() => {
    if (!rootQuery) {
      setReadState({ rootId: null, status: "idle", error: null });
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;

    const scheduleRefresh = () => {
      timer = setTimeout(() => {
        if (document.visibilityState === "visible") void load();
        else scheduleRefresh();
      }, 10_000);
    };
    const load = async () => {
      controller = new AbortController();
      setReadState({ rootId: rootQuery, status: "loading", error: null });
      try {
        const nextData = await requestLiveTree(rootQuery, controller.signal);
        if (cancelled) return;
        setLiveSnapshot({ rootId: rootQuery, data: nextData });
        setSelectedId((current) => nextData.nodes.some((node) => node.id === current) ? current : nextData.rootId);
        setReadState({ rootId: rootQuery, status: "ready", error: null });
      } catch (cause) {
        if (cancelled || controller?.signal.aborted) return;
        setReadState({ rootId: rootQuery, status: "error", error: cause instanceof Error ? cause.message : "The Sepolia read failed." });
      }
      if (!cancelled) scheduleRefresh();
    };

    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      controller?.abort();
    };
  }, [rootQuery, treeRetry]);

  useEffect(() => {
    if (!rootQuery) {
      setActivityState({ rootId: null, feed: null, loading: false, loadingMore: false, loadMoreError: null });
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;

    const scheduleRefresh = () => {
      timer = setTimeout(() => {
        if (document.visibilityState === "visible") void load();
        else scheduleRefresh();
      }, 10_000);
    };
    const load = async () => {
      controller = new AbortController();
      setActivityState((current) => ({
        rootId: rootQuery,
        feed: current.rootId === rootQuery ? current.feed : null,
        loading: true,
        loadingMore: current.rootId === rootQuery && current.loadingMore,
        loadMoreError: null,
      }));
      try {
        const result = await requestActivity(rootQuery, undefined, controller.signal);
        if (cancelled) return;
        setActivityState((current) => ({
          rootId: rootQuery,
          feed: result.source === "unavailable" && current.rootId === rootQuery && current.feed?.source === "multi-baas" ? current.feed : result,
          loading: false,
          loadingMore: current.rootId === rootQuery && current.loadingMore,
          loadMoreError: result.source === "unavailable" ? result.message : null,
        }));
      } catch (cause) {
        if (cancelled || controller?.signal.aborted) return;
        setActivityState((current) => ({
          rootId: rootQuery,
          feed: current.rootId === rootQuery && current.feed?.source === "multi-baas"
            ? current.feed
            : { source: "unavailable", reason: "upstream_error", message: cause instanceof Error ? cause.message : "MultiBaas activity is unavailable." },
          loading: false,
          loadingMore: current.rootId === rootQuery && current.loadingMore,
          loadMoreError: cause instanceof Error ? cause.message : "MultiBaas activity is unavailable.",
        }));
      }
      if (!cancelled) scheduleRefresh();
    };

    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      controller?.abort();
    };
  }, [rootQuery, activityRetry]);

  async function loadEarlierActivity() {
    if (!rootQuery || activeActivityState.loadingMore || activeActivityState.feed?.source !== "multi-baas") return;
    const cursor = activeActivityState.feed.page.nextCursor;
    if (!cursor) return;
    const requestedRoot = rootQuery;
    setActivityState((current) => current.rootId === requestedRoot ? { ...current, loadingMore: true, loadMoreError: null } : current);
    try {
      const result = await requestActivity(requestedRoot, cursor);
      if (result.source === "unavailable") {
        setActivityState((current) => current.rootId === requestedRoot ? { ...current, loadingMore: false, loadMoreError: result.message } : current);
        return;
      }
      setActivityState((current) => {
        if (current.rootId !== requestedRoot || current.feed?.source !== "multi-baas") return current;
        const seen = new Set<string>();
        const items = [...current.feed.page.items, ...result.page.items].filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
        return {
          ...current,
          feed: { source: "multi-baas", page: { ...result.page, items } },
          loadingMore: false,
          loadMoreError: null,
        };
      });
    } catch (cause) {
      setActivityState((current) => current.rootId === requestedRoot
        ? { ...current, loadingMore: false, loadMoreError: cause instanceof Error ? cause.message : "Earlier activity could not be loaded." }
        : current);
    }
  }

  if (!selectedNode) return null;

  const liveError = currentReadState.status === "error" ? currentReadState.error : null;

  return (
    <div className="app-shell">
      <Sidebar
        mobileOpen={mobileOpen}
        onNavigate={() => setMobileOpen(false)}
        workspaceLabel={`${rootNode?.label ?? "Treasury"} · ${data.source === "preview" ? "Preview" : "Root"}`}
        workspaceInitial={(rootNode?.label ?? "T").slice(0, 1).toUpperCase()}
        runtimeLabel={runtimeLabel}
      />
      <main className="main-shell">
        <Topbar mobileOpen={mobileOpen} onMenuToggle={() => setMobileOpen((open) => !open)} source={data.source} wallet={wallet} />
        <div className="dashboard-content">
          <PreviewNotice data={data} deployment={deployment} />
          <RootAccessBar rootId={rootQuery} defaultRootId={deployment.defaultRootId} />
          {rootQuery && <LiveReadNotice rootId={rootQuery} data={data} loading={currentReadState.status === "loading"} error={liveError} onRetry={() => setTreeRetry((value) => value + 1)} />}
          <OverviewHeader activeVaults={activeVaults} positions={data.positions.length} source={data.source} />
          <SummaryMetrics data={data} />

          <div className="primary-grid">
            <CapitalTree data={data} selectedId={selectedNode.id} onSelect={setSelectedId} canSpawnVault={canSpawnVault} onRequestSpawn={() => {
              setWalletActionMode("spawn-child");
              router.push("#wallet-controls");
            }} />
            <MandatePanel data={data} node={selectedNode} canTighten={canTighten} canRevoke={canRevoke} canRecover={canRecover} onRequestAction={(mode) => {
              setWalletActionMode(mode);
              router.push("#wallet-controls");
            }} />
          </div>

          <div className="secondary-grid">
            <ActivityPanel
              data={dashboardData}
              feed={activityFeed}
              loading={activeActivityState.loading}
              loadingMore={activeActivityState.loadingMore}
              loadMoreError={activeActivityState.loadMoreError}
              onRetry={() => setActivityRetry((value) => value + 1)}
              onLoadMore={() => void loadEarlierActivity()}
            />
            <PositionsPanel data={data} actions={actions} walletOnSepolia={walletOnSepolia} />
          </div>

          <WalletControlsPanel
            data={data}
            deployment={deployment}
            selectedNode={selectedNode}
            walletAddress={wallet.address}
            walletOnSepolia={walletOnSepolia}
            liveStateReady={liveStateReady}
            actions={actions}
            notice={notice}
            mode={walletActionMode}
            onModeChange={setWalletActionMode}
            onRootCreated={(rootId) => {
              setWalletActionMode(null);
              router.push(`/?root=${encodeURIComponent(rootId)}`);
            }}
          />
          <ContractSetupPanel data={dashboardData} deployment={deployment} actions={actions} wallet={wallet} liveStateReady={liveStateReady} />
          <Footer source={data.source} walletConnected={walletOnSepolia} />
        </div>
      </main>
    </div>
  );
}
