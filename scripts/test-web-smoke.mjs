import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

// Read-only checks: no wallet, secrets, signatures or inference access.
const base = process.env.ACT_TEST_APP_URL ?? 'http://127.0.0.1:3040';
const output = new URL('../artifacts/ui/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const checks = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const [root, status] of [['1', 200], ['2', 200], ['99999', 404], ['-1', 400]]) {
    const response = await page.request.get(`${base}/api/tree?root=${root}`);
    assert.equal(response.status(), status, `root ${root}`);
    if (status === 200) {
      const tree = await response.json();
      assert.equal(tree.source, 'direct-rpc');
      if (root === '2') {
        assert.equal(tree.nodes.length, 3);
        assert.equal(tree.nodes.filter(node => node.state === 'active').length, 0);
      }
    }
    checks.push(`root ${root}: HTTP ${status}`);
  }
  await page.goto(base);
  await expect(page.getByText('Live root 1.', { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole('button', { name: 'Claim demo tokens', exact: true })).toBeDisabled();
  await page.getByLabel('Root ID to load').fill('2');
  await page.getByRole('button', { name: 'Load root', exact: true }).click();
  await expect(page.getByText('Live root 2.', { exact: true })).toBeVisible({ timeout: 60000 });
  const metric = page.locator('article').filter({ has: page.getByText('Vaults in tree', { exact: true }) });
  await expect(metric.locator('.metric-value')).toContainText('3');
  await expect(metric.locator('.metric-detail')).toContainText('0 active');
  checks.push('live default, root navigation, revoked tree count and disconnected faucet');
  for (const [name, width, height] of [['desktop', 1440, 1100], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} overflow`);
    await page.screenshot({ path: new URL(`live-${name}.png`, output).pathname, fullPage: true });
    checks.push(`${name}: no horizontal overflow`);
  }
  await page.goto(`${base}/?preview=1`);
  await expect(page.getByText('Preview workspace.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open live root', exact: true })).toBeVisible();
  assert.deepEqual(errors, []);
  checks.push('explicit sample preview; no browser JavaScript errors');
  const report = { base, checkedAt: new Date().toISOString(), checks, walletTested: false };
  await writeFile(new URL('smoke-report.json', output), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
