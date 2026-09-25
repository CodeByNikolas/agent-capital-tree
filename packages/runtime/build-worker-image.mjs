import { mkdtemp, copyFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const codexPath = process.argv[2];
if (!codexPath || !resolve(codexPath).startsWith('/home/codexops/.codex/packages/standalone/releases/0.154.0-aarch64-unknown-linux-musl/bin/')) {
  throw new Error('pass the pinned Codex 0.154.0 binary path');
}
const temp = await mkdtemp(join(tmpdir(), 'act-worker-image-'));
try {
  await Promise.all([
    copyFile(codexPath, join(temp, 'codex')),
    copyFile(join(here, '../plugin/bundle/server.mjs'), join(temp, 'plugin-server.mjs')),
    copyFile(join(here, 'bridge.mjs'), join(temp, 'bridge.mjs')),
    copyFile(join(here, 'Dockerfile.worker'), join(temp, 'Dockerfile'))
  ]);
  const iid = join(temp, 'iid');
  await new Promise((ok, fail) => {
    const child = spawn('docker', ['build', '--iidfile', iid, temp], { stdio: 'inherit' });
    child.once('error', fail);
    child.once('exit', code => code === 0 ? ok() : fail(new Error(`docker build exited ${code}`)));
  });
  const imageId = (await readFile(iid, 'utf8')).trim();
  if (!/^sha256:[a-f0-9]{64}$/.test(imageId)) throw new Error('invalid built image ID');
  process.stdout.write(`${imageId}\n`);
} finally { await rm(temp, { recursive: true, force: true }); }
