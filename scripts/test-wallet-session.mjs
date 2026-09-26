import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
const base = process.env.ACT_TEST_APP_URL ?? 'http://localhost:3100';
const browser = await chromium.launch();
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 820 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/roots', route => route.fulfill({ json: { roots: [] } }));
    await page.addInitScript(() => {
      const listeners = new Map();
      window.ethereum = { on: (name, listener) => listeners.set(name, listener), removeListener: name => listeners.delete(name), request: async ({ method }) => {
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') return ['0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'];
        if (method === 'eth_chainId') return '0xaa36a7';
        throw new Error(`Unexpected request: ${method}`);
      } };
      window.emitAccounts = () => listeners.get('accountsChanged')?.(['0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']);
    });
    await page.goto(base);
    await expect(page.getByRole('button', { name: /Connected wallet/ })).toBeVisible();
    await expect(page.locator('.network-button:not(.network-button-warning)')).toHaveCount(0);
    await expect(page.locator('#how-it-works')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'How it works', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Open live demo', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Connected wallet/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeVisible();
    await page.evaluate(() => window.emitAccounts());
    await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await page.getByRole('button', { name: /Connected wallet/ }).click();
    await expect(page.getByRole('link', { name: 'View on Etherscan' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.goto(base + '/?preview=1');
    await expect(page.getByRole('heading', { name: 'How it works', exact: true })).toBeVisible();
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS: wallet menu, sign out across events/reload, explicit reconnect, no network badge, dashboard-only guide, desktop/mobile.');
} finally { await browser.close(); }
