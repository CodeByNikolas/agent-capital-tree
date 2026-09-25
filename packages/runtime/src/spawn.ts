import { createHash } from 'node:crypto';
import type { WorkerContext } from './context.js';

export type SpawnRequest = Readonly<{
  operationKey: `0x${string}`;
  task: string;
  model: string;
  token: `0x${string}`;
  amount: string;
  restrictions: unknown;
}>;
export type SpawnReceipt = Readonly<{ childId: string; txHash?: string; blockHash: string; blockNumber?: string; dispatchStatus?: 'started' | 'allocation_confirmed_dispatch_unknown' }>;
export type SpawnRecord = Readonly<{ scope: string; requestHash: string; childId?: string; dispatchAttempted?: boolean; started?: boolean }>;

/** SDK adapter must enforce current parent mandate and contract parameter hashing. */
export type SpawnChain = {
  reconcile(parent: WorkerContext, request: SpawnRequest): Promise<SpawnReceipt | undefined>;
  submit(parent: WorkerContext, request: SpawnRequest): Promise<void>;
  confirmed(receipt: SpawnReceipt): Promise<boolean>;
};
export type SpawnJournal = {
  get(scope: string): Promise<SpawnRecord | undefined>;
  put(record: SpawnRecord): Promise<void>;
};
/** Must ensure one running worker per childId, including after a companion restart. */
export type WorkerLauncher = (parent: WorkerContext, childId: string, request: SpawnRequest) => Promise<void>;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, part]) => `${JSON.stringify(key)}:${canonical(part)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(request: SpawnRequest): string {
  return createHash('sha256').update(canonical(request)).digest('hex');
}

export class SpawnCoordinator {
  #pending = new Map<string, { hash: string; promise: Promise<SpawnReceipt> }>();
  constructor(private chain: SpawnChain, private journal: SpawnJournal, private launch: WorkerLauncher,
    private prepare?: WorkerLauncher) {}

  spawn(parent: WorkerContext, request: SpawnRequest): Promise<SpawnReceipt> {
    if (!/^0x[\da-fA-F]{64}$/.test(request.operationKey) || !/^\d+$/.test(request.amount)) throw new Error('invalid spawn request');
    const scope = `${parent.rootId}:${parent.nodeId}:${parent.authorityGeneration}:${request.operationKey.toLowerCase()}`;
    const hash = fingerprint(request);
    const existing = this.#pending.get(scope);
    if (existing) {
      if (existing.hash !== hash) throw new Error('operation key reused with different parameters');
      return existing.promise;
    }
    const work = this.#spawn(parent, request, scope).finally(() => this.#pending.delete(scope));
    this.#pending.set(scope, { hash, promise: work });
    return work;
  }

  async #spawn(parent: WorkerContext, request: SpawnRequest, scope: string): Promise<SpawnReceipt> {
    const requestHash = fingerprint(request);
    const previous = await this.journal.get(scope);
    if (previous && previous.requestHash !== requestHash) throw new Error('operation key reused with different parameters');
    if (!previous) await this.journal.put({ scope, requestHash });
    // Always reconcile on-chain first: a lost journal or uncertain send must not create a second allocation.
    let receipt = await this.chain.reconcile(parent, request);
    const existedBeforeSubmit = Boolean(receipt);
    if (!receipt) {
      await this.chain.submit(parent, request);
      receipt = await this.chain.reconcile(parent, request);
    }
    if (!receipt || !(await this.chain.confirmed(receipt))) throw new Error('spawn transaction not confirmed');
    if (previous?.started && previous.childId === receipt.childId) return { ...receipt, dispatchStatus: 'started' };
    if (!previous && existedBeforeSubmit) {
      await this.journal.put({ scope, requestHash, childId: receipt.childId, dispatchAttempted: true });
      return { ...receipt, dispatchStatus: 'allocation_confirmed_dispatch_unknown' }; // Lost journal: task history is unknown.
    }
    if (previous?.dispatchAttempted) throw new Error('worker dispatch outcome is uncertain; task will not be repeated');
    await this.prepare?.(parent, receipt.childId, request);
    // Persist intent before handing the one-shot task to Docker. A crash may lose liveness, never repeat writes.
    await this.journal.put({ scope, requestHash, childId: receipt.childId, dispatchAttempted: true });
    await this.launch(parent, receipt.childId, request);
    await this.journal.put({ scope, requestHash, childId: receipt.childId, dispatchAttempted: true, started: true });
    return { ...receipt, dispatchStatus: 'started' };
  }
}
