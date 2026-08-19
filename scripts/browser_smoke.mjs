// scripts/browser_smoke.mjs
// 浏览器轴 E2E 冒烟（v3.0 指令 Phase 5.1/5.2 · 雷达维度 16 既定路径）。
//
// 覆盖：
//   1. SPA 真实渲染（AppShell 出现 · 零 console error · 零 pageerror——CSP 不得阻断主题脚本）；
//   2. 性能代理指标（DOMContentLoaded / load / first-paint 时序——Lighthouse 包的轻量代理，
//      完整 Lighthouse 评分列后续）；
//   3. 核心旅程 smoke：/ → /verify → /evidence 三路由可达（Question→Evidence→Verdict 的骨架）；
//   4. CSP 头取证（script-src 白名单生效且页面仍渲染）。
// 产物：.far/e2e/browser_smoke.json（运行时产物纪律）。
// 用法：node scripts/browser_smoke.mjs（自带 API 服务器生命周期，跑完即停）。

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const PORT = 3291;
const BASE = `http://127.0.0.1:${PORT}`;

function waitForServer(url, tries = 40) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      fetch(url)
        .then(() => resolve())
        .catch(() => (n > 0 ? setTimeout(() => attempt(n - 1), 500) : reject(new Error('server did not start'))));
    };
    attempt(tries);
  });
}

const server = spawn(process.execPath, ['src/cli/far.ts', 'api', '--port', String(PORT)], {
  stdio: ['ignore', 'ignore', 'pipe'],
});
let serverErr = '';
server.stderr.on('data', (c) => {
  serverErr += c.toString();
});

const report = { at: new Date().toISOString(), checks: [], consoleErrors: [], pageErrors: [] };
const check = (name, pass, detail = '') => {
  report.checks.push({ name, pass, detail });
  console.log(`  ${pass ? '✔' : '✖'} ${name}${detail !== '' ? ` · ${detail}` : ''}`);
};

try {
  await waitForServer(`${BASE}/health`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') report.consoleErrors.push(msg.text().slice(0, 200));
  });
  page.on('pageerror', (err) => report.pageErrors.push(String(err).slice(0, 200)));

  // 1. 首页渲染 + 性能时序
  const t0 = Date.now();
  const resp = await page.goto(`${BASE}/`, { waitUntil: 'load' });
  check('SPA / 返回 200', resp?.status() === 200, `status=${resp?.status()}`);
  const csp = resp?.headers()['content-security-policy'] ?? '';
  check('CSP 头存在且 script-src 含 sha256 白名单', csp.includes('script-src') && csp.includes("'sha256-"), '');

  await page.waitForSelector('text=FAR-Lab', { timeout: 10000 }).catch(() => undefined);
  const shellVisible = await page.locator('nav').first().isVisible().catch(() => false);
  check('AppShell 导航真实渲染（非白屏）', shellVisible);

  const timing = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const paints = performance.getEntriesByType('paint');
    return {
      domContentLoadedMs: Math.round(nav?.domContentLoadedEventEnd ?? -1),
      loadMs: Math.round(nav?.loadEventEnd ?? -1),
      firstPaintMs: Math.round(paints.find((p) => p.name === 'first-paint')?.startTime ?? -1),
      firstContentfulPaintMs: Math.round(paints.find((p) => p.name === 'first-contentful-paint')?.startTime ?? -1),
    };
  });
  report.timing = timing;
  check('FCP < 2000ms（本地服务·指令 3G 首屏线的本地代理）', timing.firstContentfulPaintMs > 0 && timing.firstContentfulPaintMs < 2000, `FCP=${timing.firstContentfulPaintMs}ms DCL=${timing.domContentLoadedMs}ms load=${timing.loadMs}ms`);

  // 2. 核心旅程三路由
  for (const route of ['/verify', '/evidence']) {
    const r = await page.goto(`${BASE}${route}`, { waitUntil: 'load' });
    const hasContent = await page.locator('main, [role="main"], body').first().textContent();
    check(`路由 ${route} 可达且有内容`, r?.status() === 200 && (hasContent?.length ?? 0) > 50, `status=${r?.status()}`);
  }

  // 3. 控制台/页面错误（CSP 阻断会以 console error 现形）
  check('零 console error（CSP 未误伤主题/应用脚本）', report.consoleErrors.length === 0, report.consoleErrors[0] ?? '');
  check('零 pageerror', report.pageErrors.length === 0, report.pageErrors[0] ?? '');

  await browser.close();
  console.log(`  (total wall ${Date.now() - t0}ms)`);
} finally {
  server.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 500));
  if (serverErr.includes('EADDRINUSE')) console.error('server failed: port in use');
}

const failed = report.checks.filter((c) => !c.pass);
const outDir = join('.far', 'e2e');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'browser_smoke.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`  → ${join(outDir, 'browser_smoke.json')} · ${report.checks.length - failed.length}/${report.checks.length} pass`);
process.exit(failed.length > 0 ? 1 : 0);
