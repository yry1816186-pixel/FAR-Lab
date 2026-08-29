import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await page.goto('http://127.0.0.1:3290/#/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
const r = await page.evaluate(() => {
  const el = document.querySelector('.qw-input');
  const cs = getComputedStyle(el);
  const root = getComputedStyle(document.documentElement);
  return {
    inputBg: cs.backgroundColor,
    inputBorder: cs.borderColor,
    pageBgToken: root.getPropertyValue('--v2-page-bg'),
    formBorderToken: root.getPropertyValue('--v2-form-border'),
    dataTheme: document.documentElement.dataset.theme ?? document.documentElement.getAttribute('data-theme'),
  };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
