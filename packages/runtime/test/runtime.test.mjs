import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkerSessions, authorizedWorkerCall, SpawnCoordinator, FileSpawnJournal, workerDockerArgs, InferenceBroker } from '../dist/index.js';

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

test('Docker command has fixed isolation flags and rejects escaped mounts', async () => {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'act-mounts-'));
  const workerRoot = join(runtimeRoot, 'workers', 'w1');
  const workspace = join(workerRoot, 'work');
  const keyFile = join(workerRoot, 'key');
  await mkdir(workerRoot, { recursive: true });
  await mkdir(workspace);
  await writeFile(keyFile, 'synthetic-only', { mode: 0o600 });
  const files = { workerId: 'w1', runtimeRoot, workspace, keyFile, image: `worker@sha256:${'a'.repeat(64)}`, model: 'gpt-6-sol', brokerUrl: 'http://broker:7000/v1', brokerToken: 'limited', mcpToken: 'local' };
  try {
  const args = await workerDockerArgs(files);
  assert.deepEqual(args.slice(0, 4), ['run', '--rm', '-i', '--read-only']);
  assert.ok(args.includes('--cap-drop=ALL'));
  assert.ok(args.includes('--security-opt=no-new-privileges'));
  assert.ok(args.includes('codex'));
  assert.ok(args.includes('--json'));
  assert.ok(!args.join(' ').includes('docker.sock'));
  assert.ok(args.filter(arg => arg.startsWith('type=bind')).every(arg => arg.includes(workerRoot)));
  await assert.rejects(workerDockerArgs({ ...files, workspace: '/home/owner' }), /outside private root/);
  const sibling = join(runtimeRoot, 'workers', 'w2');
  await mkdir(sibling);
  await writeFile(join(sibling, 'key'), 'sibling-synthetic');
  await assert.rejects(workerDockerArgs({ ...files, keyFile: join(sibling, 'key') }), /outside private root/);
  const escaped = join(workerRoot, 'escaped');
  await symlink(tmpdir(), escaped);
  await assert.rejects(workerDockerArgs({ ...files, workspace: escaped }), /invalid worker mounts/);
  } finally { await rm(runtimeRoot, { recursive: true, force: true }); }
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
