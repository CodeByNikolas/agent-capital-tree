// Browser flow with controlled wallet/RPC responses; never broadcasts a transaction.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
const base=process.env.ACT_TEST_APP_URL ?? 'http://localhost:3100';
const tree=await (await fetch('https://kanoki-app.vercel.app/api/tree?root=7')).json();
const vault=tree.nodes[0].vaultAddress, owner=tree.rootOwner;
const operator='0x3333333333333333333333333333333333333333';
const hash='0x'+'a'.repeat(64);
const browser=await chromium.launch();
try {
 for(const width of [1440,390]) {
  const page=await browser.newPage({viewport:{width,height:1000}});
  let release, sent=false;
  const receiptGate=new Promise(resolve=>{release=resolve;});
  await page.exposeFunction('walletRpc',async ({method,params})=>{
    if(['eth_accounts','eth_requestAccounts'].includes(method))return [owner];
    if(method==='eth_chainId')return '0xaa36a7';
    if(method==='eth_getCode')return '0x1234';
    if(method==='eth_blockNumber')return '0x100';
    if(method==='eth_call') {
      const input=params[0].data;
      if(input.startsWith('0x313ce567'))return '0x'+(6).toString(16).padStart(64,'0');
      if(input.length===74)return '0x'+owner.slice(2).padStart(64,'0');
      return '0x';
    }
    if(method==='eth_sendTransaction') {sent=true;return hash;}
    if(method==='eth_getTransactionReceipt') {
      await receiptGate;
      return {transactionHash:hash,transactionIndex:'0x0',blockHash:'0x'+'b'.repeat(64),blockNumber:'0x100',from:owner,to:params[0],cumulativeGasUsed:'0x5208',gasUsed:'0x5208',contractAddress:null,logs:[],logsBloom:'0x'+'0'.repeat(512),status:'0x1',type:'0x2',effectiveGasPrice:'0x1'};
    }
    throw new Error('Unexpected RPC '+method);
  });
  await page.addInitScript(()=>{window.ethereum={on(){},removeListener(){},request:args=>window.walletRpc(args)};});
  await page.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname;
    const data=path==='/api/tree'?tree:path==='/api/resolve-root'?{rootId:'7',nodeId:'7'}:path==='/api/roots'?{roots:[]}:{source:'unavailable',reason:'not_configured',message:'History unavailable'};
    return route.fulfill({json:data});
  });
  try {
    await page.goto(base+'/setup?vault='+vault+'&action=set-root-operator');
    const submit=page.getByRole('button',{name:'Authorize agent for this vault',exact:true});
    await expect(submit).toBeEnabled({timeout:60000});
    await page.getByRole('textbox',{name:'Agent signing address (operator)'}).fill(operator);
    await submit.click();
    await expect.poll(()=>sent).toBe(true);
    await expect(page.getByRole('status').filter({hasText:'waiting for a receipt'})).toBeVisible();
    assert.equal(new URL(page.url()).pathname,'/setup');
    await expect(page.getByText('Agent authorized successfully',{exact:true})).toHaveCount(0);
    release();
    await expect(page).toHaveURL(/\/tree\?vault=.*&node=7/,{timeout:20000});
    await expect(page.getByText('Agent authorized successfully',{exact:true})).toBeVisible();
    await expect(page.getByRole('link',{name:'View authorization receipt'})).toHaveAttribute('href','https://sepolia.etherscan.io/tx/'+hash);
    await page.getByRole('button',{name:'Dismiss notification'}).click();
    await expect(page.getByText('Agent authorized successfully',{exact:true})).toHaveCount(0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  } finally {release();await page.close();}
 }
 console.log('PASS: pending receipt stays on setup; confirmed authorization navigates to tree with dismissible receipt notification, desktop/mobile. No broadcasts.');
} finally {await browser.close();}
