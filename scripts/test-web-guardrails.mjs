import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

// UI authorization regression only. This provider has no key, RPC transport or
// signing method. Historical real MetaMask/receipt tests remain separate evidence.
const base = process.env.ACT_TEST_APP_URL ?? 'http://127.0.0.1:3040';
const browser = await chromium.launch();
const checks = [];
try {
  const context = await browser.newContext();
  const response = await context.request.get(`${base}/api/tree?root=9`);
  assert.equal(response.status(), 200);
  const tree = await response.json();
  assert(tree.rootOwner, 'Recorded public owner needed for UI gating checks');
  await context.addInitScript(({ owner }) => {
    const listeners = new Map();
    let account = owner;
    let chainId = '0xaa36a7';
    window.actTestRequests = [];
    window.actTestSetAccount = value => {
      account = value;
      for (const listener of listeners.get('accountsChanged') ?? []) listener(value ? [value] : []);
    };
    window.actTestSetChain = value => {
      chainId = value;
      for (const listener of listeners.get('chainChanged') ?? []) listener(value);
    };
    window.ethereum = {
      request: async ({ method }) => {
        window.actTestRequests.push(method);
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') return account ? [account] : [];
        if (method === 'eth_chainId') return chainId;
        throw new Error(`Read-only UI test rejected provider method: ${method}`);
      },
      on: (event, listener) => {
        const group = listeners.get(event) ?? new Set();
        group.add(listener);
        listeners.set(event, group);
      },
      removeListener: (event, listener) => listeners.get(event)?.delete(listener),
    };
  }, { owner: tree.rootOwner });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const button = name => page.getByRole('button', { name, exact: true });
  await page.goto(`${base}/setup?root=9`);
  await expect(page.getByText('Live root 9.', { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(button('Owner recovery')).toBeEnabled();
  checks.push('Owner recovery remains available on a revoked tree with a matching owner');

  await page.evaluate(() => window.actTestSetAccount('0x0000000000000000000000000000000000000001'));
  for (const name of ['Owner recovery', 'Fund root', 'Bind operator', 'Add child vault', 'Revoke subtree']) {
    await expect(button(name)).toBeDisabled();
  }
  checks.push('Unrelated account cannot manage or recover this root');

  await page.evaluate(owner => window.actTestSetAccount(owner), tree.rootOwner);
  await expect(button('Owner recovery')).toBeEnabled();
  await page.evaluate(() => window.actTestSetChain('0x1'));
  for (const name of ['Owner recovery', 'Fund root', 'Bind operator', 'Create root', 'Claim demo tokens']) {
    await expect(button(name)).toBeDisabled();
  }
  await page.evaluate(() => window.actTestSetChain('0xaa36a7'));
  await expect(button('Owner recovery')).toBeEnabled();
  checks.push('Wrong network disables financial controls; Sepolia restores matching authority');

  await page.route('**/api/activity?**', route => route.fulfill({ status: 503,
    contentType: 'application/json', body: JSON.stringify({ source: 'unavailable', reason: 'upstream_error', message: 'Injected history outage for UI regression.' }) }));
  await page.reload();
  await expect(page.getByText('Live root 9.', { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(button('Owner recovery')).toBeEnabled();
  checks.push('Injected history API outage does not block owner recovery controls');

  await page.route('**/api/tree?**', route => route.fulfill({ status: 503,
    contentType: 'application/json', body: JSON.stringify({ error: { code: 'rpc_unavailable', message: 'Injected tree outage for UI regression.' } }) }));
  await expect(page.getByText('Injected tree outage for UI regression.', { exact: false })).toBeVisible({ timeout: 30000 });
  for (const name of ['Owner recovery', 'Fund root', 'Bind operator']) await expect(button(name)).toBeDisabled();
  checks.push('Failed current-state refresh disables controls that depend on stale authority');
  await page.unroute('**/api/tree?**');
  await page.reload();
  await expect(page.getByText('Live root 9.', { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(button('Owner recovery')).toBeEnabled();
  await button('Owner recovery').click();
  await expect(button('Review recovery')).toBeVisible();
  checks.push('Recovered current-state read restores the owner review flow without submitting');

  const methods = await page.evaluate(() => window.actTestRequests);
  assert(methods.every(method => ['eth_accounts', 'eth_requestAccounts', 'eth_chainId'].includes(method)));
  assert.deepEqual(errors, []);
  const report = { base, checkedAt: new Date().toISOString(), checks,
    provider: 'keyless EIP-1193 UI stub', transactionsSent: 0, realWalletTested: false,
    limitations: ['Tests UI gating only; no signatures, public provider outage or new onchain recovery claimed.'] };
  const output = new URL('../artifacts/ui/', import.meta.url);
  await mkdir(output, { recursive: true });
  await writeFile(new URL('guardrails-report.json', output), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
