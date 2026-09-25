import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { JsonRpcProvider, parseEther } from 'ethers';
import { WorkerKeyStore } from '../packages/runtime/dist/index.js';
import { capitalClient } from '../packages/sdk/dist/index.js';
import { journaledTransaction } from './lib/sepolia-transactions.mjs';

// Only the completed, revoked Root2 demo. Never sweep an active agent account.
const execute = process.argv.includes('--execute');
const deployment = JSON.parse(await readFile(new URL('../deployments/sepolia.json', import.meta.url), 'utf8'));
const rpcUrl = 'https://ethereum-sepolia.publicnode.com';
const rpc = new JsonRpcProvider(rpcUrl);
const privateBase = join(homedir(), '.agent-capital-tree');
const reportPath = new URL('../deployments/recovered-test-gas.json', import.meta.url);
try {
  assert.equal((await rpc.getNetwork()).chainId, 11155111n);
  const tree = await capitalClient(rpcUrl, deployment.contracts.CapitalController.address).getTree(2n);
  assert.equal(tree.nodes.length, 3);
  assert(tree.nodes.every(node => node.revoked && node.authorizedCapabilities === 0n && node.position.tokenId === 0n && node.balances.every(value => value === 0n)));
  const recipient = deployment.deployer;
  let report;
  try { report = JSON.parse(await readFile(reportPath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  report ??= { chainId: 11155111, rootId: '2', recipient, entries: [] };
  assert.equal(report.recipient, recipient);
  for (const node of tree.nodes) {
    if (!report.entries.some(entry => entry.nodeId === String(node.id))) {
      const balance = await rpc.getBalance(node.agent);
      assert(balance > parseEther('0.0001'));
      report.entries.push({ nodeId: String(node.id), address: node.agent, amountWei: String(balance - parseEther('0.0001')) });
    }
  }
  if (!execute) { console.log(JSON.stringify({ mode: 'inspect', ...report })); }
  else {
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    const directory = join(privateBase, 'runtime-demo', 'keys');
    const keyFiles = (await readdir(directory)).filter(name => name.endsWith('.keystore.json'));
    const keys = new WorkerKeyStore(directory);
    for (const entry of report.entries) {
      assert(tree.nodes.some(node => node.id.toString() === entry.nodeId && node.agent.toLowerCase() === entry.address.toLowerCase()));
      let keyId;
      for (const name of keyFiles) {
        const encrypted = JSON.parse(await readFile(join(directory, name), 'utf8'));
        if (`0x${encrypted.address}`.toLowerCase() === entry.address.toLowerCase()) keyId = name.replace(/\.keystore\.json$/, '');
      }
      assert(keyId, 'Expected existing encrypted agent key');
      const signer = (await keys.wallet(keyId)).connect(rpc);
      assert.equal(signer.address.toLowerCase(), entry.address.toLowerCase());
      const { receipt } = await journaledTransaction({ rpc, signer, directory: join(privateBase, 'gas-recovery-journal'),
        name: `root2-node-${entry.nodeId}`, request: { to: recipient, value: BigInt(entry.amountWei) } });
      entry.transactionHash = receipt.hash;
      entry.blockNumber = receipt.blockNumber;
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    }
    report.status = 'passed';
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ status: report.status, recipient, transfers: report.entries.length }));
  }
} finally { rpc.destroy(); }
