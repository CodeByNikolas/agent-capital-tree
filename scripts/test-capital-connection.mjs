#!/usr/bin/env node
// Read-only protocol smoke: no fixed balance assumptions, keys, wallet actions or writes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Client } from '../packages/plugin/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../packages/plugin/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';

const settings = JSON.parse(await readFile(process.argv[2], 'utf8')).kanoki;
assert.ok(settings?.command && Array.isArray(settings.args), 'Provide capital settings JSON.');
const client = new Client({ name: 'capital-connection-smoke', version: '1' });
try {
  await client.connect(new StdioClientTransport({ ...settings, stderr: 'pipe' }), { timeout: 60000 });
  const tools = (await client.listTools()).tools;
  for (const name of ['getCapitalSetup', 'getTree', 'selectCapitalRoot', 'prepareOperatorRecovery', 'createChildVault']) {
    assert.ok(tools.some(tool => tool.name === name), `Missing ${name}`);
  }
  console.log(JSON.stringify({ protocol: 'connected', tools: tools.length }));
  for (const [name, args] of [
    ['getCapitalSetup', {}],
    ['getTree', { query: settings.args[2] }],
    ['getCapitalSetup', { budgetRaw: '500000' }],
  ]) {
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 120000 });
    // Emit every image link, including validation errors, for the supervising chat.
    console.log(result.structuredContent?._kanoki?.imageLinks?.join('\n') ?? result.content.find(item => item.type === 'text' && item.text.includes('Mermaid fallback'))?.text);
    assert.ok(result.content.some(item => item.type === 'image' && item.mimeType === 'image/png'));
    if (args.budgetRaw) {
      assert.equal(result.isError, true);
      assert.match(result.content.map(item => item.text ?? '').join('\n'), /100000.*0\.10.*NOT an on-chain/);
      console.log(JSON.stringify({ budgetValidation: 'passed' }));
    } else {
      assert.ok(!result.isError);
      const { _kanoki, ...data } = result.structuredContent;
      console.log(JSON.stringify({ tool: name, data }));
    }
  }
} finally { await client.close(); }
