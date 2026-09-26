#!/usr/bin/env node
// Fresh, read-only Codex plugin installation against the current public USDC deployment.
import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Client } from '../packages/plugin/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../packages/plugin/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import { capitalClient } from '../packages/sdk/dist/index.js';
import { toolSpecs } from '../packages/plugin/dist/tools.js';

const execFile = promisify(execFileCallback);
const manifest = JSON.parse(await readFile(new URL('../deployments/usdc-sepolia.json', import.meta.url), 'utf8'));
const rootId = BigInt(manifest.bootstrap.rootId);
const controller = manifest.contracts.CapitalController.address;
const rpcUrl = process.env.ACT_SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia.publicnode.com';
// Verify the canonical app against the current USDC manifest.
const appUrl = process.env.ACT_APP_URL ?? 'https://kanoki-app.vercel.app';
const chain = capitalClient(rpcUrl, controller);
const codex = process.env.ACT_CODEX_BIN ?? 'codex';
const { stdout: version } = await execFile(codex, ['--version'], { timeout: 15_000 });

// The published app and the local package must describe the same deployment.
const deploymentResponse = await fetch(new URL('/api/deployment', appUrl), { signal: AbortSignal.timeout(15_000) });
assert.equal(deploymentResponse.status, 200, 'published deployment endpoint is unavailable');
const deployment = await deploymentResponse.json();
assert.equal(deployment.id, 'usdc');
assert.equal(deployment.chainId, manifest.chainId);
assert.equal(deployment.controllerAddress?.toLowerCase(), controller.toLowerCase());
assert.equal(deployment.tokenAddresses?.[0]?.toLowerCase(), manifest.token.address.toLowerCase());
await chain.verifyDeployment();

const profile = await mkdtemp(join(tmpdir(), 'act-plugin-install-'));
const marketplace = fileURLToPath(new URL('..', import.meta.url));
const env = { ...process.env, CODEX_HOME: profile };
const run = async args => JSON.parse((await execFile(codex, args, { env, timeout: 45_000, maxBuffer: 1_000_000 })).stdout);
const bearer = randomBytes(32).toString('hex');
let server;
let client;
try {
  await run(['plugin', 'marketplace', 'add', marketplace, '--json']);
  const install = await run(['plugin', 'add', 'kanoki@kanoki', '--json']);
  assert.equal(install.pluginId, 'kanoki@kanoki');
  const registeredServers = await run(['mcp', 'list', '--json']);
  assert.equal(registeredServers.length, 1, 'fresh profile must register exactly one MCP server');
  const registered = registeredServers[0];
  assert.equal(registered.name, 'kanoki');
  assert.ok(registered.enabled, 'installed MCP server is disabled');
  assert.equal(registered.transport.cwd, install.installedPath);
  assert.equal(registered.transport.command, 'node');

  // Deliberately expose only getTree. The test cannot dispatch any on-chain write.
  server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/tools/getTree') {
      response.writeHead(404).end();
      return;
    }
    if (request.headers.authorization !== `Bearer ${bearer}`) {
      response.writeHead(401).end();
      return;
    }
    try {
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 1024) throw new Error('oversized request');
      }
      assert.deepEqual(JSON.parse(body), { rootId: rootId.toString() });
      const tree = await chain.getTree(rootId);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(tree, (_, value) => typeof value === 'bigint' ? value.toString() : value));
    } catch {
      response.writeHead(400).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  // Prove the local verifier endpoint cannot accept a write, even with its bearer.
  assert.equal((await fetch(`${origin}/v1/tools/spawnChild`, {
    method: 'POST', headers: { authorization: `Bearer ${bearer}` }, body: '{}'
  })).status, 404);
  const pluginEnv = { ...env, ...registered.transport.env };
  delete pluginEnv.ACT_RUNTIME_URL; delete pluginEnv.ACT_MCP_TOKEN;
  const transport = new StdioClientTransport({ ...registered.transport, env: pluginEnv });
  client = new Client({ name: 'plugin-install-smoke', version: '0.1.0' });
  await client.connect(transport);
  const listed = await client.listTools();
  assert.equal(listed.tools.length, 19);
  assert.ok(listed.tools.some(tool => tool.name === 'prepareRootSetup'));
  assert.ok(listed.tools.some(tool => tool.name === 'createChildVault'));
  assert.ok(!listed.tools.some(tool => tool.name === 'spawnChild'));
  const result = await client.callTool({ name: 'getTree', arguments: { rootId: rootId.toString() } });
  console.log(result.structuredContent?._kanoki?.imageLinks?.join('\n') ?? '');
  assert.equal(result.isError, undefined, result.content?.[0]?.text);
  const tree = result.structuredContent;
  assert.equal(tree.rootId, rootId.toString());
  assert.equal(tree.source.chainId, manifest.chainId);
  assert.ok(BigInt(tree.source.blockNumber) >= BigInt(manifest.contracts.CapitalController.blockNumber));
  assert.ok(tree.nodes.length > 0);
  assert.equal(tree.tokens[0].toLowerCase(), manifest.token.address.toLowerCase());
  assert.equal(result.content[2].type, 'image');
  assert.equal(result.content[2].mimeType, 'image/png');
  assert.match(result.content[1].text, /Mermaid fallback:/);
  console.log(JSON.stringify({ pluginId: install.pluginId, cliVersion: version.trim(),
    mcpServer: registered.name, toolCount: listed.tools.length, rootId: tree.rootId,
    nodeCount: tree.nodes.length, chainId: tree.source.chainId,
    blockNumber: tree.source.blockNumber, imageMimeType: result.content[2].mimeType, writes: 'none requested or submitted' }));
} finally {
  await client?.close().catch(() => {});
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(profile, { recursive: true, force: true });
}
