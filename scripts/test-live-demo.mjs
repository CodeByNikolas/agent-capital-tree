// Checks the public demo all the way from current receipts/indexed data to the rendered UI.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
const base = process.env.ACT_TEST_APP_URL ?? 'https://kanoki-app.vercel.app';
const dataBase = process.env.ACT_TEST_DATA_URL ?? base;
const report = JSON.parse(await readFile(new URL('../deployments/kanoki-demo-e2e.json', import.meta.url), 'utf8'));
const payment = JSON.parse(await readFile(new URL('../deployments/kanoki-payment.json', import.meta.url), 'utf8'));
assert.equal(report.status, 'confirmed');
async function get(path) { const response = await fetch(dataBase + path); assert.ok(response.ok, `${path}: HTTP ${response.status}`); return response.json(); }
const [tree, payments, activity] = await Promise.all(['/api/tree?root=1', '/api/payments?root=1', '/api/activity?root=1'].map(get));
assert.equal(tree.source, 'direct-rpc');
assert.equal(tree.nodes.length, 5);
for (const label of ['trader', 'liquidity', 'risk-check']) {
  const node = tree.nodes.find(node => node.id === report.nodes[label].id);
  assert.ok(node, `${label} missing from API tree`);
  assert.equal(node.parentId, report.nodes[label].parentId);
}
assert.equal(tree.positions.length, 2);
assert.ok(payments.payments.some(item => item.transactionHash.toLowerCase() === payment.payment.transactionHash.toLowerCase()));
assert.equal(activity.source, 'multi-baas');
let items = activity.page.items;
let next = activity.page;
while (next.hasMore) {
  const result = await get('/api/activity?root=1&cursor=' + encodeURIComponent(next.nextCursor));
  assert.equal(result.source, 'multi-baas');
  items = items.concat(result.page.items); next = result.page;
}
for (const name of ['spawn-trader', 'spawn-liquidity', 'spawn-risk-check', 'open-liquidity', 'swap-trader', 'collect-liquidity-fees', 'tighten-risk-policy']) {
  assert.ok(items.some(item => item.provenance.transactionHash.toLowerCase() === report.transactions[name].transactionHash.toLowerCase()), `${name} missing from MultiBaas`);
}
const browser = await chromium.launch();
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    // Local build verification can use real public reads without copying production secrets.
    if (dataBase !== base) await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      const response = await route.fetch({ url: dataBase + url.pathname + url.search });
      await route.fulfill({ response });
    });
    await page.goto(base);
    await page.getByRole('link', { name: 'Open live demo', exact: true }).click();
    const treeCards = page.locator(width < 720 ? '.tree-canvas-mobile .tree-node' : '.tree-canvas-desktop .tree-node');
    await expect(treeCards).toHaveCount(5, { timeout: 60000 });
    await expect(page.getByRole('region', { name: 'Live demo walkthrough' })).toBeVisible();
    await treeCards.filter({ hasText: 'risk-check.' }).click();
    await expect(page.getByRole('dialog')).toContainText('risk-check.trader.capital.kanoki.eth');
    await page.keyboard.press('Escape');
    for (const name of ['Uniswap', 'x402 Pay', 'Curvegrid', 'Overview']) {
      if (width < 768) await page.getByRole('button', { name: 'Toggle Sidebar', exact: true }).click();
      await page.locator('[aria-label="Primary navigation"]').getByRole('link', { name, exact: true }).click();
      if (name === 'Uniswap') {
        await expect(page.locator('.position-record')).toHaveCount(2, { timeout: 60000 });
        await expect(page.locator(`a[href="https://sepolia.etherscan.io/tx/${report.transactions['swap-trader'].transactionHash}"]`)).toBeVisible({ timeout: 60000 });
      }
      if (name === 'x402 Pay') await expect(page.locator('.payment-table')).toContainText('0.010', { timeout: 60000 });
      if (name === 'Curvegrid') {
        await expect(page.locator('.agent-report-picker select')).toBeVisible({ timeout: 60000 });
        await page.locator('.agent-report-picker select').selectOption(report.nodes.trader.id);
        await expect(page.locator('.agent-report-totals')).toContainText('Swap', { timeout: 60000 });
      }
      if (name === 'Overview') await expect(page.getByRole('heading', { name: 'How it works', exact: true })).toBeVisible();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} overflows at ${width}px`);
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS: five real vaults, nested delegation, two LP NFTs, x402 receipt, all new controller transactions indexed by MultiBaas, desktop/mobile journey.');
} finally { await browser.close(); }
