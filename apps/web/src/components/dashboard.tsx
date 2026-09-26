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
  Plug,
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
import { Sidebar as ShadcnSidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
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
import { formatAmount, formatCompactAmount } from "@/lib/format-display-amount";
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
  view: "overview" | "tree" | "activity" | "applications" | "mcp" | "setup";
  tour?: boolean;
  step?: number;
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
  { id: "applications", title: "Applications", path: "/applications", icon: Coins },
  { id: "mcp", title: "MCP", path: "/mcp", icon: Plug },
  { id: "setup", title: "Setup & control", path: "/setup", icon: ShieldCheck },
] as const;

function routeHref(path: string, vaultQuery: string | null, nodeId?: string | null): string {
  const params = new URLSearchParams();
  if (vaultQuery) params.set("vault", vaultQuery);
  else params.set("preview", "1");
  if (nodeId) params.set("node", nodeId);
  return `${path}?${params}`;
}

function AppSidebar({ view, vaultQuery, selectedId, rootLabel, runtimeLabel }: { view: DashboardProps["view"]; vaultQuery: string | null; selectedId: string; rootLabel: string; runtimeLabel: string }) {
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
      <SidebarFooter className="app-sidebar-footer"><Badge variant="outline">Sepolia test network</Badge><span>{runtimeLabel}</span><small>Wallet authority and runtime connectivity are separate.</small></SidebarFooter>
    </ShadcnSidebar>
  );
}

function Topbar({ view, source, wallet, vaultQuery, selectedId }: { view: DashboardProps["view"]; source: DataSource; wallet: InjectedWalletState; vaultQuery: string | null; selectedId: string }) {
  return (
    <header className="app-topbar">
      <div className="app-topbar-title"><SidebarTrigger aria-label="Toggle navigation" /><span>{views.find((item) => item.id === view)?.title}</span><Badge variant="outline">Test USDC · Sepolia</Badge><Badge variant="outline">{source === "preview" ? "Preview workspace" : source === "direct-rpc" ? "Direct RPC view" : "Local diagnostic"}</Badge></div>
      <div className="app-topbar-actions"><Link className="app-manage-link app-topbar-guide" href={routeHref("/", vaultQuery)} onClick={() => { try { window.localStorage.removeItem("act.onboarding.dismissed"); } catch { /* storage unavailable */ } window.dispatchEvent(new Event(ONBOARDING_OPEN_EVENT)); }}>How it works</Link><Link className="app-manage-link" href={routeHref("/setup", vaultQuery, selectedId)}>Wallet actions</Link><WalletControl wallet={wallet} /></div>
    </header>
  );
}

function PreviewNotice({ data, deployment }: { data: DashboardData; deployment: PublicDeployment }) {
  if (data.source !== "preview") return null;
  return (
    <div className="preview-notice" role="note">
      <span className="notice-symbol"><CircleDashed size={16} aria-hidden="true" /></span>
      <p><strong>Preview workspace.</strong> Balances, ENS labels, policies, LP positions and activity below are illustrative sample records. {deployment.contractsConfigured ? "Preview records cannot be used for wallet actions; use Open vault below to load live Sepolia state." : "The USDC controller deployment is still pending."}</p>
      <Link href="/setup?preview=1">Why preview data? <ArrowRight size={13} aria-hidden="true" /></Link>
    </div>
  );
}

function RootAccessBar({ vault, path, walletAddress }: { vault: string | null; path: string; walletAddress: string | null }) {
  const router = useRouter();
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { roots: discovered } = useDiscoveredRoots();

  const walletLower = walletAddress?.toLowerCase() ?? null;
  const vaultLower = vault?.toLowerCase() ?? null;
  const chips = discovered
    .map((root) => {
      const owned = Boolean(walletLower && root.owner && root.owner.toLowerCase() === walletLower);
      const leaf = root.ensName ? root.ensName.split(".")[0] : "";
      return {
        id: root.id,
        vault: root.vault,
        owned,
        active: Boolean(vaultLower && root.vault && root.vault.toLowerCase() === vaultLower),
        // Read the label straight from ENS/chain rather than a hardcoded list.
        label: leaf || `Root ${root.id}`,
        sub: owned ? "Your vault" : root.revoked ? "Revoked" : `${root.nodeCount} vault${root.nodeCount === 1 ? "" : "s"}`,
      };
    })
    .sort((left, right) => (left.owned === right.owned ? Number(BigInt(left.id) - BigInt(right.id)) : left.owned ? -1 : 1))
    .slice(0, 8);
  const hasOwned = chips.some((chip) => chip.owned);

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
      <input id="vault-reference" name="lookup" type="text" maxLength={253} placeholder="ENS name or vault contract address" aria-label="ENS name or vault contract address" autoComplete="off" required disabled={loading} />
      <button className="button button-secondary button-small" type="submit" disabled={loading}>{loading ? "Looking up…" : "Open vault"}</button>
      {lookupError && <span role="alert" className="vault-lookup-error">{lookupError}</span>}
    </form>
    {chips.length > 0 && (
      <div className="root-quick-start">
        <span className="root-quick-label">{hasOwned ? "Your roots" : "Roots on-chain"}</span>
        <div className="demo-root-chips" role="group" aria-label="Roots on Sepolia">
          {chips.map((chip) => (
            <a
              key={chip.id}
              className={`demo-root-chip${chip.active ? " demo-root-chip-active" : ""}${chip.owned ? " demo-root-chip-owned" : ""}`}
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
    {vault && <a className="root-preview-link" href={`${path}?preview=1`}>Preview sample</a>}
  </div>;
}

function LiveReadNotice({
  rootId,
  vaultQuery,
  data,
  loading,
  error,
  onRetry,
}: {
  rootId: string | null;
  vaultQuery: string;
  data: DashboardData;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const isStale = data.source === "direct-rpc" && error !== null;
  const missingVault = error?.includes("No vault in this Sepolia deployment matches that name or address") ?? false;
  return (
    <div className={`live-read-notice${error ? " live-read-notice-error" : loading ? " live-read-notice-loading" : ""}`} role={error ? "alert" : "status"} aria-live={error ? "assertive" : "polite"}>
      <span className="live-read-icon">{error ? <AlertCircle size={16} aria-hidden="true" /> : <CircleDashed size={16} aria-hidden="true" />}</span>
      <p>
        <strong>{error ? missingVault ? "Vault was not found." : "Sepolia read unavailable." : loading ? rootId ? "Reading live vault." : "Resolving vault." : "Live vault."}</strong>{" "}
        {error
          ? `${error} ${missingVault ? "Check the ENS name or contract address and try again." : "The live Sepolia state could not be loaded."} ${isStale ? "The last live snapshot remains visible, but wallet actions are locked until it refreshes." : "The sample records below are only a preview."}`
          : loading
            ? isStale
              ? "Refreshing balances, current EAC permissions, and LP state. The last snapshot remains visible and wallet actions are locked."
              : rootId
                ? "Loading balances, current EAC permissions, and LP state from the server-side Sepolia RPC."
                : `Resolving ${vaultQuery} and loading live Sepolia vault state.`
            : `Current state was read from Sepolia${data.snapshot ? ` at block ${data.snapshot.blockNumber}` : ""}. Activity history is fetched from MultiBaas separately.`}
      </p>
      <button className="button button-secondary button-small" type="button" disabled={loading} onClick={onRetry}>{loading ? "Refreshing…" : "Refresh"}</button>
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
  labelHint,
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
  labelHint?: GlossaryTerm;
}) {
  return (
    <article className={`metric-card${accent ? " metric-card-accent" : ""}`}>
      <div className="metric-card-top"><span className="metric-card-label">{label}{labelHint && <InfoHint term={labelHint} />}</span><span className="metric-icon">{icon}</span></div>
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
        label="Linked agent runtimes"
        value={String(data.nodes.filter((node) => node.runtime === "connected").length).padStart(2, "0")}
        unit=" connected"
        detail="A live mandate does not mean a bot is running"
        icon={<Zap size={17} aria-hidden="true" />}
        source={data.source}
        labelHint="runtime"
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
          <span role="columnheader">Asset</span><span role="columnheader">Held now <InfoHint term="held" /></span><span role="columnheader">Available <InfoHint term="free" /></span><span role="columnheader">Sent to children <InfoHint term="allocated" /></span>
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
        <div><strong>Allowed right now <InfoHint term="authorizedCapabilities" /></strong><small>Live on-chain EAC roles — can be narrower than the policy</small></div>
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
          <div className="panel-overline">CAPITAL & POLICY LOG <PreviewFlag source={activitySource} compact /></div>
          <h2 id="activity-title">Recent activity</h2>
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

function Footer({ source, walletConnected, vaultQuery }: { source: DataSource; walletConnected: boolean; vaultQuery: string | null }) {
  return (
    <footer className="dashboard-footer">
      <span><span className="footer-indicator" /> CONTROL PANEL · {source === "preview" ? "READ-ONLY PREVIEW" : source === "direct-rpc" ? "DIRECT RPC VIEW" : "LOCAL DIAGNOSTICS"}</span>
      <span>{walletConnected ? "Owner authority remains with your connected wallet" : "Connect your wallet to review owner controls"}</span>
      <Link href={routeHref("/setup", vaultQuery)}>Integration status <ArrowUpRight size={12} aria-hidden="true" /></Link>
    </footer>
  );
}

export function Dashboard({ data: initialData, deployment, vaultQuery, nodeQuery, actionQuery, view, onboarding = false, tour = false, step = 1 }: DashboardProps) {
  const router = useRouter();
  const vaultKey = vaultQuery?.toLowerCase() ?? null;
  const [selectedId, setSelectedId] = useState(nodeQuery ?? initialData.rootId);
  const [detailOpen, setDetailOpen] = useState(false);
  const [walletActionMode, setWalletActionMode] = useState<WalletActionMode>(actionQuery ?? null);
  const [liveSnapshot, setLiveSnapshot] = useState<{ vaultKey: string; rootId: string; nodeId: string; data: DashboardData } | null>(null);
  const [readState, setReadState] = useState<{ vaultKey: string | null; rootId: string | null; status: "idle" | "loading" | "ready" | "error"; error: string | null }>({ vaultKey: null, rootId: null, status: "idle", error: null });
  const [activityState, setActivityState] = useState<{ rootId: string | null; feed: ActivityFeedResult | null; loading: boolean; loadingMore: boolean; loadMoreError: string | null }>({ rootId: null, feed: null, loading: false, loadingMore: false, loadMoreError: null });
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
      }, 10_000);
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

  const path = view === "overview" ? "/" : `/${view}`;
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
              <p>Connect a Sepolia wallet to create a vault. Get Test USDC from Circle’s faucet; DEMO-USD is a valueless quote token.</p>
              <a className="button button-secondary button-small" href="https://faucet.circle.com/" target="_blank" rel="noreferrer">Get Test USDC <ArrowUpRight size={13} aria-hidden="true" /></a>
            </CardContent>
          </Card>
          <RootAccessBar vault={null} path="/setup" walletAddress={wallet.address} />
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
    <TooltipProvider delay={150}>
    <SidebarProvider>
      <AppSidebar view={view} vaultQuery={vaultQuery} selectedId={selectedNode.id} rootLabel={rootNode?.label ?? "Treasury"} runtimeLabel={runtimeLabel} />
      <SidebarInset className="main-shell">
        <Topbar view={view} source={data.source} wallet={wallet} vaultQuery={vaultQuery} selectedId={selectedNode.id} />
        <div className="dashboard-content">
          <GuidedTour active={tour} step={step} />
          <PreviewNotice data={data} deployment={deployment} />
          <RootAccessBar vault={vaultQuery} path={path} walletAddress={wallet.address} />
          {vaultQuery && <LiveReadNotice rootId={currentSnapshot?.rootId ?? null} vaultQuery={vaultQuery} data={data} loading={currentReadState.status === "loading"} error={liveError} onRetry={() => setTreeRetry((value) => value + 1)} />}
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
          {view === "overview" && <>
            <div className="page-heading"><span className="page-kicker">Delegated capital · Sepolia</span><h1>Each AI agent gets its own wallet — and strict limits.</h1><p>See what each vault holds, which mandates are active, and where owner control stands.</p></div>
            {!tour && <OnboardingHero />}
            <SummaryMetrics data={data} />
            <div className="overview-lower">
              <Card><CardHeader><CardTitle>Agent tree</CardTitle><CardDescription>Capital moves through bounded vaults, one delegation at a time.</CardDescription></CardHeader><CardContent><div className="overview-node-list">{mobileTreeOrder(data.nodes).slice(0, 5).map((node) => <div key={node.id}><span className="overview-node-indent" style={{ width: node.depth * 20 }} aria-hidden="true" /><GitBranch size={17} aria-hidden="true" /><strong>{node.label}</strong><Badge variant="outline">{node.source === "preview" ? "Example " : ""}{vaultStateLabels[node.state]}</Badge></div>)}</div><Button render={<Link href={routeHref("/tree", vaultQuery, selectedNode.id)} />} variant="outline">Explore agent tree <ArrowRight data-icon="inline-end" /></Button></CardContent></Card>
              <Card><CardHeader><CardTitle>Owner control</CardTitle><CardDescription>Owner recovery is separate from ENS agent roles.</CardDescription></CardHeader><CardContent><p>{data.rootOwner ? `Recorded owner ${shortAddress(data.rootOwner)}` : "Connect a wallet and open a vault to review its recorded owner."}</p><p>Recovery may require a separate LP close, then one or more explicit transactions.</p><Button render={<Link href={routeHref("/setup", vaultQuery, selectedNode.id)} />} variant="outline">Review setup & control <ArrowRight data-icon="inline-end" /></Button></CardContent></Card>
            </div>
          </>}
          {view === "tree" && <>
            <div className="page-heading"><span className="page-kicker">Authority & allocation</span><h1>Agent tree</h1><p>Select a vault to inspect current funds, EAC permissions, and the inherited limits that narrow its mandate.</p></div>
            <CapitalTree data={data} selectedId={selectedNode.id} onSelect={(id) => { setSelectedId(id); setDetailOpen(true); }} canSpawnVault={canSpawnVault} onRequestSpawn={() => requestAction("spawn-child")} />
            <Sheet open={detailOpen} onOpenChange={(open) => { setDetailOpen(open); if (!open) requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`${window.matchMedia("(max-width: 720px)").matches ? ".tree-canvas-mobile" : ".tree-canvas-desktop"} .tree-node[data-node-id="${CSS.escape(selectedNode.id)}"]`)?.focus()); }}><SheetContent className="node-detail-sheet"><SheetHeader><SheetTitle>{selectedNode.ensName}</SheetTitle><SheetDescription>Current vault funds, authority, and limits. {sourceLabel(selectedNode.source)}.</SheetDescription></SheetHeader><div className="node-detail-scroll"><MandatePanel data={data} node={selectedNode} canTighten={canTighten} canRevoke={canRevoke} canRecover={canRecover} onRequestAction={requestAction} /></div></SheetContent></Sheet>
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
          {view === "applications" && <>
            <div className="page-heading"><span className="page-kicker">Bounded applications</span><h1>Applications</h1><p>Agents can only act inside their mandate. Built-in actions today are bounded Uniswap v4 activity and x402 service payments settled in USDC.</p></div>
            <PositionsPanel data={data} actions={actions} walletOnSepolia={walletOnSepolia} />
            <X402Panel node={selectedNode} actions={actions} walletOnSepolia={walletOnSepolia} canPay={selectedAgentConnected} />
            <Card className="future-applications"><CardHeader><CardTitle>Future modules</CardTitle><CardDescription>Planned capabilities. Expand an item to see its scope; these modules cannot execute actions.</CardDescription></CardHeader><CardContent>
              <details className="future-module"><summary><span>Contract transactions</span><Badge variant="outline" className="future-module-badge">Future work</Badge></summary><p>Not implemented. Execute approved contract functions with recipient, token, and spending checks. A balance-delta check alone cannot prevent unsafe approvals or future liabilities.</p></details>
              <details className="future-module"><summary><span>Currency conversion & valuation</span><Badge variant="outline" className="future-module-badge">Future work</Badge></summary><p>Not implemented. Display supported assets in a chosen currency using verified price sources. Test USDC is Sepolia faucet funding; DEMO-USD is a valueless quote token. Neither provides a dollar valuation.</p></details>
            </CardContent></Card>
          </>}
          {view === "mcp" && <McpPanel deployment={deployment} selectedNode={selectedNode} runtimeLabel={runtimeLabel} />}
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
          <details className="setup-disclosure">
            <summary>Deployment &amp; integration status</summary>
            <ContractSetupPanel data={dashboardData} deployment={deployment} actions={actions} wallet={wallet} liveStateReady={liveStateReady} historyError={activeActivityState.loadMoreError} />
          </details>
          </>}
          <Footer source={data.source} walletConnected={walletOnSepolia} vaultQuery={vaultQuery} />
        </div>
      </SidebarInset>
    </SidebarProvider>
    </TooltipProvider>
  );
}
