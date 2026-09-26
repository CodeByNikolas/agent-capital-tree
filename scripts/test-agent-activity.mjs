import assert from 'node:assert/strict';
import { agentEvents, summarizeAgentEvents } from '../apps/web/src/lib/agent-activity.ts';
const event = (id, kind, fields) => ({ id, kind, rootId: '1', ...fields });
const items = [
  event('a', 'capital_allocated', { parentId: '1', childId: '2', token: '0xAA', amount: '10000000' }),
  event('b', 'capital_allocated', { parentId: '2', childId: '3', token: '0xaa', amount: '2000000' }),
  event('c', 'capital_reclaimed', { parentId: '1', childId: '2', token: '0xaa', amount: '1000000' }),
  event('d', 'swap_executed', { nodeId: '2', inputToken: '0xaa', outputToken: '0xbb', amountIn: '10000', amountOut: '9965' }),
  event('e', 'swap_executed', { nodeId: '3', inputToken: '0xaa', outputToken: '0xbb', amountIn: '999', amountOut: '999' }),
  event('f', 'root_funded', { token: '0xaa', amount: '900719925474099300000' }),
];
const totals = summarizeAgentEvents([...items, items[0]], '2', '1');
assert.deepEqual(totals.map(({ kind, rawAmount }) => [kind, rawAmount]), [
  ['received', 10000000n], ['delegated', 2000000n], ['returned', 1000000n], ['swapIn', 10000n], ['swapOut', 9965n],
]);
assert.equal(agentEvents(items, '2', '1').length, 4);
assert.equal(summarizeAgentEvents(items, '1', '1').find(t => t.kind === 'funded').rawAmount, 900719925474099300000n);
assert.deepEqual(summarizeAgentEvents(items, '99', '1'), []);
console.log('PASS: node isolation, transfer direction, deduplication, separate swap assets, exact large amounts, empty history.');
