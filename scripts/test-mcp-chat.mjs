#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Client } from '../packages/plugin/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../packages/plugin/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';

const manifest = JSON.parse(await readFile(new URL('../deployments/usdc-sepolia.json', import.meta.url), 'utf8'));
const client = new Client({ name: 'capital-tree-chat-smoke', version: '0.1.0' });
try {
  await client.connect(new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('./mcp-readonly-server.mjs', import.meta.url))], env: process.env }));
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map(tool => tool.name).sort(), ['getTree', 'prepareRootSetup', 'visualizeTree']);
  assert.ok(listed.tools.filter(tool => tool.name !== 'prepareRootSetup').every(tool => tool.annotations?.readOnlyHint === true));
  assert.equal(listed.tools.find(tool => tool.name === 'prepareRootSetup').annotations.readOnlyHint, false);
  const openBrowser = process.env.ACT_OPEN_BROWSER_TEST === '1';
  const prepared = await client.callTool({ name: 'prepareRootSetup', arguments: { label: 'demo-agent', budgetRaw: '100000', openBrowser } });
  assert.equal(prepared.isError, undefined);
  assert.equal(prepared.structuredContent.ensName, `demo-agent.${manifest.ensNamespace.name}`);
  const browser = prepared.structuredContent.browser;
  if (openBrowser) assert.equal(browser.opened, true, browser.note);
  else assert.equal(browser.method, 'not-requested');
  assert.equal(prepared.content[2].mimeType, 'image/png');
  if (process.env.ACT_SETUP_VISUAL_OUTPUT) await writeFile(process.env.ACT_SETUP_VISUAL_OUTPUT, Buffer.from(prepared.content[2].data, 'base64'));
  const excessive = await client.callTool({ name: 'prepareRootSetup', arguments: { label: 'demo-agent', budgetRaw: '100001' } });
  assert.equal(excessive.isError, true);
  assert.equal(excessive.content[2].mimeType, 'image/png');
  const result = await client.callTool({ name: 'getTree', arguments: { rootId: manifest.bootstrap.rootId } });
  assert.equal(result.isError, undefined, result.content?.[0]?.text);
  const tree = result.structuredContent;
  assert.match(result.content[0].text, /^\*\*kanoki\*\* · sepolia · /);
  assert.match(result.content[0].text, /USDC · capabilities .+ · (expires in|expired|expiry unavailable).+ · (active|inactive|revoked|expired)/);
  assert.match(result.content[0].text, /```text\n/);
  assert.equal(tree.rootId, manifest.bootstrap.rootId);
  assert.equal(tree.source.chainId, manifest.chainId);
  assert.deepEqual(tree.tokens.map(address => address.toLowerCase()), manifest.tokens.map(token => token.address.toLowerCase()));
  assert.ok(tree.nodes.length > 0);
  assert.equal(result.content[2].type, 'image');
  assert.match(result.content[1].text, /Mermaid fallback:/);
  const byAddress = await client.callTool({ name: 'getTree', arguments: { query: tree.nodes[0].vault } });
  assert.equal(byAddress.isError, undefined, byAddress.content?.[0]?.text);
  const addressed = byAddress.structuredContent;
  assert.equal(addressed.selectedNodeId, tree.nodes[0].id);
  assert.equal(byAddress.content[2].type, 'image');
  const child = tree.nodes.find(node => node.id !== tree.rootId);
  assert.ok(child, 'The public demo must contain a child vault');
  const byChildEns = await client.callTool({ name: 'getTree', arguments: { query: child.ensName } });
  assert.equal(byChildEns.isError, undefined, byChildEns.content?.[0]?.text);
  const childTree = byChildEns.structuredContent;
  assert.equal(childTree.rootId, tree.rootId);
  assert.equal(childTree.selectedNodeId, child.id);
  assert.equal(byChildEns.content[2].type, 'image');
  const byEns = await client.callTool({ name: 'getTree', arguments: { query: tree.nodes[0].ensName } });
  assert.equal(byEns.isError, undefined, byEns.content?.[0]?.text);
  const hello = byEns.structuredContent;
  assert.equal(hello.rootId, tree.rootId);
  assert.equal(hello.selectedNodeId, tree.rootId);
  assert.equal(hello.source.chainId, 11155111);
  assert.equal(byEns.content[2].type, 'image');
  assert.ok(BigInt(tree.source.blockNumber) >= BigInt(manifest.contracts.CapitalController.blockNumber));
  const visual = await client.callTool({ name: 'visualizeTree', arguments: { rootId: manifest.bootstrap.rootId } });
  assert.equal(visual.isError, undefined, visual.content?.[0]?.text);
  assert.match(visual.content[1].text, /Mermaid fallback:/);
  assert.equal(visual.content[2].type, 'image');
  assert.equal(visual.content[2].mimeType, 'image/png');
  assert.equal(Buffer.from(visual.content[2].data, 'base64').subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  if (process.env.ACT_VISUAL_OUTPUT) await writeFile(process.env.ACT_VISUAL_OUTPUT, Buffer.from(visual.content[2].data, 'base64'));
  const invalid = await client.callTool({ name: 'getTree', arguments: { rootId: 'not-a-root' } });
  assert.equal(invalid.isError, true);
  assert.equal(invalid.content[2].mimeType, 'image/png');
  const missing = await client.callTool({ name: 'getTree', arguments: { query: `missing.${manifest.ensNamespace.name}` } });
  assert.equal(missing.isError, true);
  assert.equal(missing.content[2].mimeType, 'image/png');
  console.log(JSON.stringify({ server: 'kanoki', toolCount: listed.tools.length,
    rootId: tree.rootId, nodeCount: tree.nodes.length, chainId: tree.source.chainId,
    blockNumber: tree.source.blockNumber, visualBytes: Buffer.from(visual.content[2].data, 'base64').length,
    browserLaunch: browser.method, writes: 'not exposed' }));
} finally {
  await client.close().catch(() => {});
}
