import { expect, test } from '@playwright/test';

/**
 * HX §8.2 formation-screen draft journey (browser, deterministic offline
 * route): 先看范围再启动 persists a draft, runs the receipt-backed scope
 * proposal, shows the EDITABLE review panel, saves a scope edit, and
 * confirming launches the draft onto the study map. Complements
 * draft-journey.test.ts (HTTP contract) from the real-product surface.
 */

const QUESTION = 'Does sleep deprivation impair motor skill consolidation?';

test('preview -> edit scope -> confirm launch lands on the study map', async ({ page }) => {
  await page.goto('/#/');

  // Formation: question + the pre-launch preview path.
  await page.getByRole('button', { name: /新研究|New research/ }).first().click();
  await expect(page).toHaveURL(/#lab\/new/);
  const q = page.locator('#nr-question');
  await q.fill(QUESTION);

  await page.getByRole('button', { name: /先看范围再启动|Preview scope first/ }).click();

  // The review panel renders the deterministic offline proposal (real scope
  // stage execution — receipt-backed, not a fabricated preview).
  const review = page.locator('.nr-review');
  await expect(review).toBeVisible({ timeout: 30_000 });
  await expect(review.locator('.nr-input').first()).toHaveValue(/life sciences \(offline scope template\)/);

  // Edit the phenomena field and save — the PATCH must persist before launch.
  const phenomena = review.locator('textarea.nr-input').first();
  await phenomena.fill('motor-skill consolidation during sleep (edited by researcher)');
  await page.getByRole('button', { name: /保存修改|Save changes/ }).click();
  await expect(page.getByText(/已保存|Saved/)).toBeVisible({ timeout: 10_000 });

  // Confirm: the draft launches and we land DIRECTLY on the study map.
  await page.getByRole('button', { name: /确认启动研究|Confirm and launch/ }).click();
  await expect(page).toHaveURL(/#study\/run_[a-z0-9]+/, { timeout: 30_000 });
  await expect(page.locator('.map-question')).toContainText('sleep deprivation', { timeout: 20_000 });
  await expect(page.locator('.map-verdict, [class*="verdict"]')).toBeVisible({ timeout: 90_000 });
});

test('direct launch stays one click (quick path unchanged)', async ({ page }) => {
  await page.goto('/#lab/new');
  await page.locator('#nr-question').fill(QUESTION);
  await page.getByRole('button', { name: /^启动研究$|^Launch study$/ }).click();
  await expect(page).toHaveURL(/#study\/run_[a-z0-9]+/, { timeout: 30_000 });
  // No review panel was ever shown on this path.
  await expect(page.locator('.nr-review')).toHaveCount(0);
});
