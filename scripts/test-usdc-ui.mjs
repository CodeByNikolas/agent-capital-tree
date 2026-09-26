import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
const base = process.env.ACT_TEST_APP_URL ?? 'http://127.0.0.1:3040';
const vault = 'capital.agentcapitalusdc.eth';
const output = new URL('../artifacts/ui/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const checks = [], errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  for (const path of ['/', '/tree', '/activity', '/applications', '/setup']) {
    const response = await page.request.get(`${base}${path}?root=1`);
    assert.equal(response.status(), 404, `Retired root URL ${path}`);
  }
  checks.push('All five routes reject retired root query links with HTTP404');
  await page.goto(base);
  await expect(page.getByRole('button', { name: 'Launch a new root vault' })).toBeVisible();
  assert(!/Preview workspace|ACT-A|ACT-B/.test(await page.locator('body').innerText()));
  checks.push('Unselected entry shows root creation rather than preview balances');
  for (const [colorScheme, width] of [['light',1440],['dark',390]]) {
    await page.emulateMedia({colorScheme});
    await page.setViewportSize({width,height:1000});
    for (const path of ['/', '/tree', '/activity', '/applications', '/setup']) {
      await page.goto(`${base}${path}?vault=${vault}`);
      await expect(page.getByText('Live vault.',{exact:true})).toBeVisible({timeout:60000});
      assert(!/ACT-A|ACT-B|Live root \d/.test(await page.locator('body').innerText()), `${path} current asset/identity labels`);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} ${width}px overflow`);
      if(path==='/applications') {
        await expect(page.getByText('Available through Companion',{exact:true})).toBeVisible();
      }
      await page.screenshot({path:new URL(`usdc-${path.slice(1)||'overview'}-${colorScheme}.png`,output).pathname,fullPage:true});
      checks.push(`${path} ${colorScheme} ${width}px: live ENS lookup, no legacy assets, no horizontal overflow`);
    }
  }
  assert.deepEqual(errors,[]);
  const report={base,checkedAt:new Date().toISOString(),checks,transactionsSent:0,realWalletTested:false};
  await writeFile(new URL('usdc-ui-report.json',output),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally {await browser.close();}
