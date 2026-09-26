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
  Clock3,
  Coins,
  Copy,
  ExternalLink,
  Fingerprint,
  GitBranch,
  Layers3,
  LockKeyhole,
  MoreHorizontal,
  Network,
  Plus,
  Shield,
  ShieldAlert,
  ShieldCheck,
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
import Link from "next/link";
import { Sidebar as ShadcnSidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { formatAmount, formatCompactAmount, formatRoundedAmount } from "@/lib/format-display-amount";
import { mobileTreeOrder } from "@/lib/mobile-tree-order";

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
  onboarding?: boolean;
  data: DashboardData;
  deployment: PublicDeployment;
  vaultQuery: string | null;
  nodeQuery?: string | null;
  actionQuery?: WalletActionMode;
  view: "overview" | "tree" | "activity" | "uniswap" | "payments" | "setup";
}

interface PaymentRecord {
  id: string;
  nodeId: string;
  nodeName: string;
  from: string;
  to: string;
  amountRaw: string;
  transactionHash: `0x${string}`;
  blockNumber: number;
}

interface PaymentHistory {
  source: "circle-usdc-receipts";
  rootId: string;
  payments: PaymentRecord[];
  coverage: { fromBlock: number; toBlock: number; completeSinceDeployment: boolean };
  note: string;
}

const permissionLabels: Record<Permission, string> = {
  delegate: "Delegate capital",
  swap: "Swap assets",
  "manage-liquidity": "Manage LP position",
  "collect-fees": "Collect fees",
  "exit-liquidity": "Exit LP position",
  pay: "Companion x402 payment",
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

async function requestLiveTree(vault: string, signal?: AbortSignal, knownRootId?: string): Promise<{ data: DashboardData; rootId: string; nodeId: string }> {
  let rootId = knownRootId;
  let nodeId: string | null = null;
  if (!rootId) {
    const lookupResponse = await fetch(`/api/resolve-root?q=${encodeURIComponent(vault)}`, { cache: "no-store", signal });
    const lookup = await lookupResponse.json() as { rootId?: unknown; nodeId?: unknown; error?: unknown };
    if (!lookupResponse.ok || typeof lookup.rootId !== "string" || typeof lookup.nodeId !== "string") {
      throw new Error(typeof lookup.error === "string" ? lookup.error : "The Sepolia vault could not be resolved.");
    }
    rootId = lookup.rootId;
    nodeId = lookup.nodeId;
  }

  const response = await fetch(`/api/tree?root=${encodeURIComponent(rootId)}`, { cache: "no-store", signal });
  const body = await response.json() as Partial<DashboardData> & { error?: { message?: unknown } };
  if (!response.ok || body.source !== "direct-rpc") {
    throw new Error(typeof body.error?.message === "string" ? body.error.message : "The live Sepolia root could not be loaded.");
  }
  if (body.rootId !== rootId || !Array.isArray(body.nodes) || !Array.isArray(body.positions)) {
    throw new Error("The live read returned an incomplete or mismatched root snapshot.");
  }
  return { data: body as DashboardData, rootId, nodeId: nodeId ?? rootId };
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

const views = [
  { id: "overview", title: "Overview", path: "/", icon: Layers3 },
  { id: "tree", title: "Agent tree", path: "/tree", icon: GitBranch },
  { id: "activity", title: "Activity", path: "/activity", icon: ActivityIcon },
  { id: "uniswap", title: "Uniswap", path: "/uniswap", icon: ArrowLeftRight },
  { id: "payments", title: "Payments", path: "/payments", icon: Coins },
  { id: "setup", title: "Setup & control", path: "/setup", icon: ShieldCheck },
] as const;

function routeHref(path: string, vaultQuery: string | null, nodeId?: string | null): string {
  const params = new URLSearchParams();
  if (vaultQuery) params.set("vault", vaultQuery);
  else params.set("preview", "1");
  if (nodeId) params.set("node", nodeId);
  return `${path}?${params}`;
}

function AppSidebar({ view, vaultQuery, selectedId, rootLabel, data, readError }: { view: DashboardProps["view"]; vaultQuery: string | null; selectedId: string; rootLabel: string; data: DashboardData; readError: string | null }) {
  const { setOpenMobile } = useSidebar();
  return (
    <ShadcnSidebar collapsible="offcanvas" className="app-sidebar">
      <SidebarHeader className="app-sidebar-header">
        <Link href={routeHref("/", vaultQuery)} className="app-brand" onClick={() => setOpenMobile(false)} aria-label="Agent Capital Tree overview">
          <span className="app-brand-mark" aria-hidden="true"><GitBranch size={22} /></span>
          <span>agent capital <strong>tree</strong></span>
        </Link>
        <div className="app-workspace"><span className="app-workspace-symbol">{rootLabel.slice(0, 1).toUpperCase()}</span><span><small>Current root</small><strong>{rootLabel}</strong></span></div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="app-sidebar-vault">
          <SidebarGroupContent>
            <RootAccessBar vault={vaultQuery} path={views.find((item) => item.id === view)?.path ?? "/"} />
            {vaultQuery && <LiveReadNotice data={data} error={readError} />}
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu aria-label="Primary navigation">
              {views.map(({ id, title, path, icon: Icon }) => (
                <SidebarMenuItem key={id}>
                  <SidebarMenuButton render={<Link href={routeHref(path, vaultQuery, selectedId)} onClick={() => setOpenMobile(false)} />} isActive={view === id} aria-current={view === id ? "page" : undefined}>
                    <Icon aria-hidden="true" /><span>{title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </ShadcnSidebar>
  );
}

function Topbar({ view, wallet, vaultQuery, selectedId }: { view: DashboardProps["view"]; wallet: InjectedWalletState; vaultQuery: string | null; selectedId: string }) {
  return (
    <header className="app-topbar">
      <div className="app-topbar-title"><SidebarTrigger aria-label="Toggle navigation" /><span>{views.find((item) => item.id === view)?.title}</span><Badge variant="outline">Sepolia</Badge></div>
      <div className="app-topbar-actions"><Link className="app-manage-link" href={routeHref("/setup", vaultQuery, selectedId)}>Wallet actions</Link><WalletControl wallet={wallet} /></div>
    </header>
  );
}

function PreviewNotice({ data, deployment }: { data: DashboardData; deployment: PublicDeployment }) {
  if (data.source !== "preview") return null;
  return (
    <div className="preview-notice" role="note">
      <span className="notice-symbol"><CircleDashed size={16} aria-hidden="true" /></span>
      <p><strong>Fictional preview · no real tokens.</strong> The names, addresses and balances on this page are invented examples, not Sepolia vaults. {deployment.contractsConfigured ? "Open the live demo to see the official Circle Sepolia USDC balance." : "The USDC controller deployment is still pending."}</p>
      {deployment.contractsConfigured && <Link href={`/tree?vault=capital.${deployment.namespaceName}`}>Open live demo <ArrowRight size={13} aria-hidden="true" /></Link>}
    </div>
  );
}

function RootAccessBar({ vault, path }: { vault: string | null; path: string }) {
  const router = useRouter();
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return <div className="root-access-bar" aria-label="Vault navigation">
    <form className="root-access-form" onSubmit={async (event) => {
      event.preventDefault();
      const query = String(new FormData(event.currentTarget).get("lookup") ?? "").trim();
      setLoading(true); setLookupError(null);
      try {
        const response = await fetch(`/api/resolve-root?q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(30000) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Lookup failed.");
        if (typeof result.vault !== "string" || typeof result.nodeId !== "string") throw new Error("The lookup did not return a vault address.");
        router.push(`${path}?vault=${encodeURIComponent(result.vault)}&node=${encodeURIComponent(result.nodeId)}`);
      } catch (cause) { setLookupError(cause instanceof Error ? cause.message : "Lookup failed. Please try again."); }
      finally { setLoading(false); }
    }}>
      <label htmlFor="vault-reference">Open vault</label>
      <input id="vault-reference" name="lookup" type="text" maxLength={253} placeholder="ENS name or vault address" aria-label="ENS name or vault contract address" autoComplete="off" required disabled={loading} />
      <button className="button button-secondary button-small" type="submit" disabled={loading}>{loading ? "Looking up…" : "Open vault"}</button>
      {lookupError && <span role="alert" className="vault-lookup-error">{lookupError}</span>}
    </form>
    {vault && <a className="root-preview-link" href={`${path}?preview=1`}>Preview sample</a>}
  </div>;
}

function LiveReadNotice({ data, error }: { data: DashboardData; error: string | null }) {
  if (!error) return null;
  return (
    <div className="live-read-notice live-read-notice-error" role="alert">
      <span className="live-read-icon"><AlertCircle size={16} aria-hidden="true" /></span>
      <p><strong>Vault data unavailable.</strong> {error} {data.source === "direct-rpc" ? "Showing the last snapshot. Wallet actions are paused until the connection recovers." : "Check the ENS name or vault address."}</p>
    </div>
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
  exactValue,
  exactDetail,
}: {
  label: string;
  value: string;
  unit: string;
  detail: string;
  icon: React.ReactNode;
  accent?: boolean;
  source: DataSource;
  exactValue?: string;
  exactDetail?: string;
}) {
  return (
    <article className={`metric-card${accent ? " metric-card-accent" : ""}`}>
      <div className="metric-card-top"><span>{label}</span><span className="metric-icon">{icon}</span></div>
      <div className="metric-value" role={exactValue ? "group" : undefined} aria-label={exactValue ? `Exact balance: ${exactValue}` : undefined} title={exactValue}>{value}<span>{unit}</span></div>
      <div className="metric-detail"><PreviewFlag source={source} compact /> <span role={exactDetail ? "group" : undefined} aria-label={exactDetail ? `Exact balance: ${exactDetail}` : undefined} title={exactDetail}>{detail}</span></div>
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
        value={formatCompactAmount(primaryAsset)}
        unit={primaryAsset.symbol ? ` ${primaryAsset.symbol}` : ""}
        detail={secondaryAsset ? `${formatCompactAmount(secondaryAsset)} ${secondaryAsset.symbol} also shown` : "Current vault token balances"}
        exactValue={`${formatAmount(primaryAsset)} ${primaryAsset.symbol}`.trim()}
        exactDetail={secondaryAsset ? `${formatAmount(secondaryAsset)} ${secondaryAsset.symbol}` : undefined}
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
      data-node-id={node.id}
      type="button"
      onClick={() => onSelect(node.id)}
      aria-pressed={selected}
      aria-description={parentLabel ? `Delegated by ${parentLabel}` : "Human owner root vault"}
      aria-label={`${node.label}, ${node.ensName}, ${stateLabel}${firstAvailable ? `, exact free balance ${formatAmount(firstAvailable)} ${firstAvailable.symbol}` : ", no free balance"}`}
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
        <span title={firstAvailable ? `Exact free balance: ${formatAmount(firstAvailable)} ${firstAvailable.symbol}` : undefined}><span className="capital-dot" />{firstAvailable ? <>{formatCompactAmount(firstAvailable)} <i>{firstAvailable.symbol}</i></> : "No free balance"}</span>
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
  const cardWidth = 240;
  const cardHeight = 150;
  const columnStep = 304;
  const leafPitch = 184;
  const firstLeafCenter = 119;
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
      const centerY = firstLeafCenter + leafIndex * leafPitch;
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
      : firstLeafCenter + leafIndex++ * leafPitch;
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
    left: 16 + node.depth * columnStep,
    centerY: positions.get(node.id) ?? firstLeafCenter,
  }));
  const byId = new Map(positioned.map((item) => [item.node.id, item]));
  const edges: TreeEdge[] = [];
  for (const child of positioned) {
    const parent = child.node.parentId ? byId.get(child.node.parentId) : undefined;
    if (!parent) continue;
    const fromX = parent.left + cardWidth;
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
  const width = 16 + (levels - 1) * columnStep + cardWidth + 16;
  positioned.sort((left, right) => left.node.depth - right.node.depth);
  const height = Math.max(300, firstLeafCenter + (Math.max(1, leafIndex) - 1) * leafPitch + cardHeight / 2 + 36);
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
  const mobileNodes = mobileTreeOrder(tree.nodes.map((item) => item.node));

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
            <div className="tree-position" role="none" key={node.id} style={{ left, top: centerY - 75 }}>
              <TreeCard node={node} selected={node.id === selectedId} onSelect={onSelect} parentLabel={node.parentId ? nodeById(data, node.parentId)?.label : undefined} />
            </div>
          ))}
          {Array.from({ length: tree.levels }, (_, depth) => (
            <div className="tree-column-label" key={depth} style={{ left: 16 + depth * 304 }}>
              {depth === 0 ? "OWNER · ROOT" : `LEVEL ${depth}`}
            </div>
          ))}
        </div>
      </div>

      <div className="tree-canvas-mobile" role="group" aria-label={data.source === "preview" ? "Preview capital tree" : "Capital tree"}>
        {mobileNodes.map((node) => {
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
      <code title={value}>{shortAddress(value)}</code>
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
            <strong role="cell" title={`Exact: ${formatAmount(sumAsset(node.tokenHoldings, asset))}`}>{formatRoundedAmount(sumAsset(node.tokenHoldings, asset))}</strong>
            <span role="cell" title={`Exact: ${formatAmount(sumAsset(node.freeCapital, asset))}`}>{formatRoundedAmount(sumAsset(node.freeCapital, asset))}</span>
            <span role="cell" title={allocationHistoryAvailable ? `Exact: ${formatAmount(sumAsset(outgoing, asset))}` : undefined}>{allocationHistoryAvailable ? formatRoundedAmount(sumAsset(outgoing, asset)) : "—"}</span>
          </div>
        ))}
      </div>
      <div className="capital-origin">
        <span>{parent ? `Gross assigned in by ${parent.label}` : "Root funding origin"}</span>
        <strong title={parent && node.capitalReceivedFromParent ? node.capitalReceivedFromParent.map((amount) => `${formatAmount(amount)} ${amount.symbol}`).join(" · ") : undefined}>{parent ? node.capitalReceivedFromParent === null ? "Not indexed" : node.capitalReceivedFromParent.map((amount) => `${formatRoundedAmount(amount)} ${amount.symbol}`).join(" · ") || "0" : node.source === "preview" ? "Example owner · no real wallet" : "Owner wallet · no parent vault"}</strong>
      </div>
      <p className="capital-ledger-note">{node.source === "preview" ? "These figures illustrate transfers between vaults; no tokens or on-chain transactions exist for this example." : allocationHistoryAvailable ? "Assignments are transfers between vaults. They are tracked separately from current holdings." : "Balances come from direct RPC. Allocation totals require the separate MultiBaas activity source."}</p>
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
        <div><strong>{node.source === "preview" ? "Example capabilities" : "Live authorized capabilities"}</strong><small>{node.source === "preview" ? "Illustrative roles · not granted on-chain" : "Current EAC roles at this vault"}</small></div>
        <span className="permission-count">{node.authorizedPermissions.length}</span>
      </div>
      {node.authorizedPermissions.length > 0
        ? <PermissionList permissions={node.authorizedPermissions} />
        : <p className="authorization-empty">No actions are currently authorized for this vault. Review its state and inherited limits before assigning work.</p>}
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
      {node.source === "preview" ? <p className="authorization-empty">This fictional vault has no wallet actions. Open a live Sepolia vault to inspect real permissions.</p> : <><div className="mandate-actions">
        <button className="button button-secondary button-small" disabled={!canTighten} onClick={() => onRequestAction("tighten-policy")} title="Connect the recorded root owner or parent agent on Sepolia"><Shield size={14} /> Tighten policy</button>
        <button className="button button-danger button-small" disabled={!canRevoke} onClick={() => onRequestAction("revoke-subtree")} title="Connect the parent agent with current EAC restriction authority"><ShieldAlert size={14} /> Revoke subtree</button>
      </div>
      <div className="owner-recovery-callout">
        <div><strong>Owner emergency recovery</strong><span>ENS-independent recovery remains separate from agent permissions.</span></div>
        <button className="button button-danger button-small" disabled={!canRecover} onClick={() => onRequestAction("owner-recovery")} title="Only the recorded root owner can use emergency recovery">Review exit</button>
      </div></>}
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
  uniswapOnly = false,
}: {
  data: DashboardData;
  feed: ActivityFeedResult | null;
  loading: boolean;
  loadingMore: boolean;
  loadMoreError: string | null;
  onRetry: () => void;
  onLoadMore: () => void;
  uniswapOnly?: boolean;
}) {
  const page = feed?.source === "multi-baas" ? feed.page : null;
  const indexLag = page?.indexing.indexGapBlocks;
  const historyCoverage = page
    ? `History indexed from block ${page.indexing.indexingStartBlock.toLocaleString()}; earlier activity is not included.`
    : null;
  const provenance = data.activitySource === "preview"
    ? "This is sample history. Transaction links appear only after an indexed on-chain receipt exists."
    : data.activitySource === "multi-baas" && page
      ? `MultiBaas ${page.indexing.state.replaceAll("_", " ")} · ${indexLag === 0 ? "caught up" : `${Math.abs(indexLag ?? 0).toLocaleString()} blocks ${indexLag && indexLag < 0 ? "ahead" : "behind"}`} · ${page.verification ? `RPC verified at block ${page.verification.checkedAtBlock}; ${page.verification.orphanedItems} orphaned record${page.verification.orphanedItems === 1 ? "" : "s"} removed.` : "Canonical receipt verification pending."}`
      : data.activitySource === "unavailable"
        ? feed?.source === "unavailable" ? feed.message : "Activity history is not configured. Direct RPC data is not used as an activity-history fallback."
        : "Activity is reported by a local diagnostic source.";
  const activityStatus = `${loading && data.activitySource !== "preview" ? "Refreshing MultiBaas activity…" : provenance}${historyCoverage ? ` ${historyCoverage}` : ""}`;
  const activitySource = data.activitySource === "preview" ? "preview" : data.source;

  return (
    <section className="panel activity-panel" id="activity" aria-labelledby="activity-title">
      <div className="panel-heading">
        <div>
          <div className="panel-overline">{uniswapOnly ? "UNISWAP ACTION LOG" : "CAPITAL & POLICY LOG"} <PreviewFlag source={activitySource} compact /></div>
          <h2 id="activity-title">{uniswapOnly ? "Swap and LP history" : "Recent activity"}</h2>
        </div>
        <div className="activity-heading-actions">
          <span className="activity-count">{data.activity.length}{data.activitySource === "preview" ? " preview" : ""} records</span>
          {(feed?.source === "unavailable" || loadMoreError) && <button className="button button-secondary button-small" type="button" disabled={loading} onClick={onRetry}>{loading ? "Checking…" : "Retry history"}</button>}
        </div>
      </div>
      <Table className="activity-list" id="activity-list">
        <TableHeader><TableRow><TableHead>Event</TableHead><TableHead>Vault and details</TableHead><TableHead>Amount and block</TableHead><TableHead>Source</TableHead></TableRow></TableHeader>
        <TableBody>
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
            <TableRow className="activity-row" key={activity.id}>
              <TableCell><span className={`activity-icon activity-icon-${index}`}>{icon}</span><span className="sr-only">{activityLabels[activity.kind]}</span></TableCell>
              <TableCell><div className="activity-copy">
                <strong>{activityLabels[activity.kind]} <span>· {activity.nodeLabel}</span></strong>
                <small>{activity.description}</small>
              </div></TableCell>
              <TableCell><div className="activity-meta">
                {activity.amount && <strong>{formatAmount(activity.amount)} <span>{activity.amount.symbol}</span></strong>}
                <time dateTime={activity.timestamp}>{activity.timestamp ? `${new Date(activity.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC` : activity.blockNumber !== undefined ? `Block ${activity.blockNumber.toLocaleString()}` : ""}</time>
                {activity.finality && <small className={`activity-finality activity-finality-${activity.finality}`}>{activity.finality.replaceAll("_", " ")}</small>}
                {activity.transactionHash && activity.source === "multi-baas" && data.chainId === sepolia.id && (
                  <a className="activity-transaction-link" href={`https://sepolia.etherscan.io/tx/${activity.transactionHash}`} target="_blank" rel="noreferrer">
                    Receipt <ExternalLink size={9} aria-hidden="true" />
                  </a>
                )}
              </div></TableCell>
              <TableCell><Badge variant="outline">{activity.source === "preview" ? "Preview" : activity.source === "multi-baas" ? "Indexed" : "Local"}</Badge></TableCell>
            </TableRow>
          );
        })}
        </TableBody>
      </Table>
      {data.activity.length === 0 && <p className="activity-empty">{loading ? "Loading activity history…" : data.activitySource === "preview" ? "Preview records are shown above when available." : feed?.source === "unavailable" ? "Indexed activity is unavailable for this root." : page ? "No indexed activity is available for this root within the covered block range." : "No activity records are available for this root yet."}</p>}
      {loadMoreError && feed?.source !== "unavailable" && <p className="activity-load-error" role="alert">{loadMoreError}</p>}
      {page?.hasMore && <button className="button button-secondary button-small activity-load-more" type="button" disabled={loadingMore} onClick={onLoadMore}>{loadingMore ? "Loading…" : "Load more activity"}</button>}
      <div className="activity-provenance"><span className="provenance-dot" />{activityStatus}</div>
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
      </div>
      {data.positions.length > 0 ? data.positions.map((position) => (
        <div className="position-record" key={position.id}>
          <div className="position-pool-row">
            <span className="token-pair-icon"><span>{position.token0?.symbol.slice(0, 1) ?? "U"}</span><span>{position.token1?.symbol.slice(0, 1) ?? "D"}</span></span>
            <div><strong>{position.poolLabel}</strong><small>Vault-owned NFT · {position.source === "preview" ? "example " : ""}position {position.id}</small></div>
            <span className={`position-open-pill position-state-${position.state}`}><span />{position.source === "preview" ? `Example ${position.state}` : position.state === "unknown" ? "Status unknown" : position.state}</span>
          </div>
      <div className="position-stats">
            <div><span>Liquidity</span><strong>{/^\d+$/.test(position.liquidity) ? BigInt(position.liquidity).toLocaleString("en-US") : position.liquidity}<small> units</small></strong></div>
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

function PaymentsPanel({ history, loading, error }: { history: PaymentHistory | null; loading: boolean; error: string | null }) {
  return <Card className="payments-panel">
    <CardHeader className="payments-heading">
      <div><CardTitle>Vault USDC settlements</CardTitle><CardDescription>On-chain EIP-3009 authorizations paired with Circle USDC transfers from this tree’s vaults.</CardDescription></div>
    </CardHeader>
    <CardContent>
      {error && <p className="payment-status payment-status-error" role="alert">{error}</p>}
      {history && <p className="payment-status" role="status">Blocks {history.coverage.fromBlock.toLocaleString()}–{history.coverage.toBlock.toLocaleString()} · {history.coverage.completeSinceDeployment ? "Complete scan since this controller was deployed" : "Earlier blocks are outside this scan"}. {history.note}</p>}
      <div className="payment-table-scroll"><Table className="payment-table">
        <TableHeader><TableRow><TableHead>Agent vault</TableHead><TableHead>Amount</TableHead><TableHead>Recipient</TableHead><TableHead>Block</TableHead><TableHead>Evidence</TableHead></TableRow></TableHeader>
        <TableBody>{history?.payments.map((payment) => <TableRow key={payment.id}>
          <TableCell><strong>{payment.nodeName}</strong><small><CopyablePaymentAddress address={payment.from} label="vault address" /></small></TableCell>
          <TableCell className="payment-amount">{formatRoundedAmount({ rawAmount: payment.amountRaw, decimals: 6, symbol: "USDC" })} <span>USDC</span></TableCell>
          <TableCell><CopyablePaymentAddress address={payment.to} label="recipient address" /></TableCell>
          <TableCell>{payment.blockNumber.toLocaleString()}</TableCell>
          <TableCell><a className="activity-transaction-link" href={`https://sepolia.etherscan.io/tx/${payment.transactionHash}`} target="_blank" rel="noreferrer">Receipt <ExternalLink size={13} aria-hidden="true" /></a></TableCell>
        </TableRow>)}</TableBody>
      </Table></div>
      {!error && !loading && history?.payments.length === 0 && <p className="activity-empty">No matching USDC settlements were found in the scanned blocks. A vault balance change alone is not a payment.</p>}
      {loading && !history && <p className="activity-empty">Reading Circle USDC settlement receipts…</p>}
    </CardContent>
  </Card>;
}

function CopyablePaymentAddress({ address, label }: { address: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return <span className="payment-address" title={address}><span>{shortAddress(address)}</span><button type="button" aria-label={`Copy ${label}`} title={`Copy full ${label}`} onClick={() => { void navigator.clipboard.writeText(address).then(() => setCopied(true)).catch(() => setCopied(false)); }}>{copied ? <Check size={13} /> : <Copy size={13} />}</button></span>;
}

function ContractSetupPanel({ data, deployment, actions, wallet, liveStateReady, historyError }: { data: DashboardData; deployment: PublicDeployment; actions: DashboardActions; wallet: InjectedWalletState; liveStateReady: boolean; historyError: string | null }) {
  const { contractsConfigured } = deployment;
  const indexerConnected = data.activitySource === "multi-baas" && !historyError;
  const walletOnSepolia = wallet.address !== null && wallet.chainId === sepolia.id;
  const ownerRecoveryReady = liveStateReady && data.source === "direct-rpc" && contractsConfigured && walletOnSepolia &&
    wallet.address?.toLowerCase() === data.rootOwner?.toLowerCase() && Boolean(actions?.ownerEmergencyRecover);
  const walletStepReady = walletOnSepolia;
  const setupDescription = ownerRecoveryReady
    ? "The recorded root owner is connected. Each owner recovery transaction is simulated against Sepolia before wallet approval."
    : contractsConfigured
      ? liveStateReady
        ? "Live state is available. Root and child actions unlock only for the recorded owner or an agent with current parent authority."
        : "Open a vault by ENS name or contract address to read its current balances and EAC authority. Creating a new root remains available from Wallet actions."
      : "The USDC controller and configured token addresses are pending. Wallet actions remain locked until deployment is recorded.";
  return (
    <section className="setup-panel" id="setup" aria-labelledby="setup-title">
      <div className="setup-orbit" aria-hidden="true"><span /><span /><span /></div>
      <div className="setup-copy">
        <div className="setup-status"><span className="setup-status-dot" /> {ownerRecoveryReady ? "OWNER CONTROLS READY" : contractsConfigured ? "CONTRACTS CONFIGURED" : "DEPLOYMENT PENDING"}</div>
        <h2 id="setup-title">Owner control<br />starts on-chain.</h2>
        <p>{setupDescription}</p>
        {contractsConfigured ? <a className="button button-setup" href="#wallet-controls">Review wallet actions<ArrowUpRight size={15} aria-hidden="true" /></a> : <button className="button button-setup" disabled title="Available after the USDC controller and tokens are deployed">Setup is pending<ArrowUpRight size={15} aria-hidden="true" /></button>}
      </div>
      <div className="setup-steps" aria-label="Setup status">
        <div className={walletStepReady ? "setup-step setup-step-complete" : "setup-step setup-step-pending"}><span>{walletStepReady ? <Check size={12} /> : "1"}</span><div><strong>{walletStepReady ? "Wallet connected" : wallet.address ? "Switch to Sepolia" : "Connect wallet"}</strong><small>{walletStepReady ? shortAddress(wallet.address ?? "") : wallet.address ? "Connected on another network" : "Injected wallet · Sepolia"}</small></div></div>
        <div className={contractsConfigured ? "setup-step setup-step-complete" : "setup-step setup-step-pending"}><span>{contractsConfigured ? <Check size={12} /> : "2"}</span><div><strong>Controller deploy</strong><small>{contractsConfigured ? "Address configuration present" : "Contract address pending"}</small></div></div>
        <div className={indexerConnected ? "setup-step setup-step-complete" : "setup-step setup-step-pending"}><span>{indexerConnected ? <Check size={12} /> : "3"}</span><div><strong>Indexer connect</strong><small>{historyError && data.activitySource === "multi-baas" ? "Last indexed data retained; history refresh unavailable" : indexerConnected ? "MultiBaas activity source active" : "MultiBaas activity source pending"}</small></div></div>
        <div className="setup-step setup-step-pending"><span>4</span><div><strong>Codex plugin</strong><small>Independent setup pending</small></div></div>
      </div>
      <div className="setup-border" aria-hidden="true" />
    </section>
  );
}

function Footer({ source, walletConnected, vaultQuery }: { source: DataSource; walletConnected: boolean; vaultQuery: string | null }) {
  return (
    <footer className="dashboard-footer">
      <span><span className="footer-indicator" /> CONTROL PANEL · {source === "preview" ? "READ-ONLY PREVIEW" : source === "direct-rpc" ? "DIRECT RPC VIEW" : "LOCAL DIAGNOSTICS"}</span>
      <span>{walletConnected ? "Owner authority remains with your connected wallet" : "Connect your wallet to review owner controls"}</span>
      <Link href={routeHref("/setup", vaultQuery)}>Integration status <ArrowUpRight size={12} aria-hidden="true" /></Link>
    </footer>
  );
}

export function Dashboard({ data: initialData, deployment, vaultQuery, nodeQuery, actionQuery, view, onboarding = false }: DashboardProps) {
  const router = useRouter();
  const vaultKey = vaultQuery?.toLowerCase() ?? null;
  const [selectedId, setSelectedId] = useState(nodeQuery ?? initialData.rootId);
  const [detailOpen, setDetailOpen] = useState(false);
  const [walletActionMode, setWalletActionMode] = useState<WalletActionMode>(actionQuery ?? null);
  const [liveSnapshot, setLiveSnapshot] = useState<{ vaultKey: string; rootId: string; nodeId: string; data: DashboardData } | null>(null);
  const [readState, setReadState] = useState<{ vaultKey: string | null; rootId: string | null; status: "idle" | "loading" | "ready" | "error"; error: string | null }>({ vaultKey: null, rootId: null, status: "idle", error: null });
  const [activityState, setActivityState] = useState<{ rootId: string | null; feed: ActivityFeedResult | null; loading: boolean; loadingMore: boolean; loadMoreError: string | null }>({ rootId: null, feed: null, loading: false, loadingMore: false, loadMoreError: null });
  const [paymentState, setPaymentState] = useState<{ rootId: string | null; history: PaymentHistory | null; loading: boolean; error: string | null }>({ rootId: null, history: null, loading: false, error: null });
  const [treeRetry, setTreeRetry] = useState(0);
  const [activityRetry, setActivityRetry] = useState(0);
  const wallet = useInjectedWallet();
  const walletOnSepolia = wallet.address !== null && wallet.chainId === sepolia.id;
  const currentSnapshot = vaultKey && liveSnapshot?.vaultKey === vaultKey ? liveSnapshot : null;
  const rootQuery = currentSnapshot?.rootId ?? null;
  const currentReadState = vaultKey && readState.vaultKey === vaultKey
    ? readState
    : { vaultKey, rootId: null, status: vaultKey ? "loading" as const : "idle" as const, error: null };
  const liveStateReady = Boolean(rootQuery && currentSnapshot && currentReadState.status === "ready");
  const data = currentSnapshot?.data ?? initialData;
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

  useEffect(() => {
    if (view !== "payments" || !rootQuery) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const scheduleRefresh = () => {
      timer = setTimeout(() => {
        if (document.visibilityState === "visible") void load();
        else scheduleRefresh();
      }, 20_000);
    };
    const load = async () => {
      controller = new AbortController();
      setPaymentState((current) => ({ rootId: rootQuery, history: current.rootId === rootQuery ? current.history : null, loading: true, error: null }));
      try {
        const response = await fetch(`/api/payments?root=${encodeURIComponent(rootQuery)}`, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Payment history is unavailable.");
        if (result.rootId !== rootQuery || !Array.isArray(result.payments)) throw new Error("Payment history did not match this root.");
        if (!cancelled) setPaymentState({ rootId: rootQuery, history: result as PaymentHistory, loading: false, error: null });
      } catch (cause) {
        if (!cancelled) setPaymentState((current) => ({ ...current, loading: false, error: cause instanceof Error ? cause.message : "Payment history is unavailable." }));
      }
      if (!cancelled) scheduleRefresh();
    };
    void load();
    return () => { cancelled = true; if (timer) clearTimeout(timer); controller?.abort(); };
  }, [view, rootQuery]);

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
    if (nodeQuery) setSelectedId(nodeQuery);
  }, [nodeQuery]);

  useEffect(() => {
    if (!vaultKey) {
      setReadState({ vaultKey: null, rootId: null, status: "idle", error: null });
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let resolvedRootId: string | undefined;
    let resolvedNodeId: string | undefined;

    const scheduleRefresh = () => {
      timer = setTimeout(() => {
        if (document.visibilityState === "visible") void load();
        else scheduleRefresh();
      }, 20_000);
    };
    const load = async () => {
      controller = new AbortController();
      setReadState({ vaultKey, rootId: resolvedRootId ?? null, status: "loading", error: null });
      try {
        const result = await requestLiveTree(vaultKey, controller.signal, resolvedRootId);
        if (cancelled) return;
        resolvedRootId = result.rootId;
        resolvedNodeId ??= result.nodeId;
        setLiveSnapshot({ vaultKey, rootId: result.rootId, nodeId: result.nodeId, data: result.data });
        setSelectedId((current) => result.data.nodes.some((node) => node.id === current) ? current : resolvedNodeId ?? result.rootId);
        setReadState({ vaultKey, rootId: result.rootId, status: "ready", error: null });
      } catch (cause) {
        if (cancelled || controller?.signal.aborted) return;
        setReadState({ vaultKey, rootId: resolvedRootId ?? null, status: "error", error: cause instanceof Error ? cause.message : "The Sepolia read failed." });
      }
      if (!cancelled) scheduleRefresh();
    };

    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      controller?.abort();
    };
  }, [vaultKey, treeRetry]);

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
      }, 20_000);
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

  const requestAction = (mode: Exclude<WalletActionMode, null>) => {
    setDetailOpen(false);
    setWalletActionMode(mode);
    router.push(`${routeHref("/setup", vaultQuery, selectedNode.id)}&action=${mode}`);
  };

  if (onboarding) {
    return (
      <main className="onboarding-page">
        <header className="app-topbar"><Link href="/" className="app-brand">agent capital tree</Link><WalletControl wallet={wallet} /></header>
        <div className="dashboard-content">
          <div className="page-heading">
            <span className="page-kicker">Your agent capital workspace</span>
            <h1>Create your root vault.</h1>
            <p>Create a Sepolia USDC vault for your agent team, or open an existing vault by its ENS name or contract address.</p>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Start with your own capital tree</CardTitle>
              <CardDescription>Your wallet owns the main vault. Each agent receives only the capital and permissions you delegate.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setWalletActionMode("create-root")}>Launch a new root vault</Button>
              <p>Connect a Sepolia wallet to create a vault. Get USDC from Circle’s faucet; DEMO-USD is a valueless quote token.</p>
              <a className="button button-secondary button-small" href="https://faucet.circle.com/" target="_blank" rel="noreferrer">Get USDC <ArrowUpRight size={13} aria-hidden="true" /></a>
            </CardContent>
          </Card>
          <RootAccessBar vault={null} path="/setup" />
          {walletActionMode === "create-root" && <WalletControlsPanel
            data={data}
            deployment={deployment}
            selectedNode={selectedNode}
            walletAddress={wallet.address}
            walletOnSepolia={walletOnSepolia}
            liveStateReady={false}
            actions={actions}
            notice={notice}
            mode="create-root"
            onModeChange={setWalletActionMode}
            onRootCreated={(vaultAddress) => router.push(`/setup?vault=${encodeURIComponent(vaultAddress)}`)}
          />}
          <nav className="onboarding-links" aria-label="Explore and get started">
            <Link href="/tree?preview=1"><Layers3 size={18} aria-hidden="true" /><span>Explore sample data</span><ArrowRight size={16} aria-hidden="true" /></Link>
            <a href="https://github.com/CodeByNikolas/agent-capital-tree/blob/main/docs/local-setup.md"><ExternalLink size={18} aria-hidden="true" /><span>Install companion &amp; MCP</span><ArrowUpRight size={16} aria-hidden="true" /></a>
          </nav>
        </div>
      </main>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar view={view} vaultQuery={vaultQuery} selectedId={selectedNode.id} rootLabel={rootNode?.label ?? "Treasury"} data={data} readError={liveError} />
      <SidebarInset className="main-shell">
        <Topbar view={view} wallet={wallet} vaultQuery={vaultQuery} selectedId={selectedNode.id} />
        <div className="dashboard-content">
          <PreviewNotice data={data} deployment={deployment} />
          {data.source === "direct-rpc" && rootNode?.tokenHoldings[0]?.symbol === "USDC" && BigInt(rootNode.tokenHoldings[0].rawAmount) === 0n && <div className="zero-usdc-notice" role="note"><Coins size={20} aria-hidden="true" /><span><strong>This root has no USDC.</strong> Request Sepolia USDC from Circle, then use Fund root in Setup &amp; control. The owner wallet also needs Sepolia ETH for gas; the vault itself does not.</span><a href="https://faucet.circle.com/" target="_blank" rel="noreferrer">Circle faucet <ArrowUpRight size={15} aria-hidden="true" /></a></div>}
          {view === "overview" && <>
            <div className="page-heading"><span className="page-kicker">Delegated capital · Sepolia</span><h1>Capital under clear authority.</h1><p>See what each vault holds, which mandates are active, and where owner control stands.</p></div>
            <SummaryMetrics data={data} />
            <div className="overview-lower">
              <Card><CardHeader><CardTitle>Agent tree</CardTitle><CardDescription>Capital moves through bounded vaults, one delegation at a time.</CardDescription></CardHeader><CardContent><div className="overview-node-list">{mobileTreeOrder(data.nodes).slice(0, 5).map((node) => <div key={node.id}><span className="overview-node-indent" style={{ width: node.depth * 20 }} aria-hidden="true" /><GitBranch size={17} aria-hidden="true" /><strong>{node.label}</strong><Badge variant="outline">{node.source === "preview" ? "Example " : ""}{vaultStateLabels[node.state]}</Badge></div>)}</div><Button render={<Link href={routeHref("/tree", vaultQuery, selectedNode.id)} />} variant="outline">Explore agent tree <ArrowRight data-icon="inline-end" /></Button></CardContent></Card>
              <Card><CardHeader><CardTitle>Owner control</CardTitle><CardDescription>Owner recovery is separate from ENS agent roles.</CardDescription></CardHeader><CardContent><p>{data.rootOwner ? `Recorded owner ${shortAddress(data.rootOwner)}` : "Connect a wallet and open a vault to review its recorded owner."}</p><p>Recovery may require a separate LP close, then one or more explicit transactions.</p><Button render={<Link href={routeHref("/setup", vaultQuery, selectedNode.id)} />} variant="outline">Review setup & control <ArrowRight data-icon="inline-end" /></Button></CardContent></Card>
            </div>
          </>}
          {view === "tree" && <>
            <div className="page-heading"><span className="page-kicker">Authority & allocation</span><h1>Agent tree</h1><p>{data.source === "preview" ? "Select a fictional agent to see how its capital and inherited mandate would be displayed." : "Select a vault to inspect current funds, EAC permissions, and the inherited limits that narrow its mandate."}</p></div>
            <CapitalTree data={data} selectedId={selectedNode.id} onSelect={(id) => { setSelectedId(id); setDetailOpen(true); }} canSpawnVault={canSpawnVault} onRequestSpawn={() => requestAction("spawn-child")} />
            <Dialog open={detailOpen} onOpenChange={(open) => { setDetailOpen(open); if (!open) requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`${window.matchMedia("(max-width: 720px)").matches ? ".tree-canvas-mobile" : ".tree-canvas-desktop"} .tree-node[data-node-id="${CSS.escape(selectedNode.id)}"]`)?.focus()); }}><DialogContent className="node-detail-dialog"><DialogHeader><DialogTitle>{selectedNode.ensName}</DialogTitle><DialogDescription>{data.source === "preview" ? "Fictional example: no on-chain funds or permissions." : "Current vault funds, authority, and limits from Sepolia."}</DialogDescription></DialogHeader><div className="node-detail-scroll"><MandatePanel data={data} node={selectedNode} canTighten={canTighten} canRevoke={canRevoke} canRecover={canRecover} onRequestAction={requestAction} /></div></DialogContent></Dialog>
          </>}
          {view === "activity" && <>
            <div className="page-heading"><span className="page-kicker">Indexed on-chain events</span><h1>Activity</h1><p>Capital movement, policy changes, and Uniswap actions for this root. Current balances and permissions come from direct RPC reads.</p></div>
            <ActivityPanel
              data={dashboardData}
              feed={activityFeed}
              loading={activeActivityState.loading}
              loadingMore={activeActivityState.loadingMore}
              loadMoreError={activeActivityState.loadMoreError}
              onRetry={() => setActivityRetry((value) => value + 1)}
              onLoadMore={() => void loadEarlierActivity()}
            />
          </>}
          {view === "uniswap" && <>
            <div className="page-heading"><span className="page-kicker">Bounded Uniswap v4 actions</span><h1>Uniswap</h1><p>{deployment.poolConfigured ? "Agents with the right mandate can swap within the fixed pool and manage vault-owned liquidity positions." : "Uniswap swaps and liquidity management are unavailable for this deployment."}</p></div>
            <div className="module-summary"><div><strong>Swap</strong><span>Exact input · fixed USDC / DEMO-USD pool · minimum output and deadline</span></div><div><strong>Liquidity</strong><span>Open, increase, collect fees, or close with separate ENS rights</span></div></div>
            <PositionsPanel data={data} actions={actions} walletOnSepolia={walletOnSepolia} />
            <ActivityPanel data={{ ...dashboardData, activity: dashboardData.activity.filter((item) => ["swap", "position-opened", "position-increased", "position-closed", "fees-collected"].includes(item.kind)) }} feed={activityFeed} loading={activeActivityState.loading} loadingMore={activeActivityState.loadingMore} loadMoreError={activeActivityState.loadMoreError} onRetry={() => setActivityRetry((value) => value + 1)} onLoadMore={() => void loadEarlierActivity()} uniswapOnly />
            <p className="module-footnote">The agent MCP provides swap and LP actions. This page shows positions and verified indexed actions; it does not submit swaps from the browser. DEMO-USD is a valueless test asset, so pool prices are not dollar valuations.</p>
          </>}
          {view === "payments" && <>
            <div className="page-heading"><span className="page-kicker">Circle USDC · EIP-3009</span><h1>Payments</h1><p>See USDC settlements from the vaults in this tree. Agents buy configured x402 services through the local Companion; the dashboard does not initiate a purchase.</p></div>
            {data.source === "preview" ? <Card><CardHeader><CardTitle>Open a live vault</CardTitle><CardDescription>Payment records are only displayed for a live Sepolia root.</CardDescription></CardHeader></Card> : <PaymentsPanel history={paymentState.rootId === rootQuery ? paymentState.history : null} loading={paymentState.rootId === rootQuery ? paymentState.loading : Boolean(rootQuery)} error={paymentState.rootId === rootQuery ? paymentState.error : null} />}
            <p className="module-footnote">These receipts prove token settlement, not the merchant’s service delivery. Generic contract transactions and currency valuation remain future work.</p>
          </>}
          {view === "setup" && <>
            <div className="page-heading"><span className="page-kicker">Wallet & integration</span><h1>Setup & control</h1><p>Connect the recorded owner or an authorized agent to manage the selected vault. Each available action is simulated before signing.</p></div>
            <div className="setup-selected"><label htmlFor="setup-node">Selected vault</label><select id="setup-node" value={selectedNode.id} onChange={(event) => setSelectedId(event.target.value)}>{data.nodes.map((node) => <option key={node.id} value={node.id}>{node.ensName}</option>)}</select><span>{sourceLabel(data.source)}</span></div>
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
            onRootCreated={(vaultAddress) => {
              setWalletActionMode(null);
              router.push(`/setup?vault=${encodeURIComponent(vaultAddress)}`);
            }}
          />
          <ContractSetupPanel data={dashboardData} deployment={deployment} actions={actions} wallet={wallet} liveStateReady={liveStateReady} historyError={activeActivityState.loadMoreError} />
          </>}
          <Footer source={data.source} walletConnected={walletOnSepolia} vaultQuery={vaultQuery} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
