#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { RuntimeCompanion, prepareRootOperator, NativeCodexLauncher } from './dist/index.js';

const [command, configPath, flag] = process.argv.slice(2);
if (!['prepare-root', 'start', 'check-codex'].includes(command) || !isAbsolute(configPath ?? '') || (flag && flag !== '--enable-sepolia-writes')) {
  throw new Error('usage: node packages/runtime/cli.mjs prepare-root|start|check-codex /absolute/private-config.json [--enable-sepolia-writes]');
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
  const inference = config.inference ?? 'codex';
  let provider;
  if (inference === 'codex') {
    if (!isAbsolute(config.codexBinary ?? '') || !isAbsolute(config.codexHome ?? '')) {
      throw new Error('native Codex requires absolute codexBinary and dedicated codexHome paths');
    }
    provider = { inference, codexBinary: config.codexBinary, codexHome: config.codexHome };
  } else if (inference === 'cliproxyapi') {
    let upstreamKey;
    if (Object.hasOwn(config, 'providerTokenFile')) upstreamKey = (await privateFile(config.providerTokenFile)).trim();
    else {
      const result = await promisify(execFile)('/usr/local/bin/codexops-proxy-token', [], { encoding: 'utf8' });
      upstreamKey = result.stdout.trim();
    }
    if (!upstreamKey) throw new Error('CLIProxyAPI token is unavailable');
    provider = { inference, upstream: config.upstream, upstreamKey };
  } else throw new Error('inference must be codex or cliproxyapi');
  if (command === 'check-codex') {
    if (inference !== 'codex') throw new Error('check-codex requires native Codex mode');
    if (!Array.isArray(config.models) || !config.models.length ||
        !config.models.every(model => typeof model === 'string' && /^[\w.-]+$/.test(model))) {
      throw new Error('configure at least one valid native Codex model');
    }
    const launcher = new NativeCodexLauncher(provider);
    try {
      for (const model of config.models) await launcher.ensureAvailable(model);
      process.stdout.write('Native Codex login, configured models and Docker are available. No capital was allocated.\n');
    } finally { await launcher.close(); }
    process.exit(0);
  }
  const multibaas = config.multibaas && {
    deploymentUrl: config.multibaas.deploymentUrl,
    controllerLabel: config.multibaas.controllerLabel,
    apiKey: (await privateFile(config.multibaas.apiKeyFile)).trim()
  };
  const companion = new RuntimeCompanion({ runtimeRoot: config.runtimeRoot, rootId: config.rootId,
    rpcUrl: config.rpcUrl, controller: config.controller, ...provider,
    imageId: config.imageId, models: config.models,
    workerUid: process.getuid(), workerGid: process.getgid(),
    childGasWei: BigInt(config.childGasWei ?? '0'), paymentServices: config.paymentServices, writesEnabled: flag === '--enable-sepolia-writes', multibaas });
  const ready = await companion.start();
  process.stdout.write(`Companion listening at ${ready.toolsOrigin}; root token file: ${ready.rootTokenFile}; Sepolia writes ${flag ? 'enabled' : 'disabled'}\n`);
  const shutdown = () => { void companion.close().then(() => process.exit(0)); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
