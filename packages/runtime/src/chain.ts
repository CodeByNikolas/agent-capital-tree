import { capitalClient, capitalControllerAbi, narrowPolicy, tokenAmounts, rawAmount, tokenIndex, type Restrictions } from '@agent-capital-tree/sdk';
import { createWalletClient, http, type Address, type LocalAccount } from 'viem';
import { sepolia } from 'viem/chains';
import type { WorkerContext } from './context.js';
import type { ToolHandler } from './server.js';
import type { ToolName } from '@agent-capital-tree/plugin/tools';

export type ChainConfig = {
  rpcUrl: string; controller: Address;
  accountFor: (context: WorkerContext) => Promise<LocalAccount>;
};

/** Signer lookup is companion-owned; a model can never choose a wallet or parent identity. */
export function chainHandlers(config: ChainConfig): Partial<Record<ToolName, ToolHandler>> {
  const client = capitalClient(config.rpcUrl, config.controller);
  const queues = new Map<string, Promise<unknown>>();

  async function authority(context: WorkerContext) {
    await client.verifyDeployment();
    const [node, generation, account] = await Promise.all([
      client.controller.read.getNode([BigInt(context.nodeId)]),
      client.controller.read.rootGeneration([BigInt(context.rootId)]), config.accountFor(context),
    ]);
    if (node.rootId.toString() !== context.rootId || node.generation !== generation ||
      generation.toString() !== context.authorityGeneration || node.agent.toLowerCase() !== account.address.toLowerCase()) {
      throw new Error('Worker mandate is stale or mismatched');
    }
    return { node, account };
  }

  async function serialized(context: WorkerContext, action: () => Promise<unknown>) {
    // Each worker has one immutable signer. Await receipts before advancing its nonce.
    const key = context.workerId;
    const prior = queues.get(key) ?? Promise.resolve();
    const current = prior.catch(() => undefined).then(action);
    queues.set(key, current);
    try { return await current; }
    finally { if (queues.get(key) === current) queues.delete(key); }
  }

  const handlers: Partial<Record<ToolName, ToolHandler>> = {
    getTree: async (_context, args) => {
      const resolved = await client.resolveTree(String(args.query ?? args.rootId));
      return { ...resolved.tree, selectedNodeId: resolved.selectedNodeId };
    },
    getEffectivePolicy: async (_context, args) => client.controller.read.getEffectivePolicy([BigInt(String(args.nodeId))]),
  };
  for (const name of ['allocateCapital', 'tightenPolicy', 'revokeSubtree', 'reclaimAssets'] as const) {
    handlers[name] = (context, args) => serialized(context, async () => {
      const { node, account } = await authority(context);
      const wallet = createWalletClient({ account, chain: sepolia, transport: http(config.rpcUrl) });
      const targetId = BigInt(String(name === 'allocateCapital' ? args.childId : args.nodeId));
      const child = await client.controller.read.getNode([targetId]);
      if (child.parentId !== node.id || child.rootId !== node.rootId) throw new Error('Target is not this worker’s direct child');
      let hash: `0x${string}`;
      const common = { address: config.controller, abi: capitalControllerAbi, account };
      if (name === 'allocateCapital') {
        const tokens = await Promise.all([client.controller.read.TOKEN0(), client.controller.read.TOKEN1()]);
        const amounts = tokenAmounts([tokens[0], tokens[1]], String(args.asset), String(args.amount));
        const simulation = await client.rpc.simulateContract({ ...common, functionName: name, args: [node.id, child.id, amounts] });
        hash = await wallet.writeContract(simulation.request);
      } else if (name === 'tightenPolicy') {
        const tokens = await Promise.all([client.controller.read.TOKEN0(), client.controller.read.TOKEN1()]);
        // Effective limits include ancestors, even if the child's original policy was broader.
        const effective = await client.controller.read.getEffectivePolicy([child.id]);
        const policy = narrowPolicy(effective, args.restrictions as Restrictions, [tokens[0], tokens[1]]);
        const simulation = await client.rpc.simulateContract({ ...common, functionName: name, args: [child.id, policy] });
        hash = await wallet.writeContract(simulation.request);
      } else if (name === 'revokeSubtree') {
        const simulation = await client.rpc.simulateContract({ ...common, functionName: name, args: [child.id] });
        hash = await wallet.writeContract(simulation.request);
      } else {
        const simulation = await client.rpc.simulateContract({ ...common, functionName: name, args: [node.id, child.id] });
        hash = await wallet.writeContract(simulation.request);
      }
      const receipt = await client.rpc.waitForTransactionReceipt({ hash, confirmations: 2, timeout: 120000 });
      if (receipt.status !== 'success') throw new Error('Transaction reverted');
      return { transactionHash: hash, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash, status: 'confirmed' };
    });
  }
  for (const name of ['swap', 'openPosition', 'increasePosition', 'collectFees', 'closePosition'] as const) {
    handlers[name] = (context, args) => serialized(context, async () => {
      const { node, account } = await authority(context);
      const targetId = BigInt(String(args.nodeId));
      const wallet = createWalletClient({ account, chain: sepolia, transport: http(config.rpcUrl) });
      const common = { address: config.controller, abi: capitalControllerAbi, account };
      const uint128 = (value: unknown) => {
        const parsed = rawAmount(String(value));
        if (parsed >= (1n << 128n)) throw new Error('Strategy amount exceeds uint128');
        return parsed;
      };
      if (!Number.isSafeInteger(args.deadline) || Number(args.deadline) <= 0) throw new Error('Invalid strategy deadline');
      const deadline = BigInt(Number(args.deadline));
      let hash: `0x${string}`;
      if (targetId !== node.id) {
        if (name !== 'closePosition') throw new Error('Strategy must use this worker’s own vault');
        const child = await client.controller.read.getNode([targetId]);
        if (child.parentId !== node.id || child.rootId !== node.rootId) throw new Error('Recovery target is not a direct child');
        const minimums = [uint128(args.minAmount0Out), uint128(args.minAmount1Out)] as const;
        const simulation = await client.rpc.simulateContract({ ...common, functionName: 'parentClosePosition', args: [node.id, child.id, minimums, deadline] });
        hash = await wallet.writeContract(simulation.request);
      } else if (name === 'swap') {
        const tokens = await Promise.all([client.controller.read.TOKEN0(), client.controller.read.TOKEN1()]);
        const zeroForOne = tokenIndex([tokens[0], tokens[1]], String(args.tokenIn)) === 0;
        // Pinned v4 TickMath boundary; the explicit min output remains the user's price protection.
        const priceLimit = zeroForOne ? 4295128740n : 1461446703485210103287273052203988822378723970341n;
        const simulation = await client.rpc.simulateContract({ ...common, functionName: name,
          args: [node.id, zeroForOne, uint128(args.amountIn), uint128(args.minAmountOut), priceLimit, deadline] });
        hash = await wallet.writeContract(simulation.request);
      } else if (name === 'openPosition' || name === 'increasePosition') {
        const maximums = [uint128(args.maxAmount0), uint128(args.maxAmount1)] as const;
        const simulation = await client.rpc.simulateContract({ ...common, functionName: name,
          args: [node.id, uint128(args.liquidity), maximums, deadline] });
        hash = await wallet.writeContract(simulation.request);
      } else {
        const minimums = [uint128(args.minAmount0Out ?? '0'), uint128(args.minAmount1Out ?? '0')] as const;
        const simulation = await client.rpc.simulateContract({ ...common, functionName: name, args: [node.id, minimums, deadline] });
        hash = await wallet.writeContract(simulation.request);
      }
      const receipt = await client.rpc.waitForTransactionReceipt({ hash, confirmations: 2, timeout: 120000 });
      if (receipt.status !== 'success') throw new Error('Strategy transaction reverted');
      return { transactionHash: hash, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash, status: 'confirmed' };
    });
  }
  return handlers;
}
