import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const runs = await fetch('http://127.0.0.1:3293/api/v1/runs').then((r) => r.json());
const run = runs.runs.find((r) => r.status === 'completed');
await page.goto(`http://127.0.0.1:3293/#run/${run.id}/verify`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const hits = await page.evaluate(() => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const out = [];
  let n;
  while ((n = walker.nextNode()) !== null) {
    if (/generate_hypotheses|verify_sources|build_evidence/.test(n.textContent ?? '')) {
      const el = n.parentElement;
      out.push({ cls: el?.className?.toString().slice(0, 40), text: (n.textContent ?? '').slice(0, 60), tag: el?.tagName });
    }
  }
  return out.slice(0, 6);
});
console.log(JSON.stringify(hits, null, 1));
await browser.close();
