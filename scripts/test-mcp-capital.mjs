#!/usr/bin/env node
// Read-only live proof. The spawned server has NO --enable-sepolia-writes flag.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Client } from '../packages/plugin/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../packages/plugin/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';

const client = new Client({ name: 'capital-mode-read-proof', version: '1' });
const transport = new StdioClientTransport({ command: process.execPath,
  args: [fileURLToPath(new URL('../packages/runtime/capital.mjs', import.meta.url)), 'stdio', 'hello.agentcapitalusdc.eth'], stderr: 'pipe' });
const timer = setTimeout(() => { console.error('Capital MCP test exceeded 120 seconds'); process.exit(1); }, 120000);
async function call(name, args) {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 60000 });
  assert.equal(result.isError, undefined, result.content[0].text);
  const png = result.content.find(item => item.type === 'image');
  assert.equal(png?.mimeType, 'image/png');
  return { data: JSON.parse(result.content[0].text), png: Buffer.from(png.data, 'base64') };
}
try {
  await client.connect(transport, { timeout: 60000 });
  const listed = await client.listTools();
  assert.equal(listed.tools.length, 21);
  assert.ok(listed.tools.some(tool => tool.name === 'createChildVault'));
  const rootSetup = await call('prepareRootSetup', { label: 'read-proof-not-created', budgetRaw: '50000', openBrowser: false });
  assert.equal(rootSetup.data.browser.opened, false);
  const setup = await call('getCapitalSetup', { budgetRaw: '50000' });
  assert.equal(setup.data.chainId, 11155111);
  assert.equal(setup.data.mode, 'capital');
  assert.equal(setup.data.writesEnabled, false);
  const blocked = await call('createChildVault', { operationKey: `0x${'b'.repeat(64)}`, name: 'read-proof-not-sent',
    asset: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', amount: '50000', restrictions: {} });
  assert.equal(blocked.data.status, 'blocked');
  assert.equal(blocked.data.transactionSubmitted, false);
  const tree = await call('getTree', { query: 'hello.agentcapitalusdc.eth' });
  assert.equal(tree.data.rootId, '3');
  await writeFile(new URL('../artifacts/ui/mcp-capital-readiness.png', import.meta.url), setup.png);
  await writeFile(new URL('../artifacts/ui/mcp-hello-tree.png', import.meta.url), tree.png);
  console.log(JSON.stringify({ mode: 'capital', tools: listed.tools.length, chainId: setup.data.chainId,
    rootId: tree.data.rootId, blockNumber: tree.data.source.blockNumber, missing: setup.data.missing,
    writes: 'disabled', images: 'PNG', backgroundWorker: 'not-requested' }));
} finally { clearTimeout(timer); await client.close(); }
