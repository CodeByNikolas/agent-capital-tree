// Capture the real, read-only preview UI for the README. No wallet is connected.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const base = process.env.ACT_TEST_APP_URL ?? 'http://localhost:3041';
const out = new URL('../artifacts/ui/kanoki-demo/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
  const frames = [
    ['overview', '/', 0], ['tree', '/tree', null],
    ['applications', '/applications', 0], ['activity', '/activity', 0],
  ];
  for (const [name, route, scroll] of frames) {
    await page.goto(base + route + '?preview=1', { waitUntil: 'networkidle' });
    await expect(page.locator('h1')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    if (scroll === null) await page.locator('.tree-canvas-desktop').evaluate(element => scrollTo(0, element.getBoundingClientRect().top + scrollY));
    else await page.evaluate(y => scrollTo(0, y), scroll);
    await page.screenshot({ path: fileURLToPath(new URL(name + '.png', out)), animations: 'disabled' });
  }
  console.log('Captured 4 Kanoki preview frames at 1280×720. No wallet actions.');
} finally { await browser.close(); }
