import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { openRecoveryPhraseImport } from './lib/browser-wallet-onboarding.mjs';

const browser = await chromium.launch();
try {
  for (const variant of ['direct', 'choice']) {
    const page = await browser.newPage();
    await page.setContent(`<button data-testid="onboarding-import-wallet">${variant === 'direct' ? 'Import using Secret Recovery Phrase' : 'I have an existing wallet'}</button><div id="next"></div>`);
    await page.evaluate(variant => {
      document.querySelector('[data-testid="onboarding-import-wallet"]').onclick = () => {
        document.querySelector('[data-testid="onboarding-import-wallet"]').remove();
        setTimeout(() => {
          const next = document.querySelector('#next');
          if (variant === 'direct') next.innerHTML = '<textarea></textarea>';
          else {
            next.innerHTML = '<button>Import using Secret Recovery Phrase</button>';
            next.querySelector('button').onclick = () => { next.innerHTML = '<textarea></textarea>'; };
          }
        }, 30);
      };
    }, variant);
    await openRecoveryPhraseImport(page);
    assert(await page.locator('textarea').isVisible(), `${variant} import should reach the phrase form`);
    await page.close();
  }
  console.log('Both MetaMask import entry variants reach the recovery-phrase form');
} finally { await browser.close(); }
