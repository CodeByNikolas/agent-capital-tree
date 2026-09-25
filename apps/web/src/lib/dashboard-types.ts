export type DataSource = "preview" | "onchain-indexer" | "local-diagnostic";

export type VaultState = "active" | "revoked" | "expired" | "setup-pending";

export type Permission =
  | "delegate"
  | "swap"
  | "manage-liquidity"
  | "collect-fees"
  | "exit-liquidity"
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
  maxActionAmount: TokenAmount;
  expiresAt: string;
}

export interface PolicyConstraint {
  ancestorId: string;
  ancestorLabel: string;
  policy: Policy;
}

export interface VaultNode {
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
  capitalReceivedFromParent: readonly TokenAmount[];
  localPolicy: Policy;
  inheritedConstraints: readonly PolicyConstraint[];
  effectivePolicy: Policy;
  source: DataSource;
}

export type ActivityKind =
  | "capital-assigned"
  | "swap"
  | "position-opened"
  | "fees-collected"
  | "policy-tightened"
  | "subtree-revoked"
  | "assets-reclaimed";

export interface CapitalActivity {
  id: string;
  kind: ActivityKind;
  nodeId: string;
  nodeLabel: string;
  description: string;
  amount?: TokenAmount;
  timestamp: string;
  source: DataSource;
  transactionHash?: `0x${string}`;
}

export interface LiquidityPosition {
  id: string;
  poolLabel: string;
  state: "open" | "closed" | "unknown";
  liquidity: string;
  token0: TokenAmount;
  token1: TokenAmount;
  fees0: TokenAmount;
  fees1: TokenAmount;
  source: DataSource;
}

export interface DashboardData {
  source: DataSource;
  chainId: number;
  rootId: string;
  contractsConfigured: boolean;
  nodes: readonly VaultNode[];
  activity: readonly CapitalActivity[];
  positions: readonly LiquidityPosition[];
}

/** Optional transaction adapters; absent handlers keep the matching control disabled. */
export interface DashboardActions {
  spawnChild?: (parentId: string) => void | Promise<void>;
  tightenPolicy?: (nodeId: string) => void | Promise<void>;
  revokeSubtree?: (nodeId: string) => void | Promise<void>;
  collectFees?: (positionId: string) => void | Promise<void>;
  closePosition?: (positionId: string) => void | Promise<void>;
  ownerEmergencyRecover?: (nodeId: string) => void | Promise<void>;
}
