import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { startWorkerGateway, workerDockerArgs } from '../dist/index.js';

const run = promisify(execFile);
const imageId = process.env.ACT_WORKER_IMAGE_ID;
if (!/^sha256:[a-f0-9]{64}$/.test(imageId ?? '')) throw new Error('set ACT_WORKER_IMAGE_ID to built image ID');
const root = await mkdtemp(join(tmpdir(), 'act-live-workers-'));
const seen = [];
const host = createHttpServer((req, res) => {
  seen.push({ path: req.url, auth: req.headers.authorization });
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ auth: req.headers.authorization }));
});
await new Promise(resolve => host.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${host.address().port}`;
const gateways = [];
try {
  for (const id of ['one', 'two']) {
    const workerRoot = join(root, 'workers', id);
    const workspace = join(workerRoot, 'workspace');
    const keyFile = join(workerRoot, 'key');
    const gatewaySocket = join(workerRoot, 'gateway.sock');
    await mkdir(workspace, { recursive: true, mode: 0o700 });
    await writeFile(keyFile, `synthetic-${id}`, { mode: 0o600 });
    const gateway = await startWorkerGateway({ socket: gatewaySocket, workerRoot, uid: process.getuid(), brokerOrigin: origin, brokerToken: `broker-${id}`, companionOrigin: origin, mcpToken: `mcp-${id}` });
    gateways.push(gateway);
    const args = await workerDockerArgs({ workerId: id, uid: process.getuid(), gid: process.getgid(), workspace, keyFile, gatewaySocket, runtimeRoot: root, imageId, model: 'gpt-6-luna' });
    const check = `const fs=require('fs'),net=require('net'),http=require('http');const id=${JSON.stringify(id)};if(fs.readFileSync('/run/worker/key','utf8')!=='synthetic-'+id)process.exit(10);for(const p of ['/var/run/docker.sock','/home/worker/.codex/auth.json','/run/worker/sibling','/home/owner/key'])if(fs.existsSync(p))process.exit(11);const s=net.connect(80,'1.1.1.1');s.on('connect',()=>process.exit(12));s.on('error',()=>{http.request({socketPath:'/run/worker/gateway.sock',path:'/v1/tools/getTree',method:'POST'},r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>{if(JSON.parse(b).auth!=='Bearer mcp-'+id)process.exit(13);console.log('OK '+id);});}).end('{}')});`;
    const command = args.slice(0, -3).concat(['node', '-e', check]);
    const result = await run('docker', command, { timeout: 30_000 });
    assert.match(result.stdout, new RegExp(`OK ${id}`));
  }
  assert.deepEqual(seen.map(x => x.auth), ['Bearer mcp-one', 'Bearer mcp-two']);
  console.log('two isolated live workers passed');
} finally {
  await Promise.all(gateways.map(g => g.close()));
  await new Promise(resolve => host.close(resolve));
  await rm(root, { recursive: true, force: true });
}
