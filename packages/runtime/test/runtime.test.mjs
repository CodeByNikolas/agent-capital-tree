import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { chmod, mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkerSessions, authorizedWorkerCall, SpawnCoordinator, FileSpawnJournal, workerDockerArgs, startWorkerGateway, DockerWorkerLauncher, InferenceBroker } from '../dist/index.js';

const parent = { workerId: 'w1', rootId: 'root', nodeId: 'parent', authorityGeneration: '3' };
const request = { operationKey: `0x${'a'.repeat(64)}`, task: 'study', model: 'gpt-6-sol', token: '0xasset', amount: '10', restrictions: { swap: false, assets: ['a'] } };

test('worker identity comes from bearer transport, not claimed agentId', async () => {
  const sessions = new WorkerSessions();
  const token = sessions.issue(parent, Date.now() + 10000);
  assert.deepEqual(sessions.authenticate(`Bearer ${token}`), parent);
  const modelArgs = { agentId: 'root', task: 'claim root identity' };
  assert.equal(await authorizedWorkerCall(sessions, `Bearer ${token}`, async context => context.nodeId), 'parent');
  assert.equal(modelArgs.agentId, 'root');
  assert.throws(() => sessions.authenticate('Bearer bogus'), /unauthorized/);
  sessions.revoke(token);
  assert.throws(() => sessions.authenticate(`Bearer ${token}`), /unauthorized/);
});

test('spawn reconciles and starts once; conflicting retry and uncertain send fail closed', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'act-journal-'));
  try {
    const journal = new FileSpawnJournal(directory);
    let submits = 0, launches = 0, receipt;
    const chain = {
      async reconcile() { return receipt; },
      async submit() { submits++; receipt = { childId: 'child', txHash: 'tx', blockHash: 'block' }; },
      async confirmed() { return true; }
    };
    const coordinator = new SpawnCoordinator(chain, journal, async () => { launches++; });
    const [a, b] = await Promise.all([coordinator.spawn(parent, request), coordinator.spawn(parent, request)]);
    assert.equal(a.childId, 'child'); assert.deepEqual(a, b);
    await coordinator.spawn(parent, { ...request, restrictions: { assets: ['a'], swap: false } });
    assert.equal(submits, 1); assert.equal(launches, 1);
    await assert.rejects(coordinator.spawn(parent, { ...request, amount: '11' }), /different parameters/);
    const files = await readFile(join(directory, (await import('node:crypto')).createHash('sha256').update(`root:parent:3:${request.operationKey}`).digest('hex') + '.json'), 'utf8');
    assert.equal(JSON.parse(files).started, true);
    const uncertain = new SpawnCoordinator({ ...chain, async submit() { throw new Error('uncertain'); }, async reconcile() { return undefined; } }, journal, async () => { throw new Error('must not start'); });
    await assert.rejects(uncertain.spawn({ ...parent, authorityGeneration: '4' }, request), /uncertain/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('spawn retries failed launch and reconciles after journal loss without resubmitting', async () => {
  const firstDirectory = await mkdtemp(join(tmpdir(), 'act-journal-'));
  const secondDirectory = await mkdtemp(join(tmpdir(), 'act-journal-'));
  try {
    let receipt, submits = 0, launchAttempts = 0;
    const started = new Set();
    const chain = {
      async reconcile() { return receipt; },
      async submit() { submits++; receipt = { childId: 'child', txHash: 'tx', blockHash: 'block' }; },
      async confirmed() { return true; }
    };
    const launch = async (_parent, childId) => {
      launchAttempts++;
      if (launchAttempts === 1) throw new Error('container unavailable');
      started.add(childId); // trusted launcher is idempotent by child ID
    };
    const first = new SpawnCoordinator(chain, new FileSpawnJournal(firstDirectory), launch);
    await assert.rejects(first.spawn(parent, request), /container unavailable/);
    assert.equal(submits, 1);
    assert.equal(started.size, 0);
    await first.spawn(parent, request);
    assert.equal(submits, 1);
    assert.deepEqual([...started], ['child']);
    // A replacement journal starts empty; on-chain reconciliation still prevents a new allocation.
    const restarted = new SpawnCoordinator(chain, new FileSpawnJournal(secondDirectory), launch);
    await restarted.spawn(parent, request);
    assert.equal(submits, 1);
    assert.deepEqual([...started], ['child']);
  } finally {
    await rm(firstDirectory, { recursive: true, force: true });
    await rm(secondDirectory, { recursive: true, force: true });
  }
});

test('Docker command mounts only private worker files and has no network', async () => {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'act-mounts-'));
  const workerRoot = join(runtimeRoot, 'workers', 'w1');
  const workspace = join(workerRoot, 'work');
  const keyFile = join(workerRoot, 'key');
  const gatewaySocket = join(workerRoot, 'gateway.sock');
  await mkdir(workerRoot, { recursive: true, mode: 0o700 });
  await mkdir(workspace, { mode: 0o700 });
  await writeFile(keyFile, 'synthetic-only', { mode: 0o600 });
  const target = createServer((_req, res) => res.end('{}'));
  await new Promise(resolve => target.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${target.address().port}`;
  await assert.rejects(startWorkerGateway({ socket: gatewaySocket, workerRoot, uid: process.getuid(), brokerOrigin: 'http://user:pass@127.0.0.1:1', brokerToken: 'scoped', companionOrigin: origin, mcpToken: 'scoped' }), /loopback HTTP origin/);
  const gateway = await startWorkerGateway({ socket: gatewaySocket, workerRoot, uid: process.getuid(), brokerOrigin: origin, brokerToken: 'scoped', companionOrigin: origin, mcpToken: 'scoped' });
  await assert.rejects(startWorkerGateway({ socket: gatewaySocket, workerRoot, uid: process.getuid(), brokerOrigin: origin, brokerToken: 'scoped', companionOrigin: origin, mcpToken: 'scoped' }), /already active/);
  const files = { workerId: 'w1', uid: process.getuid(), gid: process.getgid(), runtimeRoot, workspace, keyFile, gatewaySocket, imageId: `sha256:${'a'.repeat(64)}`, model: 'gpt-6-sol' };
  try {
    const args = await workerDockerArgs(files);
    assert.ok(args.includes('none'));
    assert.ok(args.includes('--cap-drop=ALL'));
    assert.ok(args.includes('--security-opt=no-new-privileges'));
    assert.ok(args.includes(`--user=${files.uid}:${files.gid}`));
    assert.ok(!args.join(' ').includes('docker.sock'));
    assert.ok(!args.join(' ').includes('scoped'));
    assert.equal(args.filter(arg => arg.startsWith('type=bind')).length, 3);
    assert.ok(args.filter(arg => arg.startsWith('type=bind')).every(arg => arg.includes(workerRoot)));
    await assert.rejects(workerDockerArgs({ ...files, workspace: '/home/owner' }), /outside private root/);
    const sibling = join(runtimeRoot, 'workers', 'w2');
    await mkdir(sibling);
    await writeFile(join(sibling, 'key'), 'sibling-synthetic');
    await assert.rejects(workerDockerArgs({ ...files, keyFile: join(sibling, 'key') }), /outside private root/);
    await assert.rejects(workerDockerArgs({ ...files, uid: files.uid + 1 }), /permissions do not match/);
    const escaped = join(workerRoot, 'escaped');
    await symlink(tmpdir(), escaped);
    await assert.rejects(workerDockerArgs({ ...files, workspace: escaped }), /invalid worker mounts/);
  } finally { await gateway.close(); target.close(); await rm(runtimeRoot, { recursive: true, force: true }); }
});

test('gateway recovers a dead owner socket but refuses an active one', async () => {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'act-stale-'));
  const workerRoot = join(runtimeRoot, 'workers', 'stale');
  const socket = join(workerRoot, 'gateway.sock');
  await mkdir(workerRoot, { recursive: true, mode: 0o700 });
  const child = spawn(process.execPath, ['-e', `require('net').createServer().listen(process.argv[1], () => require('fs').chmodSync(process.argv[1], 0o600))`, socket], { stdio: 'ignore' });
  try {
    for (let i = 0; i < 50; i++) {
      try { if ((await stat(socket)).mode & 0o600) break; } catch {}
      await delay(20);
    }
    assert.ok((await stat(socket)).isSocket());
    child.kill('SIGKILL');
    await new Promise(resolve => child.once('exit', resolve));
    const config = { socket, workerRoot, uid: process.getuid(), brokerOrigin: 'http://127.0.0.1:1', brokerToken: 'broker', companionOrigin: 'http://127.0.0.1:1', mcpToken: 'mcp' };
    const gateway = await startWorkerGateway(config);
    try { await assert.rejects(startWorkerGateway(config), /already active/); }
    finally { await gateway.close(); }
  } finally { child.kill('SIGKILL'); await rm(runtimeRoot, { recursive: true, force: true }); }
});

test('launcher shares a concurrent launch and stops its one worker', async () => {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'act-launcher-'));
  const workerRoot = join(runtimeRoot, 'workers', 'launch');
  const workspace = join(workerRoot, 'workspace');
  const keyFile = join(workerRoot, 'key');
  const gatewaySocket = join(workerRoot, 'gateway.sock');
  const fakeDocker = join(runtimeRoot, 'fake-docker');
  const state = join(runtimeRoot, 'state');
  const log = join(runtimeRoot, 'log');
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  await writeFile(keyFile, 'synthetic-only', { mode: 0o600 });
  await writeFile(fakeDocker, `#!/bin/sh
case "$1" in
 inspect) test -f '${state}' && echo true ;;
 run) echo run >> '${log}'; touch '${state}'; cat >/dev/null; sleep 5 ;;
 stop) rm -f '${state}' ;;
esac
`);
  await chmod(fakeDocker, 0o755);
  const launcher = new DockerWorkerLauncher(fakeDocker);
  let revoked = 0;
  const spec = {
    files: { workerId: 'launch', uid: process.getuid(), gid: process.getgid(), runtimeRoot, workspace, keyFile, gatewaySocket, imageId: `sha256:${'a'.repeat(64)}`, model: 'gpt-6-luna' },
    gateway: { socket: gatewaySocket, workerRoot, uid: process.getuid(), brokerOrigin: 'http://127.0.0.1:1', brokerToken: 'broker', companionOrigin: 'http://127.0.0.1:1', mcpToken: 'mcp' },
    task: 'synthetic task', maxLifetimeMs: 5000, revoke: () => { revoked++; }
  };
  try {
    await Promise.all([launcher.launch(spec), launcher.launch(spec)]);
    assert.equal((await readFile(log, 'utf8')).trim(), 'run');
    await launcher.stop('launch');
    assert.equal(revoked, 1);
  } finally { await launcher.close(); await rm(runtimeRoot, { recursive: true, force: true }); }
});

test('broker forwards only allowed model and path with host-only upstream key and call limit', async () => {
  let seen;
  const upstream = createServer(async (req, res) => {
    seen = { path: req.url, auth: req.headers.authorization, body: JSON.parse(await new Promise(resolve => { let s = ''; req.on('data', c => s += c); req.on('end', () => resolve(s)); })) };
    res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}');
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const broker = new InferenceBroker({ upstream: `http://127.0.0.1:${upstream.address().port}/v1`, upstreamKey: 'synthetic-host-secret', maxBodyBytes: 1024 });
  const server = broker.server();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const endpoint = `http://127.0.0.1:${server.address().port}/v1/responses`;
    const token = broker.issue('fixed-model', 10000, 1);
    const call = (url, model) => fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ model, input: 'hello' }) });
    assert.equal((await call(endpoint.replace('responses', 'chat/completions'), 'fixed-model')).status, 404);
    assert.equal((await call(endpoint, 'fixed-model')).status, 200);
    assert.equal(seen.path, '/v1/responses'); assert.equal(seen.auth, 'Bearer synthetic-host-secret');
    assert.equal((await call(endpoint, 'fixed-model')).status, 401);
    const second = broker.issue('fixed-model', 10000, 1);
    assert.equal((await fetch(endpoint, { method: 'POST', headers: { authorization: `Bearer ${second}` }, body: JSON.stringify({ model: 'wrong' }) })).status, 403);
  } finally { server.close(); upstream.close(); }
});

test('broker rejects malformed, oversized and revoked slow requests before upstream', async () => {
  let forwarded = 0;
  const upstream = createServer((_req, res) => { forwarded++; res.end('{}'); });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const broker = new InferenceBroker({ upstream: `http://127.0.0.1:${upstream.address().port}/v1`, upstreamKey: 'synthetic-secret', maxBodyBytes: 40 });
  const server = broker.server();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/v1/responses`;
  try {
    const post = (token, body) => fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body });
    assert.equal((await post(broker.issue('fixed-model', 10000, 1), '{')).status, 400);
    assert.equal((await post(broker.issue('fixed-model', 10000, 1), 'x'.repeat(41))).status, 413);
    const token = broker.issue('fixed-model', 10000, 1);
    const response = new Promise((resolve, reject) => {
      const req = httpRequest(url, { method: 'POST', headers: { authorization: `Bearer ${token}` } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      req.on('error', reject);
      req.write('{"model":');
      void delay(20).then(() => { broker.revoke(token); req.end('"fixed-model"}'); });
    });
    assert.equal(await response, 401);
    assert.equal(forwarded, 0);
  } finally { server.close(); upstream.close(); }
});

test('broker does not follow upstream redirects with its credential', async () => {
  let redirected = 0;
  const target = createServer((_req, res) => { redirected++; res.end(); });
  await new Promise(resolve => target.listen(0, '127.0.0.1', resolve));
  const upstream = createServer((_req, res) => { res.writeHead(302, { location: `http://127.0.0.1:${target.address().port}/stolen` }); res.end(); });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const broker = new InferenceBroker({ upstream: `http://127.0.0.1:${upstream.address().port}/v1`, upstreamKey: 'synthetic-secret', maxBodyBytes: 1024 });
  const server = broker.server();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/responses`, { method: 'POST', headers: { authorization: `Bearer ${broker.issue('fixed-model', 10000, 1)}` }, body: JSON.stringify({ model: 'fixed-model' }) });
    assert.equal(response.status, 502);
    assert.equal(redirected, 0);
  } finally { server.close(); upstream.close(); target.close(); }
});
