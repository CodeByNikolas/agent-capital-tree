import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

// Uses only the separately provisioned Sepolia jury wallet. No traces or screenshots.
const root = join(homedir(), '.agent-capital-tree');
const profileName = process.env.ACT_BROWSER_PROFILE ?? 'jury';
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
let stage = 'unlock';
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  let wallet = context.pages().find(p => p.url().startsWith('chrome-extension://')) ?? await context.newPage();
  const origin = `chrome-extension://${new URL(worker.url()).host}`;
  await wallet.goto(`${origin}/home.html`);
  await Promise.any(['unlock-submit', 'account-menu-icon'].map(id => wallet.getByTestId(id).waitFor({ timeout: 25000 })));
  if (await wallet.getByTestId('unlock-submit').isVisible()) {
    await wallet.locator('input[type="password"]').fill(await readFile(join(root, 'keys/jury.password'), 'utf8'));
    await wallet.getByTestId('unlock-submit').click();
  }
  await wallet.getByTestId('account-menu-icon').waitFor();
  for (const stale of context.pages()) if (stale !== wallet) await stale.close();
  stage = 'public app';
  const app = await context.newPage();
  await app.goto(appUrl);
  await app.bringToFront();
  const popup = context.waitForEvent('page', { predicate: page => page.url().startsWith(origin), timeout: 30000 }).catch(() => undefined);
  await app.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  stage = 'approve connection';
  const opened = await popup;
  if (opened) { wallet = opened; await wallet.waitForLoadState('domcontentloaded'); }
  await wallet.waitForTimeout(2500);
  wallet = context.pages().find(p => p.url().includes('notification.html')) ?? wallet;

  await wallet.getByRole('button', {name:/^(Connect|Connect anyway|Continue at your own risk)$/}).first().waitFor({timeout:60000});
  const connect = wallet.getByRole('button', { name: 'Connect', exact: true });
  if (await wallet.getByRole('button', {name: 'Connect anyway', exact: true}).isVisible() || await wallet.getByRole('button', {name: 'Continue at your own risk', exact: true}).count()) throw new Error('MetaMask safety warning: connection was not approved');
  if (await connect.isVisible()) await connect.click();
  await app.locator('.wallet-address').waitFor({ timeout: 20000 });
  stage = 'Sepolia network';
  if (await app.getByRole('button', { name: 'Switch to Sepolia', exact: true }).isVisible()) {
    await app.getByRole('button', { name: 'Switch to Sepolia', exact: true }).click();
    await wallet.waitForTimeout(1500);
    wallet = context.pages().find(p => p.url().includes('notification.html')) ?? wallet;
    const confirm = wallet.getByRole('button', { name: /^(Confirm|Switch network)$/ });
    if (await confirm.isVisible()) await confirm.click();
  }
  await app.getByLabel('Connected to Sepolia').waitFor({ timeout: 20000 });
  const address = await app.evaluate(async () => (await window.ethereum.request({ method: 'eth_accounts' }))[0]);
  assert.equal(address.toLowerCase(), '0x0b59e040f864afd07ed448f58199a296413333bf');
  assert.equal(await app.evaluate(() => window.ethereum.request({ method: 'eth_chainId' })), '0xaa36a7');
  console.log(JSON.stringify({ deployedApp: app.url(), realMetaMask: true, address, chainId: 11155111, connected: true }));
} catch (error) {
  if (error?.message === 'MetaMask safety warning: connection was not approved') console.error(error.message);
  console.error(`Browser wallet check failed during ${stage}; sensitive details suppressed.`);
  process.exitCode = 1;
} finally {
  await context.close();
  virtualDisplay?.kill();
}
