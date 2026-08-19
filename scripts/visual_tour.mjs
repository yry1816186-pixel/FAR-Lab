// scripts/visual_tour.mjs
// 视觉巡检：真实 Chromium 逐页截图（明/暗双主题）——供业主眼见检验视觉质量。
// 产物：.far/e2e/visual-tour/*.png（运行时产物纪律）。
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const PORT = 3293;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = join('.far', 'e2e', 'visual-tour');
mkdirSync(OUT, { recursive: true });

const PAGES = [
  ['/', 'home'],
  ['/missions', 'missions'],
  ['/assay', 'assay'],
  ['/verify', 'verify'],
  ['/evidence', 'evidence'],
  ['/benchmark', 'benchmark'],
  ['/events', 'events'],
  ['/about', 'about'],
];

function waitForServer(url, tries = 40) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      fetch(url).then(() => resolve()).catch(() => (n > 0 ? setTimeout(() => attempt(n - 1), 500) : reject(new Error('no server'))));
    };
    attempt(tries);
  });
}

const server = spawn(process.execPath, ['src/cli/far.ts', 'api', '--port', String(PORT)], { stdio: ['ignore', 'ignore', 'ignore'] });
try {
  await waitForServer(`${BASE}/health`);
  const browser = await chromium.launch();
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
    const page = await ctx.newPage();
    for (const [route, name] of PAGES) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' }).catch(() => undefined);
      await page.waitForTimeout(700); // 主题/D3 渲染稳定
      const file = join(OUT, `${name}-${scheme}.png`);
      await page.screenshot({ path: file, fullPage: false });
      console.log(`  ✔ ${file}`);
    }
    await ctx.close();
  }
  await browser.close();
} finally {
  server.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 400));
}
console.log('  done → ' + OUT);
