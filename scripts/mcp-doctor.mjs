#!/usr/bin/env node
// Host prerequisite check; never reads keys, private config, or a wallet.
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const checks = [];
for (const [name, binary, args] of [
  ['Node.js', process.execPath, ['--version']],
  ['Codex CLI', process.env.ACT_CODEX_BIN ?? 'codex', ['--version']],
]) {
  try {
    const { stdout } = await execFile(binary, args, { timeout: 15_000 });
    checks.push({ name, ok: true, version: stdout.trim() });
  } catch (error) {
    checks.push({ name, ok: false, reason: error.code === 'ENOENT' ? 'not found on PATH' : error.message });
  }
}
const pnpmFromRunner = /^pnpm\/([\d.]+)/.exec(process.env.npm_config_user_agent ?? '');
if (pnpmFromRunner) checks.splice(1, 0, { name: 'pnpm', ok: true, version: pnpmFromRunner[1] });
else {
  try {
    const { stdout } = await execFile('pnpm', ['--version'], { timeout: 15_000 });
    checks.splice(1, 0, { name: 'pnpm', ok: true, version: stdout.trim() });
  } catch {
    checks.splice(1, 0, { name: 'pnpm', ok: false, reason: 'run via pnpm mcp:doctor (or put pnpm on PATH)' });
  }
}
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 22) checks[0] = { name: 'Node.js', ok: false, reason: 'version 22 or newer required' };
for (const check of checks) console.log(`${check.ok ? 'OK' : 'MISSING'} ${check.name}: ${check.version ?? check.reason}`);
console.log(`Platform: ${process.platform}/${process.arch}`);
console.log('Read-only MCP verification needs no wallet, private config, Docker, or runtime token.');
if (process.platform === 'win32') console.log('Finance writes require the Linux companion in WSL2; native Windows runtime is unsupported.');
if (checks.some(check => !check.ok)) process.exitCode = 1;
