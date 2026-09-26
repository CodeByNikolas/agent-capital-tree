import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
const base = process.env.ACT_TEST_APP_URL ?? 'http://localhost:3099';
const browser = await chromium.launch();
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 720 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/roots', route => route.fulfill({ json: { roots: [] } }));
    await page.addInitScript(() => {
      window.ethereum = { on() {}, removeListener() {}, request: async ({ method }) => {
        if (method === 'eth_accounts') return ['0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'];
        if (method === 'eth_chainId') return '0xaa36a7';
        throw new Error(`Unexpected wallet request ${method}`);
      } };
    });
    await page.goto(`${base}/?preview=1`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('button', { name: /Connected wallet/ })).toBeVisible();
    await page.evaluate(() => {
      window.originalHeader = document.querySelector('.app-topbar');
      window.originalSidebar = document.querySelector('[data-slot="sidebar-wrapper"]');
      window.originalNavigation = document.querySelector('[aria-label="Primary navigation"]');
    });
    await page.getByRole('button', { name: 'Use light theme' }).click();
    for (const name of ['Agent tree', 'Uniswap', 'Setup & control', 'Overview']) {
      if (width < 768) await page.getByRole('button', { name: 'Toggle Sidebar', exact: true }).click();
      await page.locator('[aria-label="Primary navigation"]').getByRole('link', { name, exact: true }).click();
      await expect(page.locator('.app-topbar-title')).toContainText(name);
      assert.ok(await page.evaluate(() => window.originalHeader === document.querySelector('.app-topbar')), 'Header remounted during navigation');
      assert.ok(await page.evaluate(() => window.originalSidebar === document.querySelector('[data-slot="sidebar-wrapper"]')), 'Sidebar provider remounted');
      if (width >= 768) assert.ok(await page.evaluate(() => window.originalNavigation === document.querySelector('[aria-label="Primary navigation"]')), 'Sidebar navigation remounted');
      await expect(page.getByRole('button', { name: 'Use dark theme' })).toBeVisible();
      if (name === 'Setup & control') {
        await expect(page.locator('.setup-disclosure')).toBeVisible();
        assert.equal(await page.locator('details.setup-disclosure').count(), 0);
        const action = await page.getByRole('button', { name: 'Create another root' }).boundingBox();
        const row = await page.locator('.setup-selected').boundingBox();
        assert.ok(row.x + row.width - action.x - action.width < 30, 'Root action is not right aligned');
        await page.screenshot({ path: `/tmp/kanoki-shell-${width}.png`, fullPage: true });
      }
      await page.evaluate(() => window.scrollTo(0, 600));
      assert.ok(Math.abs((await page.locator('.app-topbar').boundingBox()).y) <= 1, 'Header scrolled out of view');
    }
    await page.getByRole('button', { name: /Connected wallet/ }).click();
    assert.equal((await page.getByRole('link', { name: 'View on Etherscan' }).getAttribute('href')).toLowerCase(), 'https://sepolia.etherscan.io/address/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, []);
    await page.close();
  }
  // Public read snapshots exercise the live branch without wallet transactions.
  const publicBase = process.env.ACT_TEST_DATA_URL ?? 'https://kanoki-app.vercel.app';
  const [tree, lookup] = await Promise.all(['/api/tree?root=1', '/api/resolve-root?q=capital.kanoki.eth'].map(async path => {
    const response = await fetch(publicBase + path);
    assert.ok(response.ok);
    return response.json();
  }));
  const live = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  let treeReads = 0;
  await live.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/tree') { treeReads++; return route.fulfill({ json: tree }); }
    if (path === '/api/resolve-root') return route.fulfill({ json: lookup });
    if (path === '/api/activity') return route.fulfill({ json: { source: 'unavailable', reason: 'upstream_error', message: 'Test history unavailable' } });
    return route.fulfill({ json: { roots: [] } });
  });
  await live.goto(base + '/?vault=capital.kanoki.eth');
  await expect(live.locator('.summary-ledger')).toBeVisible();
  await live.evaluate(() => { window.header = document.querySelector('.app-topbar'); window.nav = document.querySelector('[aria-label="Primary navigation"]'); });
  for (const name of ['Agent tree', 'Uniswap', 'Setup & control', 'Overview']) {
    await live.locator('[aria-label="Primary navigation"]').getByRole('link', { name, exact: true }).click();
    await expect(live.locator('.app-topbar-title')).toContainText(name);
    assert.ok(await live.evaluate(() => window.header === document.querySelector('.app-topbar') && window.nav === document.querySelector('[aria-label="Primary navigation"]')));
    await expect(live.getByLabel('Loading vault data', { exact: true })).toHaveCount(0);
  }
  assert.equal(treeReads, 1, 'Navigation restarted the live vault read');
  await live.goBack();
  await expect(live.locator('.app-topbar-title')).toContainText('Setup & control');
  assert.ok(await live.evaluate(() => window.header === document.querySelector('.app-topbar')));
  await live.close();
  console.log('PASS: persistent shell/theme, sticky header, wallet link, expanded setup and right-aligned root action on desktop/mobile.');
} finally { await browser.close(); }
