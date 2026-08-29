import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await page.goto('http://127.0.0.1:3290/#/', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
// Find the completed run id from the studies index
const runId = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.queue-item--study')];
  return rows.length;
});
await page.goto('http://127.0.0.1:3290/api/v1/runs').then(()=>{}).catch(()=>{});
const runs = await fetch('http://127.0.0.1:3290/api/v1/runs').then((r) => r.json());
const completed = (runs.runs ?? runs).find((r) => r.status === 'completed');
console.log('completed run:', completed?.id);
await page.goto(`http://127.0.0.1:3290/#study/${completed.id}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const structure = await page.evaluate(() => {
  const nodes = [...document.querySelectorAll('.map-node, .map-band')].map((n) => {
    const label = n.querySelector('.map-node-label')?.textContent;
    const title = n.querySelector('.mb-title, .ss-leader, .map-question, .v-statement')?.textContent?.slice(0, 80);
    const textLen = n.textContent?.length ?? 0;
    return { cls: n.className.slice(0, 60), label: label ?? title ?? null, textLen };
  });
  const leader = document.querySelector('.ss-leader')?.textContent?.slice(0, 120);
  const action = document.querySelector('.ma-objective')?.textContent?.slice(0, 100);
  const stateTitle = document.querySelector('.map-state .ss-title')?.textContent;
  return { nodes, leader, action, stateTitle, totalHeight: document.body.scrollHeight };
});
console.log(JSON.stringify(structure, null, 1));
await browser.close();
