import type { ReactNode } from "react";
import type { ActivityFeedResult, DashboardData, VaultNode } from "@/lib/dashboard-types";
import { flowLabels, summarizeAgentEvents } from "@/lib/agent-activity";
import { formatAmount } from "@/lib/format-display-amount";
import { Skeleton } from "@/components/ui/skeleton";

export function AgentActivity({ data, node, feed, loading, error, onSelect, onRetry, children }: {
  data: DashboardData; node: VaultNode; feed: ActivityFeedResult | null; loading: boolean;
  error: string | null; onSelect: (id: string) => void; onRetry: () => void; children: ReactNode;
}) {
  const page = feed?.source === "multi-baas" ? feed.page : null;
  const failure = error ?? (feed?.source === "unavailable" ? feed.message : null);
  const totals = page ? summarizeAgentEvents(page.items, node.id, data.rootId) : [];
  return <>
    <div className="page-heading"><h1>Agent activity</h1><p>Allocations, delegation and swaps for one vault.</p></div>
    <section className="agent-report" aria-label="Agent activity report">
      <label className="agent-report-picker">Agent vault<select value={node.id} onChange={event => onSelect(event.target.value)}>{data.nodes.map(agent => <option key={agent.id} value={agent.id}>{agent.ensName}</option>)}</select></label>
      <p className="agent-report-note">This vault’s direct activity only. x402 settlements are shown separately on x402 Pay. Swap input is trading volume, not a loss. LP and policy events appear in the event log below.</p>
      {loading ? <div role="status" aria-label="Loading agent activity"><Skeleton className="h-24 w-full" /><span>Loading MultiBaas events…</span></div>
        : failure || !page ? <div role="status"><p>{failure ?? "Open a live vault to query MultiBaas history. No sample totals are shown."}</p><button type="button" className="button button-secondary button-small" onClick={onRetry}>Retry history</button></div>
        : <>
          <div className="agent-report-coverage"><strong>Totals from loaded events only</strong><p>Indexing starts at block {page.indexing.indexingStartBlock.toLocaleString()}. Reported checkpoint: {page.indexing.latestIndexedBlock.toLocaleString()} · {page.indexing.state.replaceAll("_", " ")} · {page.indexing.indexGapBlocks > 0 ? `${page.indexing.indexGapBlocks.toLocaleString()} blocks behind` : "See index status below"}.</p><p>{page.hasMore ? "More root history is available. Load more below to extend these totals." : "All currently returned root pages are loaded; earlier or unindexed activity is not included."} These totals are not current balances or lifetime spending.</p><p>{page.items.length > 0 ? `Loaded event blocks: ${Math.min(...page.items.map(item => item.provenance.blockNumber)).toLocaleString()}–${Math.max(...page.items.map(item => item.provenance.blockNumber)).toLocaleString()}.` : "No event blocks returned."} The reported checkpoint may lag returned events; receipt verification is shown below.</p></div>
          <dl className="agent-report-totals">{totals.map(total => {
            const token = node.tokenHoldings.find(holding => holding.tokenAddress?.toLowerCase() === total.token);
            return <div key={`${total.kind}:${total.token}`}><dt>{flowLabels[total.kind]}</dt><dd className={token?.symbol === "USDC" ? "usdc-amount" : "test-amount"}>{token ? `${formatAmount({ ...token, rawAmount: total.rawAmount.toString() })} ${token.symbol}` : `${total.rawAmount} raw units (${total.token})`}</dd></div>;
          })}</dl>
          {totals.length === 0 && <p>No allocation, recovery or swap amounts for this agent in the loaded events.</p>}
          {children}
        </>}
    </section>
  </>;
}
