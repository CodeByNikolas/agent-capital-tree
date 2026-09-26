import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));

test('CLI defaults to native Codex even when legacy provider fields exist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'act-native-cli-'));
  const path = join(directory, 'config.json');
  try {
    await writeFile(path, JSON.stringify({ upstream: 'http://127.0.0.1:1/v1',
      providerTokenFile: '/must-not-be-read', runtimeRoot: join(directory, 'runtime') }), { mode: 0o600 });
    await assert.rejects(run(process.execPath, [cli, 'start', path], { timeout: 10000 }), error => {
      assert.match(error.stderr, /native Codex requires absolute codexBinary and dedicated codexHome paths/);
      assert.doesNotMatch(error.stderr, /must-not-be-read|codexops-proxy-token/);
      return true;
    });
    assert.deepEqual(await readdir(directory), ['config.json']);
    for (const model of [null, '', 1]) {
      await writeFile(path, JSON.stringify({ codexBinary: '/nonexistent/codex', codexHome: directory,
        models: [model] }), { mode: 0o600 });
      await assert.rejects(run(process.execPath, [cli, 'check-codex', path], { timeout: 10000 }), error => {
        assert.match(error.stderr, /configure at least one valid native Codex model/);
        return true;
      });
    }

    for (const openaiApiKeyFile of [null, '', 'relative']) {
      await writeFile(path, JSON.stringify({ codexBinary: '/nonexistent/codex', codexHome: directory,
        openaiApiKeyFile }), { mode: 0o600 });
      await assert.rejects(run(process.execPath, [cli, 'check-codex', path], { timeout: 10000 }), error => {
        assert.match(error.stderr, /openaiApiKeyFile must be an absolute private file path/);
        return true;
      });
    }
    for (const reasoningEffort of [null, '', 'invalid']) {
      await writeFile(path, JSON.stringify({ codexBinary: '/nonexistent/codex', codexHome: directory,
        reasoningEffort }), { mode: 0o600 });
      await assert.rejects(run(process.execPath, [cli, 'check-codex', path], { timeout: 10000 }), error => {
        assert.match(error.stderr, /reasoningEffort must be high when configured/);
        return true;
      });
    }
    await writeFile(path, JSON.stringify({ inference: 'unknown' }), { mode: 0o600 });
    await assert.rejects(run(process.execPath, [cli, 'start', path], { timeout: 10000 }), error => {
      assert.match(error.stderr, /inference must be codex or cliproxyapi/);
      return true;
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
