"use client";
import { ActivityRow, PositionCard } from "@/components/treasury-records";

import {
  AlertCircle,
  Activity as ActivityIcon,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Check,
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
  Plug,
  Plus,
  Shield,
  ShieldAlert,
  ShieldCheck,
  WalletCards,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WalletControlsPanel, type WalletActionMode } from "@/components/wallet-controls";
import { X402Panel } from "@/components/x402-panel";
import { InfoHint } from "@/components/info-hint";
import { GuidedTour } from "@/components/guided-tour";
import { OnboardingHero, ONBOARDING_OPEN_EVENT } from "@/components/onboarding-hero";
import { ViewerStatusBar } from "@/components/viewer-status";
import { McpPanel } from "@/components/mcp-panel";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { GlossaryTerm } from "@/lib/glossary";
import { useDiscoveredRoots } from "@/lib/use-roots";
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
import { formatAmount, formatExactAmount } from "@/lib/format-display-amount";
import { ThemeControl, StatusPill, CapabilityPill, Brand } from "@/components/kanoki";
import { layoutTree, relativeExpiry } from "@/lib/tree-layout";
import { AgentActivity } from "@/components/agent-activity";
import { agentEvents } from "@/lib/agent-activity";
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
  demoLabel?: string | null;
  demoBudget?: string | null;
  setupOperator?: string | null;
  view: "overview" | "tree" | "activity" | "agent-activity" | "uniswap" | "payments" | "applications" | "mcp" | "setup";
  tour?: boolean;
  step?: number;
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
            sepolia
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
      <span className="network-button">sepolia</span>
      <button className="button button-primary button-connect" onClick={connect} disabled={pending} type="button">
        <WalletCards size={16} aria-hidden="true" />
        {pending ? "Connecting…" : "Connect"}
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
  { id: "payments", title: "x402 Pay", path: "/payments", icon: Coins },
  { id: "agent-activity", title: "Curvegrid", path: "/agent-activity", icon: Fingerprint },
  { id: "applications", title: "Applications", path: "/applications", icon: Coins },
  { id: "mcp", title: "MCP", path: "/mcp", icon: Plug },
  { id: "setup", title: "Setup & control", path: "/setup", icon: ShieldCheck },
] as const;

function routeHref(path: string, vaultQuery: string | null, nodeId?: string | null): string {
  if (path === "/mcp" && !vaultQuery) return "/mcp";
  const params = new URLSearchParams();
  if (vaultQuery) params.set("vault", vaultQuery);
  else params.set("preview", "1");
  if (nodeId) params.set("node", nodeId);
  return `${path}?${params}`;
}

function AppSidebar({ view, vaultQuery, selectedId, rootLabel, data, readError, walletAddress }: { view: DashboardProps["view"]; vaultQuery: string | null; selectedId: string; rootLabel: string; data: DashboardData; readError: string | null; walletAddress: string | null }) {
  const { setOpenMobile } = useSidebar();
  return (
    <ShadcnSidebar collapsible="offcanvas" className="app-sidebar">
      <SidebarHeader className="app-sidebar-header">
        <Link href={routeHref("/", vaultQuery)} className="app-brand" onClick={() => setOpenMobile(false)} aria-label="Kanoki overview">
          <Brand />
        </Link>
        <div className="app-workspace"><span className="app-workspace-symbol">{rootLabel.slice(0, 1).toUpperCase()}</span><span><small>Current root</small><strong>{rootLabel}</strong></span></div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="app-sidebar-vault">
          <SidebarGroupContent>
            <RootAccessBar vault={vaultQuery} path={views.find((item) => item.id === view)?.path ?? "/"} walletAddress={walletAddress} />
            {vaultQuery && data.source !== "preview" && <LiveReadNotice data={data} error={readError} />}
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

function Topbar({ wallet, view, vaultQuery, selectedId }: { view: DashboardProps["view"]; source?: DataSource; wallet: InjectedWalletState; vaultQuery: string | null; selectedId: string }) {
  return <header className="app-topbar">
    <div className="app-topbar-title"><SidebarTrigger /><span>{views.find(item => item.id === view)?.title}</span></div>
    <div className="app-topbar-actions"><ThemeControl /><WalletControl wallet={wallet} /></div>
  </header>;
}

function HelpLinks({ vaultQuery, preview = false }: { vaultQuery: string | null; preview?: boolean }) {
  return <nav className="help-links" aria-label="Guides">
    <Link href={(vaultQuery || preview ? routeHref("/", vaultQuery) : "/") + "#how-it-works"} onClick={() => {
      try { window.localStorage.removeItem("act.onboarding.dismissed"); } catch { /* Optional preference. */ }
      window.dispatchEvent(new Event(ONBOARDING_OPEN_EVENT));
    }}>How it works</Link>
    <Link href={routeHref("/mcp", vaultQuery)}>MCP guide</Link>
  </nav>;
}

function PreviewNotice({ data }: { data: DashboardData }) {
  if (data.source !== "preview") return null;
  return (
    <div className="preview-notice" role="note">

      <p>Illustrative preview. Example balances and capabilities. Transactions are disabled.</p>

    </div>
  );
}

function DashboardLoading({ view, error, onRetry }: { view: DashboardProps["view"]; error: string | null; onRetry: () => void }) {
  return <div className="dashboard-loading" aria-busy={!error} aria-label={error ? "Vault unavailable" : "Loading vault data"}>
    {error ? <div className="live-read-notice live-read-notice-error" role="alert"><AlertCircle size={20} aria-hidden="true" /><p><strong>Vault data unavailable.</strong> {error}</p><Button variant="outline" onClick={onRetry}>Try again</Button></div> : <>
      <div className="page-heading"><span className="page-kicker">{views.find((item) => item.id === view)?.title}</span><Skeleton className="loading-heading" /><Skeleton className="loading-description" /></div>
      <div className="loading-grid">{Array.from({ length: view === "overview" ? 4 : 2 }, (_, index) => <div className="loading-panel" key={index}><Skeleton className="loading-label" /><Skeleton className="loading-value" /><Skeleton className="loading-line" /></div>)}</div>
    </>}
  </div>;
}

function RootAccessBar({ vault, path, walletAddress }: { vault: string | null; path: string; walletAddress: string | null }) {
  const router = useRouter();
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { roots: discovered, loading: rootsLoading } = useDiscoveredRoots();

  const walletLower = walletAddress?.toLowerCase() ?? null;
  const vaultLower = vault?.toLowerCase() ?? null;
  const chips = discovered
    .filter((root) => walletLower !== null && root.owner.toLowerCase() === walletLower)
    .map((root) => {
      const leaf = root.ensName ? root.ensName.split(".")[0] : "";
      return {
        id: root.id,
        vault: root.vault,
        active: Boolean(vaultLower && root.vault && root.vault.toLowerCase() === vaultLower),
        // Read the label straight from ENS/chain rather than a hardcoded list.
        label: leaf || `Root ${root.id}`,
        sub: root.revoked ? "Revoked" : `${root.nodeCount} vault${root.nodeCount === 1 ? "" : "s"}`,
      };
    })
    .sort((left, right) => Number(BigInt(left.id) - BigInt(right.id)))
    .slice(0, 8);

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
        const rootOnly = path === "/setup";
        if (rootOnly && (typeof result.rootVault !== "string" || typeof result.rootId !== "string")) throw new Error("The lookup did not return a root vault.");
        router.push(`${path}?vault=${encodeURIComponent(rootOnly ? result.rootVault : result.vault)}&node=${encodeURIComponent(rootOnly ? result.rootId : result.nodeId)}`);
      } catch (cause) { setLookupError(cause instanceof Error ? cause.message : "Lookup failed. Please try again."); }
      finally { setLoading(false); }
    }}>
      <label className="sr-only" htmlFor="vault-reference">{path === "/setup" ? "Open root vault" : "Open vault"}</label>
      <input id="vault-reference" name="lookup" type="text" maxLength={253} placeholder="ENS name or vault address" aria-label="ENS name or vault contract address" autoComplete="off" required disabled={loading} />
      <button className="button button-secondary button-small" type="submit" disabled={loading}>{loading ? "Looking up…" : path === "/setup" ? "Open root vault" : "Open vault"}</button>
      {lookupError && <span role="alert" className="vault-lookup-error">{lookupError}</span>}
    </form>
    {(loading || (rootsLoading && walletAddress)) && <div role="status" aria-label="Loading vault lookup"><Skeleton className="loading-table-row" /></div>}
    {!rootsLoading && chips.length > 0 && (
      <div className="root-quick-start">
        <span className="root-quick-label">Your root vaults</span>
        <div className="demo-root-chips" role="group" aria-label="Your root vaults on Sepolia">
          {chips.map((chip) => (
            <a
              key={chip.id}
              className={`demo-root-chip demo-root-chip-owned${chip.active ? " demo-root-chip-active" : ""}`}
              href={`${path}?vault=${encodeURIComponent(chip.vault)}&node=${encodeURIComponent(chip.id)}`}
              aria-current={chip.active ? "true" : undefined}
            >
              <strong>{chip.label}</strong>
              <span>{chip.sub}</span>
            </a>
          ))}
        </div>
      </div>
    )}
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

function SummaryMetrics({ data }: { data: DashboardData }) {
  const holdings = data.nodes.flatMap(node => node.tokenHoldings);
  const assets = uniqueAssets(holdings);
  const usdc = assets.find(asset => asset.symbol === "USDC");
  const demo = assets.find(asset => asset.symbol === "DEMO-USD");
  const runtimeKnown = data.nodes.every(node => node.runtime !== "unknown");
  return <dl className="summary-ledger" aria-label={data.source === "preview" ? "Preview summary" : "Capital summary"}>
    <div><dt>Vault balances</dt><dd className="usdc-amount">{usdc ? formatAmount(sumAsset(holdings, usdc)) + " USDC" : "Unavailable"}</dd>{demo && <small className="test-amount">{formatAmount(sumAsset(holdings, demo))} DEMO-USD</small>}</div>
    <div><dt>Nodes</dt><dd>{data.nodes.length} / 32</dd><small>{data.nodes.filter(node => node.state === "active").length} active · three levels maximum</small></div>
    <div><dt>Open positions</dt><dd>{data.positions.filter(position => position.state === "open").length}</dd><small>Uniswap v4</small></div>
    <div><dt>Runtime <InfoHint term="runtime" /></dt><dd>{runtimeKnown ? data.nodes.filter(node => node.runtime === "connected").length + " connected" : "Unknown"}</dd><small>{runtimeKnown ? "Local companion connections" : "Not observable onchain"}</small></div>
  </dl>;
}

function VaultRegister({ data, vaultQuery }: { data: DashboardData; vaultQuery: string | null }) {
  return <section className="vault-register" aria-labelledby="register-title">
    <div className="panel-heading"><h2 id="register-title">Nodes</h2><Link className="text-link" href={routeHref("/tree", vaultQuery)}>View tree</Link></div>
    <Table><TableHeader><TableRow><TableHead>Node</TableHead><TableHead className="register-balance">USDC balance</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>
      {mobileTreeOrder(data.nodes).map(node => {
        const balance = node.tokenHoldings.find(asset => asset.symbol === "USDC");
        return <TableRow key={node.id}><TableCell><Link className="register-node mono" title={node.ensName.toLowerCase()} href={routeHref("/tree", vaultQuery, node.id)}>{node.ensName.toLowerCase()}</Link></TableCell><TableCell className="register-balance usdc-amount">{balance ? formatAmount(balance) + " USDC" : "Unavailable"}</TableCell><TableCell><StatusPill status={node.state} /></TableCell></TableRow>;
      })}
    </TableBody></Table>
    <div className="owner-summary"><p>Owner <span className="mono" title={data.rootOwner ?? undefined}>{data.rootOwner ? shortAddress(data.rootOwner) : "unavailable"}</span>. Recovery remains separate from node capabilities.</p><Link className="text-link" href={routeHref("/setup", vaultQuery)}>Owner controls</Link></div>
  </section>;
}

function TreeCard({ node, selected, onSelect, parentLabel, now, owner }: {
  node: VaultNode; selected: boolean; onSelect: (id: string) => void; parentLabel?: string; now: number; owner?: string | null;
}) {
  const balance = node.tokenHoldings.find(asset => asset.symbol.toUpperCase().includes("USDC"));
  const demo = node.tokenHoldings.find(asset => asset.symbol === "DEMO-USD");
  const expires = Date.parse(node.effectivePolicy.expiresAt);
  const lifetime = node.mandateStartsAt ? expires - Date.parse(node.mandateStartsAt) : null;
  const state = node.state === "active" && expires <= now ? "expired"
    : node.state === "active" && lifetime && expires - now < lifetime * .1 ? "expiring" : node.state;
  const remaining = balance ? formatAmount(balance) : "—";
  return <button className={"tree-node" + (!node.parentId ? " tree-node-root" : "") + (selected ? " tree-node-selected" : "") + (state === "revoked" ? " tree-node-revoked" : "")}
    data-node-id={node.id} type="button" onClick={() => onSelect(node.id)} aria-pressed={selected}
    aria-description={parentLabel ? "Delegated by " + parentLabel : "Human root"}
    aria-label={node.ensName.toLowerCase() + ", " + remaining + " USDC remaining, " + state}>
    <span className="tree-node-head"><span className={"node-disc" + (!node.parentId ? " node-disc-human" : "")} aria-hidden="true" /><span className="tree-node-ens" title={node.ensName.toLowerCase()}>{node.ensName.toLowerCase()}</span></span>
    {!node.parentId && <span className="node-owner" title={owner ?? undefined}>owner {owner ? shortAddress(owner) : "unavailable"}</span>}
    <span className="tree-node-balances"><span className="tree-node-amount">{remaining} USDC</span>{demo && <span className="node-demo-amount">{formatAmount(demo)} DEMO-USD</span>}</span>
    <CapabilityPill permissions={state === "active" || state === "expiring" ? node.authorizedPermissions : []} />
    <span className="tree-node-meta"><time dateTime={node.effectivePolicy.expiresAt}>{relativeExpiry(node.effectivePolicy.expiresAt, now)}</time><StatusPill status={state} /></span>
  </button>;
}

function CapitalTree({ data, selectedId, onSelect, canSpawnVault, onRequestSpawn }: { data: DashboardData; selectedId: string; onSelect: (id: string) => void; canSpawnVault: boolean; onRequestSpawn: () => void }) {
  const [spaces, setSpaces] = useState({ sibling: 16, level: 32, large: 48 });
  const [now, setNow] = useState(Date.parse(data.snapshot?.observedAt ?? "2026-09-26T19:00:00Z"));
  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    setSpaces({ sibling: parseFloat(css.getPropertyValue("--space-4")), level: parseFloat(css.getPropertyValue("--space-8")), large: parseFloat(css.getPropertyValue("--space-12")) });
    setNow(Date.now());
  }, [data]);
  const tree = layoutTree(data.nodes, spaces);
  const mobileNodes = mobileTreeOrder(tree.nodes.map((item) => item.node));

  return (
    <section className="panel tree-panel" id="capital-tree" aria-labelledby="tree-title">
      <div className="panel-heading">
        <div>

          <h2 id="tree-title">Vault balances</h2>
        </div>
        <div className="panel-heading-actions">
          <button className="button button-secondary button-small" disabled={!canSpawnVault} onClick={onRequestSpawn} title={canSpawnVault ? "Create a child vault with a narrower policy and initial allocation" : "Connect the active agent assigned to this vault on Sepolia"}>
            <Plus size={14} aria-hidden="true" /> Delegate
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
              <path key={edge.id} d={edge.path} className={edge.revoked ? "tree-edge-revoked" : undefined} />
            ))}
          </svg>
          {tree.nodes.map(({ node, left, top }) => (
            <div className="tree-position" role="none" key={node.id} style={{ left, top }}>
              <TreeCard owner={data.rootOwner} now={now} node={node} selected={node.id === selectedId} onSelect={onSelect} parentLabel={node.parentId ? nodeById(data, node.parentId)?.label : undefined} />
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
              <TreeCard owner={data.rootOwner} now={now} node={node} selected={node.id === selectedId} onSelect={onSelect} parentLabel={parent?.label} />
              <span className="mobile-tree-parent">{parent ? `Delegated by ${parent.label}` : "Human owner · Root vault"}</span>
            </div>
          );
        })}
      </div>

      {tree.omittedCount > 0 && <p className="tree-limit-warning" role="status">{tree.omittedCount} node{tree.omittedCount === 1 ? "" : "s"} exceed the 32-node or three-level display limit.</p>}

      <p className="budget-note">USDC is capital. DEMO-USD is a valueless test asset. Limits apply per action.</p>
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
          <span role="columnheader">Asset</span><span role="columnheader">Held now <InfoHint term="held" /></span><span role="columnheader">Available <InfoHint term="free" /></span><span role="columnheader">Sent to children <InfoHint term="allocated" /></span>
        </div>
        {assets.map((asset) => (
          <div className="capital-ledger-row" role="row" key={asset.key}>
            <span className="capital-ledger-asset" role="cell"><i />{asset.symbol}</span>
            <strong role="cell" title={`Exact: ${formatExactAmount(sumAsset(node.tokenHoldings, asset))}`}>{formatAmount(sumAsset(node.tokenHoldings, asset))}</strong>
            <span role="cell" title={`Exact: ${formatExactAmount(sumAsset(node.freeCapital, asset))}`}>{formatAmount(sumAsset(node.freeCapital, asset))}</span>
            <span role="cell" title={allocationHistoryAvailable ? `Exact: ${formatExactAmount(sumAsset(outgoing, asset))}` : undefined}>{allocationHistoryAvailable ? formatAmount(sumAsset(outgoing, asset)) : "—"}</span>
          </div>
        ))}
      </div>
      <div className="capital-origin">
        <span>{parent ? `Gross assigned in by ${parent.label}` : "Root funding origin"}</span>
        <strong title={parent && node.capitalReceivedFromParent ? node.capitalReceivedFromParent.map((amount) => `${formatAmount(amount)} ${amount.symbol}`).join(" · ") : undefined}>{parent ? node.capitalReceivedFromParent === null ? "Not indexed" : node.capitalReceivedFromParent.map((amount) => `${formatAmount(amount)} ${amount.symbol}`).join(" · ") || "0" : node.source === "preview" ? "Example owner · no real wallet" : "Owner wallet · no parent vault"}</strong>
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
          <div className="panel-overline">WHAT THIS AGENT MAY DO <PreviewFlag source={node.source} compact /></div>
          <h2 id="mandate-title">Effective mandate <InfoHint term="effectivePolicy" /></h2>
        </div>
      </div>

      <div className="selected-vault-summary">
        <span className="selected-vault-avatar">{node.depth === 0 ? <Fingerprint size={18} /> : node.label.slice(0, 1)}</span>
        <span><strong>{node.label}</strong><small>{node.ensName}</small></span>
        <span className={`vault-state-pill vault-state-${node.state}`}><span />{node.source === "preview" ? `Example ${vaultStateLabels[node.state].toLowerCase()}` : vaultStateLabels[node.state]}</span>
      </div>

      <p className="mandate-summary">
        {node.effectivePolicy.allowedTokens.join(" · ")} · {actionCeiling} · {node.authorizedPermissions.length} capabilities · expires {new Date(node.effectivePolicy.expiresAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}
      </p>

      <CapitalLedger data={data} node={node} />

      <details className="mandate-disclosure">
        <summary>Addresses</summary>
        <div className="address-pair">
          <AddressLine label="Agent address" value={node.agentAddress} source={node.source} />
          <AddressLine label="Bound vault" value={node.vaultAddress} source={node.source} />
        </div>
      </details>

      <div className="mandate-divider" />
      <div className="policy-section-heading">
        <span className="policy-heading-icon"><ShieldCheck size={15} aria-hidden="true" /></span>
        <div><strong>{node.source === "preview" ? "Example capabilities" : "Live authorized capabilities"} <InfoHint term="authorizedCapabilities" /></strong><small>{node.source === "preview" ? "Illustrative roles · not granted on-chain" : "Current EAC roles at this vault; can be narrower than policy"}</small></div>
        <span className="permission-count">{node.authorizedPermissions.length}</span>
      </div>
      {node.authorizedPermissions.length > 0
        ? <PermissionList permissions={node.authorizedPermissions} />
        : <p className="authorization-empty">No actions are currently authorized for this vault. Review its state and inherited limits before assigning work.</p>}
      {notCurrentlyAuthorized.length > 0 && <p className="authorization-gap">Policy lists {notCurrentlyAuthorized.map((permission) => permissionLabels[permission]).join(" · ")}, but current EAC state does not authorize those actions.</p>}

      <div className="inherited-box">
        <div className="inherited-box-heading"><Network size={14} aria-hidden="true" /><strong>Limits inherited from parents <InfoHint term="inheritedLimits" /></strong><span>{node.inheritedConstraints.length} ancestors</span></div>
        <p>This mandate is capped by every parent on the path to the owner.</p>
        <div className="inherited-limit-row"><span>Allowed assets</span><strong>{node.effectivePolicy.allowedTokens.join(" · ")}</strong></div>
        <div className="inherited-limit-row"><span>Maximum per token</span><strong>{actionCeiling}</strong></div>
        <div className="inherited-limit-row"><span>Authorized now</span><strong>{node.authorizedPermissions.length} capabilities</strong></div>
        {node.inheritedConstraints.length > 0 && (
          <details className="mandate-disclosure mandate-disclosure-inset">
            <summary>Per-ancestor rules ({node.inheritedConstraints.length})</summary>
            <div className="ancestor-rules">
              {node.inheritedConstraints.map((constraint) => (
                <div className="ancestor-rule" key={constraint.ancestorId}>
                  <strong>{constraint.ancestorLabel}</strong>
                  <span>{constraint.policy.permissions.map((permission) => permissionLabels[permission]).join(" · ")}</span>
                  <small>{policyAmountLabel(constraint.policy)} per token</small>
                </div>
              ))}
            </div>
          </details>
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
  if ((loading || loadingMore) && data.activitySource !== "preview") return <section className="activity-panel" role="status" aria-label="Loading activity history"><Skeleton className="loading-heading" />{[0, 1, 2].map(row => <Skeleton key={row} className="loading-table-row" />)}</section>;
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
          <h2 id="activity-title">{uniswapOnly ? "Swap and LP history" : "Events"}</h2>
        </div>
        <div className="activity-heading-actions">
          <span className="activity-count">{loading && !feed ? "Loading records" : `${data.activity.length}${data.activitySource === "preview" ? " preview" : ""} records`}</span>
          {(feed?.source === "unavailable" || loadMoreError) && <button className="button button-secondary button-small" type="button" disabled={loading} onClick={onRetry}>{loading ? "Checking…" : "Retry history"}</button>}
        </div>
      </div>
      <p className="index-status"><span className={"index-dot index-" + (page ? indexLag === 0 ? "synced" : "lagging" : data.activitySource === "preview" ? "preview" : "unreachable")} />{page ? "Indexed by MultiBaas · block " + page.indexing.latestIndexedBlock : data.activitySource === "preview" ? "Illustrative activity" : "MultiBaas unreachable"}<span className="small">{page ? indexLag === 0 ? "in sync" : "lagging" : ""}</span></p>
      <Table className="activity-list"><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Event</TableHead><TableHead>Node</TableHead><TableHead>Amount</TableHead><TableHead>Transaction</TableHead></TableRow></TableHeader><TableBody>{data.activity.map(activity => <ActivityRow key={activity.id} activity={activity} event={activityLabels[activity.kind]} node={nodeById(data, activity.nodeId)} />)}</TableBody></Table>
      {data.activity.length === 0 && <p className="activity-empty">{loading ? "Loading activity history…" : data.activitySource === "preview" ? "Preview records are shown above when available." : feed?.source === "unavailable" ? "Indexed activity is unavailable for this root." : page ? "No indexed activity is available for this root within the covered block range." : "No activity records are available for this root yet."}</p>}
      {loadMoreError && feed?.source !== "unavailable" && <p className="activity-load-error" role="alert">{loadMoreError}</p>}
      {page?.hasMore && <button className="button button-secondary button-small activity-load-more" type="button" disabled={loadingMore} onClick={onLoadMore}>{loadingMore ? "Loading…" : "Load more activity"}</button>}
      <div className="activity-provenance"><span className="provenance-dot" />{activityStatus}</div>
    </section>
  );
}

function PositionsPanel({ data, actions, walletOnSepolia, walletAddress }: { data: DashboardData; actions?: DashboardActions; walletOnSepolia: boolean; walletAddress: string | null }) {
  return <section className="panel positions-panel" id="positions"><div className="panel-heading"><h2>Uniswap v4 positions</h2></div>{data.positions.length ? data.positions.map(position => {
    const node = nodeById(data, position.nodeId);
    const authorized = Boolean(data.source === "direct-rpc" && data.contractsConfigured && walletOnSepolia && node?.agentAddress.toLowerCase() === walletAddress?.toLowerCase());
    return <PositionCard key={position.id} position={position} node={node} actions={actions} authorized={authorized} />;
  }) : <p>No position in this vault.</p>}</section>;
}

function PaymentsPanel({ history, loading, error }: { history: PaymentHistory | null; loading: boolean; error: string | null }) {
  if (loading) return <section role="status" aria-label="Loading payment history">{[0, 1, 2].map(row => <Skeleton key={row} className="loading-table-row" />)}</section>;
  if (error) return <p role="alert">Payment history unavailable: {error}</p>;
  return <section className="payments-panel" aria-label="Vault USDC settlements">
    <div className="payments-heading"><div><h2>Vault USDC settlements</h2><p>On-chain EIP-3009 authorizations paired with Circle USDC transfers from this tree’s vaults.</p></div></div>
      {error && <p className="payment-status payment-status-error" role="alert">{error}</p>}
      {history && <p className="payment-status" role="status">Blocks {history.coverage.fromBlock.toLocaleString()}–{history.coverage.toBlock.toLocaleString()} · {history.coverage.completeSinceDeployment ? "Complete scan since this controller was deployed" : "Earlier blocks are outside this scan"}. {history.note}</p>}
      <div className="payment-table-scroll"><Table className="payment-table">
        <TableHeader><TableRow><TableHead>Agent vault</TableHead><TableHead>Amount</TableHead><TableHead>Recipient</TableHead><TableHead>Block</TableHead><TableHead>Evidence</TableHead></TableRow></TableHeader>
        <TableBody>{loading && !history ? Array.from({ length: 3 }, (_, index) => <TableRow key={index}><TableCell colSpan={5}><Skeleton className="loading-table-row" /></TableCell></TableRow>) : history?.payments.map((payment) => <TableRow key={payment.id}>
          <TableCell><strong>{payment.nodeName}</strong><small><CopyablePaymentAddress address={payment.from} label="vault address" /></small></TableCell>
          <TableCell className="payment-amount">{formatAmount({ rawAmount: payment.amountRaw, decimals: 6, symbol: "USDC" })} <span>USDC</span></TableCell>
          <TableCell><CopyablePaymentAddress address={payment.to} label="recipient address" /></TableCell>
          <TableCell>{payment.blockNumber.toLocaleString()}</TableCell>
          <TableCell><a className="activity-transaction-link" href={`https://sepolia.etherscan.io/tx/${payment.transactionHash}`} target="_blank" rel="noreferrer">Receipt <ExternalLink size={13} aria-hidden="true" /></a></TableCell>
        </TableRow>)}</TableBody>
      </Table></div>
      {!error && !loading && history?.payments.length === 0 && <p className="activity-empty">No matching USDC settlements were found in the scanned blocks. A vault balance change alone is not a payment.</p>}
  </section>;
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
        <a className="setup-step setup-step-link" href={routeHref("/mcp", data.source === "preview" ? null : data.rootId)}><span><Plug size={12} /></span><div><strong>Codex plugin (MCP)</strong><small>Open the MCP integration guide →</small></div></a>
      </div>
      <div className="setup-border" aria-hidden="true" />
    </section>
  );
}

function Footer({ source, vaultQuery }: { source: DataSource; vaultQuery: string | null }) {
  return (
    <div className="dashboard-footer-wrap">
    <footer className="dashboard-footer">
      <span>{source === "preview" ? "Illustrative preview" : source === "direct-rpc" ? "Sepolia · direct contract reads" : "Local diagnostics"}</span>
      <Link href={routeHref("/setup", vaultQuery)}>Integration status</Link>
    </footer>
    </div>
  );
}

export function Dashboard({ data: initialData, deployment, vaultQuery, nodeQuery, actionQuery, demoLabel, demoBudget, setupOperator, view, onboarding = false, tour = false, step = 1 }: DashboardProps) {
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
  const rootNode = nodeById(data, data.rootId);
  const selectedNode = view === "setup" && !actionQuery ? rootNode ?? data.nodes[0] : nodeById(data, selectedId) ?? rootNode ?? data.nodes[0];
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
  const runtimeLabel = !vaultQuery ? "No vault selected" : data.nodes.every((node) => node.runtime === "unknown") ? "Local companion status unavailable on-chain" : `${data.nodes.filter((node) => node.runtime === "connected").length} connected`;

  const requestAction = (mode: Exclude<WalletActionMode, null>) => {
    setDetailOpen(false);
    setWalletActionMode(mode);
    router.push(`${routeHref("/setup", vaultQuery, selectedNode.id)}&action=${mode}`);
  };

  if (onboarding) {
    return (
      <main className="onboarding-page">
        <header className="app-topbar"><Link href="/" aria-label="Kanoki overview"><Brand /></Link><div className="app-topbar-actions"><ThemeControl /><WalletControl wallet={wallet} /></div></header>
        <div className="dashboard-content">
          <HelpLinks vaultQuery={vaultQuery} />
          <div className="page-heading">
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
              <p className="onboarding-create-help">Connect your wallet, choose a name and permissions, then confirm in your wallet. Creation uses Sepolia ETH for gas. You can add USDC after your vault is ready.</p>
            </CardContent>
          </Card>
          <OnboardingHero context={{ vault: `capital.${deployment.namespaceName}` }} />
          <RootAccessBar vault={null} path="/setup" walletAddress={wallet.address} />
          {walletActionMode === "create-root" && <WalletControlsPanel
            creationOnly
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
            onRootCreated={(vaultAddress) => router.push(`/setup?vault=${encodeURIComponent(vaultAddress)}${demoBudget ? `&action=fund-root&budget=${demoBudget}` : ""}`)}
            demoLabel={demoLabel}
            demoBudget={demoBudget}
            setupOperator={setupOperator}
          />}
          <nav className="onboarding-links" aria-label="Explore and get started">
            <Link href={`/tree?vault=capital.${deployment.namespaceName}`}><Layers3 size={18} aria-hidden="true" /><span>Open live demo</span><ArrowRight size={16} aria-hidden="true" /></Link>
            <a href="https://github.com/CodeByNikolas/agent-capital-tree/blob/main/docs/local-setup.md"><ExternalLink size={18} aria-hidden="true" /><span>Install companion &amp; MCP</span><ArrowUpRight size={16} aria-hidden="true" /></a>
          </nav>
        </div>
      </main>
    );
  }

  if (vaultKey && (!currentSnapshot || currentReadState.status === "error")) {
    return <TooltipProvider delay={150}><SidebarProvider>
      <AppSidebar view={view} vaultQuery={vaultQuery} selectedId="" rootLabel={currentSnapshot?.data.nodes[0]?.label ?? "Loading vault…"} data={data} readError={currentReadState.error} walletAddress={wallet.address} />
      <SidebarInset className="main-shell"><Topbar view={view} wallet={wallet} vaultQuery={vaultQuery} selectedId="" />
        <div className="dashboard-content"><HelpLinks vaultQuery={vaultQuery} /><DashboardLoading view={view} error={currentReadState.error} onRetry={() => setTreeRetry((value) => value + 1)} /></div>
      </SidebarInset>
    </SidebarProvider></TooltipProvider>;
  }

  return (
    <TooltipProvider delay={150}>
    <SidebarProvider>
      <AppSidebar view={view} vaultQuery={vaultQuery} selectedId={selectedNode.id} rootLabel={rootNode?.label ?? "No vault selected"} data={data} readError={liveError} walletAddress={wallet.address} />
      <SidebarInset className="main-shell">
        <Topbar view={view} wallet={wallet} vaultQuery={vaultQuery} selectedId={selectedNode.id} />
        <div className="dashboard-content">
          {currentReadState.status === "loading" && <DashboardLoading view={view} error={null} onRetry={() => setTreeRetry(value => value + 1)} />}
          <div className="dashboard-loaded-content" hidden={currentReadState.status === "loading"}>
          <HelpLinks vaultQuery={vaultQuery} preview={data.source === "preview" && view !== "mcp"} />
          {view === "overview" && <div className="page-heading"><h1>Overview</h1><p>Balances and authority across your vaults.</p></div>}
          {view === "tree" && <div className="page-heading"><h1>Capital tree</h1><p>Select a node to inspect its balance, capabilities and limits.</p></div>}
          {view === "activity" && <div className="page-heading"><h1>Activity</h1><p>Indexed capital movements and changes to node authority.</p></div>}
          {view === "applications" && <div className="page-heading"><h1>Applications</h1><p>Uniswap positions and services within the selected node’s capabilities.</p></div>}
          {view === "setup" && <div className="page-heading"><h1>Setup</h1><p>Fund the root, authorize an operator and manage owner recovery.</p></div>}
          <GuidedTour active={tour} step={step} context={{ vault: vaultQuery ?? `capital.${deployment.namespaceName}`, preview: data.source === "preview" }} />
          {!(view === "mcp" && !vaultQuery) && <PreviewNotice data={data} />}
          {data.source !== "preview" && (
            <ViewerStatusBar
              source={data.source}
              vaultLabel={selectedNode.label}
              walletConnected={wallet.address !== null}
              walletOnSepolia={walletOnSepolia}
              liveStateReady={liveStateReady}
              ownerConnected={ownerConnected}
              selectedAgentConnected={selectedAgentConnected}
              parentCanRestrict={parentCanRestrict}
            />
          )}
          {data.source === "direct-rpc" && rootNode?.tokenHoldings[0]?.symbol === "USDC" && BigInt(rootNode.tokenHoldings[0].rawAmount) === 0n && <div className="zero-usdc-notice" role="note"><Coins size={20} aria-hidden="true" /><span><strong>This root has no USDC.</strong> Request Sepolia USDC from Circle, then use Fund root in Setup &amp; control. The owner wallet also needs Sepolia ETH for gas; the vault itself does not.</span><a href="https://faucet.circle.com/" target="_blank" rel="noreferrer">Circle faucet <ArrowUpRight size={15} aria-hidden="true" /></a></div>}

          {view === "overview" && <>


            <OnboardingHero context={{ vault: vaultQuery ?? `capital.${deployment.namespaceName}`, preview: data.source === "preview" }} />
            <SummaryMetrics data={data} />
            <VaultRegister data={data} vaultQuery={vaultQuery} />
            <div className="overview-lower">
              <Card><CardHeader><CardTitle>Agent tree</CardTitle><CardDescription>Inspect each vault’s capital, permissions and place in the delegation tree.</CardDescription></CardHeader><CardContent><Button nativeButton={false} render={<Link href={routeHref("/tree", vaultQuery, selectedNode.id)} />}>Explore agent tree <ArrowRight data-icon="inline-end" /></Button></CardContent></Card>
              <Card><CardHeader><CardTitle>Owner control</CardTitle><CardDescription>Fund your root, authorize an operator and review the independent owner recovery controls.</CardDescription></CardHeader><CardContent><Button nativeButton={false} render={<Link href={routeHref("/setup", vaultQuery)} />}>Review setup &amp; control <ArrowRight data-icon="inline-end" /></Button></CardContent></Card>
            </div>
          </>}
          {view === "tree" && <>

            <CapitalTree data={data} selectedId={selectedNode.id} onSelect={(id) => { setSelectedId(id); setDetailOpen(true); }} canSpawnVault={canSpawnVault} onRequestSpawn={() => requestAction("spawn-child")} />
            <Dialog open={detailOpen} onOpenChange={(open) => { setDetailOpen(open); if (!open) requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`${window.matchMedia("(max-width: 720px)").matches ? ".tree-canvas-mobile" : ".tree-canvas-desktop"} .tree-node[data-node-id="${CSS.escape(selectedNode.id)}"]`)?.focus()); }}><DialogContent className="node-detail-dialog"><DialogHeader><DialogTitle>{selectedNode.ensName}</DialogTitle><DialogDescription>{data.source === "preview" ? "Fictional example: no on-chain funds or permissions." : "Current vault funds, authority, and limits from Sepolia."}</DialogDescription></DialogHeader><div className="node-detail-scroll"><MandatePanel data={data} node={selectedNode} canTighten={canTighten} canRevoke={canRevoke} canRecover={canRecover} onRequestAction={requestAction} /></div></DialogContent></Dialog>
          </>}
          {view === "agent-activity" && <AgentActivity data={data} node={selectedNode} feed={activityFeed} loading={activeActivityState.loading || activeActivityState.loadingMore} error={activeActivityState.loadMoreError} onSelect={setSelectedId} onRetry={() => setActivityRetry(value => value + 1)}>
            <ActivityPanel data={{ ...dashboardData, activity: activityFeed?.source === "multi-baas" ? agentEvents(activityFeed.page.items, selectedNode.id, data.rootId).map(item => mapIndexedActivity(data, item)) : [] }} feed={activityFeed} loading={activeActivityState.loading} loadingMore={activeActivityState.loadingMore} loadMoreError={activeActivityState.loadMoreError} onRetry={() => setActivityRetry(value => value + 1)} onLoadMore={() => void loadEarlierActivity()} />
          </AgentActivity>}
          {view === "activity" && <>
            <div className="application-links"><Button variant="secondary" nativeButton={false} render={<Link href={routeHref("/agent-activity", vaultQuery, selectedNode.id)} />}>Agent activity</Button></div>
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
            <PositionsPanel data={data} actions={actions} walletOnSepolia={walletOnSepolia} walletAddress={wallet.address} />
            <ActivityPanel data={{ ...dashboardData, activity: dashboardData.activity.filter((item) => ["swap", "position-opened", "position-increased", "position-closed", "fees-collected"].includes(item.kind)) }} feed={activityFeed} loading={activeActivityState.loading} loadingMore={activeActivityState.loadingMore} loadMoreError={activeActivityState.loadMoreError} onRetry={() => setActivityRetry((value) => value + 1)} onLoadMore={() => void loadEarlierActivity()} uniswapOnly />
            <p className="module-footnote">The agent MCP provides swap and LP actions. This page shows positions and verified indexed actions; it does not submit swaps from the browser. DEMO-USD is a valueless test asset, so pool prices are not dollar valuations.</p>
          </>}
          {view === "payments" && <>
            <div className="page-heading"><span className="page-kicker">Circle USDC · EIP-3009</span><h1>x402 Pay</h1><p>See USDC settlements from the vaults in this tree. Agents buy configured x402 services through the local Companion; the dashboard does not initiate a purchase.</p></div>
            {data.source === "preview" ? <Card><CardHeader><CardTitle>Open a live vault</CardTitle><CardDescription>Payment records are only displayed for a live Sepolia root.</CardDescription></CardHeader></Card> : <PaymentsPanel history={paymentState.rootId === rootQuery ? paymentState.history : null} loading={paymentState.rootId === rootQuery ? paymentState.loading : Boolean(rootQuery)} error={paymentState.rootId === rootQuery ? paymentState.error : null} />}
            <p className="module-footnote">These receipts prove token settlement, not the merchant’s service delivery. Generic contract transactions and currency valuation remain future work.</p>
          </>}
          {view === "applications" && <>
            <div className="application-links"><Button variant="secondary" nativeButton={false} render={<Link href={routeHref("/uniswap", vaultQuery, selectedNode.id)} />}>Uniswap activity</Button><Button variant="secondary" nativeButton={false} render={<Link href={routeHref("/payments", vaultQuery, selectedNode.id)} />}>Payment receipts</Button></div>

            <PositionsPanel data={data} actions={actions} walletOnSepolia={walletOnSepolia} walletAddress={wallet.address} />
            <X402Panel node={selectedNode} actions={actions} walletOnSepolia={walletOnSepolia} canPay={selectedAgentConnected} />

          </>}
          {view === "mcp" && <McpPanel deployment={deployment} selectedNode={vaultQuery ? selectedNode : undefined} runtimeLabel={vaultQuery ? runtimeLabel : "No vault selected"} />}
          {view === "setup" && <>
            <div className="setup-selected"><strong>Root vault</strong><span className="setup-root-name">{rootNode?.ensName ?? "Unknown root"}</span><span>{sourceLabel(data.source)}</span><Button variant="outline" onClick={() => setWalletActionMode("create-root")}>Create another root</Button></div>
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
              setWalletActionMode(demoBudget ? "fund-root" : null);
              router.push(`/setup?vault=${encodeURIComponent(vaultAddress)}${demoBudget ? `&action=fund-root&budget=${demoBudget}` : ""}`);
            }}
            demoLabel={demoLabel}
            demoBudget={demoBudget}
            setupOperator={setupOperator}
          />
          <details className="setup-disclosure">
            <summary>Deployment &amp; integration status</summary>
            <ContractSetupPanel data={dashboardData} deployment={deployment} actions={actions} wallet={wallet} liveStateReady={liveStateReady} historyError={activeActivityState.loadMoreError} />
          </details>
          </>}
          <Footer source={data.source} vaultQuery={vaultQuery} />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
    </TooltipProvider>
  );
}
