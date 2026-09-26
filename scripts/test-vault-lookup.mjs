import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
const base = process.env.ACT_TEST_APP_URL ?? 'http://127.0.0.1:3040';
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const response = await page.request.get(`${base}/api/tree?root=5`);
  assert.equal(response.status(), 200);
  const tree = await response.json();
  const root = tree.nodes.find(node => node.id === '5');
  const child = tree.nodes.find(node => node.id === '7');
  for (const node of [root, child]) for (const q of [node.vaultAddress, node.ensName, `${node.ensName.toUpperCase()}.`, node.id]) {
    const resolved = await page.request.get(`${base}/api/resolve-root?q=${encodeURIComponent(q)}`);
    assert.equal(resolved.status(), 200, q);
    const body = await resolved.json();
    assert.equal(body.rootId, '5'); assert.equal(body.nodeId, node.id);
    assert.equal(body.vault.toLowerCase(), node.vaultAddress.toLowerCase());
  }
  for (const [q, status] of [['', 400], ['https://example.com', 400], ['alice.eth', 400], ['0x0000000000000000000000000000000000000001', 404], ['missing.agentcapitaltree.eth', 404], ['99999', 404]]) {
    const result = await page.request.get(`${base}/api/resolve-root?q=${encodeURIComponent(q)}`);
    assert.equal(result.status(), status, q);
    assert.equal(typeof (await result.json()).error, 'string');
  }
  for (const width of [390, 1440]) {
    await page.setViewportSize({width, height:1000});
    await page.goto(`${base}/tree?root=5`);
    const input = page.getByLabel('ENS name or vault contract address');
    await input.fill(child.ensName);
    await page.getByRole('button', {name:'Open vault',exact:true}).click();
    await expect.poll(()=>new URL(page.url()).searchParams.get('node')).toBe('7');
    assert.equal(new URL(page.url()).pathname, '/tree');
    assert.equal(new URL(page.url()).searchParams.get('root'),'5');
    await input.fill('0x0000000000000000000000000000000000000001');
    await page.getByRole('button', {name:'Open vault',exact:true}).click();
    await expect(page.locator('.vault-lookup-error')).toContainText('No vault');
    await input.fill(root.vaultAddress);
    await page.getByRole('button', {name:'Open vault',exact:true}).click();
    await expect.poll(()=>new URL(page.url()).searchParams.get('node')).toBe('5');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  console.log(JSON.stringify({base, checks:'ENS/address/root and child mapping, case/trailing-dot normalization, invalid and unknown inputs, mobile/desktop navigation and error recovery',transactionsSent:0}));
} finally {await browser.close();}
