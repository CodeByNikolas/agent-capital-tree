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
  const root5Response = await page.request.get(`${base}/api/tree?root=5`);
  assert.equal(root5Response.status(), 200);
  const root5 = await root5Response.json();
  assert.equal(root5.nodes.length, 4);
  await page.goto(`${base}/?root=5`);
  await expect(page.getByText('Live root 5.', { exact: true })).toBeVisible({ timeout: 60000 });
  const root5Metric = page.locator('article').filter({ has: page.getByText('Vaults in tree', { exact: true }) });
  await expect(root5Metric.locator('.metric-value')).toContainText('4');
  await expect(root5Metric.locator('.metric-detail')).toContainText(`${root5.nodes.filter(node => node.state === 'active').length} active`);
  const expectedNames = ['5', '6', '7', '8'].map(id => {
    const node = root5.nodes.find(node => node.id === id);
    assert(node, `root 5 node ${id}`);
    return node.ensName;
  });
  assert.deepEqual(await page.locator('.tree-canvas-mobile .tree-node-ens').allTextContents(), expectedNames);
  for (const [name, width, height] of [['desktop', 1440, 1100], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `root 5 ${name} overflow`);
    await page.screenshot({ path: new URL(`root5-current-${name}.png`, output).pathname, fullPage: true });
    // Start at document focus; reach and select a grandchild using only Tab/Enter.
    await page.goto(`${base}/?root=5`);
    await expect(page.getByText('Live root 5.', { exact: true })).toBeVisible({ timeout: 60000 });
    const grandchild = page.locator('.tree-node:visible').filter({ has: page.getByText(expectedNames[2], { exact: true }) });
    for (let tabs = 0; tabs < 80 && !await grandchild.evaluate(node => node === document.activeElement); tabs++) {
      await page.keyboard.press('Tab');
    }
    await expect(grandchild).toBeFocused();
    assert(await grandchild.evaluate(node => {
      const style = getComputedStyle(node);
      return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
    }), `${name} keyboard focus must remain visible`);
    await page.keyboard.press('Enter');
    await expect(grandchild).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.selected-vault-summary')).toContainText(expectedNames[2]);
    checks.push(`${name}: keyboard-only grandchild selection updates mandate with visible focus`);
  }
  checks.push('live root 5: mobile descendants stay with their parent; desktop/mobile without overflow');
  const root9TreeResponse = await page.request.get(`${base}/api/tree?root=9`);
  assert.equal(root9TreeResponse.status(), 200, 'root 9 tree');
  const root9Tree = await root9TreeResponse.json();
  assert.equal(root9Tree.nodes.length, 3);
  assert.deepEqual(root9Tree.nodes.map(node => node.id).sort(), ['10', '11', '9']);

  const root9ActivityResponse = await page.request.get(`${base}/api/activity?root=9`);
  assert.equal(root9ActivityResponse.status(), 200, 'root 9 indexed activity');
  const root9Activity = await root9ActivityResponse.json();
  assert.equal(root9Activity.source, 'multi-baas');
  assert.equal(root9Activity.page.rootId, '9');
  assert.equal(root9Activity.page.indexing.indexingStartBlock, 11783944);
  assert.equal(root9Activity.page.verification?.source, 'rpc');
  assert(root9Activity.page.items.length > 0, 'root 9 has indexed activity');
  for (const item of root9Activity.page.items) {
    assert.equal(item.rootId, '9');
    assert(item.provenance.blockNumber >= 11783944, 'indexed event is within the configured history window');
  }
  const verifiedRoot9Items = root9Activity.page.items.filter(item => ['confirmed', 'finalized'].includes(item.provenance.finality));
  assert(verifiedRoot9Items.length >= 2, 'root 9 has canonical receipt-verified activity');
  const createdNodeIds = new Set(root9Activity.page.items.filter(item => item.kind === 'node_created').map(item => item.nodeId));
  for (const nodeId of ['9', '10', '11']) assert(createdNodeIds.has(nodeId), `indexed node-created event for ${nodeId}`);
  checks.push(`root 9 API: ${root9Activity.page.items.length} indexed rows, ${verifiedRoot9Items.length} receipt-verified, from block 11783944`);

  await page.goto(`${base}/?root=9`);
  await expect(page.getByText('Live root 9.', { exact: true })).toBeVisible({ timeout: 60000 });
  const root9ActivityPanel = page.locator('#activity');
  const root9HistoryCoverage = 'History indexed from block 11,783,944; earlier activity is not included.';
  for (const [name, width, height] of [['desktop', 1440, 1100], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    await root9ActivityPanel.scrollIntoViewIfNeeded();
    await expect(root9ActivityPanel.locator('.activity-row').first()).toBeVisible({ timeout: 60000 });
    await expect(root9ActivityPanel.locator('.activity-finality-confirmed, .activity-finality-finalized').first()).toBeVisible({ timeout: 60000 });
    await expect(root9ActivityPanel.locator('.activity-provenance')).toContainText(root9HistoryCoverage);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `root 9 ${name} overflow`);
    await page.screenshot({ path: new URL(`root9-history-${name}.png`, output).pathname, fullPage: true });
    checks.push(`root 9 ${name}: indexed history and coverage status visible without overflow`);
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
