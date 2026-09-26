import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkWorkerHost, loadWorkerHost, workerHostSchema } from '../worker-host.mjs';

const imageId = `sha256:${'a'.repeat(64)}`;
const common = { imageId, models: ['gpt-6-luna'], childGasWei: '0' };
const native = { ...common, codexBinary: '/missing/codex', codexHome: '/missing/codex-home' };
const proxy = { ...common, inference: 'cliproxyapi', upstream: 'http://127.0.0.1:8317/v1', upstreamKey: 'synthetic-secret' };

test('worker host accepts implicit native and explicit proxy, with no mixed or authority fields', () => {
  assert.equal(workerHostSchema.safeParse(native).success, true);
  assert.equal(workerHostSchema.safeParse({ ...native, inference: 'codex' }).success, true);
  assert.equal(workerHostSchema.safeParse(proxy).success, true);
  for (const invalid of [
    { ...native, upstream: proxy.upstream }, { ...native, upstreamKey: proxy.upstreamKey },
    { ...proxy, codexBinary: native.codexBinary }, { ...proxy, codexHome: native.codexHome },
    { ...proxy, openaiApiKeyFile: '/private/key' }, { ...proxy, reasoningEffort: 'high' },
    { ...proxy, rootId: '1' }, { ...proxy, controller: 'override' },
    { ...proxy, writesEnabled: true }, { ...proxy, upstreamKey: '' },
    { ...proxy, upstream: 'http://user:password@127.0.0.1:8317/v1' },
    { ...proxy, upstream: 'http://127.0.0.1:8317/v1?key=secret' },
    { ...common, inference: 'cliproxyapi' }
  ]) assert.equal(workerHostSchema.safeParse(invalid).success, false);
});

test('private proxy settings load into companion config without exposing secrets on errors', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kanoki-worker-host-'));
  const file = join(directory, 'worker-host.json');
  try {
    await writeFile(file, JSON.stringify(proxy), { mode: 0o600 });
    const loaded = await loadWorkerHost(directory);
    assert.equal(loaded.inference, 'cliproxyapi');
    assert.equal(loaded.upstreamKey, proxy.upstreamKey);
    assert.equal(loaded.mode, 'workers');
    assert.equal(loaded.childGasWei, 0n);
    await writeFile(file, JSON.stringify({ ...proxy, rootId: 'override' }));
    await assert.rejects(loadWorkerHost(directory), error => {
      assert.match(error.message, /WORKER_HOST_INVALID/);
      assert.doesNotMatch(error.message, /synthetic-secret|override/);
      return true;
    });
    await writeFile(file, '{"upstreamKey":"synthetic-secret",');
    await assert.rejects(loadWorkerHost(directory), error => {
      assert.match(error.message, /WORKER_HOST_INVALID/);
      assert.doesNotMatch(error.message, /synthetic-secret/);
      return true;
    });
    await chmod(file, 0o644);
    await assert.rejects(loadWorkerHost(directory), /owner-only private file/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('proxy preflight uses Docker launcher; native mode still checks Codex', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kanoki-worker-docker-'));
  const oldPath = process.env.PATH;
  try {
    await writeFile(join(directory, 'docker'), `#!/bin/sh\nif [ "$1" = image ]; then printf '%s\\n' '${imageId}'; exit 0; fi\nif [ "$1" = info ]; then printf '%s\\n' 'fixture'; exit 0; fi\nexit 1\n`, { mode: 0o700 });
    process.env.PATH = `${directory}:${oldPath}`;
    const ready = await checkWorkerHost({ ...proxy, childGasWei: 0n });
    assert.equal(ready.status, 'ready');
    assert.equal(ready.workerReady, true);
    assert.equal(ready.workerStarted, false);
    assert.equal(JSON.stringify(ready, (_key, value) => typeof value === 'bigint' ? value.toString() : value).includes(proxy.upstreamKey), false);
    assert.equal((await checkWorkerHost({ ...native, childGasWei: 0n })).workerReady, false);
    assert.equal((await checkWorkerHost({ ...proxy, childGasWei: 0n }, 'unapproved')).status, 'blocked');
  } finally { process.env.PATH = oldPath; await rm(directory, { recursive: true, force: true }); }
});
