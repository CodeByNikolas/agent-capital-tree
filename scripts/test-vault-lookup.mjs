import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const base = process.env.ACT_TEST_APP_URL ?? 'http://127.0.0.1:3040';
const rootVault = process.env.ACT_TEST_USDC_ROOT_VAULT;
const childVault = process.env.ACT_TEST_USDC_CHILD_VAULT;
if (!rootVault || !childVault) {
  throw new Error('Set ACT_TEST_USDC_ROOT_VAULT and ACT_TEST_USDC_CHILD_VAULT to deployed Sepolia vault addresses or ENS names.');
}
assert.notEqual(rootVault.toLowerCase(), childVault.toLowerCase(), 'Root and child references must differ');

const output = new URL('../artifacts/ui/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const checks = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));

  async function resolve(reference) {
    const response = await page.request.get(`${base}/api/resolve-root?q=${encodeURIComponent(reference)}`);
    assert.equal(response.status(), 200, `resolve ${reference}`);
    const body = await response.json();
    assert.equal(typeof body.rootId, 'string');
    assert.equal(typeof body.nodeId, 'string');
    assert.equal(typeof body.vault, 'string');
    return body;
  }

  const root = await resolve(rootVault);
  const child = await resolve(childVault);
  assert.equal(root.nodeId, root.rootId, 'Root vault reference resolves to the root node');
  assert.equal(child.rootId, root.rootId, 'Child vault belongs to the supplied root');
  assert.notEqual(child.nodeId, root.nodeId, 'Child reference resolves to a different node');
  checks.push('USDC root and child vault addresses or ENS names resolve to the same tree');

  const numericLookup = await page.request.get(`${base}/api/resolve-root?q=1`);
  assert.equal(numericLookup.status(), 400, 'Numeric IDs are not accepted as public vault references');
  checks.push('Public vault lookup accepts ENS names or contract addresses only');

  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    for (const [label, reference, node] of [['root', rootVault, root], ['child', childVault, child]]) {
      await page.goto(`${base}/tree?vault=${encodeURIComponent(reference)}`);
      await expect(page.getByText('Live vault.', { exact: true })).toBeVisible({ timeout: 60000 });

      if (name === 'mobile') await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
      await page.getByLabel('Primary navigation').getByRole('link', { name: 'Setup & control', exact: true }).click();
      await expect.poll(() => new URL(page.url()).pathname).toBe('/setup');
      const setupUrl = new URL(page.url());
      assert.equal(setupUrl.searchParams.get('vault'), reference, `${label} vault reference is preserved`);
      assert.equal(setupUrl.searchParams.get('node'), node.nodeId, `${label} selected node is preserved`);
      await expect(page.getByLabel('Selected vault')).toHaveValue(node.nodeId);

      // Open the read-only policy editor to verify the PAY capability is available.
      setupUrl.searchParams.set('action', 'tighten-policy');
      await page.goto(setupUrl.href);
      await expect(page.getByText('Live vault.', { exact: true })).toBeVisible({ timeout: 60000 });
      await expect(page.getByText('Companion x402 payment', { exact: true })).toBeVisible();
      const faucet = page.getByRole('link', { name: 'Get test USDC', exact: true });
      await expect(faucet).toHaveAttribute('href', 'https://faucet.circle.com/');
      await expect(page.getByRole('button', { name: 'Get DEMO-USD', exact: true })).toBeDisabled();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} ${name} viewport overflow`);
      await page.screenshot({ path: new URL(`usdc-${label}-${name}.png`, output).pathname, fullPage: true });
      checks.push(`${label} ${name}: ?vault route context, Circle faucet link, and PAY label`);
    }
  }

  assert.deepEqual(errors, []);
  const report = {
    base,
    checkedAt: new Date().toISOString(),
    rootId: root.rootId,
    rootNodeId: root.nodeId,
    childNodeId: child.nodeId,
    checks,
    screenshots: ['usdc-root-desktop.png', 'usdc-root-mobile.png', 'usdc-child-desktop.png', 'usdc-child-mobile.png'],
    transactionsSent: 0,
    realWalletTested: false,
    limitations: [
      'MultiBaas controller history excludes token-direct Circle USDC Transfer events; activity is not a complete x402 payment history.',
      'This read-only browser check does not exercise x402 settlement or sign wallet transactions.',
    ],
  };
  await writeFile(new URL('vault-lookup-report.json', output), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
