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
  await expect(page.getByRole("heading", { name: "Create your root vault." })).toBeVisible();
  await expect(page.getByText("Preview workspace.", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Launch a new root vault" }).click();
  await expect(page.locator("#wallet-controls")).toBeVisible();
  checks.push("Default entry shows root onboarding, not sample data");
  await page.goto(`${base}/?root=1`);
  await expect(page.getByText('Live root 1.', { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(page.locator('#capital-tree')).toHaveCount(0);
  await expect(page.locator('#activity')).toHaveCount(0);
  await page.goto(`${base}/setup?root=1`);
  await expect(page.getByText('Live root 1.', { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole('button', { name: 'Claim demo tokens', exact: true })).toBeDisabled();
  await page.getByLabel('ENS name or vault contract address').fill('2');
  await page.getByRole('button', { name: 'Open vault', exact: true }).click();
  await expect(page.getByText('Live root 2.', { exact: true })).toBeVisible({ timeout: 60000 });
  assert.equal(new URL(page.url()).pathname, '/setup', 'Root picker preserves current page');
  await page.goto(`${base}/?root=2`);
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
  await page.goto(`${base}/tree?root=5`);
  await expect(page.getByText('Live root 5.', { exact: true })).toBeVisible({ timeout: 60000 });
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
    await page.goto(`${base}/tree?root=5`);
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
    const detail = page.getByRole('dialog');
    await expect(detail).toBeVisible();
    await expect(detail).toContainText(expectedNames[2]);
    assert(await detail.evaluate(node => node.scrollWidth <= node.clientWidth + 1), `${name} detail overflow`);
    await page.screenshot({ path: new URL(`root5-detail-${name}.png`, output).pathname, fullPage: true });
    await page.keyboard.press('Escape');
    await expect(detail).toHaveCount(0);
    await expect(grandchild).toBeFocused();
    checks.push(`${name}: keyboard selection opens agent details; Escape restores node focus`);
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

  await page.goto(`${base}/activity?root=9`);
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
    if (name === 'mobile') {
      assert(await root9ActivityPanel.locator('.activity-list').evaluate(table => table.scrollWidth <= table.clientWidth + 1), 'Mobile activity must expose amounts and receipts without horizontal scrolling');
    }
    await page.screenshot({ path: new URL(`root9-history-${name}.png`, output).pathname, fullPage: true });
    checks.push(`root 9 ${name}: indexed history and coverage status visible without overflow`);
  }
  await page.goto(`${base}/?preview=1`);
  await expect(page.getByText('Preview workspace.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open live root', exact: true })).toBeVisible();
  const pageLabels = [['/', 'Overview'], ['/tree', 'Agent tree'], ['/activity', 'Activity'], ['/applications', 'Applications'], ['/setup', 'Setup & control']];
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    for (const [name, width, height] of [['desktop', 1440, 1100], ['mobile', 390, 844]]) {
      await page.setViewportSize({ width, height });
      for (const [path, label] of pageLabels) {
        await page.goto(`${base}${path}?preview=1`);
        await expect(page.getByText('Preview workspace.', { exact: true })).toBeVisible();
        await expect(page.locator('h1')).toHaveCount(1);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme} ${name} ${path} overflow`);
        if (path === '/tree' && name === 'desktop') {
          const geometry = await page.locator('.tree-canvas-desktop').evaluate(canvas => {
            const cards = [...canvas.querySelectorAll('.tree-node')].map(node => node.getBoundingClientRect());
            const overlaps = cards.some((a, i) => cards.slice(i + 1).some(b => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top));
            const svg = canvas.querySelector('svg');
            const endpoints = [...svg.querySelectorAll('path')].every(path => {
              const first = path.getPointAtLength(0).matrixTransform(path.getScreenCTM());
              const last = path.getPointAtLength(path.getTotalLength()).matrixTransform(path.getScreenCTM());
              const near = (a, b) => Math.abs(a - b) < 3;
              return cards.some(card => near(card.right, first.x) && near((card.top + card.bottom) / 2, first.y)) &&
                cards.some(card => near(card.left, last.x) && near((card.top + card.bottom) / 2, last.y));
            });
            return { overlaps, endpoints };
          });
          assert.equal(geometry.overlaps, false, 'Readable tree cards must not overlap');
          assert.equal(geometry.endpoints, true, 'Tree connections must meet their parent and child cards');
        }
        assert(await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize) >= 16), `${theme} body font too small`);
        const readability = await page.evaluate(() => {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 1;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          const color = value => {
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = value;
            context.fillRect(0, 0, 1, 1);
            return [...context.getImageData(0, 0, 1, 1).data];
          };
          const blend = (front, back) => front.slice(0, 3).map((channel, index) => channel * front[3] / 255 + back[index] * (1 - front[3] / 255));
          const luminance = rgb => rgb.slice(0, 3).map(channel => channel / 255).map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4).reduce((sum, channel, i) => sum + channel * [0.2126, 0.7152, 0.0722][i], 0);
          const violations = [];
          for (const element of document.querySelectorAll('body *')) {
            if (!(element instanceof HTMLElement) || !element.checkVisibility() || element.closest('[disabled], [aria-hidden="true"], .sr-only')) continue;
            const directText = [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim();
            if (!directText) continue;
            const style = getComputedStyle(element);
            const size = parseFloat(style.fontSize);
            if (size < 14) violations.push({ text: directText.slice(0, 50), fontSize: size });
            const ancestors = [];
            for (let parent = element; parent; parent = parent.parentElement) ancestors.unshift(parent);
            let background = [255, 255, 255];
            for (const parent of ancestors) background = blend(color(getComputedStyle(parent).backgroundColor), background);
            const foreground = blend(color(style.color), background);
            const a = luminance(foreground), b = luminance(background);
            const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            const required = size >= 24 || (size >= 18.66 && parseInt(style.fontWeight, 10) >= 700) ? 3 : 4.5;
            if (ratio + 0.05 < required) violations.push({ text: directText.slice(0, 50), contrast: Math.round(ratio * 100) / 100, required });
          }
          return { violations, backgroundLuminance: luminance(color(getComputedStyle(document.body).backgroundColor)) };
        });
        assert.deepEqual(readability.violations, [], `${theme} ${name} ${path}: readable text size and contrast`);
        assert(theme === 'dark' ? readability.backgroundLuminance < 0.1 : readability.backgroundLuminance > 0.8, `${theme}: OS preference changes the surface`);
        await page.screenshot({ path: new URL(`redesign-${path === '/' ? 'overview' : path.slice(1)}-${theme}-${name}.png`, output).pathname, fullPage: true });
      }
      checks.push(`${theme} ${name}: five readable routes without viewport overflow`);
    }
  }
  // Exercise real navigation, including mobile Sheet dismissal and query context.
  for (const [name, width] of [['desktop', 1440], ['mobile', 390]]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}/?preview=1`);
    for (const [path, label] of pageLabels.slice(1)) {
      if (name === 'mobile') await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
      const navigation = page.getByLabel('Primary navigation');
      await navigation.getByRole('link', { name: label, exact: true }).click();
      await expect.poll(() => new URL(page.url()).pathname).toBe(path);
      assert.equal(new URL(page.url()).searchParams.get('preview'), '1');
      if (name === 'mobile') await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    checks.push(`${name}: sidebar navigation preserves preview mode and closes mobile menu`);
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`${base}/tree?root=5&node=7`);
  await expect(page.getByText('Live root 5.', { exact: true })).toBeVisible({ timeout: 60000 });
  await page.getByLabel('Primary navigation').getByRole('link', { name: 'Setup & control', exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/setup');
  assert.equal(new URL(page.url()).searchParams.get('root'), '5');
  assert.equal(new URL(page.url()).searchParams.get('node'), '7');
  checks.push('Live root and selected agent remain selected between tree and setup');
  await page.goto(`${base}/tree?root=99999`);
  await expect(page.getByText('Root 99999 was not found.', { exact: true })).toBeVisible({ timeout: 60000 });
  checks.push('Missing live root shows an explicit error');
  assert.deepEqual(errors, []);
  checks.push('explicit sample preview; no browser JavaScript errors');
  const report = { base, checkedAt: new Date().toISOString(), checks, walletTested: false };
  await writeFile(new URL('smoke-report.json', output), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
