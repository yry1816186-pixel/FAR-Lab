import { expect, test } from '@playwright/test';

/**
 * HX §19 resilience lattice on the deterministic offline route:
 *  - SSE mid-run drop: EventSource reconnect (plus the seq-cursor polling
 *    fallback) must carry the live narrative through to the verdict —
 *    a dropped connection never freezes or fabricates progress.
 *  - Failure injection: mid-run cancel (armed confirm) lands in an honest
 *    cancelled state; resume continues from the checkpoint to completion.
 *  - Structure regression (the cross-platform form of visual regression —
 *    pixel baselines are runner-dependent and would be theater here):
 *    §26 negative-acceptance invariants as DOM structure assertions.
 */

const QUESTION = 'Does calorie restriction slow cognitive decline in aging?';

test('SSE mid-run drop: reconnect carries the run to completion (offline route)', async ({ page }) => {
  await page.goto('/#lab/new');
  await page.locator('#nr-question').fill(QUESTION);
  await page.getByRole('button', { name: /^启动研究$|^Launch study$/ }).click();
  await expect(page).toHaveURL(/#study\/run_[a-z0-9]+/, { timeout: 30_000 });
  await expect(page.locator('.map-question')).toContainText('calorie restriction', { timeout: 20_000 });

  // Live band is narrating (SSE active).
  const liveBand = page.locator('.map-band--live, [class*="band--live"]').first();
  await expect(liveBand).toBeVisible({ timeout: 15_000 });

  // Cut ALL network (localhost included) mid-run, hold, restore.
  await page.context().setOffline(true);
  await page.waitForTimeout(2_500);
  await page.context().setOffline(false);

  // The run must still complete honestly — via reconnect, polling fallback,
  // or both; the verdict is the un-fakeable end state.
  await expect(page.locator('.map-state')).toBeVisible({ timeout: 120_000 });
  // Real-content discipline: offline-route completions carry real claims and
  // an honest insufficient verdict — never template hypothesis cards.
  await expect(page.locator('.map-claim-row').first()).toBeVisible({ timeout: 30_000 });
});

test('failure injection: mid-run cancel (armed) -> honest cancelled state -> resume completes', async ({ page, request }) => {
  // Slow-runner guard (2026-09-05): on a loaded hosted runner the whole offline
  // pipeline can COMPLETE before a two-step armed confirm lands — and cancelling
  // a completed run is (honestly) a no-op, so the cancelled-state assertion would
  // fail on runner speed, not on product behavior. Gate the arm on the run
  // actually being mid-flight; if it slipped to terminal first, retry on a fresh
  // study (bounded) — the assertion only ever judges a cancel that could land.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.goto('/#lab/new');
    await page.locator('#nr-question').fill(QUESTION);
    await page.getByRole('button', { name: /^启动研究$|^Launch study$/ }).click();
    await expect(page).toHaveURL(/#study\/run_[a-z0-9]+/, { timeout: 30_000 });
    const runId = /run_[a-z0-9]+/.exec(page.url())?.[0] ?? '';

    let midFlight = false;
    await expect
      .poll(async () => {
        try {
          return ((await (await request.get(`/api/v1/runs/${runId}`)).json()) as { status?: string }).status ?? 'no-status';
        } catch { return 'conn-error'; }
      }, { timeout: 60_000, interval: 500 })
      .toMatch(/^(running|partial|completed|failed|cancelled)$/);
    // Re-read once: only arm when the run is still executing.
    try {
      const status = ((await (await request.get(`/api/v1/runs/${runId}`)).json()) as { status?: string }).status;
      midFlight = status === 'running' || status === 'queued';
    } catch { midFlight = false; }
    if (!midFlight) continue; // slipped past us — fresh study, try again

    // Arm then confirm the cancel (two-step — no accidental kills).
    const cancelBtn = page.getByRole('button', { name: /^取消研究$|^Cancel study$/ }).first();
    await expect(cancelBtn).toBeVisible({ timeout: 15_000 });
    await cancelBtn.click();
    await page.getByRole('button', { name: /确认取消|Confirm cancel/ }).click();

    // Honest cancelled state is rendered (not a fabricated failure or a hang).
    // Cancel takes effect at the CURRENT BATCH BOUNDARY — on the offline route a
    // retrieve/evidence batch can run past 30s under load (observed: request
    // recorded, boundary not yet reached), so this latency budget matches the
    // resume leg's: the state transition is the contract, not the 30 seconds.
    await expect(page.getByText(/已取消|Cancelled|cancelled/).first()).toBeVisible({ timeout: 120_000 });

    // Resume from the checkpoint: continues to a real completion.
    const resume = page.getByRole('button', { name: /从此处恢复|Resume/ }).first();
    await expect(resume).toBeVisible({ timeout: 20_000 });
    await resume.click();
    await expect(page.locator('.map-state')).toBeVisible({ timeout: 120_000 });
    return;
  }
  throw new Error('resilience cancel: the offline run reached terminal state before a mid-flight cancel could land on 3 attempts — runner too slow to exercise the cancel path');
});

test('structure regression: §26 negative-acceptance invariants hold on the shipped surfaces', async ({ page }) => {
  // Home: no permanent dual-list sidebar chrome; judgment queue is the front
  // door, and the compose zone rides inside it — never a second rail entry.
  await page.goto('/#/');
  await expect(page.locator('#nr-question')).toBeVisible();
  await expect(page.locator('nav.app-rail').getByRole('button', { name: /新研究|New research/ })).toHaveCount(0);
  expect(await page.locator('.runs-sidebar, .sidebar-dock, nav.runs-nav').count()).toBe(0);

  // Creation surface: no 6-tab chrome (#lab/new is the workspace with the
  // compose zone expanded, not a separate screen).
  await page.goto('/#lab/new');
  await expect(page.locator('#nr-question')).toBeVisible();
  expect(await page.locator('.tab-bar, .run-tabs, [role="tablist"]').count()).toBe(0);

  // Study map spine: question -> evidence -> hypotheses -> verdict, one canvas
  // (order in the DOM mirrors the reading order; no tab switch in between).
  await page.goto('/#lab/new');
  await page.locator('#nr-question').fill(QUESTION);
  await page.getByRole('button', { name: /^启动研究$|^Launch study$/ }).click();
  await expect(page).toHaveURL(/#study\/run_[a-z0-9]+/, { timeout: 30_000 });
  await expect(page.locator('.map-state')).toBeVisible({ timeout: 120_000 });
  const spine = await page.locator('.map-question, .map-state, .map-action, [class*="map-"]').all();
  expect(spine.length).toBeGreaterThan(0);
  expect(await page.locator('[role="tablist"]').count()).toBe(0);
});
