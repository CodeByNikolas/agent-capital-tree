import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Contract, JsonRpcProvider, Wallet, id, parseEther } from 'ethers';
import { WorkerKeyStore } from '../packages/runtime/dist/index.js';
import { financeRoles } from '../packages/sdk/dist/index.js';
import { journaledTransaction } from './lib/sepolia-transactions.mjs';

// Review before --execute. Inspect mode only reads public chain state and fees.
const execute = process.argv.includes('--execute');
if (process.argv.slice(2).some(arg => arg !== '--execute')) throw new Error('usage: node scripts/test-live-siblings.mjs [--execute]');
const reportPath = new URL('../deployments/sibling-e2e.json', import.meta.url);
const deployment = JSON.parse(await readFile(new URL('../deployments/sepolia.json', import.meta.url), 'utf8'));
const privateBase = join(homedir(), '.agent-capital-tree');
const rpc = new JsonRpcProvider('https://ethereum-sepolia.publicnode.com');
const rootId = 1n;
const maxTotalEth = parseEther('0.008');
const swapAmount = parseEther('0.1');
const oneToken = parseEther('1');
const policyLimit = parseEther('0.1');
const operationKeys = Object.fromEntries(['a', 'b', 'c'].map(letter => [letter, id(`act-root1-sibling-${letter}-v1`)]));
const labels = Object.fromEntries(Object.entries(operationKeys).map(([letter, key]) => [letter, `sib-${letter}-${key.slice(2, 10)}`]));
const journalDirectory = join(privateBase, 'sibling-e2e-transactions');
const expectedOwner = '0x280Ca099242D7164cD001E4479D59f13CD0ea7c9';
const expectedNft = 39811n;
const expectedLiquidity = parseEther('5000');
const gasGrantUnits = 1_000_000n;
const totalGasUnitsCeiling = 22_000_000n;
const inactiveSelector = id('Inactive()').slice(0, 10).toLowerCase();
function hasInactiveRevert(value, seen = new Set()) {
  if (typeof value === 'string') return value.slice(0, 10).toLowerCase() === inactiveSelector;
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  return ['data', 'error', 'info', 'cause'].some(key => hasInactiveRevert(value[key], seen));
}
assert.ok(hasInactiveRevert({ info: { error: { data: inactiveSelector } } }));
assert.ok(!hasInactiveRevert({ code: 'NETWORK_ERROR' }));
let stage = 'preflight';
let report;

try {
  if (execute) {
    // Any previous attempt needs a human to reconcile its report and signed transactions.
    try { await readFile(reportPath); throw new Error('Sibling report already exists; inspect and reconcile before any new execution'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { if ((await readdir(journalDirectory)).length) throw new Error('Sibling transaction journal already exists; inspect it before execution'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  assert.equal((await rpc.getNetwork()).chainId, 11155111n);
  assert.equal(deployment.status, 'deployed');
  assert.equal(deployment.deployer.toLowerCase(), expectedOwner.toLowerCase());
  assert.equal(deployment.uniswap.seeded.rootId, '1');
  assert.equal(deployment.uniswap.seeded.tokenId, expectedNft.toString());
  const controllerAddress = deployment.contracts.CapitalController.address;
  const abi = JSON.parse(await readFile(new URL('../contracts/out/CapitalController.sol/CapitalController.json', import.meta.url), 'utf8')).abi;
  const controller = new Contract(controllerAddress, abi, rpc);
  const [root, owner, operator, generation, effective, feeData, ownerEth] = await Promise.all([
    controller.getNode(rootId), controller.rootOwner(rootId), controller.rootOperator(rootId),
    controller.rootGeneration(rootId), controller.getEffectivePolicy(rootId), rpc.getFeeData(), rpc.getBalance(expectedOwner)
  ]);
  assert.equal(owner.toLowerCase(), expectedOwner.toLowerCase());
  assert.equal(operator.toLowerCase(), expectedOwner.toLowerCase());
  assert.equal(root.id, rootId);
  assert.equal(root.revoked, false);
  assert.equal(root.generation, generation);
  assert.ok((effective.capabilities & (financeRoles.delegate | financeRoles.restrict | financeRoles.reclaim)) ===
    (financeRoles.delegate | financeRoles.restrict | financeRoles.reclaim));
  assert.ok(effective.expiry > BigInt((await rpc.getBlock('latest')).timestamp + 7200));
  assert.ok(effective.maxAmounts[0] >= oneToken && effective.maxAmounts[1] >= policyLimit && effective.tokenMask === 3n);
  for (const role of [financeRoles.delegate, financeRoles.restrict, financeRoles.reclaim]) {
    await controller.checkAction(rootId, role, expectedOwner, 2, 0);
  }
  const vault = new Contract(root.vault, ['function positionTokenId() view returns(uint256)', 'function positionLiquidity() view returns(uint128)'], rpc);
  const tokenA = new Contract(deployment.tokens[0].address, ['function balanceOf(address) view returns(uint256)'], rpc);
  const tokenB = new Contract(deployment.tokens[1].address, ['function balanceOf(address) view returns(uint256)'], rpc);
  const [nft, liquidity, initialA, initialB] = await Promise.all([
    vault.positionTokenId(), vault.positionLiquidity(), tokenA.balanceOf(root.vault), tokenB.balanceOf(root.vault)
  ]);
  assert.equal(nft, expectedNft);
  assert.equal(liquidity, expectedLiquidity);
  assert.ok(initialA >= 2n * oneToken && initialB >= oneToken);
  for (const key of Object.values(operationKeys)) {
    const operation = await controller.getOperation(rootId, rootId, generation, key);
    assert.equal(operation.nodeId, 0n, 'fixed sibling operation key was already used');
  }
  if (!feeData.maxFeePerGas || feeData.maxFeePerGas <= 0n) throw new Error('Sepolia fee estimate unavailable');
  const gasGrant = gasGrantUnits * feeData.maxFeePerGas;
  const forecast = totalGasUnitsCeiling * feeData.maxFeePerGas + gasGrant;
  const blockers = [];
  if (gasGrant <= 0n || gasGrant > parseEther('0.0025')) blockers.push('child gas grant exceeds 0.0025 ETH ceiling');
  if (forecast > maxTotalEth) blockers.push('conservative gas forecast exceeds 0.008 ETH cap');
  if (ownerEth < forecast + parseEther('0.005')) blockers.push('owner balance lacks forecast plus 0.005 ETH reserve');
  const summary = { mode: execute ? 'preflight-passed' : 'inspect', rootId: rootId.toString(),
    blockNumber: await rpc.getBlockNumber(), rootVault: root.vault, rootFreeA: initialA.toString(),
    rootFreeB: initialB.toString(), rootPositionTokenId: nft.toString(), rootPositionLiquidity: liquidity.toString(),
    maxFeePerGasWei: feeData.maxFeePerGas.toString(), childBGasGrantWei: gasGrant.toString(),
    conservativeBudgetWei: forecast.toString(), totalCapWei: maxTotalEth.toString(), ready: blockers.length === 0,
    blockers };
  if (!execute) { console.log(JSON.stringify(summary)); process.exit(0); }
  if (blockers.length) throw new Error(`Sibling preflight blocked: ${blockers.join('; ')}`);

  report = { chainId: 11155111, controller: controllerAddress, rootId: '1', owner: expectedOwner,
    status: 'running', startedAt: new Date().toISOString(), preflight: summary, transactions: {}, checks: {} };
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  const save = () => writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  const signer = (await Wallet.fromEncryptedJson(
    await readFile(join(privateBase, 'keys/deployer.keystore.json'), 'utf8'),
    await readFile(join(privateBase, 'keys/deployer.password'), 'utf8')
  )).connect(rpc);
  assert.equal(signer.address.toLowerCase(), expectedOwner.toLowerCase());
  const childKeys = new WorkerKeyStore(join(privateBase, 'sibling-e2e-keys'));
  const child = Object.fromEntries(await Promise.all(['a', 'b', 'c'].map(async letter =>
    [letter, (await childKeys.wallet(`root1-sibling-${letter}-v1`, true)).connect(rpc)])));
  assert.equal(new Set(Object.values(child).map(wallet => wallet.address.toLowerCase())).size, 3);
  report.children = Object.fromEntries(Object.entries(child).map(([letter, wallet]) => [letter, { address: wallet.address }]));
  await save();
  const controlled = controller.connect(signer);
  const childPolicy = { capabilities: financeRoles.swap, maxAmounts: [policyLimit, policyLimit],
    expiry: effective.expiry, tokenMask: 3, poolId: effective.poolId };
  const baselineIds = await controller.getRootNodeIds(rootId);
  let spent = 0n;
  const send = async (name, wallet, request) => {
    stage = name;
    const gas = await rpc.estimateGas({ ...request, from: wallet.address });
    const fee = (await rpc.getFeeData()).maxFeePerGas;
    if (!fee || spent + (gas * 12n / 10n) * fee + BigInt(request.value ?? 0) > maxTotalEth) {
      throw new Error('remaining test gas budget would be exceeded');
    }
    const { receipt } = await journaledTransaction({ rpc, signer: wallet, directory: journalDirectory, name, request });
    spent += receipt.gasUsed * receipt.gasPrice + BigInt(request.value ?? 0);
    report.transactions[name] = { transactionHash: receipt.hash, blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash, gasUsed: receipt.gasUsed.toString(), effectiveGasPriceWei: receipt.gasPrice.toString() };
    report.spentBudgetWei = spent.toString();
    await save();
    return receipt;
  };
  const spawn = async (letter, amount) => {
    const request = await controlled.spawnChild.populateTransaction(rootId, labels[letter], child[letter].address,
      childPolicy, [amount, 0n], operationKeys[letter]);
    await send(`spawn-${letter}`, signer, request);
    const operation = await controller.getOperation(rootId, rootId, generation, operationKeys[letter]);
    assert.ok(operation.nodeId > 0n);
    report.children[letter].nodeId = operation.nodeId.toString();
    await save();
    return operation.nodeId;
  };
  const a = await spawn('a', oneToken);
  const b = await spawn('b', oneToken);
  assert.equal((await controller.getRootNodeIds(rootId)).length, baselineIds.length + 2);
  const bNode = await controller.getNode(b);
  assert.equal(await tokenA.balanceOf(bNode.vault), oneToken);
  await send('revoke-a', signer, await controlled.revokeSubtree.populateTransaction(a));
  await assert.rejects(controller.checkAction(a, financeRoles.swap, child.a.address, 0, swapAmount), hasInactiveRevert);
  await controller.checkAction(b, financeRoles.swap, child.b.address, 0, swapAmount);
  report.checks.afterRevoke = { aInactive: true, bAuthorized: true, blockNumber: await rpc.getBlockNumber() };
  await save();

  await send('fund-b-gas', signer, { to: child.b.address, value: gasGrant });
  const deadline = BigInt((await rpc.getBlock('latest')).timestamp + 3600);
  const minOutput = parseEther('0.08');
  await send('swap-b', child.b, await controller.connect(child.b).swap.populateTransaction(
    b, true, swapAmount, minOutput, 4295128740n, deadline
  ));
  await controller.checkAction(b, financeRoles.swap, child.b.address, 0, swapAmount);
  assert.equal(await tokenA.balanceOf(bNode.vault), oneToken - swapAmount);
  assert.ok((await tokenB.balanceOf(bNode.vault)) >= minOutput);
  report.checks.siblingSwap = { bAuthorized: true, inputWei: swapAmount.toString(), minimumOutputWei: minOutput.toString(),
    blockNumber: await rpc.getBlockNumber() };
  await save();

  const aNode = await controller.getNode(a);
  const beforeAReclaim = await tokenA.balanceOf(root.vault);
  await send('reclaim-a', signer, await controlled.reclaimAssets.populateTransaction(rootId, a));
  assert.equal(await tokenA.balanceOf(root.vault), beforeAReclaim + oneToken);
  assert.equal(await tokenA.balanceOf(aNode.vault), 0n);
  const c = await spawn('c', parseEther('0.5'));
  assert.equal(await tokenA.balanceOf(root.vault), beforeAReclaim + parseEther('0.5'));
  report.checks.reallocation = { reclaimedFromAWei: oneToken.toString(), allocatedToCWei: parseEther('0.5').toString(),
    cNodeId: c.toString(), blockNumber: await rpc.getBlockNumber() };
  await save();
  for (const [letter, nodeId] of [['b', b], ['c', c]]) {
    await send(`reclaim-${letter}`, signer, await controlled.reclaimAssets.populateTransaction(rootId, nodeId));
  }
  for (const nodeId of [a, b, c]) {
    const node = await controller.getNode(nodeId);
    assert.equal(node.revoked, true);
    assert.equal(await tokenA.balanceOf(node.vault), 0n);
    assert.equal(await tokenB.balanceOf(node.vault), 0n);
  }
  assert.equal(await vault.positionTokenId(), expectedNft);
  assert.equal(await vault.positionLiquidity(), expectedLiquidity);
  assert.equal((await controller.rootOperator(rootId)).toLowerCase(), expectedOwner.toLowerCase());
  report.checks.final = { rootFreeAWei: (await tokenA.balanceOf(root.vault)).toString(),
    rootFreeBWei: (await tokenB.balanceOf(root.vault)).toString(), rootPositionTokenId: expectedNft.toString(),
    rootPositionLiquidity: expectedLiquidity.toString(), childVaultsEmpty: true, blockNumber: await rpc.getBlockNumber() };
  report.status = 'passed';
  report.finishedAt = new Date().toISOString();
  report.limitations = ['Programmatic local signers; no browser wallet or model test.',
    'No live MultiBaas query; canonical checks use Sepolia RPC.', 'Child B retains any unspent ETH gas grant.'];
  await save();
  console.log(JSON.stringify({ status: report.status, rootId: '1', children: Object.fromEntries(
    Object.entries(report.children).map(([letter, value]) => [letter, value.nodeId])), spentBudgetWei: spent.toString() }));
} catch (error) {
  if (report) {
    report.status = 'incomplete';
    report.failedStage = stage;
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  }
  throw error;
} finally { rpc.destroy(); }
