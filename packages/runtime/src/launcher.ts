import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { workerContainerName, workerDockerArgs, type WorkerFiles } from './container.js';
import { startWorkerGateway, type GatewayConfig } from './gateway.js';

export type WorkerLaunch = Readonly<{
  files: WorkerFiles;
  gateway: GatewayConfig;
  task: string;
  maxLifetimeMs: number;
  revoke: () => void;
  onExit?: (status: { workerId: string; code: number | null; signal: NodeJS.Signals | null }) => void;
}>;

type Active = { stop: () => Promise<void>; done: Promise<void> };

/** Companion owns preparation of decrypted key, child context and scoped grants. */
export class DockerWorkerLauncher {
  #active = new Map<string, Active>();
  #starting = new Map<string, Promise<void>>();
  constructor(private readonly docker = 'docker') {}

  launch(spec: WorkerLaunch): Promise<void> {
    const id = spec.files.workerId;
    const existing = this.#starting.get(id);
    if (existing) return existing;
    const work = this.#launch(spec).finally(() => this.#starting.delete(id));
    this.#starting.set(id, work);
    return work;
  }

  async #launch(spec: WorkerLaunch): Promise<void> {
    const id = spec.files.workerId;
    if (this.#active.has(id)) return;
    if (!spec.task || Buffer.byteLength(spec.task) > 65_536) throw new Error('invalid worker task');
    if (!Number.isSafeInteger(spec.maxLifetimeMs) || spec.maxLifetimeMs < 1_000 || spec.maxLifetimeMs > 86_400_000) throw new Error('invalid worker lifetime');
    const name = workerContainerName(id);
    // An orphan after companion restart cannot retain a live gateway; stop it before recreating the socket.
    if ((await this.#docker(['inspect', '-f', '{{.Id}}', name], true)).code === 0) {
      await this.#docker(['stop', '--time', '5', name], true);
    }
    const gateway = await startWorkerGateway(spec.gateway);
    let stopped = false;
    let child: ReturnType<typeof spawn> | undefined;
    let timer: NodeJS.Timeout | undefined;
    const stop = async () => {
      if (stopped) return;
      stopped = true;
      if (timer) clearTimeout(timer);
      await this.#docker(['stop', '--time', '5', name], true);
      child?.kill('SIGTERM');
      await gateway.close();
      spec.revoke();
      this.#active.delete(id);
    };
    try {
      const args = await workerDockerArgs(spec.files);
      child = spawn(this.docker, args, { stdio: ['pipe', 'ignore', 'ignore'] });
      child.stdin?.end(spec.task);
      const done = new Promise<void>(resolve => {
        child!.once('exit', (code, signal) => { spec.onExit?.({ workerId: id, code, signal }); resolve(); });
        child!.once('error', () => { spec.onExit?.({ workerId: id, code: null, signal: null }); resolve(); });
      }).then(stop);
      this.#active.set(id, { stop, done });
      timer = setTimeout(() => { void stop(); }, spec.maxLifetimeMs);
      timer.unref();
      for (let attempt = 0; attempt < 40; attempt++) {
        if ((await this.#docker(['inspect', '-f', '{{.State.Running}}', name], true)).output.trim() === 'true') return;
        if (child.exitCode !== null) throw new Error('worker exited before startup');
        await delay(100);
      }
      throw new Error('worker did not start');
    } catch (error) { await stop(); throw error; }
  }

  async stop(workerId: string): Promise<void> {
    const pending = this.#starting.get(workerId);
    if (pending) await pending.catch(() => {});
    const active = this.#active.get(workerId);
    if (active) await active.stop();
    else await this.#docker(['stop', '--time', '5', workerContainerName(workerId)], true);
  }

  async close(): Promise<void> { await Promise.all([...this.#active.values()].map(active => active.stop())); }

  #docker(args: string[], allowFailure = false): Promise<{ code: number; output: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.docker, args, { stdio: ['ignore', 'pipe', 'ignore'] });
      let output = '';
      child.stdout.on('data', chunk => { if (output.length < 4096) output += chunk.toString(); });
      child.once('error', reject);
      child.once('exit', code => code === 0 || allowFailure ? resolve({ code: code ?? 1, output }) : reject(new Error('docker command failed')));
    });
  }
}
