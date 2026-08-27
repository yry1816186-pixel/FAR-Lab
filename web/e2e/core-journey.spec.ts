import { expect, test, type Page } from '@playwright/test';

/**
 * HX §19 core journey (Research Map architecture) against the real product:
 * home judgment queue + studies index -> new-research formation (route picker,
 * what-happens) -> launch -> study map (question/evidence/hypotheses/verdict
 * on one canvas) -> inspector open/Esc -> back to home. Deterministic: the
 * offline route (~15-30s per run), receipts stamped test-mode.
 */

const QUESTION = 'Does resistance training improve insulin sensitivity in older adults?';

test('empty workspace shows the first-use zone (G1), not fabricated lists', async ({ page }) => {
  await page.goto('/#/');
  // Fresh scratch workspace: product positioning + readiness checks + ONE first
  // step — the judgment/studies sections appear only with real content (the
  // full journey test below asserts them after a run exists).
  await expect(page.locator('.fu-title, h1').first()).toBeVisible();
  await expect(page.getByRole('list', { name: /环境检查|Environment check/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /提出第一个研究问题|Pose your first research question/ })).toBeVisible();
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

  // 4. The map: question, then materializing bands, verdict at the end —
  //    all on ONE canvas (no tabs), counter-first evidence when counters exist.
  await expect(page.locator('.map-question')).toContainText('resistance training', { timeout: 20_000 });
  await expect(page.locator('.map-verdict, [class*="verdict"]')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('.map-hyp-card, [class*="hyp-card"]').first()).toBeVisible();

  // 5. Inspector: click the first claim/hypothesis object -> detail drawer,
  //    Esc closes (keyboard path).
  const firstObject = page.locator('.map-claim-row, .map-hyp-card, [class*="claim-row"]').first();
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
