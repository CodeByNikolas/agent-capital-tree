import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realpath, mkdtemp, readFile, stat, chmod, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkerKeyStore } from '../dist/keys.js';

test('encrypted worker keys survive restart, concurrent preparation and reject unsafe storage', async () => {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'act-key-test-'));
  try {
    const keys = new WorkerKeyStore(directory);
    const [first, repeated] = await Promise.all([keys.wallet('worker1', true), keys.wallet('worker1', true)]);
    assert.equal(first.address, repeated.address);
    const restored = await new WorkerKeyStore(directory).account('worker1');
    assert.equal(restored.address, first.address);
    const encrypted = await readFile(join(directory, 'worker1.keystore.json'), 'utf8');
    assert.ok(!encrypted.includes(first.privateKey.slice(2)));
    assert.equal((await stat(join(directory, 'worker1.keystore.json'))).mode & 0o777, 0o600);
    await assert.rejects(keys.wallet('../escape', true), /identifier/);
    await assert.rejects(keys.wallet('missing'), /unavailable/);
    await symlink(join(directory, 'worker1.keystore.json'), join(directory, 'alias.keystore.json'));
    await assert.rejects(keys.wallet('alias'), /unavailable|Invalid/);
    await chmod(join(directory, 'worker1.keystore.json'), 0o644);
    await assert.rejects(new WorkerKeyStore(directory).wallet('worker1'), /unavailable|Invalid/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
