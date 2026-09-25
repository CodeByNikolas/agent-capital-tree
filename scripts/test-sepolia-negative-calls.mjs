import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { Contract, Interface, JsonRpcProvider } from 'ethers';
import { financeRoles } from '../packages/sdk/dist/index.js';

// Historical eth_call against the real deployment. No signer, state overrides,
// transaction broadcast, or mutation of the retired Root5/seed Root1 is used.
const rpc = new JsonRpcProvider('https://ethereum-sepolia.publicnode.com');
const read = async name => JSON.parse(await readFile(new URL(`../${name}`, import.meta.url)));
const deployment = await read('deployments/sepolia.json');
const followup = await read('deployments/browser-tree-followup.json');
const address = deployment.contracts.CapitalController.address;
const abi = new Interface((await read('contracts/out/CapitalController.sol/CapitalController.json')).abi);
const controller = new Contract(address, abi, rpc);
const blockTag = followup.transactions.revokeChild.blockNumber - 1;
try {
  assert.equal((await rpc.getNetwork()).chainId, 11155111n);
  const block = await rpc.getBlock(blockTag);
  const root = await controller.getNode(5, { blockTag });
  const child = await controller.getNode(6, { blockTag });
  const sibling = await controller.getNode(8, { blockTag });
  assert.equal(root.rootId, 5n);
  assert.equal(child.parentId, root.id);
  assert.equal(sibling.parentId, root.id);
  assert(!root.revoked && !child.revoked && !sibling.revoked);
  assert.equal(sibling.policy.capabilities, financeRoles.swap);
  const call = (from, method, args) => rpc.call({ from, to: address,
    data: abi.encodeFunctionData(method, args), blockTag });

  // Positive controls rule out an expired/detached/revoked path as the reason
  // every subsequent call fails. Existing real EAC authority must be valid.
  await call(child.agent, 'checkAction', [child.id, financeRoles.swap, child.agent, 0, child.policy.maxAmounts[0]]);
  await call(root.agent, 'checkAction', [root.id, financeRoles.restrict, root.agent, 2, 0]);

  const checks = [];
  async function rejects(name, from, method, args, expectedError) {
    let reverted = false;
    try { await call(from, method, args); }
    catch (error) {
      assert.equal(error.code, 'CALL_EXCEPTION', `${name}: require a contract revert, not a transport failure`);
      const selector = abi.getError(expectedError).selector;
      assert.equal(error.data?.slice(0, 10), selector, `${name}: unexpected revert`);
      checks.push({ name, method, from, expectedError, revertSelector: selector });
      reverted = true;
    }
    assert(reverted, `${name}: disallowed call unexpectedly succeeded`);
  }
  await rejects('swap exceeds the real child per-action limit', child.agent, 'swap',
    [child.id, true, child.policy.maxAmounts[0] + 1n, 1n, 4295128740n, block.timestamp + 60], 'Unauthorized');
  await rejects('asset outside the fixed two-token universe', child.agent, 'checkAction',
    [child.id, financeRoles.swap, child.agent, 3, 1], 'InvalidInput');
  await rejects('swap-only sibling cannot gain delegation rights', root.agent, 'tightenPolicy',
    [sibling.id, { ...sibling.policy.toObject(), maxAmounts: [...sibling.policy.maxAmounts],
      capabilities: sibling.policy.capabilities | financeRoles.delegate }], 'PolicyExpansion');
  await rejects('parent identity cannot impersonate the child swap signer', root.agent, 'swap',
    [child.id, true, 1n, 1n, 4295128740n, block.timestamp + 60], 'Unauthorized');
  assert.equal((await rpc.getBlock(blockTag)).hash, block.hash, 'Historical block must still be canonical');
  const report = { status: 'passed', chainId: 11155111, controller: address,
    blockNumber: blockTag, blockHash: block.hash, rootId: '5', checkedAt: new Date().toISOString(),
    method: 'historical eth_call', stateOverrides: false, transactionsBroadcast: 0,
    positiveControls: ['child swap authority at its exact limit', 'parent restrict authority'],
    checks, scope: 'Unsupported third assets, amount limits and capability expansion on actual historical Sepolia state; no mined negative transaction and no per-node single-token mandate claim.' };
  await writeFile(new URL('../deployments/sepolia-negative-calls.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { rpc.destroy(); }
