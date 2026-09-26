import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { RuntimeClient } from '../dist/runtime-client.js';
import { toolSpecs } from '../dist/tools.js';

const rootId = 'root-1';

test('mandates expose restriction authority and explicit allowed assets', () => {
  const restrictions = { capabilities: ['restrict', 'swap'], allowedAssets: ['0x' + 'a'.repeat(40)] };
  assert.deepEqual(toolSpecs.tightenPolicy.schema.parse({ nodeId: '2', restrictions }).restrictions, restrictions);
  assert.throws(() => toolSpecs.tightenPolicy.schema.parse({ nodeId: '2', restrictions: { allowedAssets: ['not-an-address'] } }));
});

test('runtime client fails closed when unconfigured and rejects forged agentId', async () => {
  const client = new RuntimeClient();
  await assert.rejects(client.call('getTree', { rootId }), /not configured/);
  await assert.rejects(client.call('getTree', { rootId, agentId: 'root-owner' }), /unrecognized_keys|Unrecognized key/);
  await assert.rejects(client.call('spawnChild', { operationKey: 'invalid', task: 'do it', model: 'm', asset: '0x' + 'a'.repeat(40), amount: '1.5', restrictions: {} }), /invalid_format|Invalid string/);
});

test('runtime client forwards only validated arguments with scoped bearer', async () => {
  let seen;
  const runtime = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    seen = { path: req.url, auth: req.headers.authorization, body: JSON.parse(raw) };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ source: 'synthetic-runtime', nodes: [] }));
  });
  await new Promise(resolve => runtime.listen(0, '127.0.0.1', resolve));
  try {
    const client = new RuntimeClient(`http://127.0.0.1:${runtime.address().port}`, 'synthetic-scoped-token');
    assert.deepEqual(await client.call('getTree', { rootId }), { source: 'synthetic-runtime', nodes: [] });
    assert.deepEqual(seen, { path: '/v1/tools/getTree', auth: 'Bearer synthetic-scoped-token', body: { rootId } });
  } finally { runtime.close(); }
});

test('runtime errors and redirects never become fake transaction success', async () => {
  let targetCalled = false;
  const target = createServer((_req, res) => { targetCalled = true; res.end('{}'); });
  await new Promise(resolve => target.listen(0, '127.0.0.1', resolve));
  let mode = 'reject';
  const runtime = createServer((_req, res) => {
    if (mode === 'reject') { res.writeHead(503); res.end('private details'); }
    else { res.writeHead(302, { location: `http://127.0.0.1:${target.address().port}/other` }); res.end(); }
  });
  await new Promise(resolve => runtime.listen(0, '127.0.0.1', resolve));
  try {
    const client = new RuntimeClient(`http://127.0.0.1:${runtime.address().port}`, 'synthetic-token');
    await assert.rejects(client.call('revokeSubtree', { nodeId: 'child' }), error => error.message.includes('HTTP 503') && !error.message.includes('private details'));
    mode = 'redirect';
    await assert.rejects(client.call('revokeSubtree', { nodeId: 'child' }), /unavailable/);
    assert.equal(targetCalled, false);
  } finally { runtime.close(); target.close(); }
});

test('bundled stdio MCP server works from a copied plugin without node_modules', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'act-plugin-'));
  const source = fileURLToPath(new URL('..', import.meta.url));
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(folder, 'bundle/server.mjs')], cwd: folder, env: { PATH: process.env.PATH ?? '' } });
  const client = new Client({ name: 'plugin-test', version: '0.1.0' });
  try {
    await cp(join(source, 'bundle'), join(folder, 'bundle'), { recursive: true });
    await client.connect(transport);
    const listed = await client.listTools();
    assert.ok(listed.tools.some(tool => tool.name === 'getTree'));
    const spawn = listed.tools.find(tool => tool.name === 'spawnChild');
    assert.ok(spawn);
    assert.match(spawn.description, /native Codex subagents do not create vaults/);
    assert.match(spawn.description, /10 Sepolia test USDC is 10000000 raw units/);
    assert.match(spawn.description, /getOperationStatus/);
    assert.match(spawn.inputSchema.properties.amount.description, /no assumed default/);
    assert.match(spawn.inputSchema.properties.restrictions.description, /PAY and swap are separate rights/);
    const result = await client.callTool({ name: 'getTree', arguments: { rootId } });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /not configured/);
  } finally {
    await client.close();
    await rm(folder, { recursive: true, force: true });
  }
});


test('LP tools request exact liquidity and explicit maximum inputs', () => {
  const request = { nodeId: '2', liquidity: '500', maxAmount0: '100', maxAmount1: '100', deadline: 1800000000 };
  assert.deepEqual(toolSpecs.openPosition.schema.parse(request), request);
  assert.throws(() => toolSpecs.openPosition.schema.parse({ ...request, liquidity: undefined, minLiquidity: '500' }));
  assert.throws(() => toolSpecs.increasePosition.schema.parse({ ...request, liquidity: '1.5' }));
});

test('spawn accepts readable ENS labels but rejects paths and invalid labels', () => {
  const request = { operationKey: '0x' + '1'.repeat(64), task: 'Read state', model: 'gpt-6-luna', asset: '0x' + 'a'.repeat(40), amount: '1', restrictions: {} };
  assert.equal(toolSpecs.spawnChild.schema.parse({ ...request, name: 'researcher' }).name, 'researcher');
  for (const name of ['../master', 'child.parent', '', 'A name', 'a'.repeat(32)]) assert.throws(() => toolSpecs.spawnChild.schema.parse({ ...request, name }));
  assert.equal(toolSpecs.spawnChild.schema.parse(request).name, undefined);
});
