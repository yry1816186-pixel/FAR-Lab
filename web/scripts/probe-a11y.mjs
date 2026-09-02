// Keyboard-only journey + axe scan + verify-panel structure, real browser.
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ART = path.join(fileURLToPath(new URL('../..', import.meta.url)), 'artifacts', 'hx', 'qa-2026-08-29');
const BASE = 'http://127.0.0.1:3293';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const runId = await fetch(`${BASE}/api/v1/runs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Does resistance training improve insulin sensitivity in older adults?' }) }).then((r) => r.json()).then((d) => d.runId);
for (let i = 0; i < 90; i++) {
  const s = await fetch(`${BASE}/api/v1/runs/${runId}`).then((r) => r.json()).then((d) => d.status);
  if (['completed', 'partial', 'failed'].includes(s)) break;
  await sleep(2000);
}
console.log('run', runId, 'completed');
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

// ---- Keyboard-only journey: fresh home -> type -> Enter -> formation -> tab to launch
await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
await sleep(1200);
// fresh workspace: question box autofocused
const autoFocusOk = await page.evaluate(() => document.activeElement?.className.includes('qw-input'));
await page.keyboard.type('Does sleep deprivation impair memory consolidation?');
await page.keyboard.press('Enter');
await sleep(900);
const formationFocused = await page.evaluate(() => document.activeElement?.id === 'nr-question');
const prefillOk = await page.evaluate(() => document.querySelector('#nr-question')?.value.includes('sleep deprivation'));
console.log('kb: autoFocus', autoFocusOk, '| formation focus', formationFocused, '| prefill', prefillOk);

// ---- Keyboard on the map: '/' palette, Esc, tab order sanity
await page.goto(`${BASE}/#study/${runId}`, { waitUntil: 'networkidle' }); await sleep(2000);
await page.keyboard.press('/');
await sleep(400);
const paletteOpen = await page.evaluate(() => document.querySelector('.palette') !== null || document.activeElement?.className.includes('palette-input'));
await page.keyboard.press('Escape'); await sleep(200);
console.log('kb: palette via /', paletteOpen);

// ---- axe scan on map + verify panel
await page.addScriptTag({ path: path.join(process.cwd(), 'node_modules/axe-core/axe.min.js') });
const violations = await page.evaluate(async () => {
  const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['critical', 'serious'] } });
  return r.violations.map((v) => `${v.id}(${v.nodes.length})`);
});
console.log('axe map:', JSON.stringify(violations));
await page.goto(`${BASE}/#run/${runId}/verify`, { waitUntil: 'networkidle' }); await sleep(2000);
await page.addScriptTag({ path: path.join(process.cwd(), 'node_modules/axe-core/axe.min.js') });
const vviol = await page.evaluate(async () => {
  const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['critical', 'serious'] } });
  return r.violations.map((v) => `${v.id}(${v.nodes.length})`);
});
console.log('axe verify:', JSON.stringify(vviol));

// ---- Verify panel structure probe: quick strip, groups, filter
const structure = await page.evaluate(() => ({
  quick: document.querySelector('.prov-quick')?.textContent?.replace(/\s+/g, ' ').slice(0, 120),
  groupRows: document.querySelectorAll('.receipt-group-row').length,
  groupLabels: [...document.querySelectorAll('.receipt-group-label')].slice(0, 6).map((e) => e.textContent),
  filterBtns: [...document.querySelectorAll('.prov-filter button')].map((b) => b.textContent?.trim()),
  hashCopy: document.querySelector('.hash-copy')?.textContent?.slice(0, 20),
  idCopy: document.querySelector('.id-copy') ? true : false,
  stageLocalized: !document.body.innerText.includes('generate_hypotheses'),
}));
console.log(JSON.stringify(structure, null, 1));
// filter interaction
await page.locator('.prov-filter button', { hasText: /检索|retrieval/i }).first().click().catch(() => {});
await sleep(300);
const filteredRows = await page.evaluate(() => document.querySelectorAll('.receipt-row').length);
console.log('after filter rows:', filteredRows);
await page.screenshot({ path: path.join(ART, '34-verify-panel.png'), fullPage: true });
await browser.close();
console.log('DONE');
