import assert from 'node:assert/strict';
import { test } from 'node:test';
import { treeAsMermaid, treeAsPng, treeAsSvg } from '../tree-visual.mjs';
import { visualResult } from '../tool-visual.mjs';
import { readFile } from 'node:fs/promises';

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
  assert.match(svg, /1\.250000 USDC/);
  assert.match(svg, /0\.250000 USDC/);
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

test('large trees retain every node and every right across readable pages from one snapshot', async () => {
  const tree = structuredClone(base);
  tree.nodes = [tree.nodes[0], ...Array.from({length:31},(_,index)=>({...tree.nodes[1],id:BigInt(index+2),ensName:`child-${index}.capital.agentcapitalusdc.eth`}))];
  tree.nodes[0].authorizedActions = ['delegate','swap','lpManage','collectFees','exit','restrict','reclaim','pay'];
  const result = await visualResult('getTree',{},tree,{readOnly:true});
  assert.equal(result.content.filter(item=>item.type==='image').length,6);
  for(let page=0;page<6;page++) assert.match(treeAsSvg(tree,page),/BLOCK 42/);
  assert.match(treeAsSvg(tree,0),/reclaim · pay/);
  assert.match(treeAsSvg(tree,5),/child-30/);
  assert.match(treeAsSvg(tree,5),/Parent #1 · previous page/);
  assert.match(treeAsMermaid(tree),/n1 --> n32/);
  assert.throws(()=>treeAsSvg({...tree,source:{...tree.source,chainId:1}}),/Sepolia/);
});

test('chat Markdown links point to the exact returned PNG, not an invented attachment', async () => {
  const result = await visualResult('getTree', {}, base, {readOnly:true});
  const file = /!\[[^\]]+\]\(<([^>]+)>\)/.exec(result.content[1].text)?.[1];
  assert.ok(file);
  assert.deepEqual(await readFile(file), Buffer.from(result.content[2].data, 'base64'));
});


test('Kanoki response adds readable and structured data without breaking existing JSON clients', async () => {
  const result = await visualResult('getTree', {}, base, { readOnly: true });
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  assert.match(result.content[1].text, /\*\*kanoki\*\*/);
  assert.match(result.content[1].text, /1\.250000 USDC/);
  assert.equal(result.content[2].type, 'image');
});
