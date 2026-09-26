import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
const base = process.env.ACT_TEST_APP_URL ?? 'http://localhost:3098';
const publicBase = 'https://kanoki-app.vercel.app';
const [tree, activity, lookup] = await Promise.all(['/api/tree?root=1', '/api/activity?root=1', '/api/resolve-root?q=capital.agentcapitalvault.eth'].map(async path => { const r = await fetch(publicBase + path); assert.ok(r.ok); return r.json(); }));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.clock.install();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let releaseTree, releaseHistory, releaseServices;
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/tree') { await new Promise(r => { releaseTree = r; }); return route.fulfill({ json: tree }); }
    if (url.pathname === '/api/resolve-root') return route.fulfill({ json: lookup });
    if (url.pathname === '/api/activity' || url.pathname === '/api/payments') { await new Promise(r => { releaseHistory = r; }); return route.fulfill({ json: activity }); }
    if (url.pathname === '/api/x402/services') { await new Promise(r => { releaseServices = r; }); return route.fulfill({ json: { services: [] } }); }
    return route.fulfill({ json: { roots: [] } });
  });
  for (const route of ['/', '/tree', '/activity', '/agent-activity', '/uniswap', '/payments', '/applications', '/setup', '/mcp']) {
    releaseTree = undefined; releaseHistory = undefined;
    await page.goto(base + route + '?vault=capital.agentcapitalvault.eth');
    await expect(page.getByLabel('Loading vault data', { exact: true })).toBeVisible();
    const box = await page.locator('.loading-value').first().boundingBox(); assert.ok(box.height >= 20);
    await expect(page.locator('.summary-ledger')).toHaveCount(0);
    await expect(async () => assert.equal(typeof releaseTree, 'function')).toPass();
    releaseTree();
    await expect(page.getByLabel('Loading vault data', { exact: true })).toHaveCount(0);
    if (['/activity', '/uniswap'].includes(route)) await expect(page.getByLabel('Loading activity history', { exact: true })).toBeVisible();
    if (route === '/agent-activity') await expect(page.getByLabel('Loading agent activity', { exact: true })).toBeVisible();
    if (route === '/payments') await expect(page.getByLabel('Loading payment history', { exact: true })).toBeVisible();
    if (route === '/setup') {
      await page.locator('.dashboard-loaded-content').evaluate(el => el.dataset.retainedState = 'yes');
      releaseTree = undefined;
      await page.clock.fastForward(20_001);
      await expect(page.getByLabel('Loading vault data', { exact: true })).toBeVisible();
      await expect(page.locator('.dashboard-loaded-content')).toBeHidden();
      await expect(async () => assert.equal(typeof releaseTree, 'function')).toPass();
      releaseTree();
      await expect(page.locator('.dashboard-loaded-content')).toBeVisible();
      await expect(page.locator('.dashboard-loaded-content')).toHaveAttribute('data-retained-state', 'yes');
    }
    if (route === '/applications') await expect(page.getByLabel('Loading services', { exact: true })).toBeVisible();
  }
  // Layout checks use explicitly labelled preview data, with no financial writes.
  for (const width of [1440, 390]) for (const theme of ['dark', 'light']) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(base + '/?preview=1');
    if (width === 390) await expect(page.getByRole('button', { name: 'Toggle Sidebar', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    const cards = page.locator('.overview-lower > [data-slot="card"]');
    await expect(cards).toHaveCount(2);
    const boxes = await cards.evaluateAll(nodes => nodes.map(n => { const r=n.getBoundingClientRect();const b=n.querySelector('a').getBoundingClientRect();return {width:r.width,bottom:r.bottom,buttonBottom:b.bottom}; }));
    assert.ok(Math.abs(boxes[0].width-boxes[1].width)<1);
    assert.ok(Math.abs((boxes[0].bottom-boxes[0].buttonBottom)-(boxes[1].bottom-boxes[1].buttonBottom))<2);
    assert.equal(await page.locator('.overview-lower .button').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(127, 200, 160)');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false);
    if (width===390) {
      await page.getByRole('button', {name:'Toggle Sidebar', exact:true}).click();
      await expect(page.getByRole('link',{name:'Agent tree',exact:true})).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button',{name:'Toggle Sidebar',exact:true})).toBeFocused();
    } else await expect(page.getByRole('link',{name:'Agent tree',exact:true})).toBeVisible();
    await page.screenshot({path:`/tmp/kanoki-dashboard-${width}-${theme}.png`,fullPage:true});
  }
  assert.deepEqual(errors, []);
  console.log('PASS: visible skeletons on all nine routes, separate activity/payment/catalog loading, equal cards, aligned green CTAs, shadcn mobile keyboard navigation, dark/light and no overflow. Public read snapshots with controlled delays; no transactions.');
} finally { await browser.close(); }
