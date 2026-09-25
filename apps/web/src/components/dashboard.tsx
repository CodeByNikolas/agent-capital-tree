"use client";

import {
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
import { useEffect, useState } from "react";
import type {
  ActivityKind,
  DashboardActions,
  DashboardData,
  DataSource,
  Permission,
  TokenAmount,
  VaultNode,
  VaultState,
} from "@/lib/dashboard-types";

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
  actions?: DashboardActions;
}

const permissionLabels: Record<Permission, string> = {
  delegate: "Delegate capital",
  swap: "Swap assets",
  "manage-liquidity": "Manage LP position",
  "collect-fees": "Collect fees",
  "exit-liquidity": "Exit LP position",
  reclaim: "Reclaim assets",
};

const activityLabels: Record<ActivityKind, string> = {
  "capital-assigned": "Capital assigned",
  swap: "Swap",
  "position-opened": "Position opened",
  "fees-collected": "Fees collected",
  "policy-tightened": "Policy narrowed",
  "subtree-revoked": "Subtree revoked",
  "assets-reclaimed": "Assets reclaimed",
};

const vaultStateLabels: Record<VaultState, string> = {
  active: "Active",
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
    if (!provider?.on) return;

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
    case "onchain-indexer":
      return "Indexed on Sepolia";
    case "local-diagnostic":
      return "Local diagnostic";
  }
}

function nodeById(data: DashboardData, id: string): VaultNode | undefined {
  return data.nodes.find((node) => node.id === id);
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
        <span className={`runtime-status-dot${runtimeLabel === "Runtime connected" ? " runtime-status-dot-active" : ""}`} aria-label={runtimeLabel} />
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
        <span className="topbar-environment"><span />{source === "preview" ? "Preview workspace" : source === "onchain-indexer" ? "Indexed workspace" : "Local diagnostics"}</span>
        <WalletControl wallet={wallet} />
        <button className="mobile-menu icon-button" type="button" aria-label={mobileOpen ? "Close menu" : "Open menu"} aria-expanded={mobileOpen} onClick={onMenuToggle}><Menu size={19} /></button>
      </div>
    </header>
  );
}

function PreviewNotice({ data }: { data: DashboardData }) {
  if (data.source !== "preview") return null;
  return (
    <div className="preview-notice" role="note">
      <span className="notice-symbol"><CircleDashed size={16} aria-hidden="true" /></span>
      <p><strong>Preview workspace.</strong> Balances, ENS labels, policies, LP positions and activity below are illustrative sample records. {data.contractsConfigured ? "Preview records cannot be used for wallet actions." : "No contract addresses are configured."}</p>
      <a href="#setup">Why preview data? <ArrowRight size={13} aria-hidden="true" /></a>
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
        value={String(activeVaults).padStart(2, "0")}
        unit=" / 32"
        detail="MVP root limit"
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

function CapitalTree({ data, selectedId, onSelect, actions, walletOnSepolia }: { data: DashboardData; selectedId: string; onSelect: (id: string) => void; actions?: DashboardActions; walletOnSepolia: boolean }) {
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
          <button className="button button-secondary button-small" disabled={data.source === "preview" || !data.contractsConfigured || !walletOnSepolia || !actions?.spawnChild} onClick={() => void actions?.spawnChild?.(selectedId)} title="Available after live Sepolia contract and spawn integration">
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
  const outgoing = children.flatMap((child) => child.capitalReceivedFromParent);
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
            <span role="cell">{formatAmount(sumAsset(outgoing, asset))}</span>
          </div>
        ))}
      </div>
      <div className="capital-origin">
        <span>{parent ? `Gross assigned in by ${parent.label}` : "Root funding origin"}</span>
        <strong>{parent ? node.capitalReceivedFromParent.map(formatAmount).join(" · ") || "0" : "Owner wallet · no parent vault"}</strong>
      </div>
      <p className="capital-ledger-note">Assignments are transfers between vaults. They are tracked separately from current holdings.</p>
    </section>
  );
}

function MandatePanel({ data, node, contractsConfigured, actions, walletOnSepolia }: { data: DashboardData; node: VaultNode; contractsConfigured: boolean; actions?: DashboardActions; walletOnSepolia: boolean }) {
  const actionCeiling = formatAmount(node.effectivePolicy.maxActionAmount);

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
        <div><strong>Explicit permissions</strong><small>Granted at this vault</small></div>
        <span className="permission-count">{node.localPolicy.permissions.length}</span>
      </div>
      <PermissionList permissions={node.localPolicy.permissions} />

      <div className="inherited-box">
        <div className="inherited-box-heading"><Network size={14} aria-hidden="true" /><strong>Inherited limits</strong><span>{node.inheritedConstraints.length} ancestors</span></div>
        <p>This mandate is capped by every parent on the path to the owner.</p>
        <div className="inherited-limit-row"><span>Allowed assets</span><strong>{node.effectivePolicy.allowedTokens.join(" · ")}</strong></div>
        <div className="inherited-limit-row"><span>Maximum per action</span><strong>≤ {actionCeiling} {node.effectivePolicy.maxActionAmount.symbol}</strong></div>
        <div className="inherited-limit-row"><span>Effective permissions</span><strong>{node.effectivePolicy.permissions.length} capabilities</strong></div>
        {node.inheritedConstraints.length > 0 && (
          <div className="ancestor-rules">
            {node.inheritedConstraints.map((constraint) => (
              <div className="ancestor-rule" key={constraint.ancestorId}>
                <strong>{constraint.ancestorLabel}</strong>
                <span>{constraint.policy.permissions.map((permission) => permissionLabels[permission]).join(" · ")}</span>
                <small>≤ {formatAmount(constraint.policy.maxActionAmount)} {constraint.policy.maxActionAmount.symbol} per action</small>
              </div>
            ))}
          </div>
        )}
        {node.inheritedConstraints.length === 0 && <div className="root-mandate-note">Root mandate · no parent constraints above this vault.</div>}
      </div>

      <div className="mandate-footnote"><Clock3 size={13} aria-hidden="true" /> Expires {new Date(node.effectivePolicy.expiresAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}<span>·</span><span className="source-label">{sourceLabel(node.source)}</span></div>
      <div className="mandate-actions">
        <button className="button button-secondary button-small" disabled={data.source === "preview" || !contractsConfigured || !walletOnSepolia || !actions?.tightenPolicy} onClick={() => void actions?.tightenPolicy?.(node.id)} title="Available after live Sepolia wallet and policy integration"><Shield size={14} /> Tighten policy</button>
        <button className="button button-danger button-small" disabled={data.source === "preview" || !contractsConfigured || !walletOnSepolia || !actions?.revokeSubtree} onClick={() => void actions?.revokeSubtree?.(node.id)} title="Available after live Sepolia wallet and revoke integration"><ShieldAlert size={14} /> Revoke subtree</button>
      </div>
      <div className="owner-recovery-callout">
        <div><strong>Owner emergency recovery</strong><span>ENS-independent recovery remains separate from agent permissions.</span></div>
        <button className="button button-danger button-small" disabled={data.source === "preview" || !contractsConfigured || !walletOnSepolia || !actions?.ownerEmergencyRecover} onClick={() => void actions?.ownerEmergencyRecover?.(node.id)} title="Available after live Sepolia wallet and owner recovery integration">Review exit</button>
      </div>
    </section>
  );
}

function ActivityPanel({ data }: { data: DashboardData }) {
  return (
    <section className="panel activity-panel" id="activity" aria-labelledby="activity-title">
      <div className="panel-heading">
        <div>
          <div className="panel-overline">CAPITAL & POLICY LOG <PreviewFlag source={data.source} compact /></div>
          <h2 id="activity-title">Recent activity</h2>
        </div>
        <span className="activity-count">{data.activity.length}{data.source === "preview" ? " preview" : ""} records</span>
      </div>
      <ol className="activity-list" id="activity-list">
        {data.activity.map((activity, index) => {
          const icon = activity.kind === "capital-assigned"
            ? <ArrowDownLeft size={15} />
            : activity.kind === "swap"
              ? <ArrowLeftRight size={15} />
              : activity.kind === "position-opened"
                ? <Layers3 size={15} />
                : activity.kind === "policy-tightened" || activity.kind === "subtree-revoked"
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
                <time dateTime={activity.timestamp}>{new Date(activity.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC</time>
                {activity.transactionHash && activity.source === "onchain-indexer" && data.chainId === sepolia.id && (
                  <a className="activity-transaction-link" href={`https://sepolia.etherscan.io/tx/${activity.transactionHash}`} target="_blank" rel="noreferrer">
                    Receipt <ExternalLink size={9} aria-hidden="true" />
                  </a>
                )}
              </div>
              <span className="activity-source">{activity.source === "preview" ? "PREVIEW" : activity.source === "onchain-indexer" ? "INDEXED" : "LOCAL"}</span>
            </li>
          );
        })}
      </ol>
      <div className="activity-provenance"><span className="provenance-dot" />{data.source === "preview" ? "This is sample history. Transaction links appear only after an indexed on-chain receipt exists." : data.source === "onchain-indexer" ? "Activity is sourced from indexed on-chain events and receipts." : "Activity is reported by a local diagnostic source."}</div>
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
            <span className="token-pair-icon"><span>{position.token0.symbol.slice(0, 1)}</span><span>{position.token1.symbol.slice(0, 1)}</span></span>
            <div><strong>{position.poolLabel}</strong><small>Vault-owned NFT · {position.source === "preview" ? "example " : ""}position {position.id}</small></div>
            <span className={`position-open-pill position-state-${position.state}`}><span />{position.source === "preview" ? `Example ${position.state}` : position.state === "unknown" ? "Status unknown" : position.state}</span>
          </div>
          <div className="position-stats">
            <div><span>Liquidity</span><strong>{position.liquidity}<small> units</small></strong></div>
            <div><span>Uncollected fees</span><strong>{formatAmount(position.fees0)} <small>{position.fees0.symbol}</small></strong><strong>{formatAmount(position.fees1)} <small>{position.fees1.symbol}</small></strong></div>
          </div>
          <div className="position-separation"><LockKeyhole size={13} aria-hidden="true" /><span>Fee collection, routine exit, and owner recovery are separate permissions.</span></div>
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

function ContractSetupPanel({ data, actions, wallet }: { data: DashboardData; actions?: DashboardActions; wallet: InjectedWalletState }) {
  const { contractsConfigured } = data;
  const indexerConnected = data.source === "onchain-indexer";
  const walletOnSepolia = wallet.address !== null && wallet.chainId === sepolia.id;
  const ownerRecoveryReady = data.source !== "preview" && contractsConfigured && walletOnSepolia && Boolean(actions?.ownerEmergencyRecover);
  const walletStepReady = walletOnSepolia;
  return (
    <section className="setup-panel" id="setup" aria-labelledby="setup-title">
      <div className="setup-orbit" aria-hidden="true"><span /><span /><span /></div>
      <div className="setup-copy">
        <div className="setup-status"><span className="setup-status-dot" /> {ownerRecoveryReady ? "OWNER RECOVERY AVAILABLE" : contractsConfigured ? "CONTRACTS CONFIGURED · ACTIONS PENDING" : "DEPLOYMENT PENDING"}</div>
        <h2 id="setup-title">Owner control<br />starts on-chain.</h2>
        <p>{ownerRecoveryReady ? "The owner recovery adapter is connected. Recovery actions still require wallet approval." : contractsConfigured ? "Contracts are configured, but wallet action integration is still pending." : "The Sepolia controller and vault addresses have not been configured. Wallet actions stay locked until they are."}</p>
        {ownerRecoveryReady ? <a className="button button-setup" href="#capital-tree">Review owner controls<ArrowUpRight size={15} aria-hidden="true" /></a> : <button className="button button-setup" disabled title="Available after wallet action integration">Setup is pending<ArrowUpRight size={15} aria-hidden="true" /></button>}
      </div>
      <div className="setup-steps" aria-label="Setup status">
        <div className={walletStepReady ? "setup-step setup-step-complete" : "setup-step setup-step-pending"}><span>{walletStepReady ? <Check size={12} /> : "1"}</span><div><strong>{walletStepReady ? "Wallet connected" : wallet.address ? "Switch to Sepolia" : "Connect wallet"}</strong><small>{walletStepReady ? shortAddress(wallet.address ?? "") : wallet.address ? "Connected on another network" : "Injected wallet · Sepolia"}</small></div></div>
        <div className={contractsConfigured ? "setup-step setup-step-complete" : "setup-step setup-step-pending"}><span>{contractsConfigured ? <Check size={12} /> : "2"}</span><div><strong>Controller deploy</strong><small>{contractsConfigured ? "Address configuration present" : "Contract address pending"}</small></div></div>
        <div className={indexerConnected ? "setup-step setup-step-complete" : "setup-step setup-step-pending"}><span>{indexerConnected ? <Check size={12} /> : "3"}</span><div><strong>Indexer connect</strong><small>{indexerConnected ? "Indexed event source active" : "MultiBaas source pending"}</small></div></div>
        <div className="setup-step setup-step-pending"><span>4</span><div><strong>Codex plugin</strong><small>Independent setup pending</small></div></div>
      </div>
      <div className="setup-border" aria-hidden="true" />
    </section>
  );
}

function Footer({ source, walletConnected }: { source: DataSource; walletConnected: boolean }) {
  return (
    <footer className="dashboard-footer">
      <span><span className="footer-indicator" /> CONTROL PANEL · {source === "preview" ? "READ-ONLY PREVIEW" : source === "onchain-indexer" ? "READ-ONLY INDEXED DATA" : "LOCAL DIAGNOSTICS"}</span>
      <span>{walletConnected ? "Owner authority remains with your connected wallet" : "Connect your wallet to review owner controls"}</span>
      <a href="#setup">Integration status <ArrowUpRight size={12} aria-hidden="true" /></a>
    </footer>
  );
}

export function Dashboard({ data, actions }: DashboardProps) {
  const [selectedId, setSelectedId] = useState(data.rootId);
  const [mobileOpen, setMobileOpen] = useState(false);
  const wallet = useInjectedWallet();
  const walletOnSepolia = wallet.address !== null && wallet.chainId === sepolia.id;
  const selectedNode = nodeById(data, selectedId) ?? data.nodes[0];
  const activeVaults = data.nodes.filter((node) => node.state === "active").length;
  const rootNode = nodeById(data, data.rootId);
  const runtimeConnected = data.nodes.some((node) => node.runtime === "connected");
  const runtimeUnknown = data.nodes.some((node) => node.runtime === "unknown");
  const runtimeLabel = runtimeConnected ? "Runtime connected" : runtimeUnknown ? "Runtime status unknown" : "Runtime not linked";

  if (!selectedNode) return null;

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
          <PreviewNotice data={data} />
          <OverviewHeader activeVaults={activeVaults} positions={data.positions.length} source={data.source} />
          <SummaryMetrics data={data} />

          <div className="primary-grid">
            <CapitalTree data={data} selectedId={selectedNode.id} onSelect={setSelectedId} actions={actions} walletOnSepolia={walletOnSepolia} />
            <MandatePanel data={data} node={selectedNode} contractsConfigured={data.contractsConfigured} actions={actions} walletOnSepolia={walletOnSepolia} />
          </div>

          <div className="secondary-grid">
            <ActivityPanel data={data} />
            <PositionsPanel data={data} actions={actions} walletOnSepolia={walletOnSepolia} />
          </div>

          <ContractSetupPanel data={data} actions={actions} wallet={wallet} />
          <Footer source={data.source} walletConnected={walletOnSepolia} />
        </div>
      </main>
    </div>
  );
}
