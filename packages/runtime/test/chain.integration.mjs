import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createPublicClient, createWalletClient, http, keccak256, stringToHex, zeroAddress, toHex } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { capitalClient, financeRoles } from '@agent-capital-tree/sdk';
import { chainHandlers } from '../dist/index.js';

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
  const token0 = await deploy('CapitalController.t', ['A', 'A'], 'TestToken');
  const token1 = await deploy('CapitalController.t', ['B', 'B'], 'TestToken');
  const registry = await deploy('PermissionedRegistry', [labels.address, accounts[0].address, 1n << 0n]);
  const expiry = (await rpc.getBlock()).timestamp + 100000n;
  // Registry role values are extracted from the exact pinned ENS library below.
  const registryRoles = await readFile(new URL('../../../contracts/lib/ens-contracts-v2/contracts/src/registry/libraries/RegistryRolesLib.sol', import.meta.url), 'utf8');
  const shift = name => BigInt(registryRoles.match(new RegExp(`${name} = 1 << (\\d+)`))[1]);
  // Registrar constructor value is verified against pinned source, avoiding an invented test ACL.
  assert.equal(shift('ROLE_REGISTRAR'), 0n);
  await write(registry, 'register', ['project', accounts[0].address, zeroAddress, zeroAddress, 1n << shift('ROLE_SET_SUBREGISTRY'), expiry]);
  const factory = await deploy('NodeFactory');
  const poolId = toHex(7n, { size: 32 });
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
  await write(controller, 'spawnChild', [1n, 'child', accounts[2].address, { ...policy, maxAmounts: [20n, 20n] }, [10n, 0n], toHex(1n, { size: 32 })], 1);
  const tree = await sdk.getTree(1n);
  assert.equal(tree.nodes[1].ensName, 'child.owner.project.eth');
  assert.deepEqual(tree.totalBalances, [100n, 0n]);
  assert.deepEqual(tree.nodes.map(node => node.balances[0]), [90n, 10n]);
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
  } finally { clearInterval(mine); }
  console.log(JSON.stringify({ localChain: true, sdkTree: true, realEnsContracts: true, runtimeSignerBoundary: true, capitalConserved: true }));
} finally { anvil.kill(); }
