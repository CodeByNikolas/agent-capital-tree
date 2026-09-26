import assert from 'node:assert/strict';
import { test } from 'node:test';
import { treeAsMermaid, treeAsPng, treeAsSvg } from '../tree-visual.mjs';

const base = {
  rootId: 1n,
  generation: 1n,
  source: { chainId: 11155111, blockNumber: 42n, timestamp: 100n, observedAt: '2026-09-26T00:00:00.000Z' },
  nodes: [
    { id: 1n, parentId: 0n, generation: 1n, revoked: false, ensName: 'capital.agentcapitalusdc.eth',
      vault: '0x1234567890123456789012345678901234567890', balances: [1_250_000n, 3_000_000n],
      effectivePolicy: { expiry: 200n }, authorizedActions: ['delegate', 'swap'] },
    { id: 2n, parentId: 1n, generation: 1n, revoked: false, ensName: 'researcher.capital.agentcapitalusdc.eth',
      vault: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', balances: [250_000n, 0n],
      effectivePolicy: { expiry: 200n }, authorizedActions: ['pay'] }
  ]
};

test('tree visual uses real hierarchy and raw six-decimal balances', async () => {
  const svg = treeAsSvg(base);
  assert.match(svg, /1\.25 USDC/);
  assert.match(svg, /0\.25 USDC/);
  assert.match(svg, /researcher\.capital\.agentcapitalusdc\.eth/);
  assert.match(svg, /BLOCK 42/);
  assert.match(treeAsMermaid(base), /n1 --> n2/);
  assert.match(treeAsSvg({ ...base, selectedNodeId: 2n }), /LEVEL 2 · #2 · SELECTED/);
  const png = await treeAsPng(base);
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
});

test('untrusted labels are escaped and malformed topology fails closed', () => {
  const tree = structuredClone(base);
  tree.nodes[1].ensName = '<svg onload="alert(1)">';
  assert.doesNotMatch(treeAsSvg(tree), /<svg onload=/);
  assert.doesNotMatch(treeAsMermaid(tree), /onload=/);
  tree.nodes[1].parentId = 99n;
  assert.throws(() => treeAsSvg(tree), /Disconnected tree node/);
});
