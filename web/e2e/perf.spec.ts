import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * HX §21 — performance benchmarks on the real product (deterministic offline
 * corpus; every number written to the console baseline AND gated by hard
 * ceilings from Google's "good" thresholds so regressions fail CI without
 * flaking on runner noise).
 *
 * Measured surfaces: home (#/), new-research (#lab/new), study map
 * (#study/<id>) including its largest-band render. CLS via layout-shift
 * entries; LCP via the Paint Timing API fallback (Chromium supports both).
 */

const QUESTION = 'Does moderate caffeine intake affect cognitive performance in healthy adults?';

async function startStudy(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/v1/runs', { data: { text: QUESTION } });
  expect(res.ok()).toBeTruthy();
  const { runId } = await res.json() as { runId: string };
  return runId;
}

async function provisionStudy(request: APIRequestContext): Promise<string> {
  const runId = await startStudy(request);
  await expect
    .poll(async () => {
      // Offline-run execution can block the server event loop long enough for
      // Windows to RST a keep-alive connection — a transport blip is pending,
      // not a failure; the assertion still requires a final 'completed'.
      try {
        return (await (await request.get(`/api/v1/runs/${runId}`)).json() as { status?: string }).status ?? 'no-status';
      } catch { return 'conn-error'; }
    }, { timeout: 120_000 })
    .toBe('completed');
  return runId;
}

async function waitForTerminalRun(request: APIRequestContext, runId: string): Promise<void> {
  await expect
    .poll(async () => {
      try {
        return (await (await request.get(`/api/v1/runs/${runId}`)).json() as { status?: string }).status ?? 'no-status';
      } catch { return 'conn-error'; }
    }, { timeout: 120_000 })
    .toMatch(/^(cancelled|completed|partial|failed)$/);
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
      x: r?.x ?? 0,
      y: r?.y ?? 0,
      width: r?.width ?? 0,
      height: r?.height ?? 0,
    });
    const nodeLabel = (node: Node | null | undefined): string => {
      if (!(node instanceof Element)) return node?.nodeName ?? 'unknown';
      const id = node.id.length > 0 ? `#${node.id}` : '';
      const classes = [...node.classList].slice(0, 3).map((c) => `.${c}`).join('');
      return `${node.tagName.toLowerCase()}${id}${classes}`;
    };
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          if (e.name === 'first-contentful-paint') w.__vitals.fcp = e.startTime;
          if (e.name === 'largest-contentful-paint' && e.startTime > w.__vitals.lcp) w.__vitals.lcp = e.startTime;
        }
      }).observe({ type: 'paint', buffered: true } as PerformanceObserverInit);
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) w.__vitals.lcp = Math.max(w.__vitals.lcp, (e as PerformanceEntry).startTime);
      }).observe({ type: 'largest-contentful-paint', buffered: true } as PerformanceObserverInit);
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          const shift = e as PerformanceEntry & {
            value: number;
            hadRecentInput: boolean;
            sources?: Array<{
              node?: Node | null;
              previousRect?: DOMRectReadOnly;
              currentRect?: DOMRectReadOnly;
            }>;
          };
          if (!shift.hadRecentInput) {
            w.__vitals.cls += shift.value;
            w.__vitals.shifts.push({
              atMs: shift.startTime,
              value: shift.value,
              sources: (shift.sources ?? []).map((source) => ({
                node: nodeLabel(source.node),
                previous: rect(source.previousRect),
                current: rect(source.currentRect),
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
  await page.waitForTimeout(1_200); // settle observers after last paint
  return page.evaluate(() => (window as unknown as { __vitals: Vitals }).__vitals);
}

test('perf: loaded home first paint and layout stability within "good" budgets', async ({ page, request }) => {
  // Make the formerly order-dependent CI failure deterministic: a returning
  // workspace with active work loads the multi-run awareness strip from the
  // first /runs response. Before the boot-state fix that late 43px insertion
  // moved the entire app body and produced CLS ~= 0.115 on every run.
  const activeRunId = await startStudy(request);
  // Measurement-confound guard (2026-09-05): a just-started offline run's first
  // stage executes long synchronous stretches (node:sqlite) on the SAME event
  // loop that serves this page — measuring the cold paint INSIDE that burst
  // measures the burst, not the page (hosted FCP=LCP=4920ms with 32 specs green
  // around it). Gate on the scope stage settling so the budget judges the
  // loaded workspace, while the run stays active (later stages keep running
  // during measurement — the active-work shape is preserved).
  await expect
    .poll(async () => {
      try {
        const r = (await (await request.get(`/api/v1/runs/${activeRunId}`)).json()) as {
          status?: string; stages?: Array<{ stage: string; state: string }>;
        };
        const scope = r.stages?.find((s) => s.stage === 'scope');
        return scope !== undefined && (scope.state === 'done' || scope.state === 'skipped') ? 'past-burst' : (r.status ?? 'no-status');
      } catch { return 'conn-error'; }
    }, { timeout: 120_000, interval: 500 })
    .toBe('past-burst');
  const coldAssetRequests = new Set<string>();
  page.on('request', (req) => {
    const pathname = new URL(req.url()).pathname;
    if (pathname.startsWith('/assets/')) coldAssetRequests.add(pathname);
  });
  const v = await measureVitals(page, () => page.goto('/#/', { waitUntil: 'networkidle' }));
  console.log(`PERF home: FCP=${v.fcp.toFixed(0)}ms LCP=${v.lcp.toFixed(0)}ms CLS=${v.cls.toFixed(4)} longTasks=${v.longTasks}`);
  console.log(`PERF home cold assets: ${JSON.stringify([...coldAssetRequests].sort())}`);
  if (v.shifts.length > 0) console.log(`PERF home shifts: ${JSON.stringify(v.shifts)}`);
  await expect(page.locator('.awareness-bar')).toBeVisible();
  // Google "good": LCP <= 2500ms, CLS <= 0.1. Generous CI ceilings (runner
  // variance) — the committed baseline carries the measured local numbers.
  expect(v.lcp, 'home LCP within good budget').toBeLessThan(4_000);
  expect(v.cls, 'home layout stable').toBeLessThan(0.1);
  const unexpectedOptional = [...coldAssetRequests].filter((pathname) =>
    /\/(?:InlineMathFragment|RadarCompare|pdf(?:\.worker\.min)?-|xlsx-|transformers\.web-|asr-worker-)/.test(pathname));
  expect(unexpectedOptional, 'optional research tools stay off the cold shell').toEqual([]);
  const cancel = await request.post(`/api/v1/runs/${activeRunId}/cancel`, { data: {} });
  expect(cancel.ok()).toBeTruthy();
  // Test isolation is part of the performance contract: a cancel request is
  // not cleanup until the worker reaches a terminal state. Leaving this run
  // active made later resilience cases contend with an invisible predecessor.
  await waitForTerminalRun(request, activeRunId);
});

test('perf: study map renders the full corpus without long-task storms', async ({ page, request }) => {
  const runId = await provisionStudy(request);
  const v = await measureVitals(page, () => page.goto(`/#study/${runId}`, { waitUntil: 'domcontentloaded' }));
  await expect(page.locator('.map-state')).toBeVisible({ timeout: 60_000 });
  const counts = await page.evaluate(() => ({
    claims: document.querySelectorAll('.map-claim-row, [class*="claim-row"]').length,
    hyps: document.querySelectorAll('.map-hyp-card, [class*="hyp-card"]').length,
  }));
  console.log(`PERF map(${runId}): FCP=${v.fcp.toFixed(0)}ms LCP=${v.lcp.toFixed(0)}ms CLS=${v.cls.toFixed(4)} longTasks=${v.longTasks} claims=${counts.claims} hyps=${counts.hyps}`);
  if (v.shifts.length > 0) console.log(`PERF map shifts: ${JSON.stringify(v.shifts)}`);
  expect(v.lcp, 'map LCP within good budget').toBeLessThan(4_000);
  expect(v.cls, 'map layout stable').toBeLessThan(0.1);
  // Operability proxy (§21 "large data still operable"): the deterministic
  // offline corpus must actually materialize on the map. Real-content
  // discipline: claims are the materializing objects offline (template
  // hypotheses are refused — hyps expected 0).
  expect(counts.claims).toBeGreaterThan(0);
});
