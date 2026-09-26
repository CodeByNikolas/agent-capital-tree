#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { RuntimeCompanion, prepareRootOperator } from './dist/index.js';

const [command, configPath, flag] = process.argv.slice(2);
if (process.platform === 'win32') {
  throw new Error('Native Windows finance runtime is unsupported. Run this CLI inside WSL2 (Linux) with a Linux-absolute private config path. For a keyless MCP read-only check on Windows, run pnpm mcp:doctor and pnpm mcp:verify from the repo root.');
}
if (!['prepare-root', 'start'].includes(command) || !isAbsolute(configPath ?? '') || (flag && flag !== '--enable-sepolia-writes')) {
  throw new Error('usage: node packages/runtime/cli.mjs prepare-root|start /absolute/private-config.json [--enable-sepolia-writes]');
}
const privateFile = async path => {
  if (!isAbsolute(path)) throw new Error('private file path must be absolute');
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o600) {
    throw new Error('private file must belong to this user and have mode 0600');
  }
  return readFile(path, 'utf8');
};
const config = JSON.parse(await privateFile(configPath));
if (command === 'prepare-root') {
  const address = await prepareRootOperator(config.runtimeRoot, config.rootId, config.controller);
  process.stdout.write(`${address}\n`);
} else {
  let upstreamKey;
  if (Object.hasOwn(config, 'providerTokenFile')) upstreamKey = (await privateFile(config.providerTokenFile)).trim();
  else {
    const result = await promisify(execFile)('/usr/local/bin/codexops-proxy-token', [], { encoding: 'utf8' });
    upstreamKey = result.stdout.trim();
  }
  if (!upstreamKey) throw new Error('CLIProxyAPI token is unavailable');
  const multibaas = config.multibaas && {
    deploymentUrl: config.multibaas.deploymentUrl,
    controllerLabel: config.multibaas.controllerLabel,
    apiKey: (await privateFile(config.multibaas.apiKeyFile)).trim()
  };
  const companion = new RuntimeCompanion({ runtimeRoot: config.runtimeRoot, rootId: config.rootId,
    rpcUrl: config.rpcUrl, controller: config.controller, upstream: config.upstream,
    upstreamKey, imageId: config.imageId, models: config.models,
    workerUid: process.getuid(), workerGid: process.getgid(),
    childGasWei: BigInt(config.childGasWei ?? '0'), paymentServices: config.paymentServices, writesEnabled: flag === '--enable-sepolia-writes', multibaas });
  const ready = await companion.start();
  process.stdout.write(`Companion listening at ${ready.toolsOrigin}; root token file: ${ready.rootTokenFile}; Sepolia writes ${flag ? 'enabled' : 'disabled'}\n`);
  const shutdown = () => { void companion.close().then(() => process.exit(0)); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
