import { test } from 'node:test';
import assert from 'node:assert/strict';
import { narrowPolicy, tokenAmounts, rawAmount, financeRoles, jsonSafe } from '../dist/index.js';

const tokens = ['0x0000000000000000000000000000000000000001', '0x0000000000000000000000000000000000000002'];
const parent = { capabilities: financeRoles.delegate | financeRoles.swap, maxAmounts: [100n, 200n], expiry: 1000n, tokenMask: 3, poolId: `0x${'0'.repeat(64)}` };

test('restrictions only narrow capabilities, expiry and raw-unit asset limits', () => {
  const child = narrowPolicy(parent, { capabilities: ['swap'], expiresAt: 900, allowedAssets: [tokens[1]], maxPerAction: { [tokens[1]]: '15' } }, tokens);
  assert.deepEqual(child, { ...parent, capabilities: financeRoles.swap, expiry: 900n, tokenMask: 2, maxAmounts: [0n, 15n] });
  assert.deepEqual(parent.maxAmounts, [100n, 200n]);
  assert.throws(() => narrowPolicy(parent, { capabilities: ['reclaim'] }, tokens), /expand/);
  assert.throws(() => narrowPolicy(parent, { expiresAt: 1001 }, tokens), /expand/);
  assert.throws(() => narrowPolicy(parent, { maxPerAction: { [tokens[0]]: '101' } }, tokens), /expand/);
  assert.throws(() => narrowPolicy({ ...parent, tokenMask: 1 }, { allowedAssets: [tokens[1]] }, tokens), /expand/);
  assert.throws(() => narrowPolicy(parent, { maxPerAction: { unknown: '1' } }, tokens), /configured/);
});

test('amounts never round and reject malformed or overflowing uint256 values', () => {
  const large = '900719925474099300000';
  assert.deepEqual(tokenAmounts(tokens, tokens[1], large), [0n, BigInt(large)]);
  for (const invalid of ['1.1', '-1', '01', '1e18', ' 1', (1n << 256n).toString()]) assert.throws(() => rawAmount(invalid));
  assert.deepEqual(jsonSafe({ amount: BigInt(large) }), { amount: large });
});
