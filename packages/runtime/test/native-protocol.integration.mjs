// Deterministic local Responses fixture, real pinned Codex and Docker. No inference account is used.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { NativeCodexLauncher, WorkerSessions, companionServer, validateNativeCodexHome } from '../dist/index.js';

const binary = process.env.ACT_CODEX_BINARY;
const imageId = process.env.ACT_WORKER_IMAGE_ID;
assert.ok(isAbsolute(binary ?? ''), 'set ACT_CODEX_BINARY to pinned native Linux Codex');
assert.match(imageId ?? '', /^sha256:[a-f0-9]{64}$/);
const root = await mkdtemp(join(tmpdir(), 'act-native-protocol-'));
const home = join(root, 'login');
const workerId = `fixture-${process.pid}`;
const workspace = join(root, 'workers', workerId, 'workspace');
await mkdir(home, { mode: 0o700 });
await mkdir(workspace, { recursive: true, mode: 0o700 });
const sentinel = join(root, 'host-only.txt');
await writeFile(sentinel, 'HOST_ONLY_CANARY');
let requests = 0, calls = 0, fixtureError, hang = false;
const inventory = new Set();
const fixture = createServer(async (req, res) => {
  try {
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/v1/responses');
    let body = '';
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body);
    for (const tool of request.tools ?? []) inventory.add(tool.name ?? tool.type);
    assert.ok(inventory.has('exec_command'));
    for (const banned of ['web_search', 'image_generation', 'browser', 'computer', 'spawn_agent']) {
      assert.ok(![...inventory].some(name => name.includes(banned)), `unexpected host tool: ${banned}`);
    }
    const outputs = (request.input ?? []).filter(item => item.type === 'function_call_output' || item.type === 'custom_tool_call_output').map(item => item.output);
    let output;
    const step = requests++;

    if (hang) output = [{ type: 'function_call', id: 'fc_wait', call_id: 'call_wait', name: 'exec_command',
      arguments: JSON.stringify({ cmd: 'sleep 30', yield_time_ms: 10000, max_output_tokens: 1000 }), status: 'completed' }];
    else if (step === 0) output = [{ type: 'function_call', id: 'fc_shell', call_id: 'call_shell', name: 'exec_command',
      arguments: JSON.stringify({ cmd: `test ! -e '${sentinel}' && test "$(wc -l < /proc/net/route)" -eq 1 && pwd > /workspace/fixture-proof.txt && echo ISOLATED`, yield_time_ms: 1000, max_output_tokens: 1000 }), status: 'completed' }];
    else if (step === 1) {
      assert.match(JSON.stringify(outputs), /ISOLATED/);
      assert.ok(inventory.has('apply_patch'));
      output = [{ type: 'custom_tool_call', id: 'ctc_patch', call_id: 'call_patch', name: 'apply_patch',
        input: `*** Begin Patch\n*** Add File: /workspace/patch-proof.txt\n+REMOTE_PATCH\n*** Add File: ${root}/must-not-exist-on-host.txt\n+CONTAINER_ONLY\n*** End Patch`, status: 'completed' }];
    } else if (step === 2) {
      assert.match(JSON.stringify(outputs), /Success/);
      output = [{ type: 'function_call', id: 'fc_finance', call_id: 'call_finance', namespace: 'capitalTree', name: 'getPaymentServices', arguments: '{}', status: 'completed' }];
    } else {
      assert.match(JSON.stringify(outputs), /scoped-fixture/);
      output = [{ type: 'message', id: 'msg_done', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text: 'Fixture complete.' }] }];
    }
    const response = { id: `resp_${step}`, object: 'response', created_at: Math.floor(Date.now() / 1000), model: 'gpt-5.4', output, status: 'completed', usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } };
    const events = output.flatMap((item, output_index) => [{ type: 'response.output_item.added', output_index, item }, { type: 'response.output_item.done', output_index, item }]);
    events.push({ type: 'response.completed', response });
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(events.map((event, i) => `event: ${event.type}\ndata: ${JSON.stringify({ ...event, sequence_number: i + 1 })}\n\n`).join(''));
  } catch (error) { fixtureError = error; res.writeHead(500); res.end(); }
});
await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
const wrapper = join(root, 'fixture-codex');
const provider = `model_providers.fixture={name="Local protocol fixture",base_url="http://127.0.0.1:${fixture.address().port}/v1",wire_api="responses",requires_openai_auth=false,supports_websockets=false}`;
// The test-only executable overrides the native endpoint. Production has no fixture/provider override.
await writeFile(wrapper, `#!${process.execPath}
const {spawn}=require('node:child_process');
const p=spawn(${JSON.stringify(binary)},[...process.argv.slice(2),'-c','model_provider="fixture"','-c',${JSON.stringify(provider)}],{stdio:['pipe','pipe',require('node:fs').openSync(${JSON.stringify(join(root, 'fixture-stderr'))},'a')],env:process.env});
process.stdin.pipe(p.stdin);
require('node:readline').createInterface({input:p.stdout}).on('line',line=>{
 const m=JSON.parse(line);
 // Test-only metadata shim: the real execution environment and tool protocol remain unchanged.
 if(m.result?.thread){m.result.thread.modelProvider='openai';m.result.modelProvider='openai';}
 process.stdout.write(JSON.stringify(m)+'\\n');
});
p.on('exit',code=>process.exit(code??1));
process.on('SIGTERM',()=>p.kill('SIGTERM'));
`, { mode: 0o700 });
const sessions = new WorkerSessions();
const token = sessions.issue({ workerId, rootId: '1', nodeId: '1', authorityGeneration: '1' }, Date.now() + 60_000);
const tools = companionServer(sessions, { getPaymentServices: async context => {
  assert.equal(context.workerId, workerId); calls++; return { services: [], marker: 'scoped-fixture' };
} });
await new Promise(resolve => tools.listen(0, '127.0.0.1', resolve));
const launcher = new NativeCodexLauncher({ codexBinary: wrapper, codexHome: home });
let done;
const exited = new Promise(resolve => { done = resolve; });
let revoked = 0;
try {
  const spec = { files: { workerId, uid: process.getuid(), gid: process.getgid(), runtimeRoot: root,
    workspace, keyFile: join(root, 'never-mounted-key'), gatewaySocket: join(root, 'never-mounted.sock'), imageId, model: 'gpt-5.4' },
    companionOrigin: `http://127.0.0.1:${tools.address().port}`, mcpToken: token,
    task: 'Run the deterministic isolation fixture.', maxLifetimeMs: 45_000,
    revoke: () => { revoked++; sessions.revoke(token); }, onExit: done };
  await launcher.launch(spec);
  const result = await exited;
  if (fixtureError) throw fixtureError;
  assert.equal(result.code, 0);
  assert.equal(calls, 1);
  assert.equal(await readFile(join(workspace, 'fixture-proof.txt'), 'utf8'), '/workspace\n');
  await launcher.close();
  assert.equal(await readFile(join(workspace, 'patch-proof.txt'), 'utf8'), 'REMOTE_PATCH\n');
  await assert.rejects(readFile(join(root, 'must-not-exist-on-host.txt')), { code: 'ENOENT' });
  assert.ok(revoked >= 1);
  await validateNativeCodexHome(home);
  await validateNativeCodexHome(home);
  assert.deepEqual([...inventory].sort(), ['exec_command', 'write_stdin', 'request_user_input', 'apply_patch', 'skills', 'capitalTree'].sort());
  hang = true;
  let timedOut;
  const expiry = new Promise(resolve => { timedOut = resolve; });
  await launcher.launch({ ...spec, maxLifetimeMs: 10000, onExit: timedOut });
  assert.equal((await expiry).code, 1);
  await launcher.close();
  assert.equal(revoked, 2);
  assert.equal(calls, 1);


  console.log(JSON.stringify({ passed: true, toolInventory: [...inventory], scopedCalls: calls, expiryRevoked: true, realInference: false }));
} catch (error) {
  console.error(await readFile(join(root, 'fixture-stderr'), 'utf8').catch(() => 'fixture startup failed'));
  throw error;
} finally {
  await launcher.close();
  await Promise.all([new Promise(resolve => tools.close(resolve)), new Promise(resolve => fixture.close(resolve))]);
  await rm(root, { recursive: true, force: true });
}
