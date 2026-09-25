import { createHash, randomBytes } from 'node:crypto';
import { mkdir, lstat, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import type { Address } from 'viem';
import { financeRoles } from '@agent-capital-tree/sdk';
import { createMultiBaasHistoryClient } from '@agent-capital-tree/multibaas';
import { toolSpecs, type ToolName } from '@agent-capital-tree/plugin/tools';
import { WorkerKeyStore } from './keys.js';
import { WorkerSessions, type WorkerContext } from './context.js';
import { InferenceBroker } from './broker.js';
import { companionServer, type ToolHandler } from './server.js';
import { chainHandlers } from './chain.js';
import { OnchainSpawnChain, childKeyId } from './spawn-chain.js';
import { SpawnCoordinator, type SpawnRequest } from './spawn.js';
import { FileSpawnJournal } from './journal.js';
import { DockerWorkerLauncher } from './launcher.js';
import { ChildGasFunding, childGasGrant, MAX_CHILD_GAS_WEI } from './gas.js';

type Identity = { context: WorkerContext; keyId: string };

class WorkerIdentities {
  constructor(readonly directory: string) {}
  #path(id: string): string {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error('invalid worker ID');
    return join(this.directory, `${id}.json`);
  }
  async bind(context: WorkerContext, keyId: string): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const path = this.#path(context.workerId);
    const value = JSON.stringify({ context, keyId });
    try { await writeFile(path, value, { flag: 'wx', mode: 0o600 }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (await readFile(path, 'utf8') !== value) throw new Error('worker identity conflict');
    }
  }
  async keyId(context: WorkerContext): Promise<string> {
    const path = this.#path(context.workerId);
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o600) {
      throw new Error('invalid worker identity record');
    }
    const identity = JSON.parse(await readFile(path, 'utf8')) as Identity;
    if (JSON.stringify(identity.context) !== JSON.stringify(context) || !/^[a-zA-Z0-9_-]{1,128}$/.test(identity.keyId)) {
      throw new Error('worker identity mismatch');
    }
    return identity.keyId;
  }
}

function workerId(controller: Address, rootId: string, nodeId: string, generation: string): string {
  const domain = createHash('sha256').update(controller.toLowerCase()).digest('hex').slice(0, 12);
  const id = `node-${domain}-${rootId}-${nodeId}-g${generation}`;
  if (!/^node-[a-f0-9]{12}-\d+-\d+-g\d+$/.test(id) || id.length > 64) throw new Error('invalid worker scope');
  return id;
}

async function privateRoot(path: string): Promise<void> {
  if (!isAbsolute(path)) throw new Error('runtime root must be absolute');
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o700) {
    throw new Error('invalid private runtime root');
  }
}

async function bindDomain(runtimeRoot: string, rootId: string, controller: Address): Promise<void> {
  if (!/^[1-9]\d*$/.test(rootId) || !/^0x[a-fA-F0-9]{40}$/.test(controller)) throw new Error('invalid runtime domain');
  const path = join(runtimeRoot, 'domain.json');
  const value = JSON.stringify({ chainId: 11155111, rootId, controller: controller.toLowerCase() });
  try { await writeFile(path, value, { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o600 ||
      await readFile(path, 'utf8') !== value) throw new Error('runtime root belongs to another controller or root');
  }
}

export async function prepareRootOperator(runtimeRoot: string, rootId: string, controller: Address): Promise<Address> {
  if (!/^[1-9]\d*$/.test(rootId)) throw new Error('invalid root ID');
  await privateRoot(runtimeRoot);
  await bindDomain(runtimeRoot, rootId, controller);
  const keys = new WorkerKeyStore(join(runtimeRoot, 'keys'));
  return (await keys.account(`root-${rootId}`, true)).address;
}

export type CompanionConfig = Readonly<{
  runtimeRoot: string;
  rootId: string;
  rpcUrl: string;
  controller: Address;
  upstream: string;
  upstreamKey: string;
  imageId: string;
  models: readonly string[];
  workerUid: number;
  workerGid: number;
  childGasWei: bigint;
  writesEnabled: boolean;
  monitorIntervalMs?: number;
  multibaas?: { deploymentUrl: string; controllerLabel: string; apiKey: string };
}>;

type Grant = { context: WorkerContext; brokerToken: string; mcpToken: string; keyFile: string };

/** The trusted local process composes chain state, scoped credentials and one-shot workers. */
export class RuntimeCompanion {
  readonly keys: WorkerKeyStore;
  readonly identities: WorkerIdentities;
  readonly sessions = new WorkerSessions();
  readonly broker: InferenceBroker;
  readonly launcher = new DockerWorkerLauncher();
  readonly gas: ChildGasFunding;
  readonly chain: OnchainSpawnChain;
  readonly coordinator: SpawnCoordinator;
  readonly journal: FileSpawnJournal;
  readonly tools;
  readonly brokerServer;
  #grants = new Map<string, Grant>();
  #rootSession: { token: string; context: WorkerContext } | undefined;
  #timer?: NodeJS.Timeout;
  #monitoring = false;
  #queues = new Map<string, Promise<unknown>>();
  #brokerOrigin?: string;
  #toolsOrigin?: string;
  #lockPath?: string;

  constructor(readonly config: CompanionConfig) {
    if (!/^[1-9]\d*$/.test(config.rootId) || !/^0x[a-fA-F0-9]{40}$/.test(config.controller) ||
      !/^sha256:[a-f0-9]{64}$/.test(config.imageId) || !config.models.length ||
      !config.models.every(model => /^[\w.-]+$/.test(model)) ||
      !Number.isSafeInteger(config.workerUid) || config.workerUid < 1 ||
      !Number.isSafeInteger(config.workerGid) || config.workerGid < 1 ||
      config.childGasWei < 0n || config.childGasWei > MAX_CHILD_GAS_WEI) throw new Error('invalid companion configuration');
    this.keys = new WorkerKeyStore(join(config.runtimeRoot, 'keys'));
    this.identities = new WorkerIdentities(join(config.runtimeRoot, 'identities'));
    this.broker = new InferenceBroker({ upstream: config.upstream, upstreamKey: config.upstreamKey, maxBodyBytes: 1_000_000 });
    this.gas = new ChildGasFunding(config.rpcUrl, join(config.runtimeRoot, 'gas'));
    this.chain = new OnchainSpawnChain({ rpcUrl: config.rpcUrl, controller: config.controller, keys: this.keys,
      keyIdFor: context => this.identities.keyId(context), serialize: (address, action) => this.serialize(address, action) });
    const handlers = chainHandlers({ rpcUrl: config.rpcUrl, controller: config.controller,
      accountFor: async context => this.keys.account(await this.identities.keyId(context)) });
    const wrapped: Partial<Record<ToolName, ToolHandler>> = {};
    for (const [name, handler] of Object.entries(handlers) as [ToolName, ToolHandler][]) {
      wrapped[name] = toolSpecs[name].readOnly ? handler : async (context, args) => {
        if (!config.writesEnabled) throw new Error('Sepolia writes are disabled');
        const account = await this.keys.account(await this.identities.keyId(context));
        return this.serialize(account.address, () => handler(context, args));
      };
    }
    wrapped.spawnChild = async (context, args) => {
      if (!config.writesEnabled) throw new Error('Sepolia writes are disabled');
      if (!config.models.includes(String(args.model))) throw new Error('worker model is not approved');
      const request: SpawnRequest = { operationKey: String(args.operationKey) as `0x${string}`,
        task: String(args.task), model: String(args.model), token: String(args.asset) as `0x${string}`,
        amount: String(args.amount), restrictions: args.restrictions };
      return this.coordinator.spawn(context, request);
    };
    wrapped.getOperationStatus = async (context, args) => {
      const operation = await this.chain.client.controller.read.getOperation([
        BigInt(context.rootId), BigInt(context.nodeId), BigInt(context.authorityGeneration),
        String(args.operationKey) as `0x${string}`
      ]);
      const scope = `${context.rootId}:${context.nodeId}:${context.authorityGeneration}:${String(args.operationKey).toLowerCase()}`;
      const record = await this.journal.get(scope);
      return { childId: operation.nodeId.toString(), recordedOnchain: operation.nodeId !== 0n,
        dispatchStatus: operation.nodeId === 0n ? 'not_allocated' : record?.started && record.childId === operation.nodeId.toString()
          ? 'started' : 'allocation_confirmed_dispatch_unknown' };
    };
    if (config.multibaas) {
      const history = createMultiBaasHistoryClient({ ...config.multibaas, controllerAddress: config.controller,
        rpcUrl: config.rpcUrl });
      wrapped.getCapitalActivity = async (context, args) => {
        if (String(args.rootId) !== context.rootId) throw new Error('activity root is outside worker scope');
        return history.getCapitalActivity(context.rootId, args.cursor as string | undefined);
      };
    }
    this.tools = companionServer(this.sessions, wrapped);
    this.brokerServer = this.broker.server();
    this.journal = new FileSpawnJournal(join(config.runtimeRoot, 'spawn-journal'));
    this.coordinator = new SpawnCoordinator(this.chain, this.journal,
      (parent, childId, request) => this.launchChild(parent, childId, request),
      (parent, childId, request) => this.prepareChild(parent, childId, request));
  }

  async acquireLock(): Promise<void> {
    const path = join(this.config.runtimeRoot, 'companion.lock');
    try { await writeFile(path, String(process.pid), { flag: 'wx', mode: 0o600 }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o600) {
        throw new Error('invalid companion lock');
      }
      const pid = Number(await readFile(path, 'utf8'));
      if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('invalid companion lock PID');
      try { process.kill(pid, 0); throw new Error('companion is already running'); }
      catch (signalError) {
        if ((signalError as NodeJS.ErrnoException).code !== 'ESRCH') throw signalError;
      }
      await rm(path);
      await writeFile(path, String(process.pid), { flag: 'wx', mode: 0o600 });
    }
    this.#lockPath = path;
  }

  async stopOrphans(): Promise<void> {
    const workers = join(this.config.runtimeRoot, 'workers');
    await mkdir(workers, { mode: 0o700, recursive: true });
    const entries = await readdir(workers, { withFileTypes: true });
    const domain = createHash('sha256').update(this.config.controller.toLowerCase()).digest('hex').slice(0, 12);
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith(`node-${domain}-`)) continue;
      await this.launcher.stop(entry.name);
      await rm(join(workers, entry.name, 'key'), { force: true });
    }
  }

  async serialize<T>(address: Address, action: () => Promise<T>): Promise<T> {
    const key = address.toLowerCase();
    const prior = this.#queues.get(key) ?? Promise.resolve();
    const current = prior.catch(() => undefined).then(action);
    this.#queues.set(key, current);
    try { return await current; }
    finally { if (this.#queues.get(key) === current) this.#queues.delete(key); }
  }

  async start(): Promise<{ toolsOrigin: string; brokerOrigin: string; rootTokenFile: string }> {
    await privateRoot(this.config.runtimeRoot);
    await bindDomain(this.config.runtimeRoot, this.config.rootId, this.config.controller);
    await this.chain.client.verifyDeployment();
    const rootId = BigInt(this.config.rootId);
    const [node, generation, operator, account] = await Promise.all([
      this.chain.client.controller.read.getNode([rootId]), this.chain.client.controller.read.rootGeneration([rootId]),
      this.chain.client.controller.read.rootOperator([rootId]), this.keys.account(`root-${this.config.rootId}`)
    ]);
    if (node.id !== rootId || node.rootId !== rootId || generation === 0n || node.generation !== generation ||
      node.revoked || node.agent.toLowerCase() !== account.address.toLowerCase() ||
      operator.toLowerCase() !== account.address.toLowerCase()) throw new Error('root operator is not bound to this key');
    const context = { workerId: workerId(this.config.controller, this.config.rootId, this.config.rootId, generation.toString()),
      rootId: this.config.rootId, nodeId: this.config.rootId, authorityGeneration: generation.toString() };
    if (!(await this.currentAuthority(context, account.address))) throw new Error('root authority is not active');
    await this.identities.bind(context, `root-${this.config.rootId}`);
    await this.acquireLock();
    try {
    await this.launcher.ensureAvailable();
    await this.stopOrphans();
    if (this.config.writesEnabled) {
      await this.gas.recoverPending(); // No signer writes start while a previous gas nonce is unresolved.
    }
    await Promise.all([
      new Promise<void>((ok, fail) => { this.tools.once('error', fail); this.tools.listen(0, '127.0.0.1', ok); }),
      new Promise<void>((ok, fail) => { this.brokerServer.once('error', fail); this.brokerServer.listen(0, '127.0.0.1', ok); })
    ]);
    this.#toolsOrigin = `http://127.0.0.1:${(this.tools.address() as { port: number }).port}`;
    this.#brokerOrigin = `http://127.0.0.1:${(this.brokerServer.address() as { port: number }).port}`;
    const token = this.sessions.issue(context, Date.now() + 86_400_000);
    const tokenFile = join(this.config.runtimeRoot, 'root-session.token');
    const temp = `${tokenFile}.${randomBytes(8).toString('hex')}.tmp`;
    await writeFile(temp, token, { mode: 0o600, flag: 'wx' });
    await rename(temp, tokenFile);
    this.#rootSession = { token, context };
    const interval = this.config.monitorIntervalMs ?? 10_000;
    if (!Number.isSafeInteger(interval) || interval < 1000 || interval > 60_000) throw new Error('invalid monitor interval');
    this.#timer = setInterval(() => { void this.monitor().catch(() => {}); }, interval);
    this.#timer.unref();
    return { toolsOrigin: this.#toolsOrigin, brokerOrigin: this.#brokerOrigin, rootTokenFile: tokenFile };
    } catch (error) { await this.close().catch(() => {}); throw error; }
  }

  async currentAuthority(context: WorkerContext, address: Address): Promise<boolean> {
    try {
      const id = BigInt(context.nodeId), rootId = BigInt(context.rootId);
      const [node, generation, operator, policy] = await Promise.all([
        this.chain.client.controller.read.getNode([id]), this.chain.client.controller.read.rootGeneration([rootId]),
        this.chain.client.controller.read.rootOperator([rootId]), this.chain.client.controller.read.getEffectivePolicy([id])
      ]);
      if (node.rootId !== rootId || node.generation !== generation || generation.toString() !== context.authorityGeneration ||
        node.revoked || node.agent.toLowerCase() !== address.toLowerCase() ||
        operator === '0x0000000000000000000000000000000000000000') return false;
      for (const role of Object.values(financeRoles)) {
        if ((policy.capabilities & role) !== role) continue;
        try {
          await this.chain.client.controller.read.checkAction([id, role, address, 2, 0n]);
          return true;
        } catch { /* Try another role; every role failure revokes this worker. */ }
      }
    } catch { /* RPC uncertainty fails closed for worker access. */ }
    return false;
  }

  async monitor(): Promise<void> {
    if (this.#monitoring) return;
    this.#monitoring = true;
    try {
      const scopes = [...this.#grants.values()];
      for (const grant of scopes) {
        const account = await this.keys.account(await this.identities.keyId(grant.context)).catch(() => undefined);
        if (!account || !(await this.currentAuthority(grant.context, account.address))) await this.stopGrant(grant.context.workerId);
      }
      if (this.#rootSession) {
        const account = await this.keys.account(`root-${this.config.rootId}`).catch(() => undefined);
        if (!account || !(await this.currentAuthority(this.#rootSession.context, account.address))) {
          this.sessions.revoke(this.#rootSession.token);
          this.#rootSession = undefined;
          await rm(join(this.config.runtimeRoot, 'root-session.token'), { force: true });
        }
      }
    } finally { this.#monitoring = false; }
  }

  async stopGrant(worker: string): Promise<void> {
    const grant = this.#grants.get(worker);
    if (!grant) return;
    this.broker.revoke(grant.brokerToken);
    this.sessions.revoke(grant.mcpToken);
    this.#grants.delete(worker);
    try { await this.launcher.stop(worker); }
    finally { await rm(grant.keyFile, { force: true }); }
  }

  async #childContext(parent: WorkerContext, childId: string): Promise<WorkerContext> {
    return { workerId: workerId(this.config.controller, parent.rootId, childId, parent.authorityGeneration), rootId: parent.rootId,
      nodeId: childId, authorityGeneration: parent.authorityGeneration };
  }

  async prepareChild(parent: WorkerContext, childId: string, request: SpawnRequest): Promise<void> {
    const context = await this.#childContext(parent, childId);
    const keyId = childKeyId(parent, request.operationKey, this.config.controller);
    const child = await this.keys.account(keyId); // No replacement key after a confirmed allocation.
    await this.identities.bind(context, keyId);
    if (!(await this.currentAuthority(context, child.address))) throw new Error('child authority is inactive');
    const parentNode = await this.chain.client.controller.read.getNode([BigInt(parent.nodeId)]);
    const grant = childGasGrant(this.config.childGasWei, parentNode.depth);
    if (grant > 0n) {
      const parentAccount = await this.keys.account(await this.identities.keyId(parent));
      await this.serialize(parentAccount.address, () => this.gas.fund(keyId, parentAccount, child.address, grant));
    }
  }

  async launchChild(parent: WorkerContext, childId: string, request: SpawnRequest): Promise<void> {
    if (!this.#brokerOrigin || !this.#toolsOrigin) throw new Error('companion is not listening');
    const context = await this.#childContext(parent, childId);
    const keyId = await this.identities.keyId(context);
    if (keyId !== childKeyId(parent, request.operationKey, this.config.controller)) throw new Error('child identity mismatch');
    const account = await this.keys.account(keyId);
    if (!(await this.currentAuthority(context, account.address))) throw new Error('child authority is inactive');
    const workerRoot = join(this.config.runtimeRoot, 'workers', context.workerId);
    const workspace = join(workerRoot, 'workspace');
    const keyFile = join(workerRoot, 'key');
    const gatewaySocket = join(workerRoot, 'gateway.sock');
    await privateRoot(workerRoot);
    await mkdir(workspace, { mode: 0o700 });
    // Never overwrite a key left by an ambiguous prior launch.
    await writeFile(keyFile, (await this.keys.wallet(keyId)).privateKey, { mode: 0o600, flag: 'wx' });
    const brokerToken = this.broker.issue(request.model, 15 * 60_000, 100);
    const mcpToken = this.sessions.issue(context, Date.now() + 15 * 60_000);
    this.#grants.set(context.workerId, { context, brokerToken, mcpToken, keyFile });
    try {
      await this.launcher.launch({ files: { workerId: context.workerId, uid: this.config.workerUid,
        gid: this.config.workerGid, runtimeRoot: this.config.runtimeRoot, workspace, keyFile, gatewaySocket,
        imageId: this.config.imageId, model: request.model },
      gateway: { socket: gatewaySocket, workerRoot, uid: this.config.workerUid,
        brokerOrigin: this.#brokerOrigin, brokerToken, companionOrigin: this.#toolsOrigin, mcpToken },
      task: request.task, maxLifetimeMs: 15 * 60_000,
      revoke: () => { void this.stopGrant(context.workerId); } });
    } catch (error) { await this.stopGrant(context.workerId); throw error; }
  }

  async close(): Promise<void> {
    if (this.#timer) clearInterval(this.#timer);
    await Promise.all([...this.#grants.keys()].map(id => this.stopGrant(id)));
    await this.launcher.close();
    if (this.#rootSession) this.sessions.revoke(this.#rootSession.token);
    await rm(join(this.config.runtimeRoot, 'root-session.token'), { force: true });
    if (this.#lockPath) await rm(this.#lockPath, { force: true });
    await Promise.all([new Promise<void>(resolve => this.tools.close(() => resolve())),
      new Promise<void>(resolve => this.brokerServer.close(() => resolve()))]);
  }
}
