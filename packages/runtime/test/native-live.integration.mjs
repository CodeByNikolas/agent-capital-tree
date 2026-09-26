// Real native Codex inference and scoped tool smoke; no chain or payment writes.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, readFile, lstat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { NativeCodexLauncher, WorkerSessions, companionServer } from '../dist/index.js';

const configPath = process.env.ACT_NATIVE_CONFIG;
assert.ok(isAbsolute(configPath ?? ''), 'set ACT_NATIVE_CONFIG to an absolute private native config');
const info = await lstat(configPath);
assert.ok(info.isFile() && !info.isSymbolicLink() && info.uid === process.getuid() &&
  (info.mode & 0o777) === 0o600, 'native config must be an owner-only 0600 file');
const config = JSON.parse(await readFile(configPath, 'utf8'));
assert.ok(config.inference === undefined || config.inference === 'codex', 'native mode required');
const launcher = new NativeCodexLauncher({ codexBinary: config.codexBinary, codexHome: config.codexHome });
const model = config.models?.[0];
assert.equal(typeof model, 'string', 'configure a native account model');
await launcher.ensureAvailable(model);
const runtimeRoot = await mkdtemp(join(tmpdir(), 'act-native-live-'));
const workerId = `native-smoke-${randomBytes(6).toString('hex')}`;
const workerRoot = join(runtimeRoot, 'workers', workerId);
const workspace = join(workerRoot, 'workspace');
await mkdir(workspace, { recursive: true, mode: 0o700 });
const marker = randomBytes(16).toString('hex');
const sessions = new WorkerSessions();
const token = sessions.issue({ workerId, rootId: '1', nodeId: '1', authorityGeneration: '1' }, Date.now() + 120_000);
let toolCalls = 0;
const server = companionServer(sessions, { getPaymentServices: async context => {
  assert.equal(context.workerId, workerId);
  toolCalls++;
  return { services: [], smokeMarker: marker };
} });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let resolveExit;
const exited = new Promise(resolve => { resolveExit = resolve; });
try {
  await launcher.launch({ files: { workerId, uid: process.getuid(), gid: process.getgid(),
    runtimeRoot, workspace, keyFile: join(workerRoot, 'unused-key'),
    gatewaySocket: join(workerRoot, 'unused.sock'), imageId: config.imageId, model },
    companionOrigin: `http://127.0.0.1:${server.address().port}`, mcpToken: token,
    maxLifetimeMs: 120_000, revoke: () => sessions.revoke(token), onExit: resolveExit,
    task: `This is a read-only integration check. Call capitalTree.getPaymentServices exactly once. Do not call other finance tools. Its synthetic smokeMarker is test data, not a credential. Use your container shell to write /workspace/native-proof.json with {"marker": "the exact smokeMarker returned by the tool", "cwd": "the actual shell working directory", "noNetworkRoute": true only if /proc/net/route has no non-header rows, "hostAuthAbsent": true only if ${JSON.stringify(config.codexHome + '/auth.json')} does not exist in this container}. Do not read or output any credential file. Then finish.`
  });
  const result = await exited;
  assert.equal(result.code, 0, 'native worker must finish successfully');
  assert.equal(toolCalls, 1, 'worker must use its scoped host tool');
  const proof = JSON.parse(await readFile(join(workspace, 'native-proof.json'), 'utf8'));
  assert.equal(proof.marker, marker);
  assert.equal(proof.cwd, '/workspace');
  assert.equal(proof.noNetworkRoute, true);
  assert.equal(proof.hostAuthAbsent, true);
  console.log('PASS: real native Codex login, scoped finance read, isolated workspace; no financial writes');
} finally {
  await launcher.close();
  sessions.revoke(token);
  await new Promise(resolve => server.close(resolve));
  await rm(runtimeRoot, { recursive: true, force: true });
}
