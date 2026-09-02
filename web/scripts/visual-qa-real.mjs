// REAL-run visual QA (live zai route): the surfaces that offline runs could
// never exercise with real content — hypothesis cards with real scores,
// evidence_backed state band, deep panels (verify/plan/revisions/hypotheses),
// and inspector ops on real hypotheses. Real browser, real science.
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:3293';
const RUN = process.argv[2];
const OUT = path.join(fileURLToPath(new URL('../..', import.meta.url)), 'artifacts', 'hx', 'qa-2026-08-29');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { try { localStorage.setItem('far-theme', 'light'); localStorage.setItem('farlab.web.lang', 'zh'); } catch { /* ok */ } });
await page.goto(`${BASE}/#study/${RUN}`, { waitUntil: 'networkidle' });
await sleep(2500);

const dom = await page.evaluate(() => ({
  hypCards: document.querySelectorAll('.map-hyp-card').length,
  topCard: document.querySelector('.map-hyp-card.is-top .map-hyp-statement')?.textContent?.slice(0, 80),
  leader: document.querySelector('.ss-leader')?.textContent?.slice(0, 100),
  claimRows: document.querySelectorAll('.map-claim-row').length,
  stateConfidence: [...document.querySelectorAll('.ss-line')].map((e) => e.textContent?.slice(0, 60)).slice(0, 6),
  actionObjective: document.querySelector('.ma-objective')?.textContent?.slice(0, 90),
}));
console.log(JSON.stringify(dom, null, 1));
await page.screenshot({ path: `${OUT}/30-real-study-map.png`, fullPage: true });

// Real hypothesis inspector: promote op + full detail
const hyp = page.locator('.map-hyp-card.is-top');
if (await hyp.count() > 0) {
  await hyp.click(); await sleep(700);
  await page.screenshot({ path: `${OUT}/31-real-inspector-hyp.png`, fullPage: true });
  await page.keyboard.press('Escape'); await sleep(300);
}
const claim = page.locator('.map-claim-row.is-counter');
if (await claim.count() > 0) {
  await claim.first().click(); await sleep(700);
  await page.screenshot({ path: `${OUT}/32-real-inspector-counter-claim.png`, fullPage: true });
  await page.keyboard.press('Escape');
}

// All four deep panels on REAL content
for (const tab of ['hypotheses', 'plan', 'revisions', 'verify']) {
  await page.goto(`${BASE}/#run/${RUN}/${tab}`, { waitUntil: 'networkidle' });
  await sleep(1200);
  await page.screenshot({ path: `${OUT}/33-real-deep-${tab}.png`, fullPage: true });
  const text = await page.evaluate(() => document.body.innerText.slice(0, 120));
  console.log(`deep-${tab}:`, text.replace(/\s+/g, ' ').slice(0, 100));
}

await browser.close();
console.log('DONE');
