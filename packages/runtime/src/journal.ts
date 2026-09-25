import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import type { SpawnJournal, SpawnRecord } from './spawn.js';

/** One local process owns this directory; contract idempotency protects restarts. */
export class FileSpawnJournal implements SpawnJournal {
  constructor(private directory: string) {}
  #path(scope: string): string { return join(this.directory, createHash('sha256').update(scope).digest('hex') + '.json'); }
  async get(scope: string): Promise<SpawnRecord | undefined> {
    try { return JSON.parse(await readFile(this.#path(scope), 'utf8')) as SpawnRecord; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  }
  async put(record: SpawnRecord): Promise<void> {
    const path = this.#path(record.scope);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temp = `${path}.${randomBytes(8).toString('hex')}.tmp`;
    await writeFile(temp, JSON.stringify(record), { mode: 0o600, flag: 'wx' });
    await rename(temp, path);
  }
}
