import assert from 'node:assert/strict';
import { readFile, lstat, writeFile, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { JsonRpcProvider, parseEther } from 'ethers';
import { WorkerKeyStore, childKeyId } from '../packages/runtime/dist/index.js';
import { capitalClient } from '../packages/sdk/dist/index.js';
import { journaledTransaction } from './lib/sepolia-transactions.mjs';

// Reuse unused gas only after the model run has completed and stopped its workers.
const execute = process.argv.includes('--execute');
assert(process.argv.slice(2).every(arg => arg === '--execute'));
const base = join(homedir(), '.agent-capital-tree');
const runtimeRoot = join(base, 'browser-runtime');
const outcome = JSON.parse(await readFile(new URL('../deployments/root-codex-e2e.json', import.meta.url)));
const setup = JSON.parse(await readFile(new URL('../deployments/browser-owner-e2e.json', import.meta.url)));
const manifest = JSON.parse(await readFile(new URL('../deployments/sepolia.json', import.meta.url)));
assert.equal(outcome.status, 'passed');
assert.equal(outcome.rootId, '5');
assert.equal(outcome.controller, manifest.contracts.CapitalController.address);
assert.equal(setup.controller, outcome.controller);
assert.equal(setup.rootId, outcome.rootId);
const reportPath = new URL('../deployments/browser-recycled-gas.json', import.meta.url);
try { await lstat(reportPath); throw new Error('Gas recovery report already exists; reconcile rather than repeat a completed or uncertain sweep'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const rpcUrl = 'https://ethereum-sepolia.publicnode.com';
const rpc = new JsonRpcProvider(rpcUrl);
let locked = false;
try {
  assert.equal((await rpc.getNetwork()).chainId, 11155111n);
  const tree = await capitalClient(rpcUrl, outcome.controller).getTree(5n);
  const directory = join(runtimeRoot, 'keys');
  const keys = new WorkerKeyStore(directory);
  assert.equal(tree.operator.toLowerCase(), setup.operator.toLowerCase());
  assert.equal(tree.owner.toLowerCase(), setup.owner.toLowerCase());
  const { stdout } = await promisify(execFile)('docker', ['ps', '--format', '{{.Names}}']);
  assert(!stdout.split('\n').some(name => /^act-worker-node-[a-f0-9]+-5-/.test(name)), 'Model workers must stop first');
  const lockPath = join(runtimeRoot, 'companion.lock');
  if (execute) {
    await writeFile(lockPath, String(process.pid), { mode: 0o600, flag: 'wx' });
    locked = true;
    assert.equal((await keys.account('root-5')).address.toLowerCase(), tree.operator.toLowerCase());
  } else {
    try { await lstat(lockPath); throw new Error('Companion must be stopped'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const report = { rootId: '5', recipient: tree.operator, entries: [], status: 'running' };
  const fees = await rpc.getFeeData();
  assert(fees.maxFeePerGas);
  assert.equal(await rpc.getCode(tree.operator), '0x', 'Gas recipient must remain a plain EOA');
  const reserve = parseEther('0.0005');
  const maxFeeCap = fees.maxFeePerGas * 15n / 10n;
  const feeReserve = 25_200n * maxFeeCap;
  for (const [nodeId, parentId, operationKey] of [[outcome.childId, '5', outcome.operationKey], [outcome.grandchildId, outcome.childId, outcome.grandchildKey]]) {
    const node = tree.nodes.find(item => item.id.toString() === nodeId);
    assert(node && node.parentId.toString() === parentId);
    assert.equal(await rpc.getCode(node.agent), '0x');
    assert.equal(await rpc.getTransactionCount(node.agent), await rpc.getTransactionCount(node.agent, 'pending'));
    const value = (await rpc.getBalance(node.agent)) - reserve - feeReserve;
    assert(value > 0n && value <= parseEther('0.01'));
    const keyId = childKeyId({ workerId: '', rootId: '5', nodeId: parentId, authorityGeneration: tree.generation.toString() }, operationKey, outcome.controller);
    report.entries.push({ nodeId, address: node.agent, amountWei: value.toString(), keyId });
  }
  if (!execute) console.log(JSON.stringify({ mode: 'inspect', ...report }));
  else {
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    for (const entry of report.entries) {
      const node = tree.nodes.find(item => item.id.toString() === entry.nodeId);
      assert.equal(node.agent.toLowerCase(), entry.address.toLowerCase());
      const signer = (await keys.wallet(entry.keyId)).connect(rpc);
      assert.equal(signer.address.toLowerCase(), entry.address.toLowerCase());
      const currentFees = await rpc.getFeeData();
      assert(currentFees.maxFeePerGas && currentFees.maxFeePerGas <= maxFeeCap, 'Gas exceeded reservation; reconcile and replan before sending');
      assert(await rpc.getBalance(signer.address) >= BigInt(entry.amountWei) + reserve + feeReserve);
      const { receipt } = await journaledTransaction({ rpc, signer, directory: join(base, 'browser-gas-recycling'),
        name: `node-${entry.nodeId}`, request: { to: tree.operator, value: BigInt(entry.amountWei) } });
      Object.assign(entry, { transactionHash: receipt.hash, blockNumber: receipt.blockNumber });
      assert(await rpc.getBalance(signer.address) >= reserve);
      await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
    }
    report.status = 'passed';
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  }
} finally {
  if (locked) await rm(join(runtimeRoot, 'companion.lock'));
  rpc.destroy();
}
