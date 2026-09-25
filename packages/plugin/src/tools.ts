import { z } from 'zod';

const id = z.string().min(1).max(128);
const amount = z.string().regex(/^(0|[1-9]\d*)$/, 'raw token units as a decimal integer');
const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const operationKey = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const deadline = z.number().int().positive();
const restrictions = z.object({
  capabilities: z.array(z.enum(['delegate', 'swap', 'lpManage', 'collectFees', 'exit', 'restrict', 'reclaim'])).optional(),
  allowedAssets: z.array(address).max(2).optional(),
  expiresAt: deadline.optional(),
  maxPerAction: z.record(address, amount).optional()
}).strict();

/** Every schema is strict: an agentId in model arguments is rejected. */
export const toolSpecs = {
  getTree: { description: 'Read the current capital tree for a root.', schema: z.object({ rootId: id }).strict(), readOnly: true },
  getEffectivePolicy: { description: 'Read a node mandate including inherited restrictions.', schema: z.object({ nodeId: id }).strict(), readOnly: true },
  getCapitalActivity: { description: 'Read paginated indexed activity with source and confirmation status.', schema: z.object({ rootId: id, cursor: z.string().max(512).optional() }).strict(), readOnly: true },
  getOperationStatus: { description: 'Reconcile a submitted operation against runtime and chain state.', schema: z.object({ operationKey }).strict(), readOnly: true },
  spawnChild: { description: 'Request an on-chain child and bounded capital allocation using an idempotency key.', schema: z.object({ operationKey, task: z.string().min(1).max(12000), model: id, asset: address, amount, restrictions }).strict(), readOnly: false },
  allocateCapital: { description: 'Allocate additional free parent capital to an existing child.', schema: z.object({ childId: id, asset: address, amount }).strict(), readOnly: false },
  tightenPolicy: { description: 'Tighten a node mandate without expanding rights.', schema: z.object({ nodeId: id, restrictions }).strict(), readOnly: false },
  swap: { description: 'Request a bounded exact-input swap from a node vault.', schema: z.object({ nodeId: id, tokenIn: address, amountIn: amount, minAmountOut: amount, deadline }).strict(), readOnly: false },
  openPosition: { description: 'Open the fixed Uniswap position with exact liquidity and bounded token inputs.', schema: z.object({ nodeId: id, maxAmount0: amount, maxAmount1: amount, liquidity: amount, deadline }).strict(), readOnly: false },
  increasePosition: { description: 'Add exact liquidity to the fixed Uniswap position with bounded token inputs.', schema: z.object({ nodeId: id, maxAmount0: amount, maxAmount1: amount, liquidity: amount, deadline }).strict(), readOnly: false },
  collectFees: { description: 'Collect earned fees to the bound vault.', schema: z.object({ nodeId: id, minAmount0Out: amount.optional(), minAmount1Out: amount.optional(), deadline }).strict(), readOnly: false },
  closePosition: { description: 'Close the existing position to the bound vault.', schema: z.object({ nodeId: id, minAmount0Out: amount, minAmount1Out: amount, deadline }).strict(), readOnly: false },
  revokeSubtree: { description: 'Permanently revoke a node and its descendants.', schema: z.object({ nodeId: id }).strict(), readOnly: false },
  reclaimAssets: { description: 'Start or resume authorized parent recovery to bound vaults.', schema: z.object({ nodeId: id }).strict(), readOnly: false }
} as const;

export type ToolName = keyof typeof toolSpecs;
