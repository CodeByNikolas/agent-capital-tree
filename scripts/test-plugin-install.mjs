#!/usr/bin/env node
// Fresh Codex marketplace installation and installed MCP getTree smoke test. No signer or write endpoint.
import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { lstat, mkdtemp, readFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Client } from '../packages/plugin/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../packages/plugin/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import { capitalClient } from '../packages/sdk/dist/index.js';

const execFile = promisify(execFileCallback);
const configPath = process.argv[2];
if (process.argv.length !== 3 || !isAbsolute(configPath)) {
  throw new Error('usage: node scripts/test-plugin-install.mjs /absolute/private-runtime-config.json');
}
const info = await lstat(configPath);
assert.ok(info.isFile() && !info.isSymbolicLink() && info.uid === process.getuid() &&
  (info.mode & 0o777) === 0o600, 'expected owner-only 0600 private config');
const config = JSON.parse(await readFile(configPath, 'utf8'));
const deployment = JSON.parse(await readFile(new URL('../deployments/sepolia.json', import.meta.url), 'utf8'));
assert.equal(config.controller.toLowerCase(), deployment.contracts.CapitalController.address.toLowerCase());
const rootId = BigInt(config.rootId);
const chain = capitalClient(config.rpcUrl, config.controller);
const codex = join(homedir(), '.local/bin/codex');
const { stdout: version } = await execFile(codex, ['--version']);
assert.equal(version.trim(), 'codex-cli 0.154.0');
const profile = await mkdtemp(join(tmpdir(), 'act-plugin-install-'));
const marketplace = fileURLToPath(new URL('..', import.meta.url));
const env = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: homedir(), CODEX_HOME: profile };
const run = async args => JSON.parse((await execFile(codex, args, { env, maxBuffer: 1_000_000 })).stdout);
const bearer = randomBytes(32).toString('hex');
let server;
let client;
try {
  await run(['plugin', 'marketplace', 'add', marketplace, '--json']);
  const install = await run(['plugin', 'add', 'agent-capital-tree@agent-capital-tree', '--json']);
  assert.equal(install.pluginId, 'agent-capital-tree@agent-capital-tree');
  const registered = (await run(['mcp', 'list', '--json'])).find(item => item.name === 'capital-tree');
  assert.ok(registered?.enabled, 'installed plugin MCP server was not registered');
  assert.equal(registered.transport.cwd, install.installedPath);
  assert.equal(registered.transport.command, 'node');

  server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/tools/getTree' ||
      request.headers.authorization !== `Bearer ${bearer}`) {
      response.writeHead(404).end();
      return;
    }
    try {
      let body = '';
      for await (const chunk of request) body += chunk;
      assert.equal(BigInt(JSON.parse(body).rootId), rootId);
      const tree = await chain.getTree(rootId);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(tree, (_, value) => typeof value === 'bigint' ? value.toString() : value));
    } catch {
      response.writeHead(500).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const transport = new StdioClientTransport({ ...registered.transport,
    env: { ...env, ...registered.transport.env,
      ACT_RUNTIME_URL: `http://127.0.0.1:${server.address().port}`, ACT_MCP_TOKEN: bearer } });
  client = new Client({ name: 'plugin-install-smoke', version: '0.1.0' });
  await client.connect(transport);
  const tools = await client.listTools();
  assert.ok(tools.tools.some(tool => tool.name === 'getTree'));
  const result = await client.callTool({ name: 'getTree', arguments: { rootId: rootId.toString() } });
  assert.equal(result.isError, undefined, result.content?.[0]?.text);
  const tree = JSON.parse(result.content[0].text);
  assert.equal(tree.rootId, rootId.toString());
  assert.equal(tree.source.chainId, 11155111);
  assert.ok(BigInt(tree.source.blockNumber) >= BigInt(deployment.contracts.CapitalController.blockNumber));
  assert.ok(tree.nodes.length > 0);
  console.log(JSON.stringify({ pluginId: install.pluginId, cliVersion: version.trim(),
    mcpServer: registered.name, rootId: tree.rootId, nodeCount: tree.nodes.length,
    chainId: tree.source.chainId, blockNumber: tree.source.blockNumber,
    toolTimeoutSec: registered.tool_timeout_sec, writes: 'disabled' }));
} finally {
  await client?.close().catch(() => {});
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(profile, { recursive: true, force: true });
}
