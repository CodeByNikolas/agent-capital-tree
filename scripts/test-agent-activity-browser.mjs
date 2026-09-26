import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
const base = process.env.ACT_TEST_APP_URL ?? 'http://localhost:3098';
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (!process.env.ACT_TEST_APP_URL) await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: 'https://kanoki-app.vercel.app' + url.pathname + url.search });
    await route.fulfill({ response });
  });
  await page.goto(`${base}/agent-activity?vault=capital.kanoki.eth`);
  await expect(page.getByRole('heading', { name: 'Curvegrid', exact: true })).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('Totals from loaded events only', { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.agent-report-picker select')).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator('.agent-report-picker select').selectOption('1');
    await expect(page.locator('.agent-report-totals')).toContainText('Root funding');
    await expect(page.locator('.agent-report-totals')).not.toContainText('Allocations received');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await page.screenshot({ path: `/tmp/kanoki-agent-activity-${width}.png`, fullPage: true });
  }
  // Only the error/loading scenarios use a controlled API response; the above uses live Sepolia/MultiBaas.
  let release;
  await page.route('**/api/activity?*', async route => {
    await new Promise(resolve => { release = resolve; });
    await route.fulfill({ json: { source: 'unavailable', reason: 'upstream_error', message: 'Test indexer unavailable' } });
  });
  await page.reload();
  await expect(page.getByLabel('Loading agent activity', { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.agent-report-totals')).toHaveCount(0);
  release();
  await expect(page.getByText('Test indexer unavailable', { exact: true })).toBeVisible();
  await expect(page.locator('.agent-report-totals')).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log('PASS: live MultiBaas report, agent switching, desktop/mobile overflow, loading skeleton and unavailable state without totals. No transactions.');
} finally { await browser.close(); }
