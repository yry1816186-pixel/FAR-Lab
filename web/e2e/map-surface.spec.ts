import { expect, test } from '@playwright/test';

/**
 * FA-HCI-01 surface honesty on the study map (deterministic offline route):
 *  - execution-truth badge visible WHILE LIVE (RunHeader parity — it used to
 *    vanish for the live class);
 *  - the live band carries the stream-health banner when SSE cannot connect
 *    (StreamStatusChip, previously RunDetail-only) — simulated by aborting the
 *    events/stream route so the browser never opens a stream, exactly the
 *    restricted-network/proxy shape; the polling fallback must still carry
 *    the run to its verdict;
 *  - an ABSENT protocol band is no longer silent on settled runs: the honest
 *    "nothing to preregister" empty state renders.
 */

const QUESTION = 'Does exercise intensity modulate inflammatory markers in older adults?';

test('truth badge visible while live; stream banner speaks when SSE is blocked; protocol empty-state lands after verdict', async ({ page }) => {
  // Deterministic stream-block: every events/stream request aborts — the SSE
  // never opens, the chip must say so and polling must carry the narrative.
  await page.route('**/api/v1/runs/*/events/stream*', (route) => { void route.abort('connectionrefused'); });

  await page.goto('/#lab/new');
  await page.locator('#nr-question').fill(QUESTION);
  await page.getByRole('button', { name: /^启动研究$|^Launch study$/ }).click();
  await expect(page).toHaveURL(/#study\/run_[a-z0-9]+/, { timeout: 30_000 });

  // (1) badge is present DURING the run — any truth class, never hidden.
  const badge = page.locator('.lab-truth--live, .lab-truth--mixed, .lab-truth--synthetic, .lab-truth--recorded_replay').first();
  await expect(badge).toBeVisible({ timeout: 30_000 });

  // (2) the live band narrates AND the stream-health banner is visible on it.
  await expect(page.locator('.map-band--live').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.run-banner--warn, .run-banner--info').first()).toBeVisible({ timeout: 20_000 });

  // Polling fallback carries the run to the honest verdict regardless.
  await expect(page.locator('.map-state')).toBeVisible({ timeout: 120_000 });

  // (3) the protocol empty state must say so on the settled map.
  await expect(page.getByText(/^预注册协议$|^Preregistration protocol$/)).toBeVisible({ timeout: 15_000 });
});
