import { chromium } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Wallet } from 'ethers';
import { createFreshOwnerProfile, recordFreshOwnerProfile } from './lib/fresh-owner-profile.mjs';
import { openRecoveryPhraseImport } from './lib/browser-wallet-onboarding.mjs';

// Local test wallet only. Never trace, screenshot, or print setup inputs.
const root = join(homedir(), '.agent-capital-tree');
const walletName = process.env.ACT_TEST_WALLET ?? 'jury';
if (!['jury', 'jury-e2e'].includes(walletName)) throw new Error('Unknown isolated test wallet');
const profileName = process.env.ACT_BROWSER_PROFILE ?? walletName;
if (!/^jury(?:-[a-z0-9]+)*$/.test(profileName)) throw new Error('Invalid test profile name');
const freshOwnerResume = process.argv.includes('--fresh-owner-resume-profile');
if (freshOwnerResume && walletName !== 'jury-e2e') throw new Error('Fresh owner resume requires the designated jury-e2e wallet');
const extension = join(root, 'tools/metamask-13.49.0');
const profile = freshOwnerResume ? await createFreshOwnerProfile(root, profileName) : join(root, 'browser', profileName);
if (!freshOwnerResume) await mkdir(profile, { recursive: true, mode: 0o700 });
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
context.setDefaultTimeout(60000);
context.setDefaultNavigationTimeout(60000);
let stage = 'extension startup';
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const page = await context.newPage();
  await page.goto(`chrome-extension://${new URL(worker.url()).host}/home.html`);
  const password = await readFile(join(root, `keys/${walletName}.password`), 'utf8');
  const wallet = await Wallet.fromEncryptedJson(await readFile(join(root, `keys/${walletName}.keystore.json`), 'utf8'), password);
  await Promise.any(['unlock-submit', 'onboarding-import-wallet', 'passkey-maybe-later-button', 'account-menu-icon', 'metametrics-i-agree', 'onboarding-complete-done'].map(id => page.getByTestId(id).waitFor({ timeout: 25000 })));
  if (await page.getByTestId('unlock-submit').isVisible()) {
    stage = 'unlock';
    await page.locator('input[type="password"]').fill(password);
    await page.getByTestId('unlock-submit').click();
  } else if (await page.getByTestId('onboarding-import-wallet').isVisible()) {
    stage = 'existing wallet';
    await openRecoveryPhraseImport(page);
    if (!wallet.mnemonic) throw new Error('Test wallet mnemonic unavailable');
    stage = 'recovery phrase';
    const words = wallet.mnemonic.phrase.split(' ');
    // MetaMask converts each word into a separate field on Space. Whole-text fill
    // does not invoke its paste handler; no security setting is modified to work around it.
    await page.locator('textarea').fill(words[0]);
    await page.locator('textarea').press('Space');
    for (let i = 1; i < words.length; i++) {
      const input = page.locator('input').nth(i);
      await input.fill(words[i]);
      if (i < words.length - 1) await input.press('Space');
    }
    await page.getByRole('heading').first().click();
    await page.getByTestId('import-srp-confirm').click();
    stage = 'password';
    await page.getByTestId('create-password-new-input').fill(password);
    await page.getByTestId('create-password-confirm-input').fill(password);
    await page.getByRole('checkbox').check();
    await page.getByTestId('create-password-submit').click();
  }
  stage = 'post-import';
  const readyDeadline = Date.now() + 90000;
  while (!await page.getByTestId('account-menu-icon').isVisible() && Date.now() < readyDeadline) {
    if (await page.getByTestId('passkey-maybe-later-button').isVisible()) {
      await page.getByTestId('passkey-maybe-later-button').click();
    }
    if (await page.getByTestId('metametrics-i-agree').isVisible()) {
      const ids = ['metametrics-checkbox', 'metametrics-data-collection-checkbox'];
      for (let i = 0; i < ids.length; i++) {
        if (await page.locator('input[type="checkbox"]').nth(i).isChecked()) await page.getByTestId(ids[i]).click();
      }
      await page.getByTestId('metametrics-i-agree').click();
    }
    if (await page.getByTestId('onboarding-complete-done').isVisible()) await page.getByTestId('onboarding-complete-done').click();
    await page.waitForTimeout(500);
  }
  stage = 'wallet overview';
  await page.getByTestId('account-menu-icon').waitFor({ timeout: 60000 });
  if (freshOwnerResume) await recordFreshOwnerProfile(root, profileName, wallet.address, new URL(page.url()).host);
  console.log(JSON.stringify({ walletUiReady: true, extensionId: new URL(page.url()).host, expectedAddress: wallet.address }));
} catch {
  console.error(`Wallet setup failed during ${stage}; sensitive details suppressed.`);
  process.exitCode = 1;
} finally {
  await context.close();
}
