import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('marketplace, plugin manifests and MCP registrations consistently use kanoki', async () => {
  const json = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
  for (const path of ['../plugin.json', '../.codex-plugin/plugin.json']) assert.equal((await json(path)).name, 'kanoki');
  const marketplace = await json('../../../.agents/plugins/marketplace.json');
  assert.equal(marketplace.name, 'kanoki');
  assert.equal(marketplace.plugins[0].name, 'kanoki');
  for (const path of ['../mcp.json', '../.mcp.json']) assert.deepEqual(Object.keys((await json(path)).mcpServers), ['kanoki']);
});

test('the distributed MCP bundle identifies itself as kanoki', async () => {
  const client = new Client({ name: 'kanoki-name-test', version: '1' });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath,
      args: [fileURLToPath(new URL('../bundle/server.mjs', import.meta.url))], stderr: 'pipe' }));
    assert.equal(client.getServerVersion().name, 'kanoki');
    assert.ok((await client.listTools()).tools.length > 0);
  } finally { await client.close(); }
});
