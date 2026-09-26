#!/usr/bin/env node
// Config-free capital demo. Windows delegates to Linux; private keys never cross WSL.
import { spawn, execFileSync } from 'node:child_process';
import { access, lstat, readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const [command, query] = args;
const packageBase = new URL(import.meta.url.endsWith('/bundle/capital.mjs') ? '../' : './', import.meta.url);
const script = fileURLToPath(new URL('capital.mjs', packageBase));
const repo = fileURLToPath(new URL('../..', packageBase));
const usage = 'node packages/runtime/capital.mjs prepare|check|settings|stdio <ENS-name|vault-address|root-id> [--runtime-root /private/linux/path] [--enable-sepolia-writes]';
if (!['prepare', 'check', 'settings', 'stdio'].includes(command) || !query) throw new Error(usage);
let explicitRoot, writesEnabled = false;
for (let i = 2; i < args.length; i++) {
  if (args[i] === '--runtime-root' && args[i + 1] && !explicitRoot) explicitRoot = args[++i];
  else if (args[i] === '--enable-sepolia-writes' && !writesEnabled) writesEnabled = true;
  else throw new Error(usage);
}
const launchArgs = [script, 'stdio', query, ...(explicitRoot ? ['--runtime-root', explicitRoot] : []), ...(writesEnabled ? ['--enable-sepolia-writes'] : [])];
try {
if (command === 'settings') {
  console.log(JSON.stringify({ capital_tree_demo: { command: process.execPath, args: launchArgs } }, null, 2));
} else if (process.platform === 'win32') {
  const linuxScript = execFileSync('wsl.exe', ['--exec', 'wslpath', '-u', script], { encoding: 'utf8', windowsHide: true }).trim();
  // Arguments remain positional, never inserted into shell source. Login shell loads the user's Node path.
  const child = spawn('wsl.exe', ['--exec', '/bin/sh', '-lc', 'exec node "$@"', 'act-capital', linuxScript, ...args], { stdio: 'inherit', windowsHide: true });
  child.on('error', () => { process.stderr.write('WSL/Node unavailable. Install Node 22+ in your default WSL distribution. Docker is not needed.\n'); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} else {
  if (process.platform !== 'linux') throw new Error('Capital signing currently requires Linux or WSL2; private Unix storage checks are not disabled.');
  const { RuntimeCompanion, WorkerKeyStore, prepareRootOperator, capitalReadiness } = await import('./dist/index.js');
  const { capitalClient } = await import('../sdk/dist/index.js');
  const manifest = JSON.parse(await readFile(new URL('../../deployments/usdc-sepolia.json', packageBase), 'utf8'));
  if (manifest.chainId !== 11155111) throw new Error('Expected Ethereum Sepolia manifest');
  const controller = manifest.contracts.CapitalController.address;
  const rpcUrl = process.env.ACT_SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia.publicnode.com';
  const client = capitalClient(rpcUrl, controller);
  // Resolve lazily after MCP initialization: public RPC slowness must not hide the tool catalog.
  let rootId, runtimeRoot, initializing;
  const base = join(homedir(), '.agent-capital-tree');
  async function privatePath(path, mode, directory = false) {
    const info = await lstat(path);
    if (info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o777) !== mode ||
      (directory ? !info.isDirectory() : !info.isFile())) throw new Error('Unsafe private capital profile');
    return path;
  }
  async function matchingDomain(path) {
    try {
      await privatePath(path, 0o700, true);
      const domain = JSON.parse(await readFile(await privatePath(join(path, 'domain.json'), 0o600), 'utf8'));
      return domain.chainId === 11155111 && domain.rootId === rootId && domain.controller === controller.toLowerCase();
    } catch { return false; }
  }
  async function initialize() {
    if (runtimeRoot) return;
    initializing ??= (async () => {
    const initial = await client.resolveTree(query);
    rootId = initial.tree.rootId.toString(); // Fixed launch scope, never supplied by model tool arguments.
    const candidates = [];
  if (!explicitRoot) {
    for (const entry of await readdir(base, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; })) {
      if (entry.isDirectory() && await matchingDomain(join(base, entry.name))) candidates.push(join(base, entry.name));
    }
    if (candidates.length > 1) throw new Error('Multiple matching private profiles. Select the existing one with --runtime-root; do not rebind the operator.');
  }
  const selectedRoot = explicitRoot ?? candidates[0] ?? join(base, `capital-${controller.toLowerCase()}-${rootId}`);
  if (!isAbsolute(selectedRoot) || !relative(repo, resolve(selectedRoot)).startsWith('..') || selectedRoot.startsWith('/mnt/')) {
    throw new Error('Use a private Linux directory outside the repository and Windows mounts');
  }
  runtimeRoot = selectedRoot;
    })().finally(() => { initializing = undefined; });
    return initializing;
  }
  async function localOperator() {
    await initialize();
    const keyFile = join(runtimeRoot, 'keys', `root-${rootId}.keystore.json`);
    try { await access(keyFile); } catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
    if (!(await matchingDomain(runtimeRoot))) throw new Error('Private profile domain does not match this root');
    return (await new WorkerKeyStore(join(runtimeRoot, 'keys')).account(`root-${rootId}`)).address;
  }
  async function inspect(budgetRaw = '50000') {
    await initialize();
    const tree = await client.getTree(BigInt(rootId));
    const operator = await localOperator();
    const gasAddress = operator ?? tree.operator;
    const gas = await client.rpc.getBalance({ address: gasAddress, blockNumber: tree.source.blockNumber });
    return { ...capitalReadiness(tree, operator, gas, BigInt(budgetRaw)), writesEnabled,
      localProfile: runtimeRoot, toolVersion: 'capital-demo-1',
      signing: 'Owner keeps their wallet. Only their explicitly authorized local agent key signs bounded vault actions.' };
  }
  async function prepare(budgetRaw = '50000', openBrowser = false) {
    await initialize();
    const tree = await client.getTree(BigInt(rootId));
    let operator = await localOperator();
    if (!operator) {
      if (tree.operator !== '0x0000000000000000000000000000000000000000') {
        throw new Error('An operator is already bound but its local key was not found. Select its existing --runtime-root; automatic replacement would invalidate the tree.');
      }
      operator = await prepareRootOperator(runtimeRoot, rootId, controller);
    }
    const setup = await inspect(budgetRaw);
    const url = new URL('https://agent-capital-tree.vercel.app/setup');
    url.searchParams.set('vault', tree.nodes.find(node => node.id === tree.rootId).ensName);
    if (!setup.checks.operatorBound) url.searchParams.set('action', 'set-root-operator');
    else if (!setup.checks.vaultFunded) url.searchParams.set('action', 'fund-root');
    url.searchParams.set('operator', operator);
    url.searchParams.set('budget', budgetRaw);
    const { openWalletBrowser } = await import('../../scripts/open-wallet-browser.mjs');
    const browser = openBrowser ? await openWalletBrowser(url.href) : { opened: false, method: 'not-requested', walletDetected: false };
    return { ...setup, url: url.href, browser, transactionSubmitted: false,
      next: 'Review Agent authorization, USDC funding and native Sepolia-ETH gas separately. Already completed steps need not be repeated. Do not rebind an already correct operator.' };
  }
  const serialize = value => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
  if (command === 'check') console.log(serialize(await inspect()));
  else if (command === 'prepare') console.log(serialize(await prepare()));
  else {
    const { visualServer } = await import('../plugin/visual-server.mjs');
    const { toolSpecs } = await import('../plugin/dist/tools.js');
    const { RuntimeClient } = await import('../plugin/dist/runtime-client.js');
    const { StdioServerTransport } = await import('../plugin/node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js');
    const { z } = await import('../plugin/node_modules/zod/index.js');
    const { rootSetupSpec, prepareRootSetup } = await import('../../scripts/root-wallet-setup.mjs');
    const budgetRaw = z.string().regex(/^[1-9]\d{0,5}$/).refine(v => BigInt(v) <= 100000n).default('50000');
    const specs = { ...toolSpecs,
      visualizeTree: { ...toolSpecs.getTree, description: 'Alias of getTree. Return data and dashboard images from the same Sepolia snapshot.' },
      prepareRootSetup: rootSetupSpec,
      getCapitalSetup: { readOnly: true, schema: z.object({ budgetRaw }).strict(), description: 'First call for the capital demo. Reports ALL setup requirements at one Sepolia block: local signer, binding, rights, USDC limit, balance and separate native ETH gas. No Docker or inference key needed. Positive gas is not a fee estimate.' },
      prepareCapitalSetup: { readOnly: false, schema: z.object({ budgetRaw, openBrowser: z.boolean().default(true) }).strict(), description: 'Prepare the fixed root’s private local agent key if unbound, and open Agent authorization in the normal wallet browser. Never replace a bound operator or submit a transaction. Existing bound keys are reused. No separate chat browser.' }
    };
    let companion, bridge, starting;
    async function runtime() {
      if (bridge) return bridge;
      starting ??= (async () => {
        const setup = await inspect();
        if (!setup.checks.localKey || !setup.checks.operatorBound) throw new Error('SETUP_REQUIRED');
        companion = new RuntimeCompanion({ mode: 'capital', runtimeRoot, rootId, controller, rpcUrl, writesEnabled });
        try {
          const ready = await companion.start();
          const token = (await readFile(await privatePath(ready.rootTokenFile, 0o600), 'utf8')).trim();
          bridge = new RuntimeClient(ready.toolsOrigin, token);
          return bridge;
        } catch (error) { companion = undefined; throw error; }
      })().finally(() => { starting = undefined; });
      return starting;
    }
    const server = await visualServer({ name: 'agent-capital-tree-capital', specs,
      instructions: 'Use getCapitalSetup before demo actions and show its complete checklist. Prefer createChildVault: the chat is the intelligence, no background model is launched. Scope is fixed to this root. Never repeat completed funding or rebind a correct operator. After writes show getTree. prepareCapitalSetup uses the normal wallet browser, not a chat automation browser.',
      execute: async (name, input) => {
        if (name === 'getCapitalSetup') return inspect(input.budgetRaw);
        if (name === 'prepareRootSetup') return prepareRootSetup(input);
        if (name === 'prepareCapitalSetup') return prepare(input.budgetRaw, input.openBrowser);
        if (name === 'getTree' || name === 'visualizeTree') {
          const resolved = await client.resolveTree(input.query ?? input.rootId);
          return { ...resolved.tree, selectedNodeId: resolved.selectedNodeId };
        }
        if (name === 'spawnChild') return { status: 'unavailable', transactionSubmitted: false, next: 'Use createChildVault for chat-managed capital. Autonomous Docker workers require the separate worker configuration.' };
        if (name === 'getPaymentServices') return { network: 'eip155:11155111', asset: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', decimals: 6, services: [] };
        if (name === 'getCapitalActivity' || name === 'purchaseService') return { status: 'unavailable', transactionSubmitted: false,
          next: 'This config-free demo does not configure indexed history or paid services. Use getTree for current chain state; these integrations are optional worker-mode configuration.' };
        if (!specs[name].readOnly && !writesEnabled) return { status: 'blocked', transactionSubmitted: false, next: 'Writes disabled. Enable --enable-sepolia-writes explicitly in this local MCP command.' };
        return (await runtime()).call(name, input);
      },
      describeError: () => 'Request did not return a confirmed result. Use getCapitalSetup for all requirements; reconcile getOperationStatus and getTree before retrying a write. Never replace the operator automatically.' });
    let stopping = false;
    const stop = async () => {
      if (stopping) return; stopping = true;
      await starting?.catch(() => {});
      await companion?.close();
      await server.close();
    };
    process.once('SIGINT', () => { void stop(); });
    process.once('SIGTERM', () => { void stop(); });
    server.onclose = () => { void stop(); };
    await server.connect(new StdioServerTransport());
  }
}
} catch (error) {
  // RPC errors may embed provider URLs. Never print raw errors, stacks or credentials.
  const safe = ['Expected Ethereum Sepolia manifest', 'Multiple matching private profiles.', 'Use a private Linux directory',
    'Private profile domain does not match', 'Unsafe private capital profile', 'An operator is already bound', 'Capital signing currently requires'];
  process.stderr.write(`${safe.some(prefix => String(error.message).startsWith(prefix)) ? error.message : 'Capital setup unavailable. Check the root identifier, Sepolia RPC and private Linux profile. No success was confirmed.'}\n`);
  process.exitCode = 1;
}
