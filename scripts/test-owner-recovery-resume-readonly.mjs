import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Interface, JsonRpcProvider } from 'ethers';
import { capitalClient } from '../packages/sdk/dist/index.js';
import { verifyPartialOwnerRecovery } from './lib/browser-owner-recovery.mjs';

const read = async path => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url)));
const [report, setup, followup, artifact] = await Promise.all([
  read('deployments/browser-owner-recovery.json'),
  read('deployments/browser-owner-e2e.json'),
  read('deployments/browser-tree-followup.json'),
  read('contracts/out/CapitalController.sol/CapitalController.json'),
]);
assert.equal(report.status, 'incomplete');
assert.equal(report.failedStep, `recover-${setup.rootId}`);
assert.deepEqual(report.transactions.map(item => item.step), [`recover-${followup.siblingId}`]);
const rpc = new JsonRpcProvider('https://ethereum-sepolia.publicnode.com');
try {
  const args = { rpc, sdk: capitalClient('https://ethereum-sepolia.publicnode.com', setup.controller),
    abi: new Interface(artifact.abi), report, setup, followup, address: setup.owner };
  await verifyPartialOwnerRecovery(args);
  await assert.rejects(() => verifyPartialOwnerRecovery({ ...args, report: { ...report,
    transactions: [{ ...report.transactions[0], blockHash: `0x${'00'.repeat(32)}` }] } }),
  'A mismatched canonical receipt must stop resume');
  console.log('Confirmed sibling recovery; root remains unexecuted with no pending owner nonce');
} finally { rpc.destroy(); }
