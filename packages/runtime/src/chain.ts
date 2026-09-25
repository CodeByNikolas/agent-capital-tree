import { capitalClient, capitalControllerAbi, narrowPolicy, tokenAmounts, type Restrictions } from '@agent-capital-tree/sdk';
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
    getTree: async (_context, args) => client.getTree(BigInt(String(args.rootId))),
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
  return handlers;
}
