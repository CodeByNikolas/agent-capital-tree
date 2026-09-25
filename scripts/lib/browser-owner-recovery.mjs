import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Contract, Interface, JsonRpcProvider, parseEther } from 'ethers';
import { expect } from '@playwright/test';
import { capitalClient } from '../../packages/sdk/dist/index.js';

export async function verifyPartialOwnerRecovery({ rpc, sdk, abi, report, setup, followup, address }) {
  const siblingTx = report.transactions[0];
  const receipt = await rpc.getTransactionReceipt(siblingTx.transactionHash);
  assert(receipt?.status === 1 && receipt.from.toLowerCase() === address.toLowerCase());
  assert.equal(receipt.blockNumber, siblingTx.blockNumber);
  assert.equal(receipt.blockHash, siblingTx.blockHash);
  assert.equal((await rpc.getBlock(receipt.blockNumber)).hash, receipt.blockHash);
  assert((await rpc.getBlockNumber()) >= receipt.blockNumber + 2, 'Sibling receipt needs two confirmations');
  const tree = await sdk.getTree(BigInt(setup.rootId));
  const sibling = tree.nodes.find(item => item.id.toString() === followup.siblingId);
  const root = tree.nodes.find(item => item.id.toString() === setup.rootId);
  assert(sibling && root && sibling.parentId === root.id);
  assert(sibling.revoked && sibling.position.tokenId === 0n && sibling.balances.every(value => value === 0n));
  assert(!root.revoked && root.position.tokenId === 0n && root.balances.some(value => value > 0n));
  const recovered = receipt.logs.filter(log => log.address.toLowerCase() === setup.controller.toLowerCase())
    .map(log => { try { return abi.parseLog(log); } catch { return null; } })
    .filter(event => event?.name === 'EmergencyRecovered' && event.args.rootId.toString() === setup.rootId && event.args.nodeId.toString() === followup.siblingId);
  let expectedRecoveries = 0;
  for (const token of tree.tokens) {
    const historicalBalance = await new Contract(token, ['function balanceOf(address) view returns(uint256)'], rpc)
      .balanceOf(sibling.vault, { blockTag: receipt.blockNumber - 1 });
    const matching = recovered.filter(event => event.args.token.toLowerCase() === token.toLowerCase());
    assert.equal(matching.length, historicalBalance > 0n ? 1 : 0);
    if (historicalBalance > 0n) {
      expectedRecoveries += 1;
      assert.equal(matching[0].args.amount, historicalBalance);
      assert.equal(matching[0].args.recipient.toLowerCase(), root.vault.toLowerCase());
    }
  }
  assert(expectedRecoveries > 0, 'Sibling recovery lacks historical token balances');
  assert.equal(recovered.length, expectedRecoveries);
  for (const name of ['EmergencyRecovered', 'NodeRevoked']) {
    const topics = abi.encodeFilterTopics(abi.getEvent(name), [BigInt(setup.rootId), BigInt(setup.rootId)]);
    assert.equal((await rpc.getLogs({ address: setup.controller, fromBlock: receipt.blockNumber, toBlock: 'latest', topics })).length, 0,
      'Root recovery already reached the chain; do not sign again');
  }
  assert.equal(await rpc.getTransactionCount(address, 'pending'), await rpc.getTransactionCount(address, 'latest'),
    'Owner wallet has a pending transaction');
}

// Real owner UI + MetaMask. Inspect exact unsigned calldata before normal wallet consent.
export async function browserOwnerRecovery({ context, app, origin, address, closeOnly, resume, freshOwnerResume, privateBase, appUrl }) {
  const read = async path => JSON.parse(await readFile(new URL(`../../${path}`, import.meta.url)));
  const setup = await read('deployments/browser-owner-e2e.json');
  const models = await read('deployments/root-codex-e2e.json');
  const followup = await read('deployments/browser-tree-followup.json');
  assert.equal(setup.status, 'owner-setup-passed');
  assert.equal(models.status, 'passed');
  assert.equal(followup.status, closeOnly ? 'awaiting-owner-close' : 'passed');
  assert.equal(setup.rootId, models.rootId);
  assert.equal(setup.rootId, followup.rootId);
  assert.equal(address.toLowerCase(), setup.owner.toLowerCase());
  const domain = createHash('sha256').update(setup.controller.toLowerCase()).digest('hex').slice(0, 12);
  const { stdout: containers } = await promisify(execFile)('docker', ['ps', '--format', '{{.Names}}']);
  assert(!containers.includes(`act-worker-node-${domain}-${setup.rootId}-`), 'Stop root workers before owner recovery');
  const reportPath = new URL(`../../deployments/browser-owner-${closeOnly ? 'close' : 'recovery'}.json`, import.meta.url);
  let previous;
  try { previous = JSON.parse(await readFile(reportPath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (resume) {
    assert(!closeOnly && previous?.status === 'incomplete' && previous.failedStep === `recover-${setup.rootId}`,
      'Resume is restricted to the incomplete final root recovery');
    assert.equal(previous.rootId, setup.rootId);
    assert.equal(previous.owner.toLowerCase(), address.toLowerCase());
    assert.deepEqual(previous.transactions.map(item => item.step), [`recover-${followup.siblingId}`]);
    assert(previous.diagnostics?.submitted && previous.diagnostics?.approved && !previous.diagnostics?.returnedHash,
      'Previous root transaction state requires separate reconciliation');
  } else {
    assert(!previous, 'Reconcile previous owner recovery attempt before retry');
  }
  const rpcUrl = 'https://ethereum-sepolia.publicnode.com';
  const rpc = new JsonRpcProvider(rpcUrl);
  const sdk = capitalClient(rpcUrl, setup.controller);
  const abi = new Interface((await read('contracts/out/CapitalController.sol/CapitalController.json')).abi);
  const controller = new Contract(setup.controller, abi, rpc);
  const report = previous ?? { rootId: setup.rootId, owner: address, status: 'running', transactions: [], startedAt: new Date().toISOString() };
  const save = () => writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  let step = 'preflight';
  let expectedData;
  let submitted = false;
  let approved = false;
  let returnedHash;
  let recoveryLock = false;
  const lockPath = join(privateBase, 'browser-runtime', 'companion.lock');
  try {
    // The same exclusive lock prevents a companion from restarting mid-recovery.
    await writeFile(lockPath, String(process.pid), { mode: 0o600, flag: 'wx' });
    recoveryLock = true;
    assert.equal((await rpc.getNetwork()).chainId, 11155111n);
    assert.equal((await controller.rootOwner(setup.rootId)).toLowerCase(), address.toLowerCase());
    if (resume) {
      step = 'reconcile-resume';
      await verifyPartialOwnerRecovery({ rpc, sdk, abi, report, setup, followup, address });
      if (!freshOwnerResume) {
        // The original profile may retain an unsigned MetaMask request. Cancel
        // only a visibly identified controller request; never confirm it.
        let popup = context.pages().find(page => page.url().startsWith(`${origin}/notification.html`));
        if (!popup) { popup = await context.newPage(); await popup.goto(`${origin}/notification.html`); }
        const confirm = popup.getByRole('button', { name: 'Confirm', exact: true });
        await confirm.waitFor({ timeout: 15000 });
        assert(await popup.getByRole('button', { name: 'Cancel', exact: true }).isVisible(), 'Stale request has no normal Cancel control');
        const visibleText = (await popup.locator('body').innerText()).toLowerCase();
        assert(visibleText.includes(setup.controller.toLowerCase()) && visibleText.includes('sepolia'),
          'Stale wallet request is not clearly identified as the Sepolia controller; inspect it manually');
        await popup.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect.poll(() => popup.isClosed() ? false : confirm.isVisible().catch(() => false), { timeout: 30000 }).toBe(false);
        await app.bringToFront();
      }
      await verifyPartialOwnerRecovery({ rpc, sdk, abi, report, setup, followup, address });
      report.status = 'running'; report.resumedAt = new Date().toISOString();
    }
    await save();
    await app.exposeFunction('actReviewRecovery', transaction => {
      assert(expectedData && !submitted, 'Unexpected or duplicate owner write');
      assert.equal(transaction.from.toLowerCase(), address.toLowerCase());
      assert.equal(transaction.to.toLowerCase(), setup.controller.toLowerCase());
      assert.equal(BigInt(transaction.value ?? 0), 0n);
      assert.equal(transaction.data.toLowerCase(), expectedData.toLowerCase());
      submitted = true;
    });
    await app.exposeFunction('actRecordRecoveryHash', async hash => {
      assert(/^0x[a-fA-F0-9]{64}$/.test(hash));
      returnedHash = hash;
      report.transactions.push({ step, transactionHash: hash });
      await save();
      console.log(JSON.stringify({ step, transactionHash: hash }));
    });
    async function loadRoot() {
      await app.goto(`${appUrl}/?root=${setup.rootId}`);
      await expect(app.getByText(`Live root ${setup.rootId}.`, { exact: true })).toBeVisible({ timeout: 60000 });
      await app.evaluate(() => {
        const original = window.ethereum.request.bind(window.ethereum);
        window.ethereum.request = async args => {
          if (args.method !== 'eth_sendTransaction') return original(args);
          await window.actReviewRecovery(args.params[0]);
          const hash = await original(args);
          await window.actRecordRecoveryHash(hash);
          return hash;
        };
      });
    }
    async function confirm() {
      const deadline = Date.now() + 240000;
      while (Date.now() < deadline) {
        assert.equal(await app.locator('.wallet-action-notice-error:visible, .wallet-form-error:visible').count(), 0, 'Owner UI reported an error');
        if (returnedHash) {
          const receipt = await rpc.waitForTransaction(returnedHash, 2, 180000);
          assert(receipt?.status === 1);
          assert.equal(receipt.from.toLowerCase(), address.toLowerCase());
          assert.equal((await rpc.getBlock(receipt.blockNumber)).hash, receipt.blockHash);
          Object.assign(report.transactions.at(-1), { blockNumber: receipt.blockNumber, blockHash: receipt.blockHash });
          await save();
          return receipt;
        }
        if (submitted && !approved) {
          let popup = context.pages().find(page => page.url().startsWith(`${origin}/notification.html`));
          if (!popup) { popup = await context.newPage(); await popup.goto(`${origin}/notification.html`); }
          await popup.getByRole('button', { name: 'Confirm', exact: true }).waitFor({ timeout: 60000 });
          for (const name of ['Confirm anyway', 'Connect anyway', 'Continue at your own risk']) {
            assert(!await popup.getByRole('button', { name, exact: true }).isVisible(), 'Wallet warning requires investigation');
          }
          approved = true;
          await popup.getByRole('button', { name: 'Confirm', exact: true }).click();
          await app.bringToFront();
        }
        await app.waitForTimeout(750);
      }
      throw new Error('Owner action timed out; reconcile before resuming');
    }
    const actions = resume
      ? [['recover', setup.rootId]]
      : closeOnly
      ? [['close', models.childId], ['recover', models.grandchildId]]
      : [['recover', followup.siblingId], ['recover', setup.rootId]];
    for (const [action, nodeId] of actions) {
      step = `${action}-${nodeId}`;
      returnedHash = undefined; submitted = false; approved = false; expectedData = undefined;
      const before = await sdk.getTree(BigInt(setup.rootId));
      const node = before.nodes.find(item => item.id.toString() === nodeId);
      assert(node);
      await loadRoot();
      await app.locator('.tree-node:visible').filter({ has: app.getByText(node.ensName, { exact: true }) }).click();
      await app.getByRole('button', { name: 'Owner recovery', exact: true }).click();
      if (action === 'close') {
        assert(node.position.tokenId > 0n);
        // Both sides of this bounded demo position exceed 0.5 tokens. Simulation
        // must enforce these real minima; never silently fall back to zero.
        const localDate = await app.evaluate(() => {
          const date = new Date(Date.now() + 30 * 60000);
          return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        });
        await app.getByLabel('Minimum ACT-A output', { exact: true }).fill('0.5');
        await app.getByLabel('Minimum ACT-B output', { exact: true }).fill('0.5');
        await app.getByLabel('Close deadline', { exact: true }).fill(localDate);
        const deadline = await app.getByLabel('Close deadline', { exact: true }).evaluate(input => Math.floor(new Date(input.value).getTime() / 1000).toString());
        expectedData = abi.encodeFunctionData('ownerEmergencyClosePosition', [nodeId, [parseEther('0.5'), parseEther('0.5')], deadline]);
        await app.getByRole('button', { name: 'Simulate and close LP position', exact: true }).click();
      } else {
        assert.equal(node.position.tokenId, 0n);
        assert(node.balances.some(value => value > 0n));
        expectedData = abi.encodeFunctionData('ownerEmergencyRecover', [nodeId]);
        await app.getByRole('button', { name: 'Review recovery', exact: true }).click();
        await app.getByRole('button', { name: 'Confirm recovery', exact: true }).click();
      }
      const receipt = await confirm();
      // MetaMask may wrap calldata in its EIP-7702 executor. Verify the exact
      // canonical controller events, including outputs and bound recipients.
      const events = receipt.logs.filter(log => log.address.toLowerCase() === setup.controller.toLowerCase())
        .map(log => { try { return abi.parseLog(log); } catch { return null; } })
        .filter(event => event?.args.rootId?.toString() === setup.rootId && event?.args.nodeId?.toString() === nodeId);
      if (action === 'close') {
        const closed = events.filter(event => event.name === 'PositionClosed');
        assert.equal(closed.length, 1);
        assert.equal(closed[0].args.tokenId, node.position.tokenId);
        assert.equal(closed[0].args.liquidity, node.position.liquidity);
        assert(closed[0].args.amount0 >= parseEther('0.5') && closed[0].args.amount1 >= parseEther('0.5'));
      } else {
        const recipient = node.parentId === 0n ? address : before.nodes.find(item => item.id === node.parentId).vault;
        for (const [index, token] of before.tokens.entries()) {
          if (node.balances[index] === 0n) continue;
          const recovered = events.filter(event => event.name === 'EmergencyRecovered' && event.args.token.toLowerCase() === token.toLowerCase());
          assert.equal(recovered.length, 1);
          assert.equal(recovered[0].args.recipient.toLowerCase(), recipient.toLowerCase());
          assert.equal(recovered[0].args.amount, node.balances[index]);
        }
      }
      const after = (await sdk.getTree(BigInt(setup.rootId))).nodes.find(item => item.id.toString() === nodeId);
      assert(after.revoked);
      assert.equal(after.position.tokenId, 0n);
      if (action === 'recover') assert(after.balances.every(value => value === 0n));
    }
    const final = await sdk.getTree(BigInt(setup.rootId));
    if (!closeOnly) assert(final.nodes.every(node => node.revoked && node.position.tokenId === 0n && node.balances.every(value => value === 0n)));
    await loadRoot();
    if (resume) {
      report.reconciledFailure = { failedStep: report.failedStep, diagnostics: report.diagnostics };
      delete report.failedStep;
      delete report.diagnostics;
    }
    report.status = 'passed';
    report.finishedAt = new Date().toISOString();
    report.checks = { noRunningWorkers: true, companionExcludedByLock: true, realMetaMaskSignatures: true, allVaultsEmpty: !closeOnly, canonicalReceipts: true };
    await save();
    console.log(JSON.stringify({ status: report.status, rootId: setup.rootId, phase: closeOnly ? 'close' : 'final', transactions: report.transactions.length }));
  } catch (error) {
    report.status = 'incomplete';
    if (!resume || step !== 'reconcile-resume') {
      report.failedStep = step;
      report.diagnostics = { submitted, approved, returnedHash: returnedHash ?? null, timeout: error?.name === 'TimeoutError', assertion: error?.name === 'AssertionError' };
    }
    await save();
    console.error(JSON.stringify({ step, ...report.diagnostics }));
    throw error;
  } finally {
    if (recoveryLock) await rm(lockPath);
    rpc.destroy();
  }
}
