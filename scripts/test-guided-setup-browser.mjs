import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
const base=process.env.ACT_TEST_APP_URL ?? 'http://127.0.0.1:3056';
const browser=await chromium.launch();
try {
  for (const width of [1280,380]) {
    const page=await browser.newPage({viewport:{width,height:900}});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{window.ethereum={on(){},removeListener(){},request:async({method})=>{
      if(method==='eth_accounts'||method==='eth_requestAccounts')return ['0x2222222222222222222222222222222222222222'];
      if(method==='eth_chainId')return '0xaa36a7';
      throw new Error('No transaction requests permitted in visual smoke');
    }};});
    await page.goto(`${base}/setup?action=create-root&label=kanoki-visual-test&budget=100000&operator=0x3333333333333333333333333333333333333333`);
    await expect(page.getByRole('heading',{name:'Set up Kanoki.',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Set up Kanoki',exact:true})).toBeEnabled();
    await expect(page.getByRole('button',{name:'Launch a new root vault'})).toHaveCount(0);
    await expect(page.getByLabel('Root ENS label',{exact:true})).toHaveCount(0);
    await expect(page.getByText('0.1 Test-USDC total',{exact:false})).toBeVisible();
    await expect(page.getByText('0.01 Sepolia ETH',{exact:true})).toBeVisible();
    assert.equal(await page.locator('.wallet-action-shortcuts').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);
    await page.screenshot({path:`artifacts/ui/guided-setup-${width}.png`,fullPage:true});
    await page.close();
  }
  console.log('PASS: desktop/mobile single setup button, public budget/gas disclosure, no manual ENS/operator controls, no overflow or browser errors. No wallet writes.');
} finally {await browser.close();}
