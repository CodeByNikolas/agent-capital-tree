import { createHash } from 'node:crypto';
import { mkdtemp, copyFile, rm, readFile, realpath, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const [codexPath, expectedHash] = process.argv.slice(2);
if (!isAbsolute(codexPath ?? '') || !/^[a-f0-9]{64}$/.test(expectedHash ?? '')) {
  throw new Error('usage: node build-worker-image.mjs /absolute/path/to/codex EXPECTED_SHA256');
}
const binary = await realpath(codexPath);
const info = await stat(binary);
if (!info.isFile() || !(info.mode & 0o111)) throw new Error('Codex binary is not executable');
const bytes = await readFile(binary);
if (createHash('sha256').update(bytes).digest('hex') !== expectedHash) throw new Error('Codex binary hash mismatch');
if (bytes.toString('ascii', 1, 4) !== 'ELF') throw new Error('Codex binary must be Linux ELF');
const machine = bytes.readUInt16LE(18);
const architecture = machine === 183 ? 'arm64' : machine === 62 ? 'amd64' : undefined;
if (!architecture) throw new Error('unsupported Codex binary architecture');
const capture = (program, args) => new Promise((resolve, reject) => {
  const child = spawn(program, args, { stdio: ['ignore', 'pipe', 'ignore'] });
  let output = '';
  child.stdout.on('data', chunk => { if (output.length < 4096) output += chunk.toString(); });
  child.once('error', reject);
  child.once('exit', code => code === 0 ? resolve(output.trim()) : reject(new Error(`${program} failed`)));
});
if ((await capture(binary, ['--version'])) !== 'codex-cli 0.154.0') throw new Error('expected Codex 0.154.0');
const dockerArch = await capture('docker', ['info', '--format', '{{.Architecture}}']);
if ({ aarch64: 'arm64', arm64: 'arm64', x86_64: 'amd64', amd64: 'amd64' }[dockerArch] !== architecture) {
  throw new Error('Codex binary architecture does not match Docker daemon');
}
const temp = await mkdtemp(join(tmpdir(), 'act-worker-image-'));
try {
  await Promise.all([
    copyFile(binary, join(temp, 'codex')),
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
