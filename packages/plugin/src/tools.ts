import { z } from 'zod';

const id = z.string().min(1).max(128);
const amount = z.string().regex(/^(0|[1-9]\d*)$/, 'raw token units as a decimal integer');
const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const operationKey = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const deadline = z.number().int().positive();
const restrictions = z.object({
  capabilities: z.array(z.enum(['delegate', 'swap', 'lpManage', 'collectFees', 'exit', 'restrict', 'reclaim', 'pay'])).optional(),
  allowedAssets: z.array(address).max(2).optional(),
  expiresAt: deadline.optional(),
  maxPerAction: z.record(address, amount).optional()
}).strict();

/** Every schema is strict: an agentId in model arguments is rejected. */
export const toolSpecs = {
  getTree: { description: 'Read vault balances, capabilities and hierarchy from one Sepolia block.', schema: z.union([z.object({ rootId: id }).strict(), z.object({ query: z.string().min(1).max(253) }).strict()]), readOnly: true },
  getEffectivePolicy: { description: 'Read a node’s limits and inherited restrictions.', schema: z.object({ nodeId: id }).strict(), readOnly: true },
  getCapitalActivity: { description: 'Read MultiBaas activity with receipt verification and indexing coverage.', schema: z.object({ rootId: id, cursor: z.string().max(512).optional() }).strict(), readOnly: true },
  getOperationStatus: { description: 'Reconcile an operation against runtime and chain state.', schema: z.object({ operationKey }).strict(), readOnly: true },
  createChildVault: { description: 'Requires DELEGATE role. Create a child vault with a bounded allocation and inherited limits.', schema: z.object({ operationKey, name: z.string().regex(/^[a-z][a-z0-9-]{0,30}$/), asset: address, amount, restrictions }).strict(), readOnly: false },
  spawnChild: { description: 'Requires DELEGATE role. Create a child vault and request an isolated worker using the same operation key on retries.', schema: z.object({ operationKey, name: z.string().regex(/^[a-z][a-z0-9-]{0,30}$/).optional().describe("Readable ENS label, e.g. researcher; unique under its parent. Reuse the same name on retries."), task: z.string().min(1).max(12000), model: id, asset: address, amount, restrictions }).strict(), readOnly: false },
  getPaymentServices: { description: 'Read configured services, recipients and USDC price limits.', schema: z.object({}).strict(), readOnly: true },
  purchaseService: { description: 'Requires PAY role. Purchase a configured service within this node’s limit using the same operation key on retries.', schema: z.object({ operationKey, serviceId: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/), maxAmount: amount }).strict(), readOnly: false },
  allocateCapital: { description: 'Requires DELEGATE role. Allocate available capital to a direct child.', schema: z.object({ childId: id, asset: address, amount }).strict(), readOnly: false },
  tightenPolicy: { description: 'Requires RESTRICT role. Narrow a node’s capabilities and limits.', schema: z.object({ nodeId: id, restrictions }).strict(), readOnly: false },
  swap: { description: 'Requires SWAP role. Request a swap within the node’s limit.', schema: z.object({ nodeId: id, tokenIn: address, amountIn: amount, minAmountOut: amount, deadline }).strict(), readOnly: false },
  openPosition: { description: 'Requires LIQUIDITY management role. Open the configured Uniswap position with bounded inputs.', schema: z.object({ nodeId: id, maxAmount0: amount, maxAmount1: amount, liquidity: amount, deadline }).strict(), readOnly: false },
  increasePosition: { description: 'Requires LIQUIDITY management role. Add liquidity with bounded inputs.', schema: z.object({ nodeId: id, maxAmount0: amount, maxAmount1: amount, liquidity: amount, deadline }).strict(), readOnly: false },
  collectFees: { description: 'Requires LIQUIDITY fee-collection role. Collect fees into the bound vault.', schema: z.object({ nodeId: id, minAmount0Out: amount.optional(), minAmount1Out: amount.optional(), deadline }).strict(), readOnly: false },
  closePosition: { description: 'Requires LIQUIDITY exit role. Exit the position into the bound vault.', schema: z.object({ nodeId: id, minAmount0Out: amount, minAmount1Out: amount, deadline }).strict(), readOnly: false },
  revokeSubtree: { description: 'Requires RESTRICT role. Revoke management of a node and its descendants while funds remain in their vaults.', schema: z.object({ nodeId: id }).strict(), readOnly: false },
  reclaimAssets: { description: 'Requires RECLAIM role. Recover a direct child’s available assets to the contract-bound destination.', schema: z.object({ nodeId: id }).strict(), readOnly: false }
} as const;

export type ToolName = keyof typeof toolSpecs;
