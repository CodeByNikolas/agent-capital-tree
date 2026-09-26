import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { Contract, JsonRpcProvider, Wallet, id, parseEther } from 'ethers';
import { capitalClient, capitalControllerAbi, financeRoles } from '../packages/sdk/dist/index.js';
import { chainHandlers } from '../packages/runtime/dist/index.js';

// Fork-only financial proof. It uses fresh disposable wallets and never submits a public transaction.
const { privateKeyToAccount } = createRequire(new URL('../packages/runtime/package.json', import.meta.url))('viem/accounts');
const manifest = JSON.parse(await readFile(new URL('../deployments/sepolia.json', import.meta.url), 'utf8'));
const remote = new JsonRpcProvider('https://ethereum-sepolia.publicnode.com');
assert.equal((await remote.getNetwork()).chainId, 11155111n);
const forkBlock = await remote.getBlockNumber();
remote.destroy();
const reserve = createServer();
await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
const port = reserve.address().port;
await new Promise(resolve => reserve.close(resolve));
const anvil = spawn(process.env.ACT_ANVIL_BIN ?? join(homedir(), '.agent-capital-tree/tools/foundry-v1.8.3/anvil'),
  ['--port', String(port), '--chain-id', '11155111', '--fork-url', 'https://ethereum-sepolia.publicnode.com',
    '--fork-block-number', String(forkBlock), '--silent'], { stdio: 'ignore' });
let startupError;
anvil.on('error', error => { startupError = error; });
const rpcUrl = `http://127.0.0.1:${port}`;
const rpc = new JsonRpcProvider(rpcUrl, 11155111, { staticNetwork: true, cacheTimeout: -1 });
const gas = {};
try {
  let ready = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    if (startupError || anvil.exitCode !== null) throw new Error('Anvil fork failed');
    try { await rpc.getBlockNumber(); ready = true; break; } catch { await delay(200); }
  }
  assert.ok(ready, 'Anvil startup timed out');
  const owner = Wallet.createRandom().connect(rpc);
  const operator = Wallet.createRandom().connect(rpc);
  const idle = Wallet.createRandom();
  const sibling = Wallet.createRandom();
  for (const wallet of [owner, operator, idle, sibling]) {
    assert.equal(await rpc.getCode(wallet.address), '0x');
    await rpc.send('anvil_setBalance', [wallet.address, '0x8ac7230489e80000']);
  }
  const controller = new Contract(manifest.contracts.CapitalController.address, capitalControllerAbi, owner);
  const tokenA = manifest.tokens[0].address;
  const token = new Contract(tokenA, ['function mint()', 'function approve(address,uint256) returns(bool)'], owner);
  const sdk = capitalClient(rpcUrl, manifest.contracts.CapitalController.address);
  const amount = parseEther('4');
  const one = parseEther('1');
  const half = parseEther('0.5');
  const policy = { capabilities: financeRoles.delegate | financeRoles.reclaim, maxAmounts: [amount, 0n],
    expiry: BigInt((await rpc.getBlock('latest')).timestamp + 24 * 3600), tokenMask: 1,
    poolId: manifest.uniswap.poolId };
  const childPolicy = { ...policy, capabilities: 0n, maxAmounts: [0n, 0n] };
  async function write(name, contract, method, args) {
    const receipt = await (await contract[method](...args)).wait(1);
    assert.equal(receipt.status, 1, `${name} reverted on disposable fork`);
    gas[name] = receipt.gasUsed.toString();
    return receipt;
  }
  const created = await write('createRoot', controller, 'createRoot', ['mmforktest', policy]);
  const rootEvent = created.logs.map(log => { try { return controller.interface.parseLog(log); } catch { return null; } })
    .find(event => event?.name === 'NodeCreated' && event.args.parentId === 0n);
  assert.ok(rootEvent);
  const rootId = rootEvent.args.rootId;
  assert.ok(![1n, 2n, 5n].includes(rootId));
  await write('setRootOperator', controller, 'setRootOperator', [rootId, operator.address, policy]);
  await write('mint', token, 'mint', []);
  await write('approve', token, 'approve', [manifest.contracts.CapitalController.address, amount]);
  await write('fundRoot', controller, 'fundRoot', [rootId, [amount, 0n]]);
  const opController = controller.connect(operator);
  const generation = await controller.rootGeneration(rootId);
  const children = {};
  for (const [side, wallet] of [['idle', idle], ['sibling', sibling]]) {
    const operationKey = id(`master-fork-${side}-${forkBlock}`);
    await write(`spawn-${side}`, opController, 'spawnChild', [rootId, `${side}fork`, wallet.address,
      childPolicy, [one, 0n], operationKey]);
    children[side] = (await controller.getOperation(rootId, rootId, generation, operationKey)).nodeId;
    assert.ok(children[side] > rootId);
  }
  const before = await sdk.getTree(rootId);
  assert.equal(before.nodes.length, 3);
  assert.equal(before.nodes.find(node => node.id === children.idle).balances[0], one);
  assert.equal(before.nodes.find(node => node.id === children.sibling).balances[0], one);
  const setupLogs = await rpc.getLogs({ address: manifest.contracts.CapitalController.address,
    fromBlock: created.blockNumber, toBlock: 'latest' });
  const setupEvents = setupLogs.map(log => { try { return controller.interface.parseLog(log); } catch { return null; } })
    .filter(event => event?.args.rootId === rootId);
  assert.ok(setupEvents.some(event => event.name === 'RootFunded' && event.args.amount === amount));
  for (const childId of Object.values(children)) {
    assert.ok(setupEvents.some(event => event.name === 'NodeCreated' && event.args.nodeId === childId));
    assert.ok(setupEvents.some(event => event.name === 'CapitalAllocated' && event.args.childId === childId &&
      event.args.amount === one));
  }
  const handlers = chainHandlers({ rpcUrl, controller: manifest.contracts.CapitalController.address,
    accountFor: async () => privateKeyToAccount(operator.privateKey) });
  const context = { workerId: 'fork-master', rootId: rootId.toString(), nodeId: rootId.toString(),
    authorityGeneration: generation.toString() };
  const mine = setInterval(() => { void rpc.send('evm_mine', []).catch(() => {}); }, 500);
  try {
    const reclaimed = await handlers.reclaimAssets(context, { nodeId: children.idle.toString() });
    assert.equal(reclaimed.status, 'confirmed');
    gas.reclaimAssets = (await rpc.getTransactionReceipt(reclaimed.transactionHash)).gasUsed.toString();
    const afterReclaim = await sdk.getTree(rootId);
    assert.equal(afterReclaim.nodes.find(node => node.id === children.idle).balances[0], 0n);
    assert.equal(afterReclaim.nodes.find(node => node.id === rootId).balances[0], parseEther('3'));
    const allocated = await handlers.allocateCapital(context, { childId: children.sibling.toString(),
      asset: tokenA, amount: half.toString() });
    assert.equal(allocated.status, 'confirmed');
    gas.allocateCapital = (await rpc.getTransactionReceipt(allocated.transactionHash)).gasUsed.toString();
  } finally { clearInterval(mine); }
  const after = await sdk.getTree(rootId);
  assert.equal(after.nodes.find(node => node.id === children.sibling).balances[0], one + half);
  assert.equal(after.nodes.find(node => node.id === children.idle).revoked, true);
  for (const [name, nodeId] of [['sibling', children.sibling], ['idle', children.idle], ['root', rootId]]) {
    await write(`recover-${name}`, controller, 'ownerEmergencyRecover', [nodeId]);
  }
  const recovered = await sdk.getTree(rootId);
  assert.deepEqual(recovered.totalBalances, [0n, 0n]);
  assert.ok(recovered.nodes.every(node => node.revoked && node.position.tokenId === 0n));
  console.log(JSON.stringify({ status: 'passed', scope: 'disposable-local-Sepolia-fork', forkBlock,
    rootId: rootId.toString(), idleId: children.idle.toString(), siblingId: children.sibling.toString(), gas,
    limitation: 'Synthetic local history and programmatic decision; live MultiBaas and actual model remain untested.' }));
} finally { rpc.destroy(); anvil.kill('SIGTERM'); }
