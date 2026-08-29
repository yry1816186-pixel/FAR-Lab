// Visual QA harness (productization pass): boots a real Edge context against
// the isolated 3290 instance, drives the honest researcher journey, and saves
// full-page screenshots of every primary surface in zh/en, light/dark, and a
// narrow viewport. Real browser rendering — the vision pass runs on these.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = 'http://127.0.0.1:3290';
const OUT = new URL('../../artifacts/hx/qa-2026-08-29/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const Q = '高温胁迫下植物热激蛋白表达的调控机制是什么？';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: 'msedge' });

async function newPage({ theme = 'light', lang = 'zh', width = 1440, height = 960 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: 'zh-CN' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  // Set theme+lang via the app's own persistence keys before UI settles.
  await page.evaluate(([th, lg]) => {
    try {
      localStorage.setItem('farlab.theme', th);
      localStorage.setItem('farlab.lang', lg);
    } catch { /* fresh profile */ }
  }, [theme, lang]);
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(600);
  return { ctx, page };
}

async function shot(page, name, { fullPage = true } = {}) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
  console.log(`shot ${name}`);
}

// 1. Launch the offline study first (need a completed run for all surfaces).
const runResp = await fetch(`${BASE}/api/v1/runs`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: Q, draft: false }),
});
const run = await runResp.json();
const runId = run.runId ?? run.run?.id ?? run.id;
console.log('runId', runId);

// Wait for completion (offline deterministic ≈ 20-40s).
let status = '';
for (let i = 0; i < 90; i++) {
  const r = await fetch(`${BASE}/api/v1/runs/${runId}`).then((x) => x.json());
  status = r.status ?? r.run?.status ?? '';
  if (['completed', 'partial', 'failed', 'cancelled'].includes(status)) break;
  await sleep(2000);
}
console.log('final status', status);

// 2. zh/light full sweep (desktop).
{
  const { ctx, page } = await newPage({ theme: 'light', lang: 'zh' });
  await shot(page, '01-home-fresh');
  await page.goto(`${BASE}/#lab/new`, { waitUntil: 'networkidle' });
  await sleep(400);
  await shot(page, '02-new-research');
  await page.goto(`${BASE}/#study/${runId}`, { waitUntil: 'networkidle' });
  await sleep(1500);
  await shot(page, '03-study-map');
  // Inspector: click the first hypothesis card.
  const hyp = page.locator('.map-hyp-card').first();
  if (await hyp.count() > 0) { await hyp.click(); await sleep(500); await shot(page, '04-inspector-hyp'); await page.keyboard.press('Escape'); }
  const claim = page.locator('.map-claim-row').first();
  if (await claim.count() > 0) { await claim.click(); await sleep(500); await shot(page, '05-inspector-claim'); }
  await page.goto(`${BASE}/#library`, { waitUntil: 'networkidle' }); await sleep(600);
  await shot(page, '06-library');
  for (const tab of ['verify', 'hypotheses', 'plan', 'revisions']) {
    await page.goto(`${BASE}/#run/${runId}/${tab}`, { waitUntil: 'networkidle' });
    await sleep(800);
    await shot(page, `07-deep-${tab}`);
  }
  await ctx.close();
}

// 3. en/light home+study.
{
  const { ctx, page } = await newPage({ theme: 'light', lang: 'en' });
  await shot(page, '10-home-en');
  await page.goto(`${BASE}/#study/${runId}`, { waitUntil: 'networkidle' }); await sleep(1200);
  await shot(page, '11-study-en');
  await ctx.close();
}

// 4. zh/dark home+study.
{
  const { ctx, page } = await newPage({ theme: 'dark', lang: 'zh' });
  await shot(page, '12-home-dark');
  await page.goto(`${BASE}/#study/${runId}`, { waitUntil: 'networkidle' }); await sleep(1200);
  await shot(page, '13-study-dark');
  await ctx.close();
}

// 5. Narrow (375px) home+study zh.
{
  const { ctx, page } = await newPage({ theme: 'light', lang: 'zh', width: 375, height: 812 });
  await shot(page, '14-home-375');
  await page.goto(`${BASE}/#study/${runId}`, { waitUntil: 'networkidle' }); await sleep(1200);
  await shot(page, '15-study-375');
  await ctx.close();
}

await browser.close();
console.log('DONE');
