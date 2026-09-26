import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { lstat, realpath, stat, readFile, readdir } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { createInterface } from 'node:readline';
import { isAbsolute, resolve, sep } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { z } from 'zod';
import { toolSpecs, type ToolName } from '@agent-capital-tree/plugin/tools';
import { workerContainerName, type WorkerFiles } from './container.js';
import type { WorkerLaunch } from './launcher.js';

const VERSION = 'codex-cli 0.154.0';
const RPC_TIMEOUT_MS = 20_000;
const MAX_MESSAGE_BYTES = 16 * 1024 * 1024;

export type NativeWorkerLaunch = Omit<WorkerLaunch, 'gateway'> & Readonly<{
  companionOrigin: string;
  mcpToken: string;
}>;

type RpcMessage = { id?: number; method?: string; params?: any; result?: any; error?: { message: string } };
type Active = { stop: () => Promise<void> };

function localOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('companion origin must be loopback HTTP');
  }
  return url.origin;
}

export async function forwardScopedTool(origin: string, token: string, name: string, rawArgs: unknown):
  Promise<{ contentItems: { type: 'inputText'; text: string }[]; success: true }> {
  const target = localOrigin(origin);
  if (!token || !Object.hasOwn(toolSpecs, name)) throw new Error('scoped tool is unavailable');
  const spec = toolSpecs[name as ToolName];
  const args = spec.schema.parse(rawArgs);
  const response = await fetch(`${target}/v1/tools/${name}`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(args), redirect: 'error',
    signal: AbortSignal.timeout(spec.readOnly ? 30_000 : 300_000)
  });
  if (!response.ok) throw new Error('scoped tool rejected');
  const text = await response.text();
  if (Buffer.byteLength(text) > 1_000_000) throw new Error('scoped tool response too large');
  return { contentItems: [{ type: 'inputText', text }], success: true };
}

export async function nativeDockerArgs(files: WorkerFiles): Promise<string[]> {
  const name = workerContainerName(files.workerId);
  if (!Number.isSafeInteger(files.uid) || files.uid < 1 ||
      !Number.isSafeInteger(files.gid) || files.gid < 1 ||
      !/^sha256:[a-f0-9]{64}$/.test(files.imageId)) throw new Error('invalid native worker image or user');
  const rootPath = resolve(files.runtimeRoot, 'workers', files.workerId);
  if (!isAbsolute(files.workspace) || !resolve(files.workspace).startsWith(rootPath + sep)) {
    throw new Error('workspace outside private worker root');
  }
  const [root, workspace, rootInfo, workspaceInfo] = await Promise.all([
    realpath(rootPath), realpath(files.workspace), stat(rootPath), lstat(files.workspace)
  ]);
  if (!workspace.startsWith(root + sep) || !workspaceInfo.isDirectory() ||
      workspaceInfo.isSymbolicLink() || rootInfo.uid !== files.uid ||
      workspaceInfo.uid !== files.uid || (rootInfo.mode & 0o777) !== 0o700 ||
      (workspaceInfo.mode & 0o777) !== 0o700 || /[,\r\n]/.test(files.workspace)) {
    throw new Error('invalid native worker workspace');
  }
  return [
    'run', '--name', name, '--rm', '-i', '--read-only', '--network', 'none',
    '--cap-drop=ALL', '--security-opt=no-new-privileges', '--pids-limit=128',
    '--memory=1g', '--cpus=1', `--user=${files.uid}:${files.gid}`, '--stop-timeout=5',
    '--tmpfs=/tmp:rw,nosuid,nodev,size=64m,mode=1777',
    `--tmpfs=/home/worker:rw,nosuid,nodev,size=64m,uid=${files.uid},gid=${files.gid},mode=0700`,
    '--mount', `type=bind,src=${workspace},dst=/workspace`,
    '--env', 'HOME=/home/worker', '--env', 'CODEX_HOME=/home/worker',
    '--workdir', '/workspace', '--entrypoint', '/opt/act/codex',
    files.imageId, 'exec-server', '--listen', 'stdio'
  ];
}

/** Permit only the pinned CLI's own generated workspace trust and bundled system skills. */
export async function validateNativeCodexHome(home: string): Promise<void> {
  if (!isAbsolute(home)) throw new Error('Codex home must be absolute');
  const info = await lstat(home);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() ||
      (info.mode & 0o777) !== 0o700) throw new Error('Codex login directory is not private');
  for (const name of ['config.toml', 'AGENTS.md', 'hooks.json', 'plugins', 'skills']) {
    const path = resolve(home, name);
    const entry = await lstat(path).catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    });
    if (!entry) continue;
    if (entry.isSymbolicLink() || entry.uid !== process.getuid?.()) throw new Error('unsafe Codex profile entry');
    if (name === 'config.toml' && entry.isFile()) {
      const config = (await readFile(path, 'utf8')).trim();
      if (!config || /^\[projects\."\/workspace"\]\s+trust_level\s*=\s*"trusted"$/.test(config)) continue;
    }
    if (name === 'skills' && entry.isDirectory()) {
      const names = await readdir(path);
      if (!names.length) continue;
      if (names.length === 1 && names[0] === '.system') {
        const system = await lstat(resolve(path, '.system'));
        if (system.isDirectory() && !system.isSymbolicLink() && system.uid === process.getuid?.()) continue;
      }
    }
    throw new Error(`dedicated Codex login contains unsupported configuration: ${name}`);
  }
}

class AppSession {
  readonly process: ChildProcessWithoutNullStreams;
  #nextId = 1;
  #pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  onNotification?: (message: RpcMessage) => void;
  onRequest?: (message: RpcMessage) => void;
  onExit?: (code: number | null, signal: NodeJS.Signals | null) => void;

  constructor(binary: string, home: string) {
    this.process = spawn(binary, [
      'app-server', '--listen', 'stdio://', '--strict-config',
      '-c', 'model_provider="openai"',
      '-c', 'cli_auth_credentials_store="file"',
      '-c', 'web_search="disabled"',
      '-c', 'features.apps=false',
      '-c', 'features.plugins=false',
      '-c', 'features.hooks=false',
      '-c', 'features.multi_agent=false',
      '-c', 'features.remote_plugin=false',
      '-c', 'features.code_mode.enabled=false',
      '-c', 'features.skip_host_skill_discovery=true',
      '-c', 'features.view_image=false',
      '-c', 'features.browser_use=false',
      '-c', 'features.browser_use_external=false',
      '-c', 'features.browser_use_full_cdp_access=false',
      '-c', 'features.computer_use=false',
      '-c', 'features.image_generation=false',
      '-c', 'features.in_app_browser=false',
      '-c', 'features.skill_search=false',
      '-c', 'features.skill_mcp_dependency_install=false'
    ], { env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: home, CODEX_HOME: home },
      cwd: home, stdio: ['pipe', 'pipe', 'pipe'] });
    createInterface({ input: this.process.stdout }).on('line', line => {
      let message: RpcMessage;
      try { message = JSON.parse(line); } catch { return; }
      if (typeof message.id === 'number' && message.method) {
        if (this.onRequest) this.onRequest(message);
        else this.respond(message.id, null, 'request unavailable in worker');
      }
      else if (typeof message.id === 'number') {
        const pending = this.#pending.get(message.id);
        if (!pending) return;
        this.#pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      } else if (message.method) this.onNotification?.(message);
    });
    this.process.once('error', error => this.#fail(error));
    this.process.once('exit', (code, signal) => {
      this.#fail(new Error('Codex app-server exited'));
      this.onExit?.(code, signal);
    });
    // Do not copy app-server stderr into runtime logs: it may contain private paths or tokens.
    this.process.stderr.resume();
  }

  #fail(error: Error): void {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
  }

  request(method: string, params: unknown): Promise<any> {
    if (!this.process.stdin.writable) return Promise.reject(new Error('Codex app-server is unavailable'));
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Codex ${method} timed out`));
      }, RPC_TIMEOUT_MS);
      this.#pending.set(id, { resolve, reject, timer });
      this.process.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
  }

  respond(id: number, result: unknown, error?: string): void {
    if (!this.process.stdin.writable) return;
    this.process.stdin.write(JSON.stringify(error
      ? { id, error: { code: -32601, message: error } } : { id, result }) + '\n');
  }

  async initialize(): Promise<void> {
    await this.request('initialize', {
      clientInfo: { name: 'agent_capital_tree', title: 'Agent Capital Tree', version: '0.1.0' },
      capabilities: { experimentalApi: true }
    });
    this.process.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
  }

  close(): void { this.process.kill('SIGTERM'); }
}

async function run(binary: string, args: string[]): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    child.stdout.on('data', chunk => { if (output.length < 4096) output += String(chunk); });
    child.once('error', reject);
    child.once('exit', code => resolve({ code: code ?? 1, output }));
  });
}

/** Host Codex keeps ChatGPT auth; Docker only executes its selected environment tools. */
export class NativeCodexLauncher {
  #active = new Map<string, Active>();
  #starting = new Map<string, Promise<void>>();
  constructor(private readonly options: { codexBinary: string; codexHome: string; docker?: string }) {}

  async ensureAvailable(model?: string): Promise<void> {
    const { codexBinary, codexHome } = this.options;
    if (!isAbsolute(codexBinary) || !isAbsolute(codexHome)) throw new Error('Codex paths must be absolute');
    const [home, auth, version, docker] = await Promise.all([
      lstat(codexHome), lstat(resolve(codexHome, 'auth.json')),
      run(codexBinary, ['--version']), run(this.options.docker ?? 'docker', ['info', '--format', '{{.ServerVersion}}'])
    ]);
    if (!home.isDirectory() || home.isSymbolicLink() || home.uid !== process.getuid?.() ||
        (home.mode & 0o777) !== 0o700 || !auth.isFile() || auth.isSymbolicLink() ||
        auth.uid !== process.getuid?.() || (auth.mode & 0o777) !== 0o600) {
      throw new Error('Codex login directory is not private');
    }
    await validateNativeCodexHome(codexHome);
    if (version.code !== 0 || version.output.trim() !== VERSION || docker.code !== 0) {
      throw new Error('pinned Codex or Docker is unavailable');
    }
    const app = new AppSession(codexBinary, codexHome);
    try {
      await app.initialize();
      const account = await app.request('account/read', { refreshToken: true });
      if (account?.account?.type !== 'chatgpt') throw new Error('normal Codex ChatGPT login is unavailable');
      if (model) {
        let cursor: string | null = null;
        let found = false;
        for (let page = 0; page < 20; page++) {
          const list = await app.request('model/list', { includeHidden: false, cursor });
          if (!Array.isArray(list?.data)) throw new Error('Codex model catalog is unavailable');
          if (list.data.some((entry: any) => entry?.model === model || entry?.id === model)) found = true;
          cursor = list.nextCursor ?? null;
          if (found || !cursor) break;
        }
        if (!found) throw new Error(`Codex model is unavailable: ${model}`);
      }
    } finally { app.close(); }
  }

  launch(spec: NativeWorkerLaunch): Promise<void> {
    const id = spec.files.workerId;
    const existing = this.#starting.get(id);
    if (existing) return existing;
    const work = this.#launch(spec).finally(() => this.#starting.delete(id));
    this.#starting.set(id, work);
    return work;
  }

  async #launch(spec: NativeWorkerLaunch): Promise<void> {
    const id = spec.files.workerId;
    if (this.#active.has(id)) return;
    if (!spec.task || Buffer.byteLength(spec.task) > 65_536 ||
        !Number.isSafeInteger(spec.maxLifetimeMs) || spec.maxLifetimeMs < 1_000 ||
        spec.maxLifetimeMs > 86_400_000) throw new Error('invalid native worker task or lifetime');
    await validateNativeCodexHome(this.options.codexHome);
    const origin = localOrigin(spec.companionOrigin);
    if (!spec.mcpToken) throw new Error('missing scoped tool token');
    const dockerArgs = await nativeDockerArgs(spec.files);
    const name = workerContainerName(id);
    const docker = this.options.docker ?? 'docker';
    if ((await run(docker, ['inspect', '-f', '{{.Id}}', name])).code === 0) {
      const stopped = await run(docker, ['stop', '--time', '5', name]);
      if (stopped.code !== 0) throw new Error('failed to stop orphan native worker');
    }
    const secretPath = `/executor/${randomBytes(32).toString('hex')}`;
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0, path: secretPath,
      verifyClient: (info: { origin: string; secure: boolean; req: IncomingMessage }) =>
        !info.origin && info.req.url === secretPath,
      perMessageDeflate: false, maxPayload: MAX_MESSAGE_BYTES });
    await new Promise<void>((ok, fail) => { server.once('listening', ok); server.once('error', fail); });
    const port = (server.address() as { port: number }).port;
    const app = new AppSession(this.options.codexBinary, this.options.codexHome);
    let container: ChildProcessWithoutNullStreams | undefined;
    let socket: WebSocket | undefined;
    let timer: NodeJS.Timeout | undefined;
    let threadId: string | undefined;
    let turnId: string | undefined;
    let finished = false;
    let terminalCode: number | null = null;
    let stopping = false;
    let stopPromise: Promise<void> | undefined;
    const stop = (): Promise<void> => {
      if (stopPromise) return stopPromise;
      stopping = true;
      if (timer) clearTimeout(timer);
      stopPromise = Promise.resolve().then(async () => {
        spec.revoke();
        app.close();
        socket?.terminate();
        server.close();
        if (container) {
          container.stdin.end();
          await run(docker, ['stop', '--time', '5', name]).catch(() => {});
        }
        this.#active.delete(id);
      });
      return stopPromise;
    };
    const finish = (code: number | null, signal: NodeJS.Signals | null) => {
      if (finished) return;
      finished = true;
      terminalCode = code;
      spec.onExit?.({ workerId: id, code, signal });
      void stop();
    };
    this.#active.set(id, { stop });
    server.on('connection', ws => {
      if (socket) { ws.close(); return; }
      socket = ws;
      container = spawn(docker, dockerArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
      container.stderr.resume();
      container.once('error', () => finish(1, null));
      container.once('exit', (code, signal) => finish(code, signal));
      let stdout = Buffer.alloc(0);
      container.stdout.on('data', (chunk: Buffer) => {
        if (stopping) return;
        stdout = Buffer.concat([stdout, chunk]);
        if (stdout.length > MAX_MESSAGE_BYTES) { finish(1, null); return; }
        for (;;) {
          const end = stdout.indexOf(10);
          if (end < 0) break;
          const line = stdout.subarray(0, end).toString('utf8');
          stdout = stdout.subarray(end + 1);
          if (ws.readyState === ws.OPEN && ws.bufferedAmount < MAX_MESSAGE_BYTES) ws.send(line);
          else { finish(1, null); return; }
        }
      });
      ws.on('message', (data, binary) => {
        const bytes = Buffer.isBuffer(data) ? data :
          Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
        if (binary || bytes.length > MAX_MESSAGE_BYTES || !container?.stdin.writable) {
          finish(1, null); return;
        }
        container.stdin.write(bytes);
        container.stdin.write('\n');
      });
      ws.on('close', () => { if (!stopping) finish(1, null); });
      ws.on('error', () => finish(1, null));
    });
    app.onExit = () => { if (!stopping) finish(1, null); };
    app.onRequest = message => {
      if (message.method !== 'item/tool/call' || typeof message.id !== 'number') {
        if (typeof message.id === 'number') app.respond(message.id, null, 'request unavailable in worker');
        return;
      }
      const params = message.params;
      if (params?.threadId !== threadId || !turnId || params?.turnId !== turnId ||
          params?.namespace !== 'capitalTree' || !Object.hasOwn(toolSpecs, params?.tool ?? '')) {
        app.respond(message.id!, null, 'tool unavailable in worker');
        return;
      }
      const name = params.tool as ToolName;
      void (async () => {
        try {
          app.respond(message.id!, await forwardScopedTool(origin, spec.mcpToken, name, params.arguments));
        } catch {
          app.respond(message.id!, { contentItems: [{
            type: 'inputText', text: 'Scoped tool failed; reconcile before retrying a write.'
          }], success: false });
        }
      })();
    };
    app.onNotification = message => {
      if (message.method === 'turn/started' && message.params?.threadId === threadId) {
        turnId = message.params?.turn?.id;
      }
      if (message.method !== 'turn/completed' || message.params?.threadId !== threadId ||
          message.params?.turn?.id !== turnId) return;
      finish(message.params.turn.status === 'completed' ? 0 : 1, null);
    };
    try {
      timer = setTimeout(() => finish(1, null), spec.maxLifetimeMs);
      timer.unref();
      await app.initialize();
      await app.request('environment/add', { environmentId: id,
        execServerUrl: `ws://127.0.0.1:${port}${secretPath}`, connectTimeoutMs: 10_000 });
      const info = await app.request('environment/info', { environmentId: id });
      if (info?.cwd !== 'file:///workspace') throw new Error('native worker environment mismatch');
      const dynamicTools = [{
        type: 'namespace', name: 'capitalTree', description: 'Scoped Capital Tree finance tools.',
        tools: Object.entries(toolSpecs).map(([name, tool]) => ({
          type: 'function', name, description: tool.description,
          inputSchema: z.toJSONSchema(tool.schema)
        }))
      }];
      const thread = await app.request('thread/start', {
        model: spec.files.model, cwd: '/workspace', ephemeral: true, approvalPolicy: 'never',
        sandbox: 'danger-full-access', environments: [{
          environmentId: id, cwd: '/workspace', runtimeWorkspaceRoots: ['/workspace']
        }], dynamicTools,
        config: { features: { apps: false, plugins: false, hooks: false, multi_agent: false,
          remote_plugin: false, skip_host_skill_discovery: true, view_image: false,
          browser_use: false, browser_use_external: false, browser_use_full_cdp_access: false,
          computer_use: false, image_generation: false, in_app_browser: false,
          skill_search: false, skill_mcp_dependency_install: false,
          code_mode: { enabled: false } }, web_search: 'disabled' }
      });
      threadId = thread?.thread?.id;
      if (!threadId || thread?.thread?.modelProvider !== 'openai' ||
          thread?.thread?.model !== spec.files.model ||
          thread?.thread?.environments?.length !== 1 ||
          thread.thread.environments[0]?.environmentId !== id ||
          thread.thread.environments[0]?.cwd !== '/workspace') {
        throw new Error('native worker thread environment or model mismatch');
      }
      const turn = await app.request('turn/start', {
        threadId, input: [{ type: 'text', text: spec.task }], approvalPolicy: 'never',
        sandboxPolicy: { type: 'externalSandbox', networkAccess: 'restricted' }
      });
      turnId = turn?.turn?.id;
      if (!turnId) throw new Error('native worker turn was not created');
      if (finished && terminalCode !== 0) throw new Error('native worker exited during startup');
    } catch (error) {
      await stop();
      throw error;
    }
  }

  async stop(workerId: string): Promise<void> {
    const pending = this.#starting.get(workerId);
    if (pending) await pending.catch(() => {});
    await this.#active.get(workerId)?.stop();
    const name = workerContainerName(workerId);
    if ((await run(this.options.docker ?? 'docker', ['inspect', '-f', '{{.Id}}', name])).code === 0) {
      await run(this.options.docker ?? 'docker', ['stop', '--time', '5', name]);
    }
  }

  async close(): Promise<void> {
    await Promise.all([...this.#active.values()].map(active => active.stop()));
  }
}
