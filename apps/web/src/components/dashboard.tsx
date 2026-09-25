"use client";

import {
  Activity as ActivityIcon,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleDashed,
  CircleHelp,
  Clock3,
  Coins,
  Command,
  Copy,
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
  DashboardData,
  DataSource,
  Permission,
  TokenAmount,
  VaultNode,
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

const nodeGridPlacement: Record<string, string> = {
  root: "tree-node-root",
  market: "tree-node-market",
  scout: "tree-node-scout",
  liquidity: "tree-node-liquidity",
  research: "tree-node-research",
  oracle: "tree-node-oracle",
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

function formatAmount(amount: TokenAmount): string {
  const raw = BigInt(amount.rawAmount);
  const scale = 10n ** BigInt(amount.decimals);
  const whole = raw / scale;
  const fraction = (raw % scale).toString().padStart(amount.decimals, "0");
  const groupedWhole = whole.toLocaleString("en-US");
  const visibleFraction = fraction.replace(/0+$/, "");
  return visibleFraction ? `${groupedWhole}.${visibleFraction}` : groupedWhole;
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
    <button className="icon-button" type="button" aria-label={label}>
      {children}
    </button>
  );
}

function PreviewFlag({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`preview-flag${compact ? " preview-flag-compact" : ""}`}>
      <span className="preview-flag-dot" aria-hidden="true" />
      {compact ? "Preview" : "Illustrative preview data"}
    </span>
  );
}

function WalletControl() {
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
        <button className="wallet-address" onClick={connect} disabled={pending} type="button">
          <WalletCards size={15} aria-hidden="true" />
          <span>{shortAddress(address)}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
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

function Sidebar() {
  return (
    <aside className="sidebar">
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
        <span className="workspace-avatar">C</span>
        <span className="workspace-copy">
          <span className="workspace-kicker">Workspace</span>
          <strong>Cedar treasury</strong>
        </span>
        <ChevronDown size={15} aria-hidden="true" />
      </div>

      <div className="sidebar-group-label">Control room</div>
      <nav className="primary-nav" aria-label="Primary navigation">
        <a className="nav-link nav-link-active" href="#overview" aria-current="page">
          <Layers3 size={17} aria-hidden="true" /> Overview
          <span className="nav-active-mark" />
        </a>
        <a className="nav-link" href="#capital-tree"><GitBranch size={17} aria-hidden="true" /> Capital tree</a>
        <a className="nav-link" href="#activity"><ActivityIcon size={17} aria-hidden="true" /> Activity</a>
      </nav>

      <div className="sidebar-group-label sidebar-group-spaced">Workspace</div>
      <nav className="primary-nav" aria-label="Workspace navigation">
        <a className="nav-link" href="#positions"><Coins size={17} aria-hidden="true" /> Positions</a>
        <a className="nav-link" href="#setup"><Command size={17} aria-hidden="true" /> Plugin setup</a>
      </nav>

      <div className="sidebar-spacer" />
      <div className="runtime-card">
        <div className="runtime-card-icon"><Unplug size={15} aria-hidden="true" /></div>
        <div>
          <strong>Runtime not linked</strong>
          <span>Wallet authority and agent runtime are separate.</span>
        </div>
        <span className="runtime-status-dot" aria-label="Runtime not connected" />
      </div>
      <div className="sidebar-footer">
        <span className="version-label">SEP · TEST NETWORK</span>
        <IconButton label="Help and documentation"><CircleHelp size={17} aria-hidden="true" /></IconButton>
      </div>
    </aside>
  );
}

function Topbar() {
  return (
    <header className="topbar">
      <div className="breadcrumb">
        <span>Workspace</span><span className="breadcrumb-divider">/</span><strong>Treasury overview</strong>
      </div>
      <div className="topbar-actions">
        <span className="topbar-environment"><span />Preview workspace</span>
        <WalletControl />
        <button className="mobile-menu icon-button" type="button" aria-label="Open menu"><Menu size={19} /></button>
      </div>
    </header>
  );
}

function PreviewNotice() {
  return (
    <div className="preview-notice" role="note">
      <span className="notice-symbol"><CircleDashed size={16} aria-hidden="true" /></span>
      <p><strong>Preview workspace.</strong> Balances, ENS labels, policies, LP positions and activity below are illustrative sample records. No contracts are configured.</p>
      <a href="#setup">Why preview data? <ArrowRight size={13} aria-hidden="true" /></a>
    </div>
  );
}

function OverviewHeader({ activeVaults, positions }: { activeVaults: number; positions: number }) {
  return (
    <section className="overview-heading" id="overview">
      <div>
        <div className="eyebrow"><span className="eyebrow-dash" /> SEPOLIA · CAPITAL CONTROL</div>
        <h1>Capital, on a<br className="heading-break" /> shorter leash.</h1>
        <p className="hero-copy">One clear view of delegated capital, agent mandates, and owner control.</p>
        <div className="hero-meta">
          <span className="hero-meta-item"><GitBranch size={14} aria-hidden="true" /> {activeVaults} example vaults</span>
          <span className="hero-meta-separator" />
          <span className="hero-meta-item"><Layers3 size={14} aria-hidden="true" /> {positions} example LP position</span>
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
}: {
  label: string;
  value: string;
  unit: string;
  detail: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <article className={`metric-card${accent ? " metric-card-accent" : ""}`}>
      <div className="metric-card-top"><span>{label}</span><span className="metric-icon">{icon}</span></div>
      <div className="metric-value">{value}<span>{unit}</span></div>
      <div className="metric-detail"><PreviewFlag compact /> <span>{detail}</span></div>
    </article>
  );
}

function SummaryMetrics({ data }: { data: DashboardData }) {
  const activeVaults = data.nodes.filter((node) => node.state === "active").length;
  const totalActA = data.nodes.reduce((sum, node) => {
    const amount = node.totalBalance.find((entry) => entry.symbol === "ACT-A");
    return sum + (amount ? BigInt(amount.rawAmount) : 0n);
  }, 0n);
  const totalActB = data.nodes.reduce((sum, node) => {
    const amount = node.totalBalance.find((entry) => entry.symbol === "ACT-B");
    return sum + (amount ? BigInt(amount.rawAmount) : 0n);
  }, 0n);
  const totalAmount = (rawAmount: bigint, symbol: string): TokenAmount => ({ rawAmount: rawAmount.toString(), decimals: 2, symbol });

  return (
    <section className="metrics-grid" aria-label="Preview summary">
      <MetricCard
        label="Assets across vaults"
        value={formatAmount(totalAmount(totalActA, "ACT-A"))}
        unit=" ACT-A"
        detail={`${formatAmount(totalAmount(totalActB, "ACT-B"))} ACT-B also shown`}
        icon={<Coins size={17} aria-hidden="true" />}
        accent
      />
      <MetricCard
        label="Vaults in tree"
        value={String(activeVaults).padStart(2, "0")}
        unit=" / 32"
        detail="MVP root limit"
        icon={<GitBranch size={17} aria-hidden="true" />}
      />
      <MetricCard
        label="Open LP positions"
        value={String(data.positions.filter((position) => position.state === "open").length).padStart(2, "0")}
        unit=""
        detail="Management and exit separate"
        icon={<Layers3 size={17} aria-hidden="true" />}
      />
      <MetricCard
        label="Runtime links"
        value={String(data.nodes.filter((node) => node.runtime === "connected").length).padStart(2, "0")}
        unit=" connected"
        detail="No agent process implied"
        icon={<Zap size={17} aria-hidden="true" />}
      />
    </section>
  );
}

function TreeCard({
  node,
  selected,
  onSelect,
}: {
  node: VaultNode;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const actA = node.freeCapital.find((amount) => amount.symbol === "ACT-A");
  const stateLabel = node.state === "active" ? "Example active" : node.state.replace("-", " ");

  return (
    <button
      className={`tree-node ${nodeGridPlacement[node.id] ?? ""}${selected ? " tree-node-selected" : ""}`}
      type="button"
      onClick={() => onSelect(node.id)}
      role="treeitem"
      aria-selected={selected}
      aria-label={`${node.label}, ${node.ensName}, ${stateLabel}`}
    >
      <div className="tree-node-head">
        <span className={`node-avatar node-avatar-${node.depth}`}>
          {node.depth === 0 ? <Fingerprint size={16} aria-hidden="true" /> : node.label.slice(0, 1)}
        </span>
        <span className="node-state"><span />{stateLabel}</span>
        <MoreHorizontal size={16} className="node-more" aria-hidden="true" />
      </div>
      <strong className="tree-node-name">{node.label}</strong>
      <span className="tree-node-ens">{node.ensName}</span>
      <div className="tree-node-foot">
        <span><span className="capital-dot" />{actA ? formatAmount(actA) : "—"} <i>ACT-A</i></span>
        <span className="node-depth">L{node.depth}</span>
      </div>
    </button>
  );
}

function CapitalTree({ data, selectedId, onSelect }: { data: DashboardData; selectedId: string; onSelect: (id: string) => void }) {
  const desktopOrder = ["root", "market", "scout", "liquidity", "research", "oracle"];
  const nodes = desktopOrder.map((id) => nodeById(data, id)).filter((node): node is VaultNode => Boolean(node));

  return (
    <section className="panel tree-panel" id="capital-tree" aria-labelledby="tree-title">
      <div className="panel-heading">
        <div>
          <div className="panel-overline">CAPITAL HIERARCHY <PreviewFlag compact /></div>
          <h2 id="tree-title">Your agent tree</h2>
        </div>
        <div className="panel-heading-actions">
          <button className="button button-secondary button-small" disabled title="Available after the controller is deployed and configured">
            <Plus size={14} aria-hidden="true" /> Add a vault
          </button>
          <IconButton label="Tree options"><MoreHorizontal size={18} aria-hidden="true" /></IconButton>
        </div>
      </div>

      <div className="tree-canvas-desktop" role="tree" aria-label="Preview capital tree">
        <svg className="tree-connectors" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M 27 50 H 31 V 17 H 36" />
          <path d="M 27 50 H 31 V 83 H 36" />
          <path d="M 63 17 H 70 V 32 H 74" />
          <path d="M 63 17 H 70 V 50 H 74" />
          <path d="M 63 83 H 70 V 83 H 74" />
          <circle cx="31" cy="50" r="1.1" />
          <circle cx="70" cy="17" r="1.1" />
          <circle cx="70" cy="83" r="1.1" />
        </svg>
        {nodes.map((node) => (
          <TreeCard key={node.id} node={node} selected={node.id === selectedId} onSelect={onSelect} />
        ))}
        <div className="tree-column-label tree-column-label-root">OWNER · ROOT</div>
        <div className="tree-column-label tree-column-label-parent">PARENT VAULT</div>
        <div className="tree-column-label tree-column-label-child">CHILD VAULT</div>
      </div>

      <div className="tree-canvas-mobile" role="tree" aria-label="Preview capital tree">
        {nodes.map((node) => {
          const parent = node.parentId ? nodeById(data, node.parentId) : undefined;
          return (
            <div className={`mobile-tree-row mobile-tree-depth-${node.depth}`} key={node.id}>
              {node.depth > 0 && <span className="mobile-tree-branch" aria-hidden="true" />}
              <TreeCard node={node} selected={node.id === selectedId} onSelect={onSelect} />
              <span className="mobile-tree-parent">{parent ? `Delegated by ${parent.label}` : "Human owner · Root vault"}</span>
            </div>
          );
        })}
      </div>

      <div className="tree-legend">
        <span><span className="legend-line legend-line-active" /> Example active authority path</span>
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

function AddressLine({ label, value }: { label: string; value: string }) {
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
      <button type="button" onClick={copyPreviewValue} aria-label={`Copy preview ${label.toLowerCase()}`} title="Copy preview string">
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </div>
  );
}

function MandatePanel({ node, contractsConfigured }: { node: VaultNode; contractsConfigured: boolean }) {
  const actionCeiling = formatAmount(node.effectivePolicy.maxActionAmount);

  return (
    <section className="panel mandate-panel" aria-labelledby="mandate-title">
      <div className="panel-heading panel-heading-compact">
        <div>
          <div className="panel-overline">SELECTED VAULT <PreviewFlag compact /></div>
          <h2 id="mandate-title">Effective mandate</h2>
        </div>
        <IconButton label="Mandate details"><MoreHorizontal size={18} aria-hidden="true" /></IconButton>
      </div>

      <div className="selected-vault-summary">
        <span className="selected-vault-avatar">{node.depth === 0 ? <Fingerprint size={18} /> : node.label.slice(0, 1)}</span>
        <span><strong>{node.label}</strong><small>{node.ensName}</small></span>
        <span className="example-active-pill"><span /> Example active</span>
      </div>

      <div className="address-pair">
        <AddressLine label="Agent address" value={node.agentAddress} />
        <AddressLine label="Bound vault" value={node.vaultAddress} />
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
        <button className="button button-secondary button-small" disabled={!contractsConfigured} title="Available after live contract configuration"><Shield size={14} /> Tighten policy</button>
        <button className="button button-danger button-small" disabled={!contractsConfigured} title="Available after live contract configuration"><ShieldAlert size={14} /> Revoke subtree</button>
      </div>
    </section>
  );
}

function ActivityPanel({ data }: { data: DashboardData }) {
  return (
    <section className="panel activity-panel" id="activity" aria-labelledby="activity-title">
      <div className="panel-heading">
        <div>
          <div className="panel-overline">CAPITAL & POLICY LOG <PreviewFlag compact /></div>
          <h2 id="activity-title">Recent activity</h2>
        </div>
        <a className="text-link" href="#activity-list">View all <ArrowRight size={14} aria-hidden="true" /></a>
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
              </div>
              <span className="activity-source">{activity.source === "preview" ? "PREVIEW" : activity.source === "onchain-indexer" ? "INDEXED" : "LOCAL"}</span>
            </li>
          );
        })}
      </ol>
      <div className="activity-provenance"><span className="provenance-dot" /> This is sample history. Transaction links appear only after an indexed on-chain receipt exists.</div>
    </section>
  );
}

function PositionsPanel({ data, contractsConfigured }: { data: DashboardData; contractsConfigured: boolean }) {
  const position = data.positions[0];

  return (
    <section className="panel positions-panel" id="positions" aria-labelledby="positions-title">
      <div className="panel-heading">
        <div>
          <div className="panel-overline">LIQUIDITY BOOK <PreviewFlag compact /></div>
          <h2 id="positions-title">LP position</h2>
        </div>
        <IconButton label="Position options"><MoreHorizontal size={18} aria-hidden="true" /></IconButton>
      </div>
      {position ? (
        <>
          <div className="position-pool-row">
            <span className="token-pair-icon"><span>A</span><span>B</span></span>
            <div><strong>{position.poolLabel}</strong><small>Vault-owned NFT · example position {position.id}</small></div>
            <span className="position-open-pill"><span /> Example open</span>
          </div>
          <div className="position-stats">
            <div><span>Liquidity</span><strong>{position.liquidity}<small> preview units</small></strong></div>
            <div><span>Uncollected fees</span><strong>{formatAmount(position.fees0)} <small>ACT-A</small></strong><strong>{formatAmount(position.fees1)} <small>ACT-B</small></strong></div>
          </div>
          <div className="position-separation"><LockKeyhole size={13} aria-hidden="true" /><span>Fee collection, routine exit, and owner recovery are separate permissions.</span></div>
          <div className="position-actions">
            <button className="button button-secondary button-small" disabled={!contractsConfigured} title="Available after live contract configuration">Collect fees</button>
            <button className="button button-secondary button-small" disabled={!contractsConfigured} title="Available after live contract configuration">Close position</button>
          </div>
        </>
      ) : (
        <div className="empty-position"><Layers3 size={18} /><span>No position is present in this data source.</span></div>
      )}
    </section>
  );
}

function ContractSetupPanel({ contractsConfigured }: { contractsConfigured: boolean }) {
  return (
    <section className="setup-panel" id="setup" aria-labelledby="setup-title">
      <div className="setup-orbit" aria-hidden="true"><span /><span /><span /></div>
      <div className="setup-copy">
        <div className="setup-status"><span className="setup-status-dot" /> {contractsConfigured ? "CONTRACTS CONFIGURED" : "DEPLOYMENT PENDING"}</div>
        <h2 id="setup-title">Owner control<br />starts on-chain.</h2>
        <p>{contractsConfigured ? "Live contract configuration is available." : "The Sepolia controller and vault addresses have not been configured. Wallet actions stay locked until they are."}</p>
        <button className="button button-setup" disabled={!contractsConfigured} title="Available after deployment configuration">
          {contractsConfigured ? "Open owner controls" : "Setup is pending"}<ArrowUpRight size={15} aria-hidden="true" />
        </button>
      </div>
      <div className="setup-steps" aria-label="Setup status">
        <div className="setup-step setup-step-complete"><span><Check size={12} /></span><div><strong>Wallet connect</strong><small>Injected wallet · Sepolia</small></div></div>
        <div className="setup-step setup-step-pending"><span>2</span><div><strong>Controller deploy</strong><small>Contract address pending</small></div></div>
        <div className="setup-step setup-step-pending"><span>3</span><div><strong>Indexer connect</strong><small>MultiBaas source pending</small></div></div>
      </div>
      <div className="setup-border" aria-hidden="true" />
    </section>
  );
}

function Footer() {
  return (
    <footer className="dashboard-footer">
      <span><span className="footer-indicator" /> CONTROL PANEL · READ-ONLY PREVIEW</span>
      <span>Owner authority remains with your wallet</span>
      <a href="#setup">Integration status <ArrowUpRight size={12} aria-hidden="true" /></a>
    </footer>
  );
}

export function Dashboard({ data }: DashboardProps) {
  const [selectedId, setSelectedId] = useState(data.rootId);
  const selectedNode = nodeById(data, selectedId) ?? data.nodes[0];
  const activeVaults = data.nodes.filter((node) => node.state === "active").length;

  if (!selectedNode) return null;

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-shell">
        <Topbar />
        <div className="dashboard-content">
          <PreviewNotice />
          <OverviewHeader activeVaults={activeVaults} positions={data.positions.length} />
          <SummaryMetrics data={data} />

          <div className="primary-grid">
            <CapitalTree data={data} selectedId={selectedNode.id} onSelect={setSelectedId} />
            <MandatePanel node={selectedNode} contractsConfigured={data.contractsConfigured} />
          </div>

          <div className="secondary-grid">
            <ActivityPanel data={data} />
            <PositionsPanel data={data} contractsConfigured={data.contractsConfigured} />
          </div>

          <ContractSetupPanel contractsConfigured={data.contractsConfigured} />
          <Footer />
        </div>
      </main>
    </div>
  );
}
