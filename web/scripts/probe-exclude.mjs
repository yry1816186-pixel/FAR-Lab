import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ART = path.join(fileURLToPath(new URL('../..', import.meta.url)), 'artifacts', 'hx', 'qa-2026-08-29');
const BASE = 'http://127.0.0.1:3291';
// Create + complete an offline run via API
const jf = async (u, o) => { for (let i = 0; i < 4; i++) { try { return await fetch(u, o); } catch { await new Promise((r) => setTimeout(r, 1500)); } } throw new Error('fetch failed ' + u); };
const runId = await jf(`${BASE}/api/v1/runs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Does resistance training improve insulin sensitivity in older adults?' }) }).then((r) => r.json()).then((d) => d.runId);
console.log('run', runId);
for (let i = 0; i < 90; i++) {
  const s = await jf(`${BASE}/api/v1/runs/${runId}`).then((r) => r.json()).then((d) => d.status);
  if (['completed', 'partial', 'failed'].includes(s)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text().slice(0, 200)); });
await page.goto(`${BASE}/#study/${runId}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const rows = await page.locator('.map-claim-row').count();
console.log('claim rows:', rows);
// Open first claim inspector
await page.locator('.map-claim-row').first().click();
await page.waitForTimeout(600);
const exclBtn = page.getByRole('button', { name: /排除出分析|Exclude from analysis/ });
console.log('exclude btn visible:', await exclBtn.count());
await exclBtn.click();
const reason = page.locator('#insp-exclude-reason');
await reason.waitFor({ state: 'visible', timeout: 5000 });
await reason.fill('probe: methodology');
await page.getByRole('button', { name: /确认排除|Confirm exclusion/ }).click();
await page.waitForTimeout(1500);
const disclosed = await page.getByText(/已被你排除|You excluded/).count();
console.log('disclosure after op:', disclosed);
await page.keyboard.press('Escape');
await page.waitForTimeout(1000);
const exclRow = await page.locator('.map-claim-row.is-excluded').count();
const allRows = await page.locator('.map-claim-row').count();
console.log('all rows after Esc:', allRows);
console.log('is-excluded rows after Esc:', exclRow);
const adj = await page.locator('.map-band--adjusted').count();
console.log('adjusted band:', adj);
await page.screenshot({ path: path.join(ART, 'probe-exclude.png'), fullPage: true });
await browser.close();
