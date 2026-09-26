// Read-only public dashboard assertions for the fresh model-driven jury run.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
const owner = JSON.parse(await readFile(new URL('../deployments/usdc-jury-owner.json', import.meta.url)));
const native = process.argv.includes('--native-openai');
const flow = JSON.parse(await readFile(new URL(native ? '../deployments/jury-openai-native.json' : '../deployments/jury-usdc-codex.json', import.meta.url)));
const prefix = native ? 'jury-openai' : 'jury';
assert.equal(flow.status, 'passed');
const base = 'https://agent-capital-tree.vercel.app';
const query = `vault=${encodeURIComponent(owner.vault)}`;
const output = new URL('../artifacts/ui/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const checks = [];
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const [width, colorScheme] of [[1440, 'light'], [390, 'dark']]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme });
    for (const route of ['tree', 'activity', 'uniswap', 'payments']) {
      await page.goto(`${base}/${route}?${query}`);
      await page.locator('.dashboard-footer').waitFor({ timeout: 60000 });
      if (route === 'tree') {
        await expect(page.locator('.tree-node:visible')).toHaveCount(flow.nodeCount);
        await expect(page.locator('.tree-node:visible').filter({ hasText: flow.childName })).toContainText('9.98');
      } else {
        const expected = route === 'payments' ? flow.transactions.payment.hash : flow.transactions.swap.hash;
        await expect(page.locator(`a[href="https://sepolia.etherscan.io/tx/${expected}"]`)).toBeVisible({ timeout: 90000 });
        if (route === 'activity') await expect(page.locator(`a[href="https://sepolia.etherscan.io/tx/${flow.transactions.spawn.hash}"]`).first()).toBeVisible();
        if (route === 'payments') await expect(page.locator('.payment-table')).toContainText('0.010 USDC');
      }
      if (route === 'payments') {
        const overflow = await page.locator('.payment-table tbody td:first-child strong').evaluateAll(names => names.some(name => {
          const cell = name.closest('td').getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(name);
          return [...range.getClientRects()].some(rect => rect.left < cell.left || rect.right > cell.right);
        }));
        assert(!overflow, 'Payment vault name must stay inside its cell');
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: new URL(`${prefix}-${route}-${width}.png`, output).pathname, fullPage: true });
      checks.push({ route, width, colorScheme, status: 'passed', ...(route === 'payments' ? { vaultNameWithinCell: true } : {}) });
    }
  }
  assert.deepEqual(errors, []);
  const report = { status: 'passed', checkedAt: new Date().toISOString(), rootId: flow.rootId, childId: flow.childId, base, checks, transactionsSent: 0 };
  await writeFile(new URL(`${prefix}-dashboard-report.json`, output), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
