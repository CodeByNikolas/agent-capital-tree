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
  assert.deepEqual(listed.tools.map(tool => tool.name).sort(), ['getTree', 'visualizeTree']);
  assert.ok(listed.tools.every(tool => tool.annotations?.readOnlyHint === true));
  const result = await client.callTool({ name: 'getTree', arguments: { rootId: manifest.bootstrap.rootId } });
  assert.equal(result.isError, undefined, result.content?.[0]?.text);
  const tree = JSON.parse(result.content[0].text);
  assert.equal(tree.rootId, manifest.bootstrap.rootId);
  assert.equal(tree.source.chainId, manifest.chainId);
  assert.equal(tree.tokens[0].toLowerCase(), manifest.token.address.toLowerCase());
  assert.ok(tree.nodes.length > 0);
  assert.ok(BigInt(tree.source.blockNumber) >= BigInt(manifest.contracts.CapitalController.blockNumber));
  const visual = await client.callTool({ name: 'visualizeTree', arguments: { rootId: manifest.bootstrap.rootId } });
  assert.equal(visual.isError, undefined, visual.content?.[0]?.text);
  assert.match(visual.content[0].text, /Mermaid fallback:/);
  assert.equal(visual.content[1].type, 'image');
  assert.equal(visual.content[1].mimeType, 'image/png');
  assert.equal(Buffer.from(visual.content[1].data, 'base64').subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  if (process.env.ACT_VISUAL_OUTPUT) await writeFile(process.env.ACT_VISUAL_OUTPUT, Buffer.from(visual.content[1].data, 'base64'));
  const invalid = await client.callTool({ name: 'getTree', arguments: { rootId: 'not-a-root' } });
  assert.equal(invalid.isError, true);
  console.log(JSON.stringify({ server: 'agent-capital-tree-readonly', toolCount: listed.tools.length,
    rootId: tree.rootId, nodeCount: tree.nodes.length, chainId: tree.source.chainId,
    blockNumber: tree.source.blockNumber, visualBytes: Buffer.from(visual.content[1].data, 'base64').length,
    writes: 'not exposed' }));
} finally {
  await client.close().catch(() => {});
}
