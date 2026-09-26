import { BaseError, ContractFunctionRevertedError, parseAbi, createPublicClient, erc20Abi, getContract, http, isAddress, type Address, type PublicClient, type HttpTransport, type GetContractReturnType, type ContractFunctionReturnType, type Hex } from 'viem';
import { sepolia } from 'viem/chains';
import { capitalControllerAbi } from './abi.js';
import { financeRoles, type Capability } from './policy.js';

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
  nodes: Array<Node & { effectivePolicy: EffectivePolicy; balances: [bigint, bigint]; ensName: string; position: { tokenId: bigint; liquidity: bigint }; authorizedCapabilities: bigint; authorizedActions: Capability[] }>;
  totalBalances: [bigint, bigint];
  source: { kind: 'rpc'; chainId: number; blockNumber: bigint; blockHash: Hex; timestamp: bigint; observedAt: string };
};
export type CapitalClient = {
  rpc: Rpc; controller: Controller; verifyDeployment(): Promise<void>; getTree(rootId: bigint, blockNumber?: bigint): Promise<CapitalTree>;
  resolveTree(query: string): Promise<{ tree: CapitalTree; selectedNodeId: bigint }>;
};

/** A chain-pinned read client. Wallets/signers stay with the caller. */
export function capitalClient(rpcUrl: string, controllerAddress: Address): CapitalClient {
  const rpc: PublicClient<HttpTransport, typeof sepolia> = createPublicClient({ chain: sepolia, transport: http(rpcUrl, { timeout: 15000, batch: { batchSize: 8, wait: 20 } }) });
  const controller: GetContractReturnType<typeof capitalControllerAbi, typeof rpc> = getContract({ address: controllerAddress, abi: capitalControllerAbi, client: rpc });
  let active = 0;
  const waiting: Array<() => void> = [];
  async function read<T>(action: () => Promise<T>): Promise<T> {
    if (active >= 3) await new Promise<void>(resolve => waiting.push(resolve));
    active++;
    try {
      for (let attempt = 0; ; attempt++) {
        try { return await action(); }
        catch (error) {
          if (attempt >= 3 || !/\b429\b|Too Many Requests|rate limit/i.test(String(error))) throw error;
          await new Promise(resolve => setTimeout(resolve, 450 * 2 ** attempt));
        }
      }
    } finally {
      active--;
      waiting.shift()?.();
    }
  }

  async function verifyDeployment() {
    if (await read(() => rpc.getChainId()) !== CHAIN_ID) throw new Error('Expected Ethereum Sepolia');
    const code = await read(() => rpc.getCode({ address: controllerAddress }));
    if (!code || code === '0x') throw new Error('Controller has not been deployed');
  }

  async function getTree(rootId: bigint, blockNumber?: bigint) {
    await verifyDeployment();
    const block = await read(() => rpc.getBlock(blockNumber === undefined ? {} : { blockNumber }));
    const at = { blockNumber: block.number };
    // A confirmed InvalidNode revert is distinguishable from a transport outage.
    const rootIds = async () => {
      try { return await read(() => controller.read.getRootNodeIds([rootId], at)); }
      catch (error) {
        const cause = error instanceof BaseError ? error.walk(item => item instanceof ContractFunctionRevertedError) : undefined;
        if (cause instanceof ContractFunctionRevertedError && cause.data?.errorName === 'InvalidNode') throw new Error('Root not found in this Sepolia deployment');
        throw error;
      }
    };
    const [ids, owner, operator, generation, token0, token1, namespace] = await Promise.all([
      rootIds(), read(() => controller.read.rootOwner([rootId], at)),
      read(() => controller.read.rootOperator([rootId], at)), read(() => controller.read.rootGeneration([rootId], at)),
      read(() => controller.read.TOKEN0(at)), read(() => controller.read.TOKEN1(at)), read(() => controller.read.namespaceLabel(at)),
    ]);
    if (!ids.length) throw new Error('Root not found in this Sepolia deployment');
    if (ids.length > 32) throw new Error('Invalid root tree');
    const tokens = [token0, token1] as const;
    const nodes = await Promise.all(ids.map(async id => {
      const node = await read(() => controller.read.getNode([id], at));
      const [effectivePolicy, ...balances] = await Promise.all([
        read(() => controller.read.getEffectivePolicy([id], at)),
        ...tokens.map(address => read(() => rpc.readContract({ address, abi: erc20Abi, functionName: 'balanceOf', args: [node.vault], ...at }))),
      ]);
      const [tokenId, liquidity, permissions] = await Promise.all([
        read(() => rpc.readContract({ address: node.vault, abi: capitalVaultReadAbi, functionName: 'positionTokenId', ...at })),
        read(() => rpc.readContract({ address: node.vault, abi: capitalVaultReadAbi, functionName: 'positionLiquidity', ...at })),
        Promise.all(Object.values(financeRoles).map(async role => {
          if (!(effectivePolicy.capabilities & role)) return 0n;
          try {
            await read(() => controller.read.checkAction([id, role, node.agent, 2, 0n], at));
            return role;
          } catch (error) {
            if (error instanceof BaseError && error.walk(cause => cause instanceof ContractFunctionRevertedError) instanceof ContractFunctionRevertedError) return 0n;
            throw error; // An unavailable RPC is not evidence that authority was revoked.
          }
        })),
      ]);
      return { ...node, effectivePolicy, balances: balances as [bigint, bigint], position: { tokenId, liquidity },
        authorizedCapabilities: permissions.reduce((mask, role) => mask | role, 0n),
        authorizedActions: Object.entries(financeRoles).filter(([, role]) => permissions.includes(role)).map(([name]) => name as Capability) };
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

  async function resolveTree(query: string) {
    const input = query.trim();
    if (/^[1-9]\d*$/.test(input)) {
      const rootId = BigInt(input);
      const tree = await getTree(rootId);
      return { tree, selectedNodeId: rootId };
    }
    await verifyDeployment();
    const block = await read(() => rpc.getBlock());
    const at = { blockNumber: block.number };
    const namespace = await read(() => controller.read.namespaceLabel(at));
    const name = input.toLowerCase().replace(/\.$/, '');
    const addressQuery = isAddress(input);
    if (!addressQuery && (name.length > 253 || !name.endsWith(`.${namespace}.eth`) || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(name))) {
      throw new Error(`Enter a positive root ID, a vault address, or a full name under ${namespace}.eth`);
    }
    const next = await read(() => controller.read.nextNodeId(at));
    if (next > 513n) throw new Error('Onchain vault directory exceeds the 512-node demo lookup limit');
    const nodes = await Promise.all(Array.from({ length: Number(next - 1n) }, (_, index) =>
      read(() => controller.read.getNode([BigInt(index + 1)], at))));
    const byId = new Map(nodes.map(node => [node.id, node]));
    let selected: (typeof nodes)[number] | undefined;
    for (const node of nodes) {
      if (addressQuery) {
        if (node.vault.toLowerCase() === input.toLowerCase()) { selected = node; break; }
      } else {
        const labels = [node.label];
        let parent = node.parentId;
        for (let depth = 0; parent !== 0n && depth < 3; depth++) {
          const ancestor = byId.get(parent);
          if (!ancestor) throw new Error('Incomplete onchain tree');
          labels.push(ancestor.label);
          parent = ancestor.parentId;
        }
        if (parent !== 0n) throw new Error('Invalid onchain tree depth');
        if ([...labels, namespace, 'eth'].join('.').toLowerCase() === name) { selected = node; break; }
      }
    }
    if (!selected) throw new Error('No vault in this Sepolia deployment matches that name or address');
    const tree = await getTree(selected.rootId, block.number);
    if (!tree.nodes.some(node => node.id === selected.id && node.vault.toLowerCase() === selected.vault.toLowerCase())) {
      throw new Error('Resolved node is absent from its root tree');
    }
    return { tree, selectedNodeId: selected.id };
  }

  return { rpc, controller, verifyDeployment, getTree, resolveTree };
}

/** A name-addressed authority attestation: what an agent may currently do under its ENS mandate. */
export type NodeAuthority = {
  name: string; rootId: string; nodeId: string; agent: Address; vault: Address;
  active: boolean; revoked: boolean; expiry: string;
  /** Live per-capability grant, checked on-chain against the node's EAC roles + bounded policy. */
  capabilities: Record<Capability, boolean>;
  policy: { maxAmounts: [string, string]; tokenMask: number; poolId: Hex; expiry: string };
  tokens: readonly [Address, Address];
  source: CapitalTree['source'];
};

/**
 * Resolve the live authority of a single tree node, keyed by its numeric id, into a compact
 * attestation any caller (a service, another agent) can consume. This is the public, ENS-named
 * face of the same on-chain oracle (`checkAction` + bounded policy) that gates every action.
 */
export async function authorityOf(client: CapitalClient, nodeId: bigint): Promise<NodeAuthority> {
  const node = await client.controller.read.getNode([nodeId]);
  const tree = await client.getTree(node.rootId);
  const named = tree.nodes.find(candidate => candidate.id === nodeId);
  if (!named) throw new Error('Node is not part of its root tree');
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  const active = !named.revoked && named.generation === tree.generation && named.effectivePolicy.expiry > nowSeconds;
  const capabilities = Object.fromEntries(
    (Object.keys(financeRoles) as Capability[]).map(capability => [capability, named.authorizedActions.includes(capability)]),
  ) as Record<Capability, boolean>;
  return {
    name: named.ensName, rootId: tree.rootId.toString(), nodeId: named.id.toString(),
    agent: named.agent, vault: named.vault, active, revoked: named.revoked,
    expiry: named.effectivePolicy.expiry.toString(), capabilities,
    policy: {
      maxAmounts: [named.effectivePolicy.maxAmounts[0].toString(), named.effectivePolicy.maxAmounts[1].toString()],
      tokenMask: named.effectivePolicy.tokenMask, poolId: named.effectivePolicy.poolId,
      expiry: named.effectivePolicy.expiry.toString(),
    },
    tokens: tree.tokens, source: tree.source,
  };
}

/** Decimal strings preserve integer precision across JSON/MCP boundaries. */
export function jsonSafe(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item));
}
