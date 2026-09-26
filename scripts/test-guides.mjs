import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { tourStepHref, tourExitHref, tourStepCount } from '../apps/web/src/lib/tour-steps.ts';

const base = process.env.ACT_TEST_APP_URL ?? 'http://localhost:3044';
for (let step = 1; step <= tourStepCount; step++) {
  const url = new URL(tourStepHref(step, { vault: 'my-root.kanoki.eth' }), base);
  assert.equal(url.searchParams.get('vault'), 'my-root.kanoki.eth');
  assert.equal(url.searchParams.has('root'), false);
  assert.equal(new URL(tourExitHref(step, { vault: 'my-root.kanoki.eth' }), base).searchParams.has('tour'), false);
}
const browser = await chromium.launch();
try {
  for (const width of [1280, 380]) {
    const page = await browser.newPage({ viewport: { width, height: 820 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/roots', route => route.fulfill({ json: { roots: [] } }));
    await page.goto(base, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'How it works', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Hide', exact: true }).click();
    await expect(page.locator('#how-it-works')).toHaveCount(0);
    await page.getByRole('navigation', { name: 'Guides', exact: true }).getByRole('link', { name: 'How it works' }).click();
    await expect(page.locator('#how-it-works')).toBeVisible();
    assert.equal(new URL(page.url()).searchParams.has('preview'), false);
    await page.getByRole('navigation', { name: 'Guides', exact: true }).getByRole('link', { name: 'MCP guide' }).click();
    await expect(page.getByRole('heading', { name: 'Kanoki in your chat.' })).toBeVisible();
    await expect(page.getByText('Capital-mode availability:', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Use it in a Codex chat' })).toBeVisible();
    await page.goto(base + '/?preview=1', { waitUntil: 'networkidle' });
    await page.getByRole('link', { name: 'Start guided tour', exact: true }).click();
    for (let step = 1; step <= tourStepCount; step++) {
      const guide = page.getByRole('region', { name: 'Guided tour' });
      await expect(guide).toContainText(`Step ${step} of ${tourStepCount}`);
      assert.equal(new URL(page.url()).searchParams.get('preview'), '1');
      assert.equal(new URL(page.url()).searchParams.has('root'), false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (step < tourStepCount) await guide.getByRole('link', { name: 'Next', exact: true }).click();
      else await guide.getByRole('link', { name: 'Finish tour', exact: true }).click();
    }
    await expect(page.getByRole('region', { name: 'Guided tour' })).toHaveCount(0);
    assert.equal(new URL(page.url()).searchParams.get('preview'), '1');
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS: onboarding hide/reopen, reachable MCP instructions, all tour steps, preserved vault/preview context, desktop/mobile and no browser errors. No wallet actions.');
} finally { await browser.close(); }
