import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

test('worker builder validates Linux CLI inside Docker and rejects an unpinned version', async () => {
  const root = await mkdtemp(join(tmpdir(), 'act-image-test-'));
  try {
    const runtime = join(root, 'runtime');
    await mkdir(runtime);
    await mkdir(join(root, 'plugin', 'bundle'), { recursive: true });
    await copyFile(new URL('../build-worker-image.mjs', import.meta.url), join(runtime, 'build-worker-image.mjs'));
    for (const file of ['Dockerfile.worker', 'bridge.mjs']) await writeFile(join(runtime, file), 'fixture');
    await writeFile(join(root, 'plugin', 'bundle', 'server.mjs'), 'fixture');
    // Deliberately not runnable on any host: only the mocked Docker may execute it.
    const elf = Buffer.alloc(64);
    elf.write('\x7fELF');
    elf.writeUInt16LE(183, 18);
    const binary = join(root, 'linux-codex');
    await writeFile(binary, elf, { mode: 0o755 });
    const hash = createHash('sha256').update(elf).digest('hex');
    const imageId = `sha256:${'a'.repeat(64)}`;
    const log = join(root, 'docker-calls');
    await writeFile(join(root, 'docker'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + '\\n');
if (args[0] === 'info') console.log('aarch64');
else if (args[0] === 'build') fs.writeFileSync(args[args.indexOf('--iidfile') + 1], ${JSON.stringify(imageId)});
else if (args[0] === 'run') console.log(process.env.FIXTURE_VERSION);
else process.exit(1);
`, { mode: 0o755 });
    const invoke = version => spawnSync(process.execPath, [join(runtime, 'build-worker-image.mjs'), binary, hash], {
      encoding: 'utf8', env: { ...process.env, PATH: `${root}:${process.env.PATH}`, FIXTURE_VERSION: version }
    });
    const accepted = invoke('codex-cli 0.154.0');
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.equal(accepted.stdout.trim(), imageId);
    const calls = (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.deepEqual(calls.map(args => args[0]), ['info', 'build', 'run']);
    assert.deepEqual(calls[2], ['run', '--rm', '--network', 'none', '--read-only',
      '--cap-drop=ALL', '--security-opt=no-new-privileges', '--user=65534:65534',
      '--entrypoint', '/opt/act/codex', imageId, '--version']);
    const rejected = invoke('codex-cli 0.153.0');
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /expected Codex 0\.154\.0/);
    assert.equal(rejected.stdout, '');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
