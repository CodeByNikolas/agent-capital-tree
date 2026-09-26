import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nativeDockerArgs, forwardScopedTool, validateNativeCodexHome } from '../dist/codex-launcher.js';

test('native Docker mounts only its workspace, without keys or host login', async () => {
  const root = await mkdtemp(join(tmpdir(), 'act-native-mounts-'));
  const workspace = join(root, 'workers', 'unit', 'workspace');
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  const files = { workerId: 'unit', uid: process.getuid(), gid: process.getgid(), runtimeRoot: root,
    workspace, keyFile: '/host/key', gatewaySocket: '/host/socket', imageId: `sha256:${'a'.repeat(64)}`, model: 'model' };
  try {
    const args = await nativeDockerArgs(files);
    assert.equal(args.filter(arg => arg === '--mount').length, 1);
    assert.ok(args.includes('--network') && args[args.indexOf('--network') + 1] === 'none');
    assert.ok(!args.join(' ').includes('/host/'));
    assert.ok(args.includes('exec-server'));
    await assert.rejects(nativeDockerArgs({ ...files, workspace: root }), /outside private/);
    await rm(workspace, { recursive: true });
    await symlink(root, workspace);
    await assert.rejects(nativeDockerArgs(files), /invalid native worker/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('native profile permits generated trust/system files but rejects root MCP config and external skills', async () => {
  const home = await mkdtemp(join(tmpdir(), 'act-native-profile-'));
  try {
    await validateNativeCodexHome(home);
    await writeFile(join(home, 'config.toml'), '[projects."/workspace"]\ntrust_level = "trusted"\n');
    await mkdir(join(home, 'skills', '.system'), { recursive: true });
    await validateNativeCodexHome(home);
    await validateNativeCodexHome(home);
    await writeFile(join(home, 'config.toml'), '[mcp_servers.root]\ncommand = "root-command"\n');
    await assert.rejects(validateNativeCodexHome(home), /unsupported configuration: config.toml/);
    await rm(join(home, 'config.toml'));
    await mkdir(join(home, 'skills', 'external'));
    await assert.rejects(validateNativeCodexHome(home), /unsupported configuration: skills/);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('native finance forwarding validates arguments, supplies only scoped auth, and rejects redirects', async () => {
  let calls = 0, redirected = false;
  const server = createServer((req, res) => {
    calls++;
    assert.equal(req.headers.authorization, 'Bearer scoped-unit-token');
    assert.equal(req.url, '/v1/tools/getPaymentServices');
    if (redirected) { res.writeHead(302, { location: '/should-not-follow' }); res.end(); }
    else { res.writeHead(200); res.end('{"services":[]}'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await forwardScopedTool(origin, 'scoped-unit-token', 'getPaymentServices', {})).success, true);
    await assert.rejects(forwardScopedTool(origin, 'scoped-unit-token', 'getPaymentServices', { agentId: 'parent' }));
    await assert.rejects(forwardScopedTool('https://example.com', 'scoped-unit-token', 'getPaymentServices', {}), /loopback/);
    await assert.rejects(forwardScopedTool(origin, 'scoped-unit-token', 'arbitraryTool', {}), /unavailable/);
    assert.equal(calls, 1);
    redirected = true;
    await assert.rejects(forwardScopedTool(origin, 'scoped-unit-token', 'getPaymentServices', {}));
    assert.equal(calls, 2);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
