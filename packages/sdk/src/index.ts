import { BaseError, ContractFunctionRevertedError, parseAbi, createPublicClient, erc20Abi, getContract, http, type Address, type PublicClient, type HttpTransport, type GetContractReturnType, type ContractFunctionReturnType, type Hex } from 'viem';
import { sepolia } from 'viem/chains';
import { capitalControllerAbi } from './abi.js';
import { financeRoles } from './policy.js';

export const capitalVaultReadAbi = parseAbi([
  'function positionTokenId() view returns (uint256)',
  'function positionLiquidity() view returns (uint128)',
]);
export { capitalControllerAbi } from './abi.js';
export * from './policy.js';

export const CHAIN_ID = sepolia.id;
type Rpc = PublicClient<HttpTransport, typeof sepolia>;
type Controller = GetContractReturnType<typeof capitalControllerAbi, Rpc>;
type Node = ContractFunctionReturnType<typeof capitalControllerAbi, 'view', 'getNode'>;
type EffectivePolicy = ContractFunctionReturnType<typeof capitalControllerAbi, 'view', 'getEffectivePolicy'>;
export type CapitalTree = {
  rootId: bigint; owner: Address; operator: Address; generation: bigint;
  tokens: readonly [Address, Address];
  nodes: Array<Node & { effectivePolicy: EffectivePolicy; balances: [bigint, bigint]; ensName: string; position: { tokenId: bigint; liquidity: bigint }; authorizedCapabilities: bigint }>;
  totalBalances: [bigint, bigint];
  source: { kind: 'rpc'; chainId: number; blockNumber: bigint; blockHash: Hex; timestamp: bigint; observedAt: string };
};
export type CapitalClient = {
  rpc: Rpc; controller: Controller; verifyDeployment(): Promise<void>; getTree(rootId: bigint): Promise<CapitalTree>;
};

/** A chain-pinned read client. Wallets/signers stay with the caller. */
export function capitalClient(rpcUrl: string, controllerAddress: Address): CapitalClient {
  const rpc: PublicClient<HttpTransport, typeof sepolia> = createPublicClient({ chain: sepolia, transport: http(rpcUrl, { timeout: 15000, batch: { batchSize: 50, wait: 10 } }) });
  const controller: GetContractReturnType<typeof capitalControllerAbi, typeof rpc> = getContract({ address: controllerAddress, abi: capitalControllerAbi, client: rpc });

  async function verifyDeployment() {
    if (await rpc.getChainId() !== CHAIN_ID) throw new Error('Expected Ethereum Sepolia');
    const code = await rpc.getCode({ address: controllerAddress });
    if (!code || code === '0x') throw new Error('Controller has not been deployed');
  }

  async function getTree(rootId: bigint) {
    await verifyDeployment();
    const block = await rpc.getBlock();
    const at = { blockNumber: block.number };
    const [ids, owner, operator, generation, token0, token1, namespace] = await Promise.all([
      controller.read.getRootNodeIds([rootId], at), controller.read.rootOwner([rootId], at),
      controller.read.rootOperator([rootId], at), controller.read.rootGeneration([rootId], at),
      controller.read.TOKEN0(at), controller.read.TOKEN1(at), controller.read.namespaceLabel(at),
    ]);
    if (!ids.length || ids.length > 32) throw new Error('Invalid root tree');
    const tokens = [token0, token1] as const;
    const nodes = await Promise.all(ids.map(async id => {
      const node = await controller.read.getNode([id], at);
      const [effectivePolicy, ...balances] = await Promise.all([
        controller.read.getEffectivePolicy([id], at),
        ...tokens.map(address => rpc.readContract({ address, abi: erc20Abi, functionName: 'balanceOf', args: [node.vault], ...at })),
      ]);
      const [tokenId, liquidity, permissions] = await Promise.all([
        rpc.readContract({ address: node.vault, abi: capitalVaultReadAbi, functionName: 'positionTokenId', ...at }),
        rpc.readContract({ address: node.vault, abi: capitalVaultReadAbi, functionName: 'positionLiquidity', ...at }),
        Promise.all(Object.values(financeRoles).map(async role => {
          if (!(effectivePolicy.capabilities & role)) return 0n;
          try {
            await controller.read.checkAction([id, role, node.agent, 2, 0n], at);
            return role;
          } catch (error) {
            if (error instanceof BaseError && error.walk(cause => cause instanceof ContractFunctionRevertedError) instanceof ContractFunctionRevertedError) return 0n;
            throw error; // An unavailable RPC is not evidence that authority was revoked.
          }
        })),
      ]);
      return { ...node, effectivePolicy, balances: balances as [bigint, bigint], position: { tokenId, liquidity },
        authorizedCapabilities: permissions.reduce((mask, role) => mask | role, 0n) };
    }));
    const byId = new Map(nodes.map(node => [node.id, node]));
    const named = nodes.map(node => {
      const labels: string[] = [];
      let current: typeof node | undefined = node;
      for (let depth = 0; current && depth < 3; depth++) {
        labels.push(current.label);
        current = byId.get(current.parentId);
      }
      if (current) throw new Error('Invalid tree depth');
      return { ...node, ensName: [...labels, namespace, 'eth'].join('.') };
    });
    // Actual balances only. Delegations are transfers between these vaults, not added capital.
    const totalBalances = nodes.reduce<[bigint, bigint]>((totals, node) => [
      totals[0] + node.balances[0], totals[1] + node.balances[1],
    ], [0n, 0n]);
    return { rootId, owner, operator, generation, tokens, nodes: named, totalBalances,
      source: { kind: 'rpc' as const, chainId: CHAIN_ID, blockNumber: block.number,
        blockHash: block.hash, timestamp: block.timestamp, observedAt: new Date().toISOString() } };
  }

  return { rpc, controller, verifyDeployment, getTree };
}



/** Decimal strings preserve integer precision across JSON/MCP boundaries. */
export function jsonSafe(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item));
}
