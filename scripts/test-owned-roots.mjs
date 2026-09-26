// UI regression: suggestions use onchain ownership, including wallet changes. No transactions.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
const base = process.env.ACT_TEST_APP_URL ?? 'http://127.0.0.1:3098';
const ownerA = `0x${'a'.repeat(40)}`;
const ownerB = `0x${'b'.repeat(40)}`;
const other = `0x${'c'.repeat(40)}`;
const root = (id, owner, label) => ({ id: String(id), owner, label,
  ensName: `${label}.kanoki.eth`, vault: `0x${id.toString(16).padStart(40, '0')}`,
  nodeCount: 1, revoked: false });
const roots = [...Array.from({ length: 9 }, (_, i) => root(i + 1, other, `foreign-${i}`)),
  root(10, `0x${'A'.repeat(40)}`, 'owned-a'), root(11, ownerB, 'owned-b')];
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const listeners = new Map();
    window.ethereum = { on: (event, fn) => listeners.set(event, fn),
      removeListener: event => listeners.delete(event), request: async ({ method }) => {
        if (method === 'eth_accounts') return [];
        if (method === 'eth_chainId') return '0xaa36a7';
        throw new Error(`Unexpected wallet request: ${method}`);
      } };
    window.testWalletReady = () => listeners.has('accountsChanged');
    window.setTestWallet = accounts => listeners.get('accountsChanged')?.(accounts);
  });
  await page.route('**/api/roots', route => route.fulfill({ json: { roots, blockNumber: '123' } }));
  for (const width of [1280, 390]) for (const path of ['/setup', '/setup?preview=1']) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}${path}`);
    await page.waitForFunction(() => window.testWalletReady());
    if (path.includes('preview') && width === 390) await page.getByRole('button', { name: 'Toggle Sidebar', exact: true }).click();
    const chips = page.locator('.demo-root-chip');
    await expect(chips).toHaveCount(0);
    await page.evaluate(owner => window.setTestWallet([owner]), ownerA);
    await expect(chips).toHaveCount(1);
    await expect(chips).toContainText('owned-a');
    await expect(page.getByText('Your root vaults', { exact: true })).toBeVisible();
    if (path.includes('preview')) {
      const form = await page.locator('.root-access-form').boundingBox();
      const input = await page.locator('.root-access-form input').boundingBox();
      const button = await page.locator('.root-access-form button').boundingBox();
      const suggestions = await page.locator('.root-quick-start').boundingBox();
      assert.ok(input.width >= 150, `Sidebar input shrank to ${input.width}px after owned roots loaded`);
      assert.ok(suggestions.y >= form.y + form.height, 'Owned vaults overlap the lookup form');
      assert.ok(button.y >= input.y + input.height, 'Lookup controls overlap');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `/tmp/kanoki-owned-vaults-${width}.png`, fullPage: true });
    }
    await page.evaluate(owner => window.setTestWallet([owner]), ownerB);
    await expect(chips).toHaveCount(1);
    await expect(chips).toContainText('owned-b');
    await page.evaluate(() => window.setTestWallet(['0x1234567890abcdef1234567890abcdef12345678']));
    await expect(chips).toHaveCount(0);
    await page.evaluate(() => window.setTestWallet([]));
    await expect(chips).toHaveCount(0);
  }
  assert.deepEqual(errors, []);
  console.log('Passed: owner-only suggestions in onboarding/sidebar, case-insensitive ownership, filter before limit, account switch, no-owned wallet and disconnect. Fixture directory; no transactions.');
} finally { await browser.close(); }
