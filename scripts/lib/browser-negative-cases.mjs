import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { JsonRpcProvider } from 'ethers';
import { expect } from '@playwright/test';

export async function browserNegativeCases({ context, app, origin, address, appUrl }) {
  const setup = JSON.parse(await readFile(new URL('../../deployments/browser-owner-e2e.json', import.meta.url)));
  assert.equal(address.toLowerCase(), setup.owner.toLowerCase());
  const rpc = new JsonRpcProvider('https://ethereum-sepolia.publicnode.com');
  const checks = [];
  try {
    await app.goto(`${appUrl}/?root=${setup.rootId}`);
    await expect(app.getByText(`Live root ${setup.rootId}.`, { exact: true })).toBeVisible({ timeout: 60000 });
    await expect(app.getByRole('button', { name: 'Fund root', exact: true })).toBeEnabled();
    const nonce = await rpc.getTransactionCount(address);
    let requestSeen = false;
    await app.exposeFunction('actObserveRejectedRequest', () => { requestSeen = true; });
    await app.evaluate(() => {
      const original = window.ethereum.request.bind(window.ethereum);
      window.ethereum.request = async args => {
        if (args.method === 'eth_sendTransaction') await window.actObserveRejectedRequest();
        return original(args);
      };
    });
    await app.getByRole('button', { name: 'Create root', exact: true }).click();
    await app.getByLabel('Root ENS label', { exact: true }).fill(`rejection-${Date.now()}`);
    await app.getByLabel('Maximum ACT-A per action', { exact: true }).fill('1');
    await app.getByLabel('Maximum ACT-B per action', { exact: true }).fill('1');
    await app.getByLabel('Policy expires', { exact: true }).fill(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
    for (const checkbox of await app.locator('.wallet-permission-fields input[type=checkbox]').all()) await checkbox.check();
    await app.getByRole('button', { name: 'Create root vault', exact: true }).click();
    await expect.poll(() => requestSeen, { timeout: 60000 }).toBe(true);
    let popup = context.pages().find(page => page.url().startsWith(`${origin}/notification.html`));
    if (!popup) { popup = await context.newPage(); await popup.goto(`${origin}/notification.html`); }
    // Reject the real wallet request. This test never presses a transaction Confirm.
    await popup.getByRole('button', { name: /^(Cancel|Reject)$/ }).first().click({ timeout: 60000 });
    await expect(app.locator('.wallet-action-notice-error')).toContainText(/reject|denied|cancel/i, { timeout: 30000 });
    await expect(app.getByRole('button', { name: 'Create root vault', exact: true })).toBeEnabled();
    assert.equal(await rpc.getTransactionCount(address), nonce);
    assert.equal(await rpc.getTransactionCount(address, 'pending'), nonce);
    checks.push('Real MetaMask rejection leaves owner nonce unchanged and releases busy UI');

    async function confirmNetwork(chainId, networkText) {
      const until = Date.now() + 60000;
      while (Date.now() < until) {
        if (await app.evaluate(() => window.ethereum.request({ method: 'eth_chainId' })) === chainId) return;
        let dialog = context.pages().find(page => page.url().startsWith(`${origin}/notification.html`));
        if (!dialog) { dialog = await context.newPage(); await dialog.goto(`${origin}/notification.html`); }
        const confirm = dialog.getByRole('button', { name: /^(Confirm|Switch network)$/ });
        if (await confirm.isVisible().catch(() => false)) {
          assert(await dialog.getByText(networkText, { exact: false }).count(), 'Unexpected network request');
          assert(!await dialog.getByRole('button', { name: /anyway|at your own risk/i }).count(), 'Unexpected wallet warning');
          await confirm.click();
        }
        await app.waitForTimeout(500);
      }
      throw new Error('Network switch did not complete');
    }
    await app.evaluate(() => {
      window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x1' }] }).catch(() => {});
    });
    await confirmNetwork('0x1', 'Ethereum');
    await expect(app.getByRole('button', { name: 'Switch to Sepolia', exact: true })).toBeVisible();
    for (const name of ['Fund root', 'Bind operator', 'Claim demo tokens', 'Create root']) {
      await expect(app.getByRole('button', { name, exact: true })).toBeDisabled();
    }
    await app.getByRole('button', { name: 'Switch to Sepolia', exact: true }).click();
    await confirmNetwork('0xaa36a7', 'Sepolia');
    await expect(app.getByLabel('Connected to Sepolia')).toBeVisible();
    checks.push('Real mainnet switch disables financial UI; Sepolia switch restores network');

    await app.route('**/api/tree?**', route => route.fulfill({ status: 503, contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'rpc_unavailable', message: 'Simulated RPC outage for acceptance test.' } }) }));
    await expect(app.locator('.live-read-notice-error')).toBeVisible({ timeout: 30000 });
    await expect(app.getByRole('button', { name: 'Fund root', exact: true })).toBeDisabled();
    await app.unroute('**/api/tree?**');
    await app.reload();
    await expect(app.getByText(`Live root ${setup.rootId}.`, { exact: true })).toBeVisible({ timeout: 60000 });
    await expect(app.getByRole('button', { name: 'Fund root', exact: true })).toBeEnabled();
    assert.equal(await rpc.getTransactionCount(address), nonce);
    checks.push('Simulated tree API outage locks stale-state management and recovers after reload');
    const report = { status: 'passed', checkedAt: new Date().toISOString(), appUrl, rootId: setup.rootId, owner: address,
      checks, limitations: ['RPC outage injected at the HTTP response boundary; the public RPC service was not disrupted.'] };
    await writeFile(new URL('../../deployments/browser-negative-cases.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  } finally { rpc.destroy(); }
}
