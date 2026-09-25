import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createPublicClient, createWalletClient, http, keccak256, stringToHex, zeroAddress, toHex } from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { capitalClient, financeRoles } from '@agent-capital-tree/sdk';
import { chainHandlers, OnchainSpawnChain, ChildGasFunding, childKeyId } from '../dist/index.js';

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
  } finally { clearInterval(mine); }
  console.log(JSON.stringify({ localChain: true, sdkTree: true, realEnsContracts: true, runtimeSignerBoundary: true, capitalConserved: true }));
} finally { anvil.kill(); }
