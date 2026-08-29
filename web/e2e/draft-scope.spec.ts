import { expect, test } from '@playwright/test';

/**
 * HX §8.2 formation-screen draft journey (browser, deterministic offline
 * route). Real-content discipline (owner directive 2026-08-29): the offline
 * route refuses template scope proposals — so the browser journey asserts the
 * HONEST behavior: preview surfaces unavailability (no fabricated review
 * panel), the persisted draft stays reachable in the judgment queue, and the
 * direct-launch quick path is unchanged. The full preview→edit→confirm flow
 * itself lives in draft-journey.test.ts with a live-model test double.
 */

const QUESTION = 'Does sleep deprivation impair motor skill consolidation?';

test('preview on the offline route surfaces honest unavailability, never a fabricated review panel', async ({ page }) => {
  await page.goto('/#lab/new');
  const q = page.locator('#nr-question');
  await q.fill(QUESTION);

  await page.getByRole('button', { name: /预览研究范围|^Preview scope$/ }).click();

  // The refusal is visible in researcher language and names the route — no
  // template scope dressed up as an analysis of this question.
  await expect(page.locator('.errorbox').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.errorbox-message').first()).toContainText(/离线|offline|live model|真实模型/i, { timeout: 10_000 });
  // No review panel was fabricated on top of the refusal.
  await expect(page.locator('.nr-review')).toHaveCount(0);
  // The question is preserved — the researcher can still direct-launch.
  await expect(q).toHaveValue(QUESTION);
});

test('direct launch stays one click (quick path unchanged)', async ({ page }) => {
  await page.goto('/#lab/new');
  await page.locator('#nr-question').fill(QUESTION);
  await page.getByRole('button', { name: /^启动研究$|^Launch study$/ }).click();
  await expect(page).toHaveURL(/#study\/run_[a-z0-9]+/, { timeout: 30_000 });
  // No review panel was ever shown on this path.
  await expect(page.locator('.nr-review')).toHaveCount(0);
});

test('a draft persisted by the preview attempt surfaces in the home judgment queue with a continue action', async ({ page }) => {
  await page.goto('/#lab/new');
  await page.locator('#nr-question').fill(QUESTION);
  await page.getByRole('button', { name: /预览研究范围|^Preview scope$/ }).click();
  // The refusal surfaces (the draft run was persisted BEFORE the proposal).
  await expect(page.locator('.errorbox').first()).toBeVisible({ timeout: 30_000 });

  // Return home: the awaiting-launch decision floats in the judgment queue —
  // not buried in the studies index — with an explicit continue affordance.
  await page.goto('/#/');
  const queue = page.locator('.queue-section').first();
  await expect(queue.getByText(/草稿待启动|Draft awaiting launch/).first()).toBeVisible({ timeout: 15_000 });
  await expect(queue.getByRole('button', { name: /继续|Continue/ }).first()).toBeVisible();
});
