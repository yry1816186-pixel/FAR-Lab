import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const runs = await fetch('http://127.0.0.1:3290/api/v1/runs').then((r) => r.json());
const completed = (runs.runs ?? runs).find((r) => r.status === 'completed');
await page.goto(`http://127.0.0.1:3290/#study/${completed.id}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const overlap = await page.evaluate(() => {
  const frame = document.querySelector('.map-graph-frame');
  if (!frame) return 'no graph';
  // Collect foreignObject/div/svg text node rects inside the graph
  const texts = [...frame.querySelectorAll('text, .eg-node-label, div')]
    .filter((el) => (el.textContent ?? '').trim().length > 3 && el.children.length === 0)
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { text: el.textContent.trim().slice(0, 26), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    });
  // Detect pairwise overlaps
  const overlaps = [];
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i], b = texts[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
        overlaps.push([a.text, b.text]);
      }
    }
  }
  return { nodeCount: texts.length, overlapCount: overlaps.length, overlaps: overlaps.slice(0, 8) };
});
console.log(JSON.stringify(overlap, null, 1));
await browser.close();
