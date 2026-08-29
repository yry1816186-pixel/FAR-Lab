import { expect, test, type Page } from '@playwright/test';

/**
 * HX §19 core journey (Research Map architecture) against the real product:
 * home judgment queue + studies index -> new-research formation (route picker,
 * what-happens) -> launch -> study map (question/evidence/hypotheses/verdict
 * on one canvas) -> inspector open/Esc -> back to home. Deterministic: the
 * offline route (~15-30s per run), receipts stamped test-mode.
 */

const QUESTION = 'Does resistance training improve insulin sensitivity in older adults?';

test('empty workspace shows the first-use zone (G1), not fabricated lists', async ({ page, request }) => {
  // The E2E server is reused between local runs, so its workspace is only
  // empty on a fresh boot (CI runners boot fresh every time and never skip).
  const runs = await (await request.get('/api/v1/runs')).json() as { runs: unknown[] };
  test.skip(runs.runs.length > 0, 'workspace already has runs (reused server) — G1 asserted on clean CI runners');
  await page.goto('/#/');
  // Fresh scratch workspace: product positioning + readiness checks + the
  // question box itself as the first step (no bare CTA — the researcher can
  // type immediately; the judgment/studies sections appear only with content).
  await expect(page.locator('.fu-title, h1').first()).toBeVisible();
  await expect(page.getByRole('list', { name: /环境检查|Environment check/ })).toBeVisible();
  await expect(page.locator('.qw-input')).toBeVisible();
  await expect(page.locator('.qw-input')).toBeFocused();
});

test('full journey: formation -> launch -> study map -> inspector -> home', async ({ page }) => {
  // 1. Home -> New research
  await page.goto('/#/');
  const newBtn = page.getByRole('button', { name: /新研究|New research/ }).first();
  await expect(newBtn).toBeVisible();
  await newBtn.click();
  await expect(page).toHaveURL(/#lab\/new/);

  // 2. Formation: question field, paste-hint presence, route picker with the
  //    offline route preselected as default (serve-e2e activated it).
  const q = page.locator('#nr-question');
  await expect(q).toBeVisible();
  await q.fill(QUESTION);
  const route = page.locator('.nr-route');
  await expect(route).toBeVisible();
  await expect(route.locator('option', { hasText: /离线|offline/i }).first()).toBeAttached();

  // 3. Launch -> lands DIRECTLY on the study map (#study/<runId>)
  await page.getByRole('button', { name: /启动研究|Start research/ }).click();
  await expect(page).toHaveURL(/#study\/run_[a-z0-9]+/, { timeout: 30_000 });

  // 4. The map: question, then materializing bands. Real-content discipline
  //    (2026-08-29): the offline route refuses template hypotheses/scope — the
  //    settled study shows its honest INSUFFICIENT verdict + real claims, and
  //    hypothesis cards must NOT appear (no demonstration content).
  await expect(page.locator('.map-question')).toContainText('resistance training', { timeout: 20_000 });
  await expect(page.locator('.map-state')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('.map-claim-row').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.map-hyp-card')).toHaveCount(0);

  // 5. Inspector: click the first claim object -> detail drawer,
  //    Esc closes (keyboard path).
  const firstObject = page.locator('.map-claim-row').first();
  await firstObject.click();
  const inspector = page.locator('.lab-inspector, [role="dialog"]');
  await expect(inspector).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(inspector).toBeHidden();

  // 6. Back to home: the completed study appears in the studies index and the
  //    judgment queue section still renders.
  await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => { /* hash nav may no-op */ });
  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: /研究索引|Studies/ })).toBeVisible();
  await expect(page.getByText('resistance training').first()).toBeVisible({ timeout: 15_000 });
});
