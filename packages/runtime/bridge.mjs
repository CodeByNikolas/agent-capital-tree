import { createServer, request } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

const model = process.argv[2];
const reasoningEffort = model === 'gpt-6-luna' ? 'max' : model === 'gpt-6-sol' ? 'medium' : undefined;
if (!reasoningEffort) throw new Error('unsupported worker model');
const socketPath = '/run/worker/gateway.sock';
const proxy = createServer((incoming, outgoing) => {
  if (incoming.method !== 'POST' || !(/^\/v1\/responses$|^\/v1\/tools\/[A-Za-z]+$/.test(incoming.url ?? ''))) {
    outgoing.writeHead(404); outgoing.end(); return;
  }
  const upstream = request({ socketPath, path: incoming.url, method: 'POST', headers: { 'content-type': 'application/json' } }, response => {
    outgoing.writeHead(response.statusCode ?? 502, { 'content-type': response.headers['content-type'] ?? 'application/json' });
    response.pipe(outgoing);
  });
  upstream.on('error', () => { outgoing.writeHead(502); outgoing.end(); });
  incoming.pipe(upstream);
});
await new Promise((ok, fail) => { proxy.once('error', fail); proxy.listen(8787, '127.0.0.1', ok); });
const codexHome = '/home/worker/.codex';
await mkdir(codexHome, { recursive: true, mode: 0o700 });
await writeFile(`${codexHome}/config.toml`, `model = "${model}"
model_reasoning_effort = "${reasoningEffort}"
model_provider = "act_broker"
approval_policy = "never"
sandbox_mode = "danger-full-access"
[model_providers.act_broker]
name = "ACT Broker"
base_url = "http://127.0.0.1:8787/v1"
env_key = "ACT_INFERENCE_TOKEN"
wire_api = "responses"
[ mcp_servers.kanoki ]
command = "node"
args = ["/opt/act/plugin-server.mjs"]
tool_timeout_sec = 300
[ mcp_servers.kanoki.env ]
ACT_RUNTIME_URL = "http://127.0.0.1:8787"
ACT_MCP_TOKEN = "worker-local"
`, { mode: 0o600 });
const codex = spawn('/opt/act/codex', ['exec', '--json', '--ephemeral', '-C', '/workspace', '--skip-git-repo-check', '-m', model, '-'], {
  stdio: 'inherit', env: process.env
});
codex.once('exit', (code, signal) => { proxy.close(); process.exitCode = signal ? 128 : (code ?? 1); });
codex.once('error', () => { proxy.close(); process.exitCode = 1; });
