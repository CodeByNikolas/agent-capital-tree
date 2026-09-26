import "server-only";
import { capitalClient, financeRoles, type CapitalTree, type Policy as SdkPolicy } from "@agent-capital-tree/sdk";
import { erc20Abi, type Address } from "viem";
import type {
  DashboardData,
  Permission,
  Policy as DashboardPolicy,
  TokenAmount,
  VaultNode,
} from "@/lib/dashboard-types";
import { getPublicDeployment } from "@/lib/deployment";

const permissionBits: readonly [Permission, bigint][] = [
  ["delegate", financeRoles.delegate],
  ["swap", financeRoles.swap],
  ["manage-liquidity", financeRoles.lpManage],
  ["collect-fees", financeRoles.collectFees],
  ["exit-liquidity", financeRoles.exit],
  ["pay", financeRoles.pay],
  ["restrict", financeRoles.restrict],
  ["reclaim", financeRoles.reclaim],
];

interface TokenMetadata {
  address: Address;
  decimals: number;
  symbol: string;
}

function amount(rawAmount: bigint, token: TokenMetadata): TokenAmount {
  return {
    rawAmount: rawAmount.toString(),
    decimals: token.decimals,
    symbol: token.symbol,
    tokenAddress: token.address,
  };
}

function toDashboardPolicy(policy: SdkPolicy, tokens: readonly [TokenMetadata, TokenMetadata]): DashboardPolicy {
  const allowedTokens = tokens
    .filter((_, index) => (policy.tokenMask & (1 << index)) !== 0)
    .map((token) => token.symbol);

  return {
    permissions: permissionBits
      .filter(([, bit]) => (policy.capabilities & bit) !== 0n)
      .map(([permission]) => permission),
    allowedTokens,
    maxActionAmounts: [amount(policy.maxAmounts[0], tokens[0]), amount(policy.maxAmounts[1], tokens[1])],
    expiresAt: new Date(Number(policy.expiry) * 1000).toISOString(),
    poolId: policy.poolId,
  };
}

function toTokenMetadata(address: Address, symbol: string, decimals: number): TokenMetadata {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error("Token returned invalid decimals");
  }
  return { address, symbol, decimals };
}

export async function readLiveDashboard(rootId: bigint): Promise<DashboardData> {
  const deployment = getPublicDeployment();
  if (!deployment.contractsConfigured || !deployment.controllerAddress || !deployment.tokenAddresses) {
    throw new Error("deployment_pending");
  }
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!rpcUrl) throw new Error("rpc_unconfigured");

  const client = capitalClient(rpcUrl, deployment.controllerAddress);
  const tree = await client.getTree(rootId);
  if (
    !deployment.tokenAddresses ||
    tree.tokens[0].toLowerCase() !== deployment.tokenAddresses[0].toLowerCase() ||
    tree.tokens[1].toLowerCase() !== deployment.tokenAddresses[1].toLowerCase()
  ) {
    throw new Error("deployment_token_mismatch");
  }
  const metadataValues = await Promise.all(deployment.tokenAddresses.map(async (address) => {
    const [symbol, decimals] = await Promise.all([
      client.rpc.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
      client.rpc.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
    ]);
    return toTokenMetadata(address, symbol, decimals);
  }));
  const tokens = metadataValues as unknown as readonly [TokenMetadata, TokenMetadata];
  return mapCapitalTree(tree, tokens, deployment.controllerAddress);
}

function mapCapitalTree(
  tree: CapitalTree,
  tokens: readonly [TokenMetadata, TokenMetadata],
  controllerAddress: Address,
): DashboardData {
  const byId = new Map(tree.nodes.map((node) => [node.id, node]));
  const mappedNodes: VaultNode[] = tree.nodes.map((node) => {
    const extendedNode = node as typeof node & {
      authorizedCapabilities?: bigint;
      position?: { tokenId: bigint; liquidity: bigint };
    };
    if (extendedNode.authorizedCapabilities === undefined || !extendedNode.position) {
      throw new Error("live_snapshot_fields_unavailable");
    }
    const localPolicy = toDashboardPolicy(node.policy, tokens);
    const effectivePolicy = toDashboardPolicy(node.effectivePolicy, tokens);
    const ancestorNodes: typeof tree.nodes = [];
    let parentId = node.parentId;
    const visited = new Set<bigint>([node.id]);
    while (parentId !== 0n) {
      const parent = byId.get(parentId);
      if (!parent || visited.has(parent.id)) throw new Error("invalid_tree_relationship");
      visited.add(parent.id);
      ancestorNodes.unshift(parent);
      parentId = parent.parentId;
    }

    const tokenHoldings = [amount(node.balances[0], tokens[0]), amount(node.balances[1], tokens[1])];
    const state = node.revoked
      ? "revoked"
      : node.effectivePolicy.expiry <= tree.source.timestamp
        ? "expired"
        : extendedNode.authorizedCapabilities === 0n
          ? "blocked"
        : "active";

    return {
      id: node.id.toString(),
      parentId: node.parentId === 0n ? null : node.parentId.toString(),
      rootId: node.rootId.toString(),
      ensName: node.ensName,
      label: node.label,
      agentAddress: node.agent,
      vaultAddress: node.vault,
      depth: node.depth - 1,
      state,
      runtime: "unknown",
      freeCapital: tokenHoldings,
      tokenHoldings,
      capitalReceivedFromParent: node.parentId === 0n ? [] : null,
      localPolicy,
      inheritedConstraints: ancestorNodes.map((ancestor) => ({
        ancestorId: ancestor.id.toString(),
        ancestorLabel: ancestor.label,
        policy: toDashboardPolicy(ancestor.policy, tokens),
      })),
      effectivePolicy,
      authorizedPermissions: permissionBits
        .filter(([, bit]) => (extendedNode.authorizedCapabilities! & bit) !== 0n)
        .map(([permission]) => permission),
      position: extendedNode.position.tokenId === 0n
        ? null
        : { tokenId: extendedNode.position.tokenId.toString(), liquidity: extendedNode.position.liquidity.toString() },
      source: "direct-rpc",
    };
  });

  const positions = mappedNodes.flatMap((node) => {
    if (!node.position) return [];
    return [{
      id: node.position.tokenId,
      nodeId: node.id,
      poolLabel: `Configured pool ${tokens[0].symbol} / ${tokens[1].symbol}`,
      state: BigInt(node.position.liquidity) > 0n ? "open" as const : "closed" as const,
      liquidity: node.position.liquidity,
      token0: null,
      token1: null,
      fees0: null,
      fees1: null,
      source: "direct-rpc" as const,
    }];
  });

  return {
    source: "direct-rpc",
    activitySource: "unavailable",
    chainId: tree.source.chainId,
    rootId: tree.rootId.toString(),
    rootOwner: tree.owner,
    rootOperator: tree.operator,
    snapshot: {
      blockNumber: tree.source.blockNumber.toString(),
      blockHash: tree.source.blockHash,
      observedAt: tree.source.observedAt,
    },
    contractsConfigured: deploymentReady(controllerAddress),
    nodes: mappedNodes,
    activity: [],
    positions,
  };
}

function deploymentReady(controllerAddress: Address): boolean {
  const deployment = getPublicDeployment();
  return deployment.contractsConfigured && deployment.controllerAddress === controllerAddress;
}
