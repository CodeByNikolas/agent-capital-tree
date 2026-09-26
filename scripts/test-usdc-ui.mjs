import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
const base = process.env.ACT_TEST_APP_URL ?? 'http://127.0.0.1:3040';
const manifest = JSON.parse(await readFile(new URL('../deployments/usdc-sepolia.json', import.meta.url), 'utf8'));
const vault = `capital.${manifest.ensNamespace.name}`;
const output = new URL('../artifacts/ui/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const checks = [], errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  for (const path of ['/', '/tree', '/activity', '/uniswap', '/payments', '/setup']) {
    const response = await page.request.get(`${base}${path}?root=1`);
    assert.equal(response.status(), 404, `Retired root URL ${path}`);
  }
  checks.push('All six routes reject retired root query links with HTTP404');
  await page.goto(base);
  await expect(page.getByRole('button', { name: 'Launch a new root vault' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open live demo' })).toHaveAttribute('href', `/tree?vault=${vault}`);
  await expect(page.getByRole('link', { name: 'Explore sample data' })).toHaveCount(0);
  assert(!/Preview workspace|ACT-A|ACT-B/.test(await page.locator('body').innerText()));
  checks.push('Unselected entry offers root creation and the live demo without a sample-data link');
  await page.goto(`${base}/tree?preview=1`);
  await expect(page.getByText('Fictional preview · no real tokens.')).toBeVisible();
  await expect(page.getByText('Main agent',{exact:true}).first()).toBeVisible();
  assert(!/Cedar desk|14,625/.test(await page.locator('body').innerText()));
  const previewRoot = page.locator('.tree-node:visible').first();
  await previewRoot.click();
  await expect(page.getByRole('dialog')).toContainText('Fictional example: no on-chain funds or permissions.');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(previewRoot).toBeFocused();
  checks.push('Preview uses fictional balances and Main agent; centered dialog closes with Escape and restores focus');
  for (const [colorScheme, width] of [['light',1440],['dark',390]]) {
    await page.emulateMedia({colorScheme});
    await page.setViewportSize({width,height:1000});
    for (const path of ['/', '/tree', '/activity', '/uniswap', '/payments', '/setup']) {
      await page.goto(`${base}${path}?vault=${vault}`);
      if(width<600){
        await expect(page.locator('[data-slot="sidebar"]')).toHaveCount(0);
        await page.getByRole('button',{name:'Toggle navigation'}).click();
      }
      await expect(page.locator('.app-workspace strong')).toContainText('capital', {timeout:60000});
      await expect(page.getByRole('button', {name: 'Refresh', exact:true})).toHaveCount(0);
      assert(!/Runtime status unknown|Current state was read|Wallet authority and runtime connectivity/.test(await page.locator('body').innerText()));
      if(width<600){await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);}
      await expect(page.locator('.app-topbar').getByText('Sepolia', {exact:true})).toHaveCount(0);
      if(path==='/setup') {
        await expect(page.locator('.setup-root-name')).toContainText(vault);
        await expect(page.locator('#setup-node')).toHaveCount(0);
        await expect(page.getByRole('button',{name:'Create another root'})).toBeVisible();
      }
      assert(!/ACT-A|ACT-B|Live root \d/.test(await page.locator('body').innerText()), `${path} current asset/identity labels`);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} ${width}px overflow`);
      if(path==='/tree') {
        const rootNode = page.locator('.tree-node:visible').first();
        await rootNode.click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        const centered = await dialog.evaluate(element => {
          const rect = element.getBoundingClientRect();
          return Math.abs((rect.left+rect.right)/2-innerWidth/2)<3 && Math.abs((rect.top+rect.bottom)/2-innerHeight/2)<3;
        });
        assert(centered, `${width}px vault detail is centered`);
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(rootNode).toBeFocused();
      }
      if(path==='/uniswap') {
        await expect(page.getByRole('heading',{name:'LP positions'})).toBeVisible();
        await expect(page.locator('.activity-provenance')).toContainText('MultiBaas',{timeout:60000});
        await expect(page.locator('.activity-row')).toHaveCount(1);
      }
      if(path==='/payments') {
        await expect(page.locator('.payment-table tbody tr')).toHaveCount(1,{timeout:60000});
        await expect(page.locator('.payment-table tbody tr')).toContainText('0.010 USDC');
        await expect(page.getByText('Complete scan since this controller was deployed',{exact:false})).toBeVisible();
      }
      await page.screenshot({path:new URL(`usdc-${path.slice(1)||'overview'}-${colorScheme}.png`,output).pathname,fullPage:true});
      checks.push(`${path} ${colorScheme} ${width}px: live ENS lookup, no legacy assets, no horizontal overflow`);
    }
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(`${base}/payments?vault=${vault}`);
  await expect(page.locator('.payment-table tbody tr')).toHaveCount(1,{timeout:60000});
  const refreshed = await Promise.all([
    page.waitForResponse(response => response.url().includes('/api/tree?') && response.ok(), {timeout:45000}),
    page.waitForResponse(response => response.url().includes('/api/activity?') && response.ok(), {timeout:45000}),
    page.waitForResponse(response => response.url().includes('/api/payments?') && response.ok(), {timeout:45000}),
  ]);
  assert.equal(refreshed.length, 3);
  await expect(page.locator('.payment-table tbody tr')).toContainText('0.010 USDC');
  checks.push('Tree, activity and payments refresh automatically without a refresh button; settlement row stays visible');
  assert.equal((await page.request.get(`${base}/applications?vault=${vault}`)).status(),200);
  assert.equal((await page.request.get(`${base}/mcp`)).status(),200);
  assert.deepEqual(errors,[]);
  const report={base,checkedAt:new Date().toISOString(),checks,transactionsSent:0,realWalletTested:false};
  await writeFile(new URL('usdc-ui-report.json',output),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally {await browser.close();}
