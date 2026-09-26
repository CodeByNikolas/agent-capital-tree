import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { lstat, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { InferenceBroker, WorkerSessions, companionServer, startWorkerGateway, workerDockerArgs } from '../dist/index.js';

const privateFile = async path => {
  if (!isAbsolute(path ?? '')) throw new Error('private file path must be absolute');
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o600) {
    throw new Error('private file must belong to this user and have mode 0600');
  }
  return readFile(path, 'utf8');
};

const configPath = process.env.ACT_RUNTIME_CONFIG;
const config = JSON.parse(await privateFile(configPath));
if (!config.providerTokenFile || config.upstream !== 'http://100.91.160.81:8317/v1') {
  throw new Error('acceptance requires providerTokenFile and the HomeBox CLIProxyAPI endpoint');
}
const imageId = process.env.ACT_WORKER_IMAGE_ID;
if (!/^sha256:[a-f0-9]{64}$/.test(imageId ?? '')) throw new Error('set ACT_WORKER_IMAGE_ID');
const upstreamKey = (await privateFile(config.providerTokenFile)).trim();
const broker = new InferenceBroker({ upstream: config.upstream, upstreamKey, maxBodyBytes: 1_000_000 });
const brokerServer = broker.server();
const sessions = new WorkerSessions();
let toolCalls = 0;
const companion = companionServer(sessions, { getTree: async () => { toolCalls++; return { synthetic: 'ACT_TOOL_OK' }; } });
const root = await mkdtemp(join(tmpdir(), 'act-model-test-'));
const workerRoot = join(root, 'workers', 'model');
const workspace = join(workerRoot, 'workspace');
const keyFile = join(workerRoot, 'key');
const gatewaySocket = join(workerRoot, 'gateway.sock');
await mkdir(workspace, { recursive: true, mode: 0o700 });
await writeFile(keyFile, 'synthetic-only', { mode: 0o600 });
let gateway;
try {
  await Promise.all([new Promise(r => brokerServer.listen(0, '127.0.0.1', r)), new Promise(r => companion.listen(0, '127.0.0.1', r))]);
  const brokerToken = broker.issue('gpt-6-luna', 600_000, 20);
  const mcpToken = sessions.issue({ workerId: 'model', rootId: '1', nodeId: '1', authorityGeneration: '1' }, Date.now() + 600_000);
  gateway = await startWorkerGateway({ socket: gatewaySocket, workerRoot, uid: process.getuid(), brokerOrigin: `http://127.0.0.1:${brokerServer.address().port}`, brokerToken, companionOrigin: `http://127.0.0.1:${companion.address().port}`, mcpToken });
  const args = await workerDockerArgs({ workerId: 'model', uid: process.getuid(), gid: process.getgid(), runtimeRoot: root, workspace, keyFile, gatewaySocket, imageId, model: 'gpt-6-luna' });
  const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.end('Call the agent-capital-tree getTree tool with rootId "1". Then reply ACT_MODEL_OK only if the tool returns ACT_TOOL_OK.');
  const marker = 'ACT_MODEL_OK';
  let markerSeen = false, overlap = '';
  child.stdout.on('data', x => {
    const value = overlap + x.toString();
    if (value.includes(marker)) markerSeen = true;
    overlap = value.slice(-(marker.length - 1));
  });
  child.stderr.on('data', () => {});
  const timer = setTimeout(() => child.kill('SIGTERM'), 180_000);
  const code = await new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); });
  clearTimeout(timer);
  console.log(JSON.stringify({ code, toolCalls, modelMarkerSeen: markerSeen }));
  assert.equal(code, 0, 'isolated model worker did not exit successfully');
  assert.ok(toolCalls > 0, 'isolated model worker did not call the scoped MCP read');
  assert.ok(markerSeen, 'isolated model worker did not report the expected completion marker');
} finally {
  if (gateway) await gateway.close();
  await Promise.all([new Promise(r => brokerServer.close(r)), new Promise(r => companion.close(r))]);
  await rm(root, { recursive: true, force: true });
}
