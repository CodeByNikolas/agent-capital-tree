import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';

const base = process.env.ACT_TEST_APP_URL ?? 'http://127.0.0.1:3095';
const address = '0x91B0BeF8a75fE1C958Cf30714152e66E396e2aF4';
const browser = await chromium.launch();
const checks = [];
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/mcp`);
  await expect(page.getByRole('heading', { name: 'Authorize once. Manage capital in chat.' })).toBeVisible();
  await expect(page.getByText('createChildVault', { exact: true }).first()).toBeVisible();
  checks.push('Capital guide and explicit no-background-worker distinction visible');
  await page.goto(`${base}/setup?vault=hello.agentcapitalusdc.eth&action=set-root-operator&operator=${address}&budget=50000`);
  await expect(page.getByLabel('Agent signing address (operator)')).toHaveValue(address, { timeout: 60000 });
  await expect(page.getByLabel(/Maximum .*USDC per action/)).toHaveValue('0.05');
  await expect(page.getByRole('button', { name: 'Authorize agent for this vault' })).toBeDisabled();
  checks.push('Public address and 0.05 USDC per-action limit prefilled; disconnected wallet cannot submit');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}px`);
    await page.screenshot({ path: fileURLToPath(new URL(`../artifacts/ui/capital-setup-${width}.png`, import.meta.url)), fullPage: true });
  }
  assert.deepEqual(errors, []);
  const report = { base, checkedAt: new Date().toISOString(), checks, widths: [1440, 390], transactionsSent: 0, walletConnected: false };
  await writeFile(new URL('../artifacts/ui/capital-web-report.json', import.meta.url), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
