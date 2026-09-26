#!/usr/bin/env node
// Run inside Linux/WSL2. The local MCP host sees only this command and a private directory path.
import { spawn } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.argv[2];
if (process.platform === 'win32' || !root || !isAbsolute(root)) {
  throw new Error('Use: node packages/runtime/mcp-stdio.mjs /absolute/private-runtime-root inside Linux/WSL2');
}
async function privatePath(path, mode, directory = false) {
  const info = await lstat(path);
  if (info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o777) !== mode ||
    (directory ? !info.isDirectory() : !info.isFile())) throw new Error('Unsafe private MCP runtime path');
  return path;
}
await privatePath(root, 0o700, true);
const domain = JSON.parse(await readFile(await privatePath(join(root, 'domain.json'), 0o600), 'utf8'));
const ready = JSON.parse(await readFile(await privatePath(join(root, 'mcp-ready.json'), 0o600), 'utf8'));
const token = (await readFile(await privatePath(join(root, 'root-session.token'), 0o600), 'utf8')).trim();
const origin = new URL(ready.toolsOrigin);
if (domain.chainId !== 11155111 || ready.chainId !== 11155111 ||
  domain.rootId !== ready.rootId || domain.controller !== ready.controller ||
  origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || origin.pathname !== '/' ||
  origin.username || origin.password || origin.search || origin.hash || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
  throw new Error('Invalid or stale private MCP runtime state');
}
const bundle = fileURLToPath(new URL('../plugin/bundle/server.mjs', import.meta.url));
const child = spawn(process.execPath, [bundle], {
  stdio: 'inherit',
  env: { ...process.env, ACT_RUNTIME_URL: origin.origin, ACT_MCP_TOKEN: token }
});
child.on('error', () => { process.stderr.write('Could not start local MCP bundle.\n'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
