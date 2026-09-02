import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ART = path.join(fileURLToPath(new URL('../..', import.meta.url)), 'artifacts', 'hx', 'qa-2026-08-29');
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await page.goto('http://127.0.0.1:3292/#/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(ART, '20-firstuse-fresh.png'), fullPage: true });
const dom = await page.evaluate(() => ({
  title: document.querySelector('.fu-title')?.textContent,
  checks: [...document.querySelectorAll('.fu-check')].map((c) => c.textContent?.trim().slice(0, 90)),
  start: document.querySelector('.fu-start')?.textContent,
  note: document.querySelector('.fu-note')?.textContent,
}));
console.log(JSON.stringify(dom, null, 1));
await page.screenshot({ path: path.join(ART, '20-firstuse-fresh.png'), fullPage: true });
// Type a question in the embedded box -> formation prefilled
await page.locator('.qw-input').fill('What drives CRISPR off-target editing?');
await page.locator('.qw-go').click();
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(ART, '21-firstuse-formation.png'), fullPage: true });
const qv = await page.locator('#nr-question').inputValue().catch(() => '');
console.log('url:', page.url(), '| prefilled:', qv.slice(0, 40));
await browser.close();
