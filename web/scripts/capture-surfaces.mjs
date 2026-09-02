// Waved visual-QA capture (2026-09-02): the design-loop camera — BEFORE/AFTER
// evidence for surface work. Real browser against a real server; theme + lang
// pinnable via env (CAPTURE_THEME=light|dark, CAPTURE_LANG=zh|en, default
// light/zh); desktop 1600x1000 and narrow 375x812; plus DOM measurements
// (alignment drift, overflow, graph-frame clipping) printed as JSON so visual
// claims stay DOM-verifiable, not vision-model guesses.
//
// Usage: node scripts/capture-surfaces.mjs <baseUrl> <outDir> <runId>
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3311';
const OUT = process.argv[3] ?? '.impeccable/capture';
const RUN = process.argv[4] ?? '';
const THEME = process.env.CAPTURE_THEME ?? 'light';
const LANG = process.env.CAPTURE_LANG ?? 'zh';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', width: 1600, height: 1000 },
  { name: 'narrow', width: 375, height: 812 },
];
const SURFACES = RUN
  ? [
      { name: 'home', hash: '#/' },
      { name: 'new', hash: '#lab/new' },
      { name: 'library', hash: '#library' },
      { name: 'study', hash: `#study/${RUN}` },
    ]
  : [
      { name: 'home', hash: '#/' },
      { name: 'new', hash: '#lab/new' },
    ];

const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'msedge' });
const report = { base: BASE, run: RUN, surfaces: {}, measures: {} };

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  // Theme/lang must be in localStorage BEFORE the SPA boots — a post-load
  // setItem never applies (hash navigation does not reload), which produced
  // byte-identical "variant" captures (caught 2026-09-02).
  await page.addInitScript(([theme, lang]) => {
    try {
      localStorage.setItem('far-theme', theme);
      localStorage.setItem('farlab.web.lang', lang);
    } catch { /* ok */ }
  }, [THEME, LANG]);
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  for (const s of SURFACES) {
    await page.goto(`${BASE}/${s.hash}`, { waitUntil: 'networkidle' }).catch(() => { /* networkidle can time out on SSE; domcontentloaded + settle is enough */ });
    await sleep(2600);
    // Hash navigation is same-document: the internal scroller keeps its
    // position (the measurement pass below parks it at the bottom) — every
    // surface must be captured from its TOP or below-fold sections (the
    // evidence graph!) silently drop out of the frame (caught 2026-09-02).
    await page.evaluate(() => {
      const sc = document.querySelector('.content');
      if (sc !== null) sc.scrollTo(0, 0);
      window.scrollTo(0, 0);
    });
    await sleep(400);
    const suffix = THEME === 'light' && LANG === 'zh' ? '' : `-${THEME}${LANG}`;
    const file = `${OUT}/${s.name}-${vp.name}${suffix}.png`;
    await page.screenshot({ path: file, fullPage: true });
    report.surfaces[`${s.name}-${vp.name}${suffix}`] = file;

    // Per-viewport DOM truth: overflow, alignment, clipping.
    const m = await page.evaluate(() => {
      const doc = document.documentElement;
      const rect = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, width: r.width, top: r.top, bottom: r.bottom };
      };
      const frame = document.querySelector('.map-graph-frame');
      // NC1 check: can the surface's scroller actually reach its bottom, and
      // does the last element clear the scroll container's edge?
      const scroller = document.querySelector('.content');
      let bottomClearance = null;
      if (scroller !== null) {
        scroller.scrollTop = scroller.scrollHeight;
        const sr = scroller.getBoundingClientRect();
        const deep = scroller.querySelectorAll('section, .queue-item, .nr-embed, .map-node');
        const last = deep[deep.length - 1];
        if (last !== undefined) {
          const lr = last.getBoundingClientRect();
          bottomClearance = Math.round(sr.bottom - lr.bottom);
        }
      }
      return {
        scrollW: doc.scrollWidth,
        innerW: window.innerWidth,
        horizontalOverflow: doc.scrollWidth > window.innerWidth,
        contentScroll: scroller === null ? null : {
          scrollHeight: scroller.scrollHeight,
          clientHeight: scroller.clientHeight,
          canReachBottom: scroller.scrollHeight <= scroller.clientHeight || scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1,
          bottomClearance,
        },
        compose: rect('.nr-card--embed'),
        queueItem: rect('.queue-item'),
        queueSection: rect('.queue-section'),
        studyCanvas: rect('.map-canvas'),
        graphFrame: rect('.map-graph-frame'),
        graphClipped: frame ? frame.scrollHeight > frame.clientHeight + 1 : null,
        graphClipBy: frame ? frame.scrollHeight - frame.clientHeight : null,
        awarenessBar: rect('.awareness-bar'),
        statusBar: rect('.status-bar'),
      };
    });
    report.measures[`${s.name}-${vp.name}`] = m;
  }
  await page.close();
}

// Inspector open (desktop, default theme/lang only): the decision surface is
// part of the visual contract — claim row → drawer with ops.
if (RUN !== '') {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.addInitScript(([theme, lang]) => {
    try {
      localStorage.setItem('far-theme', theme);
      localStorage.setItem('farlab.web.lang', lang);
    } catch { /* ok */ }
  }, [THEME, LANG]);
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await page.goto(`${BASE}/#study/${RUN}`, { waitUntil: 'domcontentloaded' });
  await sleep(2600);
  const claim = page.locator('.map-claim-row').first();
  if (await claim.count() > 0) {
    await claim.click();
    await sleep(900);
    const file = `${OUT}/study-inspector${THEME === 'light' && LANG === 'zh' ? '' : `-${THEME}${LANG}`}.png`;
    await page.screenshot({ path: file, fullPage: true });
    report.surfaces.inspector = file;
    await page.keyboard.press('Escape');
    await sleep(400);
  }
  // The graph frame in view: it sits below the fold on the study page, so a
  // top-of-page capture never shows it (the standing fullPage trap).
  const frame = page.locator('.map-graph-frame');
  if (await frame.count() > 0) {
    await frame.scrollIntoViewIfNeeded();
    await sleep(600);
    const file = `${OUT}/study-graph${THEME === 'light' && LANG === 'zh' ? '' : `-${THEME}${LANG}`}.png`;
    await page.screenshot({ path: file });
    report.surfaces.graph = file;
  }
  await page.close();
}

await browser.close();
console.log(JSON.stringify(report, null, 1));
