#!/usr/bin/env node
// Read-only live protocol proof. No wallet preparation, financial write or inference.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '../packages/plugin/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../packages/plugin/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';

const client = new Client({ name: 'kanoki-connection-test', version: '1' });
try {
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [
    fileURLToPath(new URL('../packages/runtime/capital.mjs', import.meta.url)), 'stdio',
    'root-agent.agentcapitalusdc.eth', '--deployment', 'usdc-full-vaults'], stderr: 'pipe' }), { timeout: 60000 });
  assert.equal(client.getServerVersion().name, 'kanoki');
  const tools = (await client.listTools()).tools;
  assert.equal(tools.length, 19);
  assert.equal(tools.some(tool => ['spawnChild','getCapitalActivity','getPaymentServices','purchaseService'].includes(tool.name)), false);
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await client.callTool({ name: 'getEffectivePolicy', arguments: { nodeId: '4' } }, undefined, { timeout: 120000 });
    const links = result.content.filter(item => item.type === 'text').flatMap(item => item.text.match(/!\[[^\]]*\]\(<[^>]+>\)/g) ?? []);
    console.log([...new Set(links)].join('\n'));
    assert.ok(!result.isError, result.content[0].text);
    assert.ok(result.content.some(item => item.type === 'image'));
    assert.equal(result.structuredContent.nodeId, '4');
    assert.equal(result.structuredContent.rootId, '4');
    console.log(JSON.stringify({ server: client.getServerVersion().name, toolCount: tools.length,
      policy: result.structuredContent, writes: 0 }));
  }
} finally { await client.close(); }
