import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createPublicClient, createWalletClient, http, keccak256, parseEther, stringToHex, zeroAddress, toHex } from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { capitalClient, financeRoles } from '@agent-capital-tree/sdk';
import { chainHandlers, OnchainSpawnChain, ChildGasFunding, RuntimeCompanion, childKeyId, prepareRootOperator } from '../dist/index.js';

// Disposable local chain only. Anvil's well-known test mnemonic is never used on Sepolia.
const reserve = createServer();
await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
const port = reserve.address().port;
await new Promise(resolve => reserve.close(resolve));
const rpcUrl = `http://127.0.0.1:${port}`;
const anvil = spawn(process.env.ACT_ANVIL_BIN ?? join(homedir(), '.agent-capital-tree/tools/foundry-v1.8.3/anvil'), ['--port', String(port), '--chain-id', '11155111', '--silent'], { stdio: 'ignore' });
let startupError;
anvil.on('error', error => { startupError = error; });
const rpc = createPublicClient({ chain: sepolia, transport: http(rpcUrl, { retryCount: 0 }), pollingInterval: 100 });
const accounts = [0, 1, 2, 3].map(addressIndex => mnemonicToAccount('test test test test test test test test test test test junk', { addressIndex }));
const wallets = accounts.map(account => createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) }));
const artifacts = new Map();
async function artifact(file, name = file) {
  const key = `${file}:${name}`;
  if (!artifacts.has(key)) artifacts.set(key, JSON.parse(await readFile(new URL(`../../../contracts/out/${file}.sol/${name}.json`, import.meta.url), 'utf8')));
  return artifacts.get(key);
}
async function deploy(file, args = [], name = file) {
  const a = await artifact(file, name);
  const hash = await wallets[0].deployContract({ abi: a.abi, bytecode: a.bytecode.object, args });
  const receipt = await rpc.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, 'success');
  return { address: receipt.contractAddress, abi: a.abi };
}
async function write(contract, functionName, args, signer = 0) {
  const { request } = await rpc.simulateContract({ ...contract, functionName, args, account: accounts[signer] });
  const receipt = await rpc.waitForTransactionReceipt({ hash: await wallets[signer].writeContract(request) });
  assert.equal(receipt.status, 'success');
  return receipt;
}
try {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    if (startupError || anvil.exitCode !== null) throw new Error('Disposable Anvil failed to start');
    try { await rpc.getChainId(); ready = true; break; } catch { await delay(100); }
  }
  assert.ok(ready, 'Anvil did not start');
  const labels = await deploy('CapitalController.t', [], 'TestLabelStore');
  const tokenA = await deploy('CapitalController.t', ['A', 'A'], 'TestToken');
  const tokenB = await deploy('CapitalController.t', ['B', 'B'], 'TestToken');
  const [token0, token1] = [tokenA, tokenB].sort((a, b) => a.address.toLowerCase().localeCompare(b.address.toLowerCase()));
  const registry = await deploy('PermissionedRegistry', [labels.address, accounts[0].address, 1n << 0n]);
  const expiry = (await rpc.getBlock()).timestamp + 100000n;
  // Registry role values are extracted from the exact pinned ENS library below.
  const registryRoles = await readFile(new URL('../../../contracts/lib/ens-contracts-v2/contracts/src/registry/libraries/RegistryRolesLib.sol', import.meta.url), 'utf8');
  const shift = name => BigInt(registryRoles.match(new RegExp(`${name} = 1 << (\\d+)`))[1]);
  // Registrar constructor value is verified against pinned source, avoiding an invented test ACL.
  assert.equal(shift('ROLE_REGISTRAR'), 0n);
  await write(registry, 'register', ['project', accounts[0].address, zeroAddress, zeroAddress, 1n << shift('ROLE_SET_SUBREGISTRY'), expiry]);
  const poolManager = await deploy('PositionManagerConfig', [], 'DummyPoolManager');
  const permit2 = await deploy('PositionManagerConfig', [], 'DummyPermit2');
  const positionManager = await deploy('PositionManagerConfig', [poolManager.address, permit2.address]);
  const vaultFactory = await deploy('VaultFactory', [poolManager.address, positionManager.address, permit2.address, [token0.address, token1.address]]);
  const factory = await deploy('NodeFactory', [vaultFactory.address]);
  const poolId = await rpc.readContract({ address: factory.address, abi: factory.abi, functionName: 'POOL_ID' });
  const controller = await deploy('CapitalController', [registry.address, labels.address, factory.address, [token0.address, token1.address], 'project', poolId]);
  const sdk = capitalClient(rpcUrl, controller.address);
  const projectRegistry = await sdk.controller.read.PROJECT_REGISTRY();
  await write(registry, 'setSubregistry', [keccak256(stringToHex('project')), projectRegistry]);
  const policy = { capabilities: Object.values(financeRoles).reduce((a, b) => a | b, 0n), maxAmounts: [100n, 100n], expiry: expiry - 100n, tokenMask: 3, poolId };
  await write(controller, 'createRoot', ['owner', policy]);
  await write(controller, 'setRootOperator', [1n, accounts[1].address, policy]);
  await write(token0, 'mint', [accounts[0].address, 100n]);
  await write(token0, 'approve', [controller.address, 100n]);
  await write(controller, 'fundRoot', [1n, [100n, 0n]]);
  const rootChildReceipt = await write(controller, 'spawnChild', [1n, 'child', accounts[2].address, { ...policy, maxAmounts: [20n, 20n] }, [10n, 0n], toHex(1n, { size: 32 })], 1);
  const tree = await sdk.getTree(1n);
  assert.equal(tree.nodes[1].ensName, 'child.owner.project.eth');
  assert.deepEqual(tree.totalBalances, [100n, 0n]);
  assert.deepEqual(tree.nodes.map(node => node.balances[0]), [90n, 10n]);
  assert.deepEqual(tree.nodes.map(node => node.position), [
    { tokenId: 0n, liquidity: 0n }, { tokenId: 0n, liquidity: 0n }
  ]);
  assert.ok(tree.nodes[1].authorizedCapabilities !== 0n);
  assert.deepEqual(tree.nodes[1].authorizedActions,
    ['delegate', 'swap', 'lpManage', 'collectFees', 'exit', 'restrict', 'reclaim']);
  const handlers = chainHandlers({ rpcUrl, controller: controller.address, accountFor: async context => accounts[context.workerId === 'root' ? 1 : 2] });
  const root = { workerId: 'root', rootId: '1', nodeId: '1', authorityGeneration: '1' };
  // Mine a second confirmation automatically while handlers wait for receipt finality depth.
  const mine = setInterval(() => { void rpc.request({ method: 'evm_mine' }).catch(() => {}); }, 100);
  try {
    await handlers.allocateCapital(root, { childId: '2', asset: token0.address, amount: '5' });
    assert.deepEqual((await sdk.getTree(1n)).nodes.map(node => node.balances[0]), [85n, 15n]);
    await assert.rejects(handlers.allocateCapital({ ...root, workerId: 'child' }, { childId: '2', asset: token0.address, amount: '5' }), /mismatched/);
    await assert.rejects(handlers.allocateCapital(root, { childId: '1', asset: token0.address, amount: '5' }), /direct child/);
    await handlers.reclaimAssets(root, { nodeId: '2' });
    assert.deepEqual((await sdk.getTree(1n)).nodes.map(node => node.balances[0]), [100n, 0n]);
    await handlers.revokeSubtree(root, { nodeId: '2' });
    assert.equal((await sdk.getTree(1n)).nodes[1].authorizedCapabilities, 0n);
    assert.deepEqual((await sdk.getTree(1n)).nodes[1].authorizedActions, []);
    const intents = await mkdtemp(join(tmpdir(), 'act-spawn-intent-'));
    try {
      const spawnRequest = { operationKey: toHex(2n, { size: 32 }), task: 'synthetic task', model: 'gpt-6-luna',
        token: token0.address, amount: '5', restrictions: { maxPerAction: { [token0.address]: '20', [token1.address]: '20' } } };
      const key = childKeyId(root, spawnRequest.operationKey, controller.address);
      const childAgent = privateKeyToAccount(`0x${'4'.repeat(64)}`);
      const grandchildAgent = privateKeyToAccount(`0x${'5'.repeat(64)}`);
      const childContext = { workerId: 'child3', rootId: '1', nodeId: '3', authorityGeneration: '1' };
      const grandchildRequest = { operationKey: toHex(3n, { size: 32 }), task: 'synthetic grandchild', model: 'gpt-6-luna',
        token: token0.address, amount: '1', restrictions: { maxPerAction: { [token0.address]: '10', [token1.address]: '10' } } };
      const grandchildKey = childKeyId(childContext, grandchildRequest.operationKey, controller.address);
      const keys = { directory: intents, account: async (id, create = false) => {
        if (id === 'root') return accounts[1];
        if (id === key) return childAgent;
        if (id === grandchildKey) return grandchildAgent;
        throw new Error('missing durable key');
      } };
      const config = { rpcUrl, controller: controller.address, keys, keyIdFor: async context => context.nodeId === '1' ? 'root' : key,
        serialize: async (_address, action) => action() };
      const adapter = new OnchainSpawnChain(config);
      await adapter.submit(root, spawnRequest);
      const spawned = await adapter.reconcile(root, spawnRequest);
      assert.equal(spawned.childId, '3');
      assert.equal(await adapter.confirmed(spawned), true);
      const restarted = new OnchainSpawnChain(config);
      assert.equal((await restarted.reconcile(root, spawnRequest)).childId, '3');
      await assert.rejects(restarted.reconcile(root, { ...spawnRequest, amount: '6' }), /intent conflicts/);
      const missingKey = new OnchainSpawnChain({ ...config, keys: { directory: intents, account: async id => {
        if (id === 'root') return accounts[1];
        throw new Error('missing durable key');
      } } });
      await assert.rejects(missingKey.reconcile(root, spawnRequest), /missing durable key/);
      const gas = new ChildGasFunding(rpcUrl, join(intents, 'gas'));
      const baseGrant = 20_000_000_000_000_000n;
      const beforeGas = await rpc.getBalance({ address: childAgent.address });
      assert.equal(beforeGas, 0n);
      const gasHash = await gas.fund(key, accounts[1], childAgent.address, baseGrant);
      assert.equal(await gas.fund(key, accounts[1], childAgent.address, baseGrant), gasHash);
      assert.equal(await rpc.getBalance({ address: childAgent.address }), baseGrant);
      await adapter.submit(childContext, grandchildRequest);
      const grandchild = await adapter.reconcile(childContext, grandchildRequest);
      assert.equal(grandchild.childId, '4');
      assert.equal(await adapter.confirmed(grandchild), true);
      const grandchildGasHash = await gas.fund(grandchildKey, childAgent, grandchildAgent.address, baseGrant / 4n);
      assert.equal(await gas.fund(grandchildKey, childAgent, grandchildAgent.address, baseGrant / 4n), grandchildGasHash);
      assert.equal(await rpc.getBalance({ address: grandchildAgent.address }), baseGrant / 4n);
      const rootSpawnGas = rootChildReceipt.gasUsed;
      const childSpawnGas = (await rpc.getTransactionReceipt({ hash: grandchild.txHash })).gasUsed;
      assert.ok(childSpawnGas > 0n && rootSpawnGas > 0n);
      console.log(JSON.stringify({ rootSpawnGas: rootSpawnGas.toString(), childSpawnGas: childSpawnGas.toString(),
        childGasRemaining: (await rpc.getBalance({ address: childAgent.address })).toString() }));
    } finally { await rm(intents, { recursive: true, force: true }); }
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'act-companion-restart-'));
    try {
      const rootAddress = await prepareRootOperator(runtimeRoot, '1', controller.address);
      await write(controller, 'setRootOperator', [1n, rootAddress, policy]);
      await rpc.waitForTransactionReceipt({ hash: await wallets[0].sendTransaction({ to: rootAddress, value: parseEther('0.05') }) });
      const generation = (await sdk.controller.read.rootGeneration([1n])).toString();
      const parent = { workerId: 'root', rootId: '1', nodeId: '1', authorityGeneration: generation };
      const operationKey = toHex(4n, { size: 32 });
      const request = { operationKey, task: 'synthetic dispatch only', model: 'gpt-6-luna', asset: token0.address,
        amount: '5', restrictions: { maxPerAction: { [token0.address]: '20', [token1.address]: '20' } } };
      const grant = parseEther('0.0001');
      const runtimeConfig = { runtimeRoot, rootId: '1', rpcUrl, controller: controller.address,
        upstream: 'http://127.0.0.1:1/v1', upstreamKey: 'synthetic-host-only',
        imageId: `sha256:${'a'.repeat(64)}`, models: ['gpt-6-luna'], workerUid: process.getuid(),
        workerGid: process.getgid(), childGasWei: grant, writesEnabled: true };
      let dispatches = 0;
      const start = async () => {
        const companion = new RuntimeCompanion(runtimeConfig);
        companion.launcher.ensureAvailable = async () => {};
        companion.launcher.launch = async () => { dispatches++; };
        companion.launcher.stop = async () => {};
        companion.launcher.close = async () => {};
        return { companion, ready: await companion.start() };
      };
      const tool = async (ready, name, args) => {
        const response = await fetch(`${ready.toolsOrigin}/v1/tools/${name}`, {
          method: 'POST', headers: { authorization: `Bearer ${await readFile(ready.rootTokenFile, 'utf8')}` },
          body: JSON.stringify(args)
        });
        return { status: response.status, body: await response.json() };
      };
      let running = await start();
      let first;
      try {
        first = await tool(running.ready, 'spawnChild', request);
        assert.equal(first.status, 200);
        assert.equal(first.body.dispatchStatus, 'started');
        assert.equal(dispatches, 1);
      } finally { await running.companion.close(); }
      const childAccount = await running.companion.keys.account(childKeyId(parent, operationKey, controller.address));
      const fundedBalance = await rpc.getBalance({ address: childAccount.address });
      const rootNonce = await rpc.getTransactionCount({ address: rootAddress });
      const allocatedTree = await sdk.getTree(1n);
      const allocatedBalance = allocatedTree.nodes.find(node => node.id.toString() === first.body.childId).balances[0];
      assert.equal(fundedBalance, grant);
      assert.equal(allocatedBalance, 5n);
      assert.equal((await readdir(join(runtimeRoot, 'gas'))).filter(name => name.endsWith('.json')).length, 1);
      running = await start();
      try {
        const repeated = await tool(running.ready, 'spawnChild', request);
        assert.equal(repeated.status, 200);
        assert.equal(repeated.body.childId, first.body.childId);
        assert.equal(repeated.body.dispatchStatus, 'started');
        assert.equal((await tool(running.ready, 'getOperationStatus', { operationKey })).body.dispatchStatus, 'started');
      } finally { await running.companion.close(); }
      assert.equal(dispatches, 1);
      assert.equal(await rpc.getTransactionCount({ address: rootAddress }), rootNonce);
      assert.equal(await rpc.getBalance({ address: childAccount.address }), fundedBalance);
      assert.equal((await sdk.getTree(1n)).nodes.length, allocatedTree.nodes.length);
      const cliDirectory = join(runtimeRoot, 'portable-provider-cli');
      const dockerBin = join(cliDirectory, 'bin');
      const dockerPath = join(dockerBin, 'docker');
      const cliConfigPath = join(cliDirectory, 'config.json');
      const providerTokenPath = join(cliDirectory, 'provider-token');
      const helperGuardPath = join(cliDirectory, 'host-helper-attempted');
      const preloadPath = join(cliDirectory, 'guard-provider-helper.mjs');
      await mkdir(dockerBin, { recursive: true, mode: 0o700 });
      await writeFile(dockerPath, '#!/bin/sh\nif [ "$1" = info ]; then exit 0; fi\nif [ "$1" = inspect ]; then exit 1; fi\nif [ "$1" = stop ]; then exit 0; fi\nexit 1\n', { mode: 0o700 });
      await chmod(dockerPath, 0o700);
      await writeFile(providerTokenPath, 'synthetic-provider-token\n', { mode: 0o600 });
      await writeFile(preloadPath, `import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { appendFileSync } from 'node:fs';
const original = childProcess.execFile;
childProcess.execFile = (...args) => {
  if (args[0] === '/usr/local/bin/codexops-proxy-token') {
    appendFileSync(${JSON.stringify(helperGuardPath)}, 'attempted\\n', { mode: 0o600 });
    throw new Error('provider helper forbidden in acceptance');
  }
  return original(...args);
};
syncBuiltinESMExports();
`, { mode: 0o600 });
      const assertNoHostHelper = async () => {
        let attempted = false;
        try { await readFile(helperGuardPath); attempted = true; }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        assert.equal(attempted, false, 'CLI attempted to call the HomeBox helper');
      };
      const cliEnv = { ...process.env, PATH: `${dockerBin}:${process.env.PATH}`,
        NODE_OPTIONS: [process.env.NODE_OPTIONS, `--import=${preloadPath}`].filter(Boolean).join(' ') };
      await writeFile(cliConfigPath, JSON.stringify({ runtimeRoot, rootId: '1', rpcUrl, controller: controller.address,
        upstream: 'http://127.0.0.1:1/v1', providerTokenFile: providerTokenPath, imageId: `sha256:${'a'.repeat(64)}`,
        models: ['gpt-6-luna'], childGasWei: '0' }), { mode: 0o600 });
      const cli = spawn(process.execPath, [new URL('../cli.mjs', import.meta.url).pathname, 'start', cliConfigPath], {
        env: cliEnv, stdio: ['ignore', 'pipe', 'pipe']
      });
      const cliExit = new Promise((resolve, reject) => {
        cli.once('error', reject);
        cli.once('exit', (code, signal) => resolve({ code, signal }));
      });
      let cliOutput = '', cliReady = false;
      const cliStartup = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('CLI provider-file startup timed out')), 15_000);
        const fail = () => { clearTimeout(timeout); reject(new Error('CLI provider-file startup failed')); };
        cli.stdout.on('data', chunk => {
          cliOutput = (cliOutput + chunk.toString()).slice(-2048);
          if (cliOutput.includes('Companion listening at')) {
            cliReady = true;
            clearTimeout(timeout);
            resolve(cliOutput);
          }
        });
        cli.stderr.on('data', () => {});
        cli.once('error', fail);
        cli.once('exit', () => { if (!cliReady) fail(); });
      });
      try {
        const output = await cliStartup;
        assert.match(output, /Sepolia writes disabled/);
        assert.ok(!output.includes('synthetic-provider-token'));
        await assertNoHostHelper();
      } finally {
        if (cli.exitCode === null && cli.signalCode === null) cli.kill('SIGTERM');
        await cliExit;
      }
      const looseToken = join(cliDirectory, 'loose-token');
      const emptyToken = join(cliDirectory, 'empty-token');
      const linkedToken = join(cliDirectory, 'linked-token');
      await writeFile(looseToken, 'synthetic-provider-token\n', { mode: 0o644 });
      await chmod(looseToken, 0o644);
      await writeFile(emptyToken, '', { mode: 0o600 });
      await symlink(providerTokenPath, linkedToken);
      // Explicit missing, malformed, world-readable, empty, or symlinked files fail closed.
      const invalidProviderFiles = [join(cliDirectory, 'missing-token'), '', null, false, 17, looseToken, emptyToken, linkedToken];
      for (const providerTokenFile of invalidProviderFiles) {
        await writeFile(cliConfigPath, JSON.stringify({ runtimeRoot, rootId: '1', rpcUrl, controller: controller.address,
          upstream: 'http://127.0.0.1:1/v1', providerTokenFile,
          imageId: `sha256:${'a'.repeat(64)}`, models: ['gpt-6-luna'], childGasWei: '0' }), { mode: 0o600 });
        const deniedCli = spawn(process.execPath, [new URL('../cli.mjs', import.meta.url).pathname, 'start', cliConfigPath], {
          env: cliEnv, stdio: ['ignore', 'ignore', 'ignore']
        });
        const deniedExit = new Promise((resolve, reject) => {
          deniedCli.once('error', reject);
          deniedCli.once('exit', code => resolve({ code }));
        });
        // Cold module loading can exceed 3s; match the successful CLI startup budget.
        const result = await Promise.race([deniedExit, delay(15_000).then(() => undefined)]);
        if (result === undefined) {
          if (deniedCli.exitCode === null && deniedCli.signalCode === null) deniedCli.kill('SIGTERM');
          await deniedExit;
        }
        assert.ok(result, 'CLI did not exit within the startup deadline for an invalid explicit provider token path');
        assert.notEqual(result.code, 0, 'CLI accepted an invalid explicit provider token path');
        await assertNoHostHelper();
      }
      console.log(JSON.stringify({ portableProviderCliConfig: true, invalidExplicitTokenFilesRejected: true,
        hostHelperAttempts: 0, writesEnabled: false }));
      await rm(join(runtimeRoot, 'spawn-journal'), { recursive: true, force: true }); // Disposable loss-of-journal case.
      running = await start();
      try {
        const uncertain = await tool(running.ready, 'spawnChild', request);
        assert.equal(uncertain.status, 200);
        assert.equal(uncertain.body.childId, first.body.childId);
        assert.equal(uncertain.body.dispatchStatus, 'allocation_confirmed_dispatch_unknown');
        assert.equal((await tool(running.ready, 'getOperationStatus', { operationKey })).body.dispatchStatus,
          'allocation_confirmed_dispatch_unknown');
        assert.equal((await tool(running.ready, 'spawnChild', request)).status, 409);
      } finally { await running.companion.close(); }
      assert.equal(dispatches, 1);
      assert.equal(await rpc.getTransactionCount({ address: rootAddress }), rootNonce);
      assert.equal(await rpc.getBalance({ address: childAccount.address }), fundedBalance);
      assert.equal((await readdir(join(runtimeRoot, 'gas'))).filter(name => name.endsWith('.json')).length, 1);
      assert.equal((await sdk.getTree(1n)).nodes.length, allocatedTree.nodes.length);
      console.log(JSON.stringify({ companionRestart: true, allocations: 1, gasFundings: 1, dispatches,
        lostJournal: 'allocation_confirmed_dispatch_unknown' }));
    } finally { await rm(runtimeRoot, { recursive: true, force: true }); }
  } finally { clearInterval(mine); }
  console.log(JSON.stringify({ localChain: true, sdkTree: true, realEnsContracts: true, runtimeSignerBoundary: true, capitalConserved: true }));
} finally { anvil.kill(); }
