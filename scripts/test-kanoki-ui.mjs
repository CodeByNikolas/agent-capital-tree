import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const base=process.env.ACT_TEST_APP_URL??'http://localhost:3040';
const out=new URL('../artifacts/ui/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch();const checks=[];
const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number);
const luminance=c=>c.map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((s,n,i)=>s+n*[.2126,.7152,.0722][i],0);
try {
 for(const [width,height] of [[1280,720],[380,820]]) {
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const theme of ['dark','light']) {
   await page.goto(base+'/tree?preview=1',{waitUntil:'networkidle'});
   await page.getByRole('button',{name:'Use light theme'}).click();
   await expect(page.locator('html')).toHaveAttribute('data-theme','light');
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   await page.evaluate(()=>document.fonts.ready);
   const cards=page.locator(width>720?'.tree-canvas-desktop .tree-node':'.tree-canvas-mobile .tree-node');await expect(cards.first()).toBeVisible();
   await expect(cards.first()).toContainText('USDC');assert.equal(await cards.first().locator('.capability-pill').count(),4);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No page overflow');
   const contrast=await page.evaluate(()=>{
    const css=getComputedStyle(document.documentElement);const sample=document.createElement('span');document.body.append(sample);
    const color=token=>{sample.style.color='var('+token+')';return getComputedStyle(sample).color;};
    const values={ink:color('--ink'),muted:color('--ink-muted'),moss:color('--moss'),gold:color('--gold-ink'),surface:color('--surface'),raised:color('--surface-raised')};sample.remove();return values;
   });
   for(const fg of ['ink','muted','moss','gold']) for(const bg of ['surface','raised']) {const a=luminance(rgb(contrast[fg])),b=luminance(rgb(contrast[bg]));assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,theme+' contrast '+fg+'/'+bg);}
   await page.keyboard.press('Tab');let found=false;
   for(let index=0;index<60;index++){if(await cards.first().evaluate(el=>el===document.activeElement)){found=true;break;}await page.keyboard.press('Tab');}
   assert.ok(found,'Tree reachable by Tab');
   const focus=await cards.first().evaluate(el=>({outline:getComputedStyle(el).outlineColor,expected:getComputedStyle(document.documentElement).getPropertyValue('--gold').trim(),style:getComputedStyle(el).outlineStyle}));assert.equal(focus.style,'solid');
   await page.screenshot({path:fileURLToPath(new URL('kanoki-tree-'+width+'-'+theme+'.png',out)),fullPage:true,animations:'disabled'});
   await cards.first().press('Enter');await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(cards.first()).toBeFocused();
   checks.push({width,theme,contrast:'all 8 text pairs >= 4.5',keyboard:'Tab, Enter, Escape, restored focus',overflow:false});
  }
  for(const route of ['/', '/applications','/activity','/setup','/mcp']) {
   await page.goto(base+route+'?preview=1',{waitUntil:'networkidle'});await expect(page.locator('h1')).toHaveCount(1);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),route+' overflow');
   if(width===1280 && ['/applications','/activity','/setup'].includes(route)) await page.screenshot({path:fileURLToPath(new URL('kanoki-'+route.slice(1)+'.png',out)),fullPage:true,animations:'disabled'});
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 await writeFile(new URL('kanoki-ui-report.json',out),JSON.stringify({base,checks,wallet:'not used'},null,2));console.log(JSON.stringify(checks));
}finally{await browser.close();}
