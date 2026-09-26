// Root creation defaults and explicit MCP overrides. Wallet reads only; never submits.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch();
const base=process.env.ACT_TEST_APP_URL ?? 'http://127.0.0.1:3099';
const checks=[];
try {
 const page=await browser.newPage(); const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.ethereum={on(){},removeListener(){},request:async({method})=>{
   if(method==='eth_accounts'||method==='eth_requestAccounts')return ['0x1234567890abcdef1234567890abcdef12345678'];
   if(method==='eth_chainId')return '0xaa36a7';
   throw new Error(`Unexpected wallet request: ${method}`);
  }};
 });
 for(const [width,colorScheme] of [[1440,'light'],[390,'dark']]) {
  await page.setViewportSize({width,height:1100}); await page.emulateMedia({colorScheme});
  await page.goto(`${base}/setup`);
  await page.getByRole('button',{name:'Launch a new root vault'}).click();
  const name=page.getByLabel('Root ENS label',{exact:true});
  await expect(name).toHaveValue(/^[a-z]+-[a-z]+$/);
  await expect(page.locator('.wallet-action-shortcuts')).toHaveCount(0);
  await expect(page.locator('a[href="https://faucet.circle.com/"]')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Create root vault',exact:true})).toBeEnabled();
  await expect(page.getByLabel('Maximum USDC per action',{exact:true})).toHaveValue('20');
  await expect(page.getByLabel('Maximum DEMO-USD per action',{exact:true})).toHaveValue('20');
  const capabilities=page.locator('.wallet-permission-fields input');
  assert.equal(await capabilities.count(),8);
  for(const capability of await capabilities.all()) await expect(capability).toBeChecked();
  await capabilities.first().uncheck();
  await expect(capabilities.first()).not.toBeChecked();
  await page.getByLabel('Maximum USDC per action',{exact:true}).fill('10');
  await page.getByRole('button',{name:'New suggestion'}).click();
  await expect(name).toHaveValue(/^[a-z]+-[a-z]+$/);
  await expect(page.locator('.wallet-permission-fields input').first()).not.toBeChecked();
  await expect(page.getByLabel('Maximum USDC per action',{exact:true})).toHaveValue('10');
  await name.fill('my-custom-vault');
  await expect(page.locator('.root-name-preview')).toHaveText('my-custom-vault.agentcapitalvault.eth');
  const gap=await page.evaluate(()=>document.querySelector('#wallet-controls').getBoundingClientRect().top-document.querySelector('.root-access-bar').getBoundingClientRect().bottom);
  assert(gap>=24,`card gap ${gap}`);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  checks.push({width,colorScheme,cardGap:gap,randomName:true,customName:true,managementButtonsHidden:true,faucetDeferred:true});
 }
 await page.goto(`${base}/setup?action=create-root&label=jury-prefilled&budget=50000`);
 await expect(page.getByLabel('Root ENS label',{exact:true})).toHaveValue('jury-prefilled');
 await expect(page.getByLabel('Maximum USDC per action',{exact:true})).toHaveValue('0.05');
 await expect(page.locator('.wallet-permission-fields input:checked')).toHaveCount(3);
 await page.goto(`${base}/setup?preview=1`);
 await expect(page.getByRole('link',{name:'Get test USDC',exact:false})).toBeVisible();
 assert.deepEqual(errors,[]);
 const report={status:'passed',checks,prefilledMcpValuesPreserved:true,dashboardFaucetRetained:true,transactionsSent:0,wallet:'read-only provider stub; no signatures'};
 console.log(JSON.stringify(report));
}finally{await browser.close();}
