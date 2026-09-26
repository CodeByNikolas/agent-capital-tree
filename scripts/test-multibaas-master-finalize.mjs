import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Contract, JsonRpcProvider, Transaction, Wallet, parseEther } from 'ethers';
import { capitalClient } from '../packages/sdk/dist/index.js';
import { createMultiBaasHistoryClient } from '../packages/multibaas/dist/index.js';
import { journaledTransaction } from './lib/sepolia-transactions.mjs';

const rootAmount = parseEther('4'), childAmount = parseEther('1'), reallocation = parseEther('0.5');
const receiptRecord = receipt => ({ transactionHash: receipt.hash, blockNumber: receipt.blockNumber,
  blockHash: receipt.blockHash, status: receipt.status, gasUsed: receipt.gasUsed.toString() });
async function readPrivate(path) {
  assert.ok(isAbsolute(path));
  const info = await lstat(path);
  assert.ok(info.isFile() && !info.isSymbolicLink() && info.uid === process.getuid() &&
    (info.mode & 0o777) === 0o600, 'Unsafe private file');
  return readFile(path, 'utf8');
}
function modelWrites(events, rootId, idleId, siblingId, asset) {
  assert.equal(events[0]?.type, 'thread.started');
  assert.equal(events.at(-1)?.type, 'turn.completed');
  const calls = new Map();
  for (const event of events) {
    assert.ok(['thread.started', 'turn.started', 'turn.completed', 'item.started', 'item.completed'].includes(event.type));
    if (!event.type.startsWith('item.')) continue;
    const item = event.item;
    assert.ok(item && ['reasoning', 'agent_message', 'error', 'mcp_tool_call'].includes(item.type),
      'Unexpected model action');
    if (item.type !== 'mcp_tool_call') continue;
    assert.ok(['getCapitalActivity', 'getTree', 'reclaimAssets', 'allocateCapital'].includes(item.tool));
    assert.ok(typeof item.id === 'string' && item.id);
    const state = calls.get(item.id) ?? { name: item.tool, started: false, completed: false };
    assert.equal(state.name, item.tool);
    if (event.type === 'item.started') { assert.ok(!state.started); state.started = true; }
    else {
      assert.ok(state.started && !state.completed && item.status === 'completed' && !item.error);
      state.completed = true;
      state.arguments = item.arguments;
      state.result = item.result ?? item.output;
      assert.ok(state.result && !state.result.isError && Array.isArray(state.result.content));
    }
    calls.set(item.id, state);
  }
  const sequence = [...calls.values()];
  assert.ok(sequence.every(call => call.started && call.completed));
  const names = sequence.map(call => call.name);
  const reclaimIndex = names.indexOf('reclaimAssets'), allocateIndex = names.indexOf('allocateCapital');
  assert.ok(reclaimIndex > 0 && allocateIndex > reclaimIndex);
  assert.equal(names.filter(name => name === 'reclaimAssets').length, 1);
  assert.equal(names.filter(name => name === 'allocateCapital').length, 1);
  assert.ok(names.slice(0, reclaimIndex).includes('getCapitalActivity') && names.slice(0, reclaimIndex).includes('getTree'));
  assert.ok(names.slice(reclaimIndex + 1, allocateIndex).includes('getTree'));
  for (const call of sequence.filter(item => ['getTree', 'getCapitalActivity'].includes(item.name))) {
    assert.deepEqual(call.arguments, { rootId });
    const pages = call.result.content.filter(part => part.type === 'text').map(part => JSON.parse(part.text));
    assert.ok(pages.length && pages.every(page => page.rootId === rootId));
  }
  const reclaim = sequence[reclaimIndex], allocate = sequence[allocateIndex];
  assert.deepEqual(reclaim.arguments, { nodeId: idleId });
  assert.equal(allocate.arguments.childId, siblingId);
  assert.equal(allocate.arguments.asset?.toLowerCase(), asset.toLowerCase());
  assert.equal(allocate.arguments.amount, reallocation.toString());
  const hash = call => {
    const text = JSON.stringify(call.result).replaceAll('\\"', '"');
    const match = text.match(/"transactionHash"\s*:\s*"(0x[a-fA-F0-9]{64})"/);
    assert.ok(match, 'Missing model transaction hash');
    return match[1].toLowerCase();
  };
  const hashes = [hash(reclaim), hash(allocate)];
  assert.notEqual(hashes[0], hashes[1]);
  return { names, hashes };
}
function expectedSetup(report, gasGrant) {
  const names = ['create-root', 'bind-operator', 'fund-root', 'spawn-idle', 'spawn-sibling'];
  if (report.transactions?.['approve-act-a']) names.push('approve-act-a');
  for (let remaining = gasGrant, i = 0; remaining > 0n; i++) {
    names.push(`operator-gas-${i}`);
    remaining -= remaining > parseEther('0.01') ? parseEther('0.01') : remaining;
  }
  assert.deepEqual(Object.keys(report.transactions).sort(), names.sort(), 'Unexpected setup or recovery receipt');
  return names;
}
if (process.argv[2] === '--self-test') {
  const call = (type, tool, id, args, result = { content: [{ type: 'text', text: '{"rootId":"9"}' }] }) =>
    ({ type, item: { type: 'mcp_tool_call', id, tool, arguments: args, status: 'completed', result } });
  const r = { content: [{ type: 'text', text: '{"transactionHash":"0x' + 'a'.repeat(64) + '"}' }] };
  const a = { content: [{ type: 'text', text: '{"transactionHash":"0x' + 'b'.repeat(64) + '"}' }] };
  const specs = [['getCapitalActivity', { rootId: '9' }], ['getTree', { rootId: '9' }],
    ['reclaimAssets', { nodeId: '10' }, r], ['getTree', { rootId: '9' }],
    ['allocateCapital', { childId: '11', asset: '0x' + 'c'.repeat(40), amount: reallocation.toString() }, a]];
  const safe = [{ type: 'thread.started' }, { type: 'turn.started' }, ...specs.flatMap(([tool, args, result], i) =>
    [call('item.started', tool, String(i), args, result), call('item.completed', tool, String(i), args, result)]),
  { type: 'turn.completed' }];
  assert.equal(modelWrites(safe, '9', '10', '11', '0x' + 'c'.repeat(40)).hashes.length, 2);
  assert.throws(() => modelWrites(safe.map(event => event.item?.tool === 'allocateCapital' ?
    { ...event, item: { ...event.item, tool: 'shell' } } : event), '9', '10', '11', '0x' + 'c'.repeat(40)));
  assert.throws(() => modelWrites(safe.slice(0, -2).concat({ type: 'turn.completed' }), '9', '10', '11', '0x' + 'c'.repeat(40)));
  console.log('finalizer model sequence guards passed');
  process.exit(0);
}

const [configPath, mode] = process.argv.slice(2);
if (!configPath || !isAbsolute(configPath) || !['--dry-run', '--execute'].includes(mode) || process.argv.length !== 4)
  throw new Error('usage: node scripts/test-multibaas-master-finalize.mjs /absolute/private-config.json --dry-run|--execute');
const config = JSON.parse(await readPrivate(configPath));
const manifest = JSON.parse(await readFile(new URL('../deployments/sepolia.json', import.meta.url), 'utf8'));
assert.match(config.runId, /^[a-z0-9]{6,24}$/);
assert.equal(config.controller.toLowerCase(), manifest.contracts.CapitalController.address.toLowerCase());
const runtimeRoot = join(homedir(), '.agent-capital-tree', `multibaas-master-${config.runId}`);
const dir = await lstat(runtimeRoot);
assert.ok(dir.isDirectory() && !dir.isSymbolicLink() && dir.uid === process.getuid() && (dir.mode & 0o777) === 0o700);
const report = JSON.parse(await readPrivate(join(runtimeRoot, 'report.json')));
assert.equal(report.status, 'incomplete');
assert.equal(report.stage, 'master-model');
assert.equal(report.runId, config.runId);
assert.equal(report.chainId, 11155111);
assert.equal(report.controller.toLowerCase(), config.controller.toLowerCase());
assert.equal(report.rootId, '9');
assert.equal(report.idleId, '10');
assert.equal(report.siblingId, '11');
assert.equal(report.checks?.indexedSetup?.source, 'multibaas');
assert.ok(!report.checks?.model && !report.checks?.ownerRecovery);
const resultPath = join(runtimeRoot, 'finalizer-result.json');
assert.ok(!(await lstat(resultPath).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })),
  'Prior finalizer result exists');
const journal = join(runtimeRoot, 'transactions');
assert.ok((await lstat(journal)).isDirectory());
assert.ok(!(await readdir(journal)).some(name => name.startsWith('owner-recover-')),
  'Recovery journal exists; reconcile manually before any send');
const gasGrant = BigInt(config.operatorGasWei), maxSpend = BigInt(config.maxGasSpendWei);
assert.ok(gasGrant > 0n && gasGrant <= parseEther('0.03') && maxSpend > gasGrant && maxSpend <= parseEther('0.05'));
const expected = expectedSetup(report, gasGrant);
const transcriptPath = join(runtimeRoot, 'codex.jsonl');
assert.ok((await lstat(transcriptPath)).size <= 10_000_000);
const transcript = (await readPrivate(transcriptPath)).trim().split('\n').map(JSON.parse);
assert.equal(report.model?.transcriptSha256,
  createHash('sha256').update(await readFile(transcriptPath)).digest('hex'));
const tokenA = manifest.tokens[0].address;
const { names, hashes } = modelWrites(transcript, '9', '10', '11', tokenA);
assert.deepEqual(report.model.calls, names);
const rpc = new JsonRpcProvider(config.rpcUrl);
try {
  assert.equal((await rpc.getNetwork()).chainId, 11155111n);
  const abi = JSON.parse(await readFile(new URL('../contracts/out/CapitalController.sol/CapitalController.json', import.meta.url), 'utf8')).abi;
  const controller = new Contract(config.controller, abi, rpc);
  const owner = (await Wallet.fromEncryptedJson(await readPrivate(config.ownerKeystore),
    (await readPrivate(config.ownerPassword)).trim())).connect(rpc);
  assert.equal(owner.address.toLowerCase(), report.owner.toLowerCase());
  const setup = {};
  let ownerGas = 0n, operatorGas = 0n, granted = 0n;
  for (const name of expected) {
    const signed = Transaction.from(JSON.parse(await readPrivate(join(journal, `${name}.json`))).signed);
    const record = report.transactions[name];
    assert.equal(signed.hash.toLowerCase(), record.transactionHash.toLowerCase());
    assert.equal(signed.chainId, 11155111n);
    const [tx, receipt] = await Promise.all([rpc.getTransaction(signed.hash), rpc.getTransactionReceipt(signed.hash)]);
    assert.ok(tx && receipt && receipt.status === 1 && record.status === 1);
    assert.equal(tx.from.toLowerCase(), signed.from.toLowerCase());
    assert.equal(tx.data, signed.data);
    assert.equal(tx.value, signed.value);
    assert.equal(receipt.blockHash, record.blockHash);
    assert.equal(receipt.blockNumber, record.blockNumber);
    assert.equal(receipt.gasUsed.toString(), record.gasUsed);
    assert.equal((await rpc.getBlock(receipt.blockNumber)).hash, receipt.blockHash);
    setup[name] = { signed, receipt };
    if (signed.from.toLowerCase() === owner.address.toLowerCase()) {
      ownerGas += receipt.gasUsed * receipt.gasPrice;
      granted += signed.value;
    } else {
      assert.equal(signed.from.toLowerCase(), report.operator.toLowerCase());
      operatorGas += receipt.gasUsed * receipt.gasPrice;
    }
  }
  assert.equal(ownerGas, BigInt(report.spentOwnerGasWei));
  assert.equal(operatorGas, BigInt(report.spentOperatorGasWei));
  assert.equal(granted, gasGrant);
  assert.equal(granted, BigInt(report.grantedOperatorWei));
  const [latest, pending] = await Promise.all([
    rpc.getTransactionCount(report.operator, 'latest'), rpc.getTransactionCount(report.operator, 'pending')]);
  assert.equal(latest, 4); assert.equal(pending, 4);
  const model = [];
  for (const [i, name] of ['reclaimAssets', 'allocateCapital'].entries()) {
    const [tx, receipt] = await Promise.all([rpc.getTransaction(hashes[i]), rpc.getTransactionReceipt(hashes[i])]);
    assert.ok(tx && receipt && receipt.status === 1);
    assert.equal(tx.from.toLowerCase(), report.operator.toLowerCase());
    assert.equal(tx.to.toLowerCase(), config.controller.toLowerCase());
    assert.equal(tx.nonce, 2 + i);
    assert.equal(tx.value, 0n);
    assert.equal((await rpc.getBlock(receipt.blockNumber)).hash, receipt.blockHash);
    const call = controller.interface.parseTransaction({ data: tx.data });
    assert.equal(call?.name, name);
    assert.equal(call.args[0], 9n);
    assert.equal(call.args[1], BigInt(i ? report.siblingId : report.idleId));
    if (i) assert.deepEqual(call.args[2].toArray(), [reallocation, 0n]);
    operatorGas += receipt.gasUsed * receipt.gasPrice;
    model.push(receiptRecord(receipt));
  }
  assert.ok(ownerGas + operatorGas <= maxSpend, 'Actual gas cap exceeded');
  const sdk = capitalClient(config.rpcUrl, config.controller);
  const checkTree = async expectedTotal => {
    const tree = await sdk.getTree(9n);
    assert.equal(tree.generation, await controller.rootGeneration(9n));
    assert.equal(tree.owner.toLowerCase(), owner.address.toLowerCase());
    assert.equal(tree.operator.toLowerCase(), report.operator.toLowerCase());
    assert.equal(tree.nodes.length, 3);
    assert.deepEqual(tree.totalBalances, expectedTotal);
    return tree;
  };
  const tree = await checkTree([rootAmount, 0n]);
  const byId = id => tree.nodes.find(node => node.id === BigInt(id));
  assert.equal(byId('9').balances[0], rootAmount - childAmount - reallocation);
  assert.equal(byId('10').balances[0], 0n); assert.equal(byId('10').revoked, true);
  assert.equal(byId('11').balances[0], childAmount + reallocation); assert.equal(byId('11').revoked, false);
  assert.ok(tree.nodes.every(node => node.position.tokenId === 0n && node.position.liquidity === 0n &&
    node.balances[1] === 0n));
  const keyLines = (await readPrivate(config.multibaas.apiKeyFile)).trim().split(/\r?\n/);
  const apiKey = keyLines.length === 1 ? keyLines[0].replace(/^MULTIBAAS_API_KEY=/, '') :
    keyLines.find(line => line.startsWith('MULTIBAAS_API_KEY='))?.slice('MULTIBAAS_API_KEY='.length);
  assert.match(apiKey, /^\S+$/);
  const history = createMultiBaasHistoryClient({ deploymentUrl: config.multibaas.deploymentUrl,
    controllerLabel: config.multibaas.controllerLabel, controllerAddress: config.controller,
    apiKey, rpcUrl: config.rpcUrl });
  let indexed;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const page = await history.getCapitalActivity('9');
      const good = ['capital_reclaimed', 'capital_allocated'].every((kind, i) => page.items.some(item =>
        item.kind === kind && item.childId === (i ? '11' : '10') &&
        item.amount === (i ? reallocation : childAmount).toString() &&
        item.provenance.transactionHash.toLowerCase() === hashes[i] &&
        ['confirmed', 'finalized'].includes(item.provenance.finality)));
      if (good) { indexed = page; break; }
    } catch (error) { if (attempt === 5) throw error; }
    await delay(5000);
  }
  assert.ok(indexed, 'MultiBaas did not verify both model writes');
  const requests = [['sibling', '11'], ['idle', '10'], ['root', '9']].map(([name, nodeId]) =>
    ({ name: `owner-recover-${name}`, nodeId }));
  const prepared = await Promise.all(requests.map(async item => {
    const request = await controller.connect(owner).ownerEmergencyRecover.populateTransaction(item.nodeId);
    return { ...item, request, gas: await rpc.estimateGas({ ...request, from: owner.address }) };
  }));
  const fee = (await rpc.getFeeData()).maxFeePerGas;
  assert.ok(fee && fee <= 20_000_000_000n);
  const reserve = prepared.reduce((sum, item) => sum + item.gas, 0n) * 15n / 10n * fee;
  assert.ok(ownerGas + granted + reserve <= maxSpend, 'Owner outflow cap lacks recovery reserve');
  assert.ok(ownerGas + operatorGas + reserve <= maxSpend, 'Total gas cap lacks recovery reserve');
  if (mode === '--dry-run') {
    console.log(JSON.stringify({ status: 'ready-for-explicit-recovery', rootId: '9',
      modelTransactionHashes: hashes, modelCalls: names, indexedWrites: 2,
      ownerRecoveryOrder: prepared.map(item => item.name), writes: 'disabled' }));
  } else {
    const recovered = {};
    assert.equal(await rpc.getTransactionCount(owner.address, 'pending'), await rpc.getTransactionCount(owner.address, 'latest'),
      'Owner has an unresolved pending transaction');
    for (const item of prepared) {
      assert.ok(!(await readdir(journal)).includes(`${item.name}.json`), 'Recovery journal appeared; reconcile manually');
      const remaining = [maxSpend - ownerGas - granted, maxSpend - ownerGas - operatorGas,
        await rpc.getBalance(owner.address), parseEther('0.025')].reduce((a, b) => a < b ? a : b);
      const { receipt } = await journaledTransaction({ rpc, signer: owner, directory: journal,
        name: item.name, request: item.request, maxGasCostWei: remaining });
      ownerGas += receipt.gasUsed * receipt.gasPrice;
      assert.ok(ownerGas + granted <= maxSpend && ownerGas + operatorGas <= maxSpend);
      recovered[item.name] = receiptRecord(receipt);
    }
    const finalTree = await checkTree([0n, 0n]);
    assert.ok(finalTree.nodes.every(node => node.revoked && node.position.tokenId === 0n &&
      node.balances[0] === 0n && node.balances[1] === 0n));
    const result = { status: 'passed', rootId: '9', modelTransactionHashes: hashes,
      modelTranscriptSha256: createHash('sha256').update(await readFile(transcriptPath)).digest('hex'),
      modelReceipts: model, recoveryReceipts: recovered, spentOwnerGasWei: ownerGas.toString(),
      spentOperatorGasWei: operatorGas.toString(), indexedModelWrites: 2,
      originalFailureReportPreserved: true };
    await writeFile(resultPath, JSON.stringify(result, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ status: 'passed', rootId: '9', resultPath }));
  }
} finally { rpc.destroy(); }
