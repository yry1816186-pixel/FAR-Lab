import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * Probe (deterministic reproducer for the hosted map-CLS intermittent): the
 * study map's layout-stability budget is measured while its data requests are
 * in flight. On fast local machines every fetch resolves before first paint
 * and the reserve->content swaps never shift anything (local CLS 0.0323, 8/8).
 * Hosted runners are slow enough to open the window FINAL_GAPS registered
 * (0.3011 vs 0.0298 on the same tree). This spec pins the network timings so
 * the race reproduces deterministically: /science (spine) and /evidence are
 * delayed past first paint, exactly the registered evidence-completion vs
 * /science-settle window.
 */

const QUESTION = 'Does moderate caffeine intake affect cognitive performance in healthy adults?';

// ONE provisioned study serves every delay case: the study is static completed
// data; each case builds its own page + routes. (Provisioning per-case added
// four offline runs to the scratch workspace — suite footprint is part of the
// perf contract for every spec that runs after this one.)
let sharedRunId: string | null = null;

async function provisionStudy(request: APIRequestContext): Promise<string> {
  if (sharedRunId !== null) return sharedRunId;
  const res = await request.post('/api/v1/runs', { data: { text: QUESTION } });
  expect(res.ok()).toBeTruthy();
  const { runId } = await res.json() as { runId: string };
  await expect
    .poll(async () => {
      try {
        return (await (await request.get(`/api/v1/runs/${runId}`)).json() as { status?: string }).status ?? 'no-status';
      } catch { return 'conn-error'; }
    }, { timeout: 120_000 })
    .toBe('completed');
  sharedRunId = runId;
  return runId;
}

type ShiftRect = { x: number; y: number; width: number; height: number };
type ShiftSource = { node: string; previous: ShiftRect; current: ShiftRect };
type ShiftEntry = { atMs: number; value: number; sources: ShiftSource[] };
type Vitals = { fcp: number; lcp: number; cls: number; longTasks: number; shifts: ShiftEntry[] };

async function measureVitals(page: import('@playwright/test').Page, goto: () => Promise<void>): Promise<Vitals> {
  await page.goto('about:blank');
  await page.addInitScript(() => {
    (window as unknown as { __vitals?: unknown }).__vitals = { fcp: 0, lcp: 0, cls: 0, longTasks: 0, shifts: [] };
    const w = window as unknown as { __vitals: Vitals };
    const rect = (r: DOMRectReadOnly | undefined): ShiftRect => ({
      x: r?.x ?? 0, y: r?.y ?? 0, width: r?.width ?? 0, height: r?.height ?? 0,
    });
    const nodeLabel = (node: Node | null | undefined): string => {
      if (!(node instanceof Element)) return node?.nodeName ?? 'unknown';
      const id = node.id.length > 0 ? `#${node.id}` : '';
      const classes = [...node.classList].slice(0, 3).map((c) => `.${c}`).join('');
      const label = node.querySelector?.('.map-node-label')?.textContent?.trim() ?? '';
      return `${node.tagName.toLowerCase()}${id}${classes}${label ? `[${label}]` : ''}`;
    };
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          if (e.name === 'first-contentful-paint') w.__vitals.fcp = e.startTime;
          if (e.name === 'largest-contentful-paint' && e.startTime > w.__vitals.lcp) w.__vitals.lcp = e.startTime;
        }
      }).observe({ type: 'paint', buffered: true } as PerformanceObserverInit);
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) w.__vitals.lcp = Math.max(w.__vitals.lcp, e.startTime);
      }).observe({ entryTypes: ['largest-contentful-paint'] } as PerformanceObserverInit);
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          const shift = e as PerformanceEntry & {
            value: number; hadRecentInput: boolean;
            sources?: Array<{ node?: Node | null; previousRect?: DOMRectReadOnly; currentRect?: DOMRectReadOnly }>;
          };
          if (!shift.hadRecentInput) {
            w.__vitals.cls += shift.value;
            w.__vitals.shifts.push({
              atMs: shift.startTime, value: shift.value,
              sources: (shift.sources ?? []).map((s) => ({
                node: nodeLabel(s.node), previous: rect(s.previousRect), current: rect(s.currentRect),
              })),
            });
          }
        }
      }).observe({ type: 'layout-shift', buffered: true } as PerformanceObserverInit);
      new PerformanceObserver((l) => { w.__vitals.longTasks += l.getEntries().length; })
        .observe({ entryTypes: ['longtask'] } as PerformanceObserverInit);
    } catch { /* observer support varies; zeros stay honest */ }
  });
  await goto();
  await page.waitForTimeout(3_500); // let the DELAYED responses land inside the measured window
  return page.evaluate(() => (window as unknown as { __vitals: Vitals }).__vitals);
}

for (const scienceDelayMs of [2_500]) {
  test(`slow spine (${scienceDelayMs}ms /science delay) keeps map layout stable`, async ({ page, request }) => {
    test.setTimeout(180_000);
    const runId = await provisionStudy(request);
    await page.route('**/api/v1/runs/*/science', async (route) => {
      await page.waitForTimeout(scienceDelayMs);
      await route.continue();
    });
    const v = await measureVitals(page, () => page.goto(`/#study/${runId}`, { waitUntil: 'domcontentloaded' }));
    await expect(page.locator('.map-state')).toBeVisible({ timeout: 60_000 });
    const counts = await page.evaluate(() => ({
      claims: document.querySelectorAll('.map-claim-row, [class*="claim-row"]').length,
      hyps: document.querySelectorAll('.map-hyp-card, [class*="hyp-card"]').length,
    }));
    console.log(`PROBE map slow-spine ${scienceDelayMs}ms(${runId}): FCP=${v.fcp.toFixed(0)}ms LCP=${v.lcp.toFixed(0)}ms CLS=${v.cls.toFixed(4)} claims=${counts.claims} hyps=${counts.hyps}`);
    if (v.shifts.length > 0) console.log(`PROBE shifts: ${JSON.stringify(v.shifts)}`);
    expect(v.cls, 'map layout stable with slow spine').toBeLessThan(0.1);
  });
}

for (const evidenceDelayMs of [1_200, 2_500]) {
  test(`slow evidence (${evidenceDelayMs}ms /evidence delay) keeps map layout stable`, async ({ page, request }) => {
    test.setTimeout(180_000);
    const runId = await provisionStudy(request);
    await page.route('**/api/v1/runs/*/evidence', async (route) => {
      await page.waitForTimeout(evidenceDelayMs);
      await route.continue();
    });
    const v = await measureVitals(page, () => page.goto(`/#study/${runId}`, { waitUntil: 'domcontentloaded' }));
    await expect(page.locator('.map-claim-row, .queue-empty, .map-state').first()).toBeVisible({ timeout: 60_000 });
    const counts = await page.evaluate(() => ({
      claims: document.querySelectorAll('.map-claim-row, [class*="claim-row"]').length,
      hyps: document.querySelectorAll('.map-hyp-card, [class*="hyp-card"]').length,
    }));
    console.log(`PROBE map slow-evidence ${evidenceDelayMs}ms(${runId}): FCP=${v.fcp.toFixed(0)}ms LCP=${v.lcp.toFixed(0)}ms CLS=${v.cls.toFixed(4)} claims=${counts.claims} hyps=${counts.hyps}`);
    if (v.shifts.length > 0) console.log(`PROBE shifts: ${JSON.stringify(v.shifts)}`);
    expect(v.cls, 'map layout stable with slow evidence').toBeLessThan(0.1);
  });
}
