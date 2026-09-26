// Replay current public reads with controlled latency to catch polling flicker.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
const base = process.env.ACT_TEST_APP_URL ?? 'https://kanoki-app.vercel.app';
const dataBase = process.env.ACT_TEST_DATA_URL ?? 'https://kanoki-app.vercel.app';
const vault = '0x2914398C72e3CE8B6924366BBDDc671940841F2b';
const fixtures = new Map();
async function read(path) {
  if (!fixtures.has(path)) {
    const response = await fetch(dataBase + path);
    assert.ok(response.ok, `${path}: ${response.status}`);
    fixtures.set(path, await response.json());
  }
  return fixtures.get(path);
}
await Promise.all([7, 1].flatMap(root => ['tree', 'activity', 'payments'].map(api => read(`/api/${api}?root=${root}`))));
const root7 = fixtures.get('/api/tree?root=7');
assert.equal(root7.nodes[0].localPolicy.permissions.length, 8);
assert.equal(root7.rootOperator, '0x0000000000000000000000000000000000000000');
assert.equal(root7.nodes[0].authorizedPermissions.length, 0);
const browser = await chromium.launch();
try {
  for (const [path, selector, root, api] of [
    ['/', '.funding-address', 7, 'tree'],
    ['/activity', '.activity-list', 1, 'activity'],
    ['/uniswap', '.activity-list', 1, 'activity'],
    ['/payments', '.payment-table', 1, 'payments'],
    ['/agent-activity', '.agent-report-totals', 1, 'activity'],
  ]) {
    const page = await browser.newPage({ permissions: ['clipboard-read', 'clipboard-write'] });
    let reads = 0;
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      let body;
      if (url.pathname === '/api/resolve-root') body = { rootId: String(root), nodeId: String(root) };
      else {
        body = await read(url.pathname + url.search);
        if (url.pathname === `/api/${api}` && ++reads > 1) await pending;
      }
      await route.fulfill({ json: body });
    });
    try {
      await page.clock.install();
      await page.goto(base + path + '?vault=' + (root === 7 ? vault : 'capital.kanoki.eth'));
      await expect(page.locator(selector)).toBeVisible({ timeout: 60000 });
      if (root === 7) {
        await expect(page.locator('.funding-address')).toContainText(vault);
        await expect(page.locator('.funding-address')).toContainText(root7.nodes[0].ensName);
        await page.getByRole('button', { name: 'Copy vault ens', exact: true }).click();
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), root7.nodes[0].ensName);
        await page.getByRole('button', { name: 'Copy vault contract', exact: true }).click();
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), vault);
        await expect(page.locator('.operator-pending-notice')).toContainText('8 selected capabilities');
        await expect(page.getByRole('link', { name: 'Authorize agent', exact: true })).toHaveAttribute('href', /action=set-root-operator/);
        await page.setViewportSize({ width: 390, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      }
      if (path !== '/agent-activity') assert.doesNotMatch(await page.locator('main').innerText(), /MultiBaas/i);
      else await expect(page.locator('main')).toContainText('MultiBaas');
      await page.clock.fastForward(21000);
      await expect.poll(() => reads).toBeGreaterThan(1);
      await expect(page.locator(selector)).toBeVisible();
      await expect(page.locator('.dashboard-loading:visible, [aria-label="Loading activity history"]:visible, [aria-label="Loading payment history"]:visible, [aria-label="Loading agent activity"]:visible')).toHaveCount(0);
      release();
      if (root === 7) {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.getByRole('link', { name: 'Authorize agent', exact: true }).click();
        await expect(page.getByRole('textbox', { name: 'Agent signing address (operator)' })).toBeVisible();
        await page.locator('[aria-label="Primary navigation"]').getByRole('link', { name: 'Agent tree', exact: true }).click();
        await page.locator('.tree-canvas-desktop .tree-node').click();
        await expect(page.getByRole('dialog')).toContainText('8 policy capabilities');
        await expect(page.getByRole('dialog')).toContainText('No agent operator is bound yet');
      }
      await page.unrouteAll({ behavior: 'wait' });
      console.log(`PASS ${path}: background refresh retains content; correct funding/authorization/provenance.`);
    } finally {
      release();
      await page.unrouteAll({ behavior: 'wait' });
      await page.close();
    }
  }
} finally { await browser.close(); }
