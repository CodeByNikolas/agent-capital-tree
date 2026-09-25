import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Contract, Interface, JsonRpcProvider, parseEther } from 'ethers';
import { expect } from '@playwright/test';
import { prepareRootOperator } from '../../packages/runtime/dist/index.js';

// Real UI actions and MetaMask confirmations. No wallet keys enter this module.
export async function browserOwnerSetup({ context, app, origin, address, privateBase }) {
  const manifest = JSON.parse(await readFile(new URL('../../deployments/sepolia.json', import.meta.url), 'utf8'));
  const controller = manifest.contracts.CapitalController.address;
  const controllerAbi = JSON.parse(await readFile(new URL('../../contracts/out/CapitalController.sol/CapitalController.json', import.meta.url), 'utf8')).abi;
  const abi = new Interface(controllerAbi);
  const tokenAbi = new Interface(['function mint()', 'function approve(address,uint256)', 'function claimed(address) view returns(bool)', 'function balanceOf(address) view returns(uint256)']);
  const tokens = manifest.tokens.map(token => token.address.toLowerCase());
  const rpc = new JsonRpcProvider('https://ethereum-sepolia.publicnode.com');
  const reportPath = new URL('../../deployments/browser-owner-e2e.json', import.meta.url);
  let report;
  try { report = JSON.parse(await readFile(reportPath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (report && ['running', 'incomplete'].includes(report.status)) throw new Error('Reconcile the previous browser write receipts before resuming owner setup');
  report ??= { owner: address, controller, chainId: 11155111, label: 'browser-jury', status: 'running', transactions: [], startedAt: new Date().toISOString(), startBlock: await rpc.getBlockNumber() };
  assert.equal(report.owner.toLowerCase(), address.toLowerCase());
  assert.equal(report.controller, controller);
  const save = () => writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  let phase = 'claim';
  let step = 'initial state';
  report.status = 'running';
  const pending = [];
  await save();
  try {
    assert.equal((await rpc.getNetwork()).chainId, 11155111n);
    await app.exposeFunction('actReviewUnsigned', async transaction => {
      assert.equal(transaction.from.toLowerCase(), address.toLowerCase());
      assert.equal(BigInt(transaction.value ?? 0), 0n);
      const to = transaction.to.toLowerCase();
      const decoded = (to === controller.toLowerCase() ? abi : tokenAbi).parseTransaction({ data: transaction.data });
      assert(decoded);
      if (phase === 'claim') assert(tokens.includes(to) && decoded.name === 'mint');
      else if (phase === 'create') {
        assert(to === controller.toLowerCase() && decoded.name === 'createRoot');
        assert.equal(decoded.args[0], report.label);
        assert(decoded.args[1].maxAmounts.every(amount => amount === parseEther('100')));
      } else if (phase === 'fund') {
        if (decoded.name === 'approve') {
          assert(tokens.includes(to));
          assert.equal(decoded.args[0].toLowerCase(), controller.toLowerCase());
          assert.equal(decoded.args[1], parseEther('100'));
        } else {
          assert(to === controller.toLowerCase() && decoded.name === 'fundRoot');
          assert.equal(decoded.args[0].toString(), report.rootId);
          assert(decoded.args[1].every(amount => amount === parseEther('100')));
        }
      } else if (phase === 'bind') {
        assert(to === controller.toLowerCase() && decoded.name === 'setRootOperator');
        assert.equal(decoded.args[0].toString(), report.rootId);
        assert.equal(decoded.args[1].toLowerCase(), report.operator.toLowerCase());
      } else throw new Error('Unexpected wallet write phase');
      const index = pending.length;
      pending.push({ transaction, phase, functionName: decoded.name, approved: false });
      return index;
    });
    await app.exposeFunction('actRecordHash', async (index, hash) => {
      assert(/^0x[0-9a-fA-F]{64}$/.test(hash));
      pending[index].hash = hash;
      report.transactions.push({ phase: pending[index].phase, functionName: pending[index].functionName, transactionHash: hash });
      await save();
    });
    const instrument = () => app.evaluate(() => {
      if (window.ethereum.__actObserved) return;
      const original = window.ethereum.request.bind(window.ethereum);
      window.ethereum.request = async args => {
        if (args.method !== 'eth_sendTransaction') return original(args);
        const index = await window.actReviewUnsigned(args.params[0]);
        const hash = await original(args);
        await window.actRecordHash(index, hash);
        return hash;
      };
      window.ethereum.__actObserved = true;
    });
    await instrument();

    async function finishAction(done) {
      const deadline = Date.now() + 240000;
      while (Date.now() < deadline) {
        if (await app.locator('.wallet-action-notice-error:visible, .wallet-form-error:visible').count()) throw new Error(`Browser ${phase} action reported an error`);
        if (await done()) return;
        const next = pending.find(item => !item.approved && !item.hash);
        if (next) {
          let popup = context.pages().find(page => page.url().startsWith(`${origin}/notification.html`));
          if (!popup) {
            popup = await context.newPage();
            await popup.goto(`${origin}/notification.html`, { waitUntil: 'domcontentloaded' });
          }
          await popup.getByRole('button', { name: 'Confirm', exact: true }).waitFor({ timeout: 60000 });
          for (const warning of ['Confirm anyway', 'Connect anyway', 'Continue at your own risk']) {
            if (await popup.getByRole('button', { name: warning, exact: true }).isVisible()) throw new Error('Wallet safety warning requires investigation');
          }
          // The app's exact unsigned calldata was checked above before the request reached MetaMask.
          next.approved = true;
          await popup.getByRole('button', { name: 'Confirm', exact: true }).click();
          await app.bringToFront();
        }
        await app.waitForTimeout(750);
      }
      throw new Error(`Browser ${phase} confirmation timed out; reconcile receipts before retry`);
    }

    await expect(app.getByText('Live root 1.', { exact: true })).toBeVisible({ timeout: 60000 });
    if (!report.claimed) {
      await app.getByRole('button', { name: 'Claim demo tokens', exact: true }).click();
      await finishAction(() => app.getByText(/^Demo tokens (?:already )?claimed$/).isVisible());
      for (const token of manifest.tokens) {
        const asset = new Contract(token.address, tokenAbi, rpc);
        assert(await asset.claimed(address));
        assert.equal(await asset.balanceOf(address), parseEther('1000'));
      }
      report.claimed = true;
      await save();
    }
    if (!report.rootId) {
      phase = 'create';
      step = 'open create form';
      await app.getByRole('button', { name: 'Create root', exact: true }).click();
      step = 'fill create form';
      await app.getByLabel('Root ENS label', { exact: true }).fill(report.label);
      await app.getByLabel('Maximum ACT-A per action', { exact: true }).fill('100');
      await app.getByLabel('Maximum ACT-B per action', { exact: true }).fill('100');
      await app.getByLabel('Policy expires', { exact: true }).fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
      for (const checkbox of await app.locator('.wallet-permission-fields input[type=checkbox]').all()) await checkbox.check();
      step = 'submit create form';
      await app.getByRole('button', { name: 'Create root vault', exact: true }).click();
      step = 'confirm create transaction';
      await finishAction(async () => Boolean(new URL(app.url()).searchParams.get('root')));
      report.rootId = new URL(app.url()).searchParams.get('root');
      await save();
    } else {
      await app.goto(`https://agent-capital-tree.vercel.app/?root=${report.rootId}`);
      await instrument();
    }
    await expect(app.getByText(`Live root ${report.rootId}.`, { exact: true })).toBeVisible({ timeout: 60000 });
    if (!report.funded) {
      phase = 'fund';
      await app.getByRole('button', { name: 'Fund root', exact: true }).click();
      await app.getByLabel('ACT-A amount', { exact: true }).fill('100');
      await app.getByLabel('ACT-B amount', { exact: true }).fill('100');
      await app.getByRole('button', { name: 'Approve and fund root', exact: true }).click();
      await finishAction(() => app.locator('.wallet-action-notice-confirmed').filter({ hasText: 'Fund root vault' }).isVisible());
      const node = await new Contract(controller, controllerAbi, rpc).getNode(report.rootId);
      for (const token of manifest.tokens) assert.equal(await new Contract(token.address, tokenAbi, rpc).balanceOf(node.vault), parseEther('100'));
      report.funded = true;
      await save();
    }
    const runtimeRoot = join(privateBase, 'browser-runtime');
    report.operator ??= await prepareRootOperator(runtimeRoot, report.rootId, controller);
    await save();
    if (!report.operatorBound) {
      phase = 'bind';
      await app.getByRole('button', { name: 'Bind operator', exact: true }).click();
      await app.getByLabel('Root operator address', { exact: true }).fill(report.operator);
      await app.getByRole('button', { name: 'Set root operator', exact: true }).click();
      await finishAction(() => app.locator('.wallet-action-notice-confirmed').filter({ hasText: 'Set root operator' }).isVisible());
      assert.equal((await new Contract(controller, controllerAbi, rpc).rootOperator(report.rootId)).toLowerCase(), report.operator.toLowerCase());
      report.operatorBound = true;
      await save();
    }
    for (const transaction of report.transactions) {
      const receipt = await rpc.getTransactionReceipt(transaction.transactionHash);
      assert(receipt && receipt.status === 1);
      assert.equal(receipt.from.toLowerCase(), address.toLowerCase());
      transaction.blockNumber = receipt.blockNumber;
      transaction.blockHash = receipt.blockHash;
    }
    report.status = 'owner-setup-passed';
    report.finishedAt = new Date().toISOString();
    report.limitations = ['Agent execution and owner recovery are separate subsequent steps.', 'MultiBaas live indexing remains unconfigured.'];
    await save();
    console.log(JSON.stringify({ status: report.status, rootId: report.rootId, owner: address, operator: report.operator, transactions: report.transactions.length }));
  } catch (error) {
    report.status = 'incomplete';
    report.failedPhase = phase;
    report.failedStep = step;
    // Inspect only our own form errors, never extension contents or raw wallet errors.
    const errors = await app.locator('.wallet-action-notice-error:visible, .wallet-form-error:visible').allTextContents().catch(() => []);
    report.diagnostics = {
      timeout: error?.name === 'TimeoutError',
      assertion: error?.name === 'AssertionError',
      strictLocator: /strict mode violation/.test(error?.message ?? ''),
      appErrors: errors.map(value => value.replace(/0x[a-fA-F0-9]{64}/g, '[hash]').slice(0, 500)),
      submitted: pending.map(item => ({ phase: item.phase, functionName: item.functionName, approved: item.approved, hash: item.hash ?? null })),
    };
    await save();
    console.error(JSON.stringify({ phase, step, ...report.diagnostics }));
    throw error;
  } finally { rpc.destroy(); }
}
