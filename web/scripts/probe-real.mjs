import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await page.goto('http://127.0.0.1:3293/#study/run_r5bkszh0entqxhhgk8epdm48h0', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const dom = await page.evaluate(() => {
  const body = document.body.innerText;
  const idLeaks = body.match(/clm_[a-z0-9]{10,}/g)?.slice(0, 3) ?? [];
  const stateBand = document.querySelector('.map-state');
  const stateTop = stateBand?.getBoundingClientRect().top ?? 0;
  const confEl = [...document.querySelectorAll('.ss-line')].find((e) => /置信/.test(e.textContent ?? ''));
  return {
    idLeaks,
    idLeakContext: idLeaks.length > 0 ? body.slice(Math.max(0, body.indexOf(idLeaks[0]) - 140), body.indexOf(idLeaks[0]) + 60).replace(/\s+/g, ' ') : null,
    confidenceOffsetInBand: confEl ? Math.round(confEl.getBoundingClientRect().top - stateTop) : -1,
    bandHeight: stateBand ? Math.round(stateBand.getBoundingClientRect().height) : -1,
    hypCards: document.querySelectorAll('.map-hyp-card').length,
    chipCounts: [...document.querySelectorAll('.map-chip')].map((c) => c.textContent),
    claimRowSrcSample: document.querySelector('.map-claim-src')?.textContent?.slice(0, 70),
  };
});
console.log(JSON.stringify(dom, null, 1));
await page.locator('.map-claim-row.is-counter').first().click().catch(() => page.locator('.map-claim-row').first().click());
await page.waitForTimeout(800);
const insp = await page.evaluate(() => {
  const txt = document.querySelector('.lab-inspector')?.innerText ?? '';
  return {
    hasDoi: /doi\.org|10\.\d{4,}/.test(txt),
    quoteSample: (txt.match(/"[^"]{20,80}"/) ?? [])[0]?.slice(0, 70) ?? null,
    sourceLine: txt.split('\n').find((l) => /来源|source/i.test(l))?.slice(0, 80) ?? null,
  };
});
console.log(JSON.stringify(insp, null, 1));
await browser.close();
