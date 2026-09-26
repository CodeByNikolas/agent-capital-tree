import type { X402PurchaseResult } from "@/lib/x402";

export type DataSource = "preview" | "direct-rpc" | "local-diagnostic";
export type ActivitySource = "preview" | "multi-baas" | "local-diagnostic" | "unavailable";
export type ActivityRecordSource = Exclude<ActivitySource, "unavailable">;
export type ActivityFinality = "not_verified" | "pending" | "confirmed" | "finalized";

export interface IndexedActivityProvenance {
  chainId: number;
  transactionHash: `0x${string}`;
  logIndex: number;
  blockNumber: number;
  transactionIndex: number;
  blockHash: `0x${string}`;
  finality: ActivityFinality;
}

type IndexedActivityBase = {
  id: string;
  rootId: string;
  eventName: string;
  provenance: IndexedActivityProvenance;
};

export type IndexedCapitalActivity =
  | (IndexedActivityBase & { kind: "node_created"; nodeId: string; parentId: string; agent: string; vault: string })
  | (IndexedActivityBase & { kind: "root_funded"; token: string; amount: string })
  | (IndexedActivityBase & { kind: "capital_allocated" | "capital_reclaimed"; parentId: string; childId: string; token: string; amount: string })
  | (IndexedActivityBase & { kind: "emergency_recovered"; nodeId: string; token: string; amount: string; recipient: string })
  | (IndexedActivityBase & { kind: "policy_tightened"; nodeId: string })
  | (IndexedActivityBase & { kind: "operator_changed"; operator: string; generation: string })
  | (IndexedActivityBase & { kind: "node_revoked"; nodeId: string })
  | (IndexedActivityBase & { kind: "swap_executed"; nodeId: string; inputToken: string; outputToken: string; amountIn: string; amountOut: string })
  | (IndexedActivityBase & { kind: "position_opened" | "position_increased" | "position_closed"; nodeId: string; tokenId: string; liquidity: string; amount0: string; amount1: string })
  | (IndexedActivityBase & { kind: "fees_collected"; nodeId: string; tokenId: string; amount0: string; amount1: string });

export interface ActivityFeedPage {
  rootId: string;
  items: readonly IndexedCapitalActivity[];
  nextCursor: string | null;
  hasMore: boolean;
  indexing: {
    state: "historical_indexing" | "lagging" | "caught_up" | "indexer_ahead";
    latestIndexedBlock: number;
    indexingStartBlock: number;
    chainHeadBlock: number;
    indexGapBlocks: number;
    updatedAt: string;
  };
  verification?: {
    source: "rpc";
    checkedAtBlock: string;
    finalizedBlock: string;
    orphanedItems: number;
  };
}

export type ActivityFeedResult =
  | { source: "multi-baas"; page: ActivityFeedPage }
  | { source: "unavailable"; reason: "not_configured" | "deployment_pending" | "rpc_unconfigured" | "upstream_error"; message: string };

export type VaultState = "active" | "blocked" | "revoked" | "expired" | "setup-pending";

export type Permission =
  | "delegate"
  | "swap"
  | "manage-liquidity"
  | "collect-fees"
  | "exit-liquidity"
  | "pay"
  | "restrict"
  | "reclaim";

export interface TokenAmount {
  /** Raw integer units; SDK adapters must not convert money to floating point. */
  rawAmount: string;
  decimals: number;
  symbol: string;
  tokenAddress?: `0x${string}`;
}

export interface Policy {
  permissions: readonly Permission[];
  allowedTokens: readonly string[];
  maxActionAmounts: readonly TokenAmount[];
  expiresAt: string;
  poolId: `0x${string}`;
}

export interface PolicyDraft {
  permissions: readonly Permission[];
  allowedTokens: readonly [boolean, boolean];
  maxAmounts: readonly [string, string];
  /** Date field value in YYYY-MM-DD format. */
  expiresAt: string;
  poolId: `0x${string}`;
}

export interface PolicyConstraint {
  ancestorId: string;
  ancestorLabel: string;
  policy: Policy;
}

export interface VaultNode {
  mandateStartsAt?: string;
  id: string;
  parentId: string | null;
  rootId: string;
  ensName: string;
  label: string;
  agentAddress: string;
  vaultAddress: string;
  depth: number;
  state: VaultState;
  runtime: "unknown" | "connected" | "not-connected";
  /** Spendable token balance, distinct from allocated capital and LP exposure. */
  freeCapital: readonly TokenAmount[];
  /** Current token balances held by this vault. */
  tokenHoldings: readonly TokenAmount[];
  /** Gross capital assigned directly by the parent; empty for the owner root. */
  /** Null means internal allocation totals have not been indexed. */
  capitalReceivedFromParent: readonly TokenAmount[] | null;
  localPolicy: Policy;
  inheritedConstraints: readonly PolicyConstraint[];
  effectivePolicy: Policy;
  authorizedPermissions: readonly Permission[];
  position: { tokenId: string; liquidity: string } | null;
  source: DataSource;
}

export type ActivityKind =
  | "capital-assigned"
  | "capital-funded"
  | "capital-reclaimed"
  | "swap"
  | "node-created"
  | "operator-changed"
  | "position-opened"
  | "position-increased"
  | "position-closed"
  | "fees-collected"
  | "policy-tightened"
  | "subtree-revoked"
  | "owner-recovered"
  | "assets-reclaimed";

export interface CapitalActivity {
  id: string;
  kind: ActivityKind;
  nodeId: string;
  nodeLabel: string;
  description: string;
  amount?: TokenAmount;
  timestamp?: string;
  source: ActivityRecordSource;
  transactionHash?: `0x${string}`;
  blockNumber?: number;
  transactionIndex?: number;
  logIndex?: number;
  finality?: ActivityFinality;
}

export interface LiquidityPosition {
  id: string;
  nodeId: string;
  poolLabel: string;
  state: "open" | "closed" | "unknown";
  liquidity: string;
  token0: TokenAmount | null;
  token1: TokenAmount | null;
  fees0: TokenAmount | null;
  fees1: TokenAmount | null;
  source: DataSource;
}

export interface DashboardData {
  source: DataSource;
  activitySource: ActivitySource;
  chainId: number;
  rootId: string;
  rootOwner: string | null;
  rootOperator: string | null;
  snapshot?: { blockNumber: string; blockHash: `0x${string}`; observedAt: string };
  contractsConfigured: boolean;
  nodes: readonly VaultNode[];
  activity: readonly CapitalActivity[];
  positions: readonly LiquidityPosition[];
}

/** Optional transaction adapters; absent handlers keep the matching control disabled. */
export interface DashboardActions {
  claimDemoQuote?: () => Promise<void>;
  createRoot?: (label: string, policy: PolicyDraft) => Promise<string>;
  fundRoot?: (rootId: string, amounts: readonly [string, string]) => Promise<void>;
  setRootOperator?: (rootId: string, operator: string, policy: PolicyDraft) => Promise<void>;
  spawnChild?: (parentId: string, label: string, agent: string, policy: PolicyDraft, amounts: readonly [string, string]) => Promise<string>;
  tightenPolicy?: (nodeId: string, policy: PolicyDraft) => Promise<void>;
  revokeSubtree?: (nodeId: string) => void | Promise<void>;
  collectFees?: (positionId: string) => void | Promise<void>;
  closePosition?: (positionId: string) => void | Promise<void>;
  ownerEmergencyRecover?: (nodeId: string) => void | Promise<void>;
  ownerEmergencyClosePosition?: (nodeId: string, minimumOutputs: readonly [string, string], deadline: string) => Promise<void>;
  /** Pay for an x402 service in USDC from the connected agent's wallet, bound to its ENS mandate. */
  payForService?: (nodeId: string, serviceId: string) => Promise<X402PurchaseResult>;
}
