import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

// Uses only the separately provisioned Sepolia jury wallet. No traces or screenshots.
const root = join(homedir(), '.agent-capital-tree');
const walletName = process.env.ACT_TEST_WALLET ?? 'jury';
if (!['jury', 'jury-e2e'].includes(walletName)) throw new Error('Unknown isolated test wallet');
const expectedAddress = `0x${JSON.parse(await readFile(join(root, `keys/${walletName}.keystore.json`), 'utf8')).address}`;
const profileName = process.env.ACT_BROWSER_PROFILE ?? walletName;
if (!/^jury(?:-[a-z0-9]+)?$/.test(profileName)) throw new Error('Invalid test profile name');
const extension = join(root, 'tools/metamask-13.49.0');
const appUrl = process.env.ACT_TEST_APP_URL ?? 'https://agent-capital-tree.vercel.app';
if (!['https://agent-capital-tree.vercel.app', 'https://agent-capital-tree-qeypjqseu-tumblockchains-projects.vercel.app'].includes(appUrl)) throw new Error('Unknown test deployment');
let virtualDisplay;
let display = process.env.DISPLAY;
if (!display) {
  virtualDisplay = spawn('Xvfb', ['-displayfd', '1', '-screen', '0', '1440x1000x24', '-nolisten', 'tcp'], { stdio: ['ignore', 'pipe', 'ignore'] });
  const number = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { virtualDisplay.kill(); reject(new Error('Display startup timed out')); }, 5000);
    virtualDisplay.once('error', () => { clearTimeout(timer); reject(new Error('Display unavailable')); });
    virtualDisplay.stdout.once('data', chunk => { clearTimeout(timer); resolve(chunk.toString().trim()); });
  });
  if (!/^\d+$/.test(number)) throw new Error('Invalid display number');
  display = `:${number}`;
}
const context = await chromium.launchPersistentContext(join(root, 'browser', profileName), {
  channel: 'chromium', headless: false,
  env: { ...process.env, DISPLAY: display },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
context.setDefaultTimeout(30000);
context.setDefaultNavigationTimeout(30000);
let stage = 'unlock';
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  let wallet = context.pages().find(p => p.url().startsWith('chrome-extension://')) ?? await context.newPage();
  const origin = `chrome-extension://${new URL(worker.url()).host}`;
  await wallet.goto(`${origin}/home.html`);
  await Promise.any(['unlock-submit', 'account-menu-icon'].map(id => wallet.getByTestId(id).waitFor({ timeout: 60000 })));
  if (await wallet.getByTestId('unlock-submit').isVisible()) {
    await wallet.locator('input[type="password"]').fill(await readFile(join(root, `keys/${walletName}.password`), 'utf8'));
    await wallet.getByTestId('unlock-submit').click();
  }
  await wallet.getByTestId('account-menu-icon').waitFor({ timeout: 60000 });
  for (const stale of context.pages()) if (stale !== wallet) await stale.close();
  stage = 'public app';
  const app = await context.newPage();
  await app.goto(appUrl);
  await app.bringToFront();
  await app.waitForFunction(() => Boolean(window.ethereum));
  const existingAccounts = await app.evaluate(() => window.ethereum.request({ method: 'eth_accounts' }));
  if (existingAccounts.length === 0) {
    await app.getByRole('button', { name: 'Connect wallet', exact: true }).click();
    stage = 'approve connection';
    // Extension pages may emit the page event before their URL is assigned, or
    // reuse an existing window. Locate the actual consent screen, not a stale tab.
    const consentDeadline = Date.now() + 60000;
    const openConsentAt = Date.now() + 3000;
    let consent;
    while (!consent && Date.now() < consentDeadline) {
      for (const candidate of context.pages().filter(page => page.url().startsWith(origin))) {
        if (await candidate.getByRole('button', { name: /^(Connect|Connect anyway|Continue at your own risk)$/ }).first().isVisible().catch(() => false)) {
          consent = candidate;
          break;
        }
      }
      if (!consent && Date.now() >= openConsentAt) {
        consent = await context.newPage();
        await consent.goto(`${origin}/notification.html`, { waitUntil: 'domcontentloaded' });
        await consent.getByRole('button', { name: /^(Connect|Connect anyway|Continue at your own risk)$/ }).first().waitFor({ timeout: 60000 });
      }
      if (!consent) await app.waitForTimeout(500);
    }
    if (!consent) throw new Error('No wallet consent screen appeared');
    wallet = consent;
    const connect = wallet.getByRole('button', { name: 'Connect', exact: true });
    if (await wallet.getByRole('button', {name: 'Connect anyway', exact: true}).isVisible() || await wallet.getByRole('button', {name: 'Continue at your own risk', exact: true}).count()) throw new Error('MetaMask safety warning: connection was not approved');
    if (await connect.isVisible()) await connect.click();
  }
  await app.locator('.wallet-address').waitFor({ timeout: 20000 });
  stage = 'Sepolia network';
  await Promise.any([
    app.getByRole('button', { name: 'Switch to Sepolia', exact: true }).waitFor(),
    app.getByLabel('Connected to Sepolia').waitFor(),
  ]);
  if (await app.getByRole('button', { name: 'Switch to Sepolia', exact: true }).isVisible()) {
    await app.getByRole('button', { name: 'Switch to Sepolia', exact: true }).click();
    stage = 'network consent';
    const networkDeadline = Date.now() + 30000;
    const openPendingAt = Date.now() + 3000;
    let pendingOpened = false;
    let confirmed = false;
    while (!confirmed && Date.now() < networkDeadline) {
      if (await app.getByLabel('Connected to Sepolia').isVisible()) {
        confirmed = true;
        break;
      }
      // Chromium under Xvfb can leave the approval queued without opening its
      // extension window. Opening MetaMask's own notification UI preserves consent.
      if (!pendingOpened && Date.now() >= openPendingAt) {
        const pending = await context.newPage();
        await pending.goto(`${origin}/notification.html`, { waitUntil: 'domcontentloaded' });
        await pending.getByRole('button', { name: /^(Confirm|Switch network)$/ }).waitFor({ timeout: 60000 });
        pendingOpened = true;
      }
      for (const candidate of context.pages().filter(page => page.url().startsWith(origin))) {
        const confirm = candidate.getByRole('button', { name: /^(Confirm|Switch network)$/ });
        if (await confirm.isVisible().catch(() => false)) {
          if (!await candidate.getByText('Sepolia', { exact: false }).count()) throw new Error('Unexpected network consent screen');
          await confirm.click();
          confirmed = true;
          break;
        }
      }
      if (!confirmed) await app.waitForTimeout(500);
    }
    if (!confirmed) throw new Error('No network confirmation appeared');
  }
  stage = 'network result';
  await app.getByLabel('Connected to Sepolia').waitFor({ timeout: 20000 });
  const address = await app.evaluate(async () => (await window.ethereum.request({ method: 'eth_accounts' }))[0]);
  assert.equal(address.toLowerCase(), expectedAddress.toLowerCase());
  assert.equal(await app.evaluate(() => window.ethereum.request({ method: 'eth_chainId' })), '0xaa36a7');
  const evidence = { checkedAt: new Date().toISOString(), deployedApp: app.url(), realMetaMask: true, address, chainId: 11155111, connected: true, transactionSigningTested: false };
  await writeFile(new URL(`../deployments/browser-wallet${walletName === 'jury' ? '' : '-fresh'}.json`, import.meta.url), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence));
  if (process.argv.includes('--owner-setup')) {
    if (walletName !== 'jury-e2e') throw new Error('Owner setup requires the independent fresh wallet');
    stage = 'owner setup';
    const { browserOwnerSetup } = await import('./lib/browser-owner-flow.mjs');
    await browserOwnerSetup({ context, app, origin, address, privateBase: root });
  }
  if (process.argv.includes('--owner-close') || process.argv.includes('--owner-recovery')) {
    if (walletName !== 'jury-e2e') throw new Error('Owner recovery requires the independent fresh wallet');
    stage = 'owner recovery';
    const { browserOwnerRecovery } = await import('./lib/browser-owner-recovery.mjs');
    await browserOwnerRecovery({ context, app, origin, address, privateBase: root, appUrl, closeOnly: process.argv.includes('--owner-close') });
  }
  if (process.argv.includes('--negative-cases')) {
    if (walletName !== 'jury-e2e') throw new Error('Negative cases require the independent fresh wallet');
    stage = 'negative cases';
    const { browserNegativeCases } = await import('./lib/browser-negative-cases.mjs');
    await browserNegativeCases({ context, app, origin, address, appUrl });
  }
} catch (error) {
  if (error?.message === 'MetaMask safety warning: connection was not approved') console.error(error.message);
  // Report only fixed UI labels, never wallet page text, account names or inputs.
  const dialogs = [];
  for (const page of context.pages().filter(page => page.url().startsWith('chrome-extension://'))) {
    const labels = [];
    for (const name of ['Connect', 'Connect anyway', 'Continue at your own risk', 'Next', 'Confirm', 'Cancel', 'Got it', 'Approve']) {
      if (await page.getByRole('button', { name, exact: true }).first().isVisible().catch(() => false)) labels.push(name);
    }
    if (labels.length) dialogs.push(labels);
    if (stage === 'unlock') console.error(JSON.stringify({ unlockVisible: await page.getByTestId('unlock-submit').isVisible(), accountMenuVisible: await page.getByTestId('account-menu-icon').isVisible() }));
  }
  console.error(JSON.stringify({ stage, visibleKnownDialogButtons: dialogs, timeout: error?.name === 'TimeoutError', missingNetworkConsent: error?.message === 'No network confirmation appeared' }));
  const app = context.pages().find(page => page.url().startsWith(appUrl));
  if (app) {
    const chainId = await app.evaluate(() => window.ethereum?.request({ method: 'eth_chainId' })).catch(() => null);
    const message = await app.locator('.wallet-error').textContent({ timeout: 500 }).catch(() => '');
    console.error(JSON.stringify({ chainId, switchPending: await app.getByRole('button', { name: 'Switching…', exact: true }).isVisible(), walletError: message ? {
      unknownChain: /4902|unrecognized chain|not been added|not configured/i.test(message),
      rejected: /4001|reject|denied/i.test(message),
      pending: /32002|already pending/i.test(message),
      rpcFailure: /rpc|fetch|network|timeout/i.test(message),
    } : null }));
  }
  console.error(`Browser wallet check failed during ${stage}; sensitive details suppressed.`);
  process.exitCode = 1;
} finally {
  await context.close();
  virtualDisplay?.kill();
}
