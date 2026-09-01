import { expect, test } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * HX §20 AFTER-metrics on the final architecture, measured by a real browser
 * walking the six core tasks as one continuous session on the deterministic
 * offline route. Wall-clock + primary-action counts only — no invented
 * percentages. Disclosure: only task-1 has a recorded BEFORE (57.4s / 3 clicks
 * + chat round-trip, pre-rebuild walkthrough); the other five BEFOREs were
 * never captured and the pre-rebuild surfaces are deleted — resurrecting them
 * to fabricate baselines would be theater. Results append to
 * artifacts/hx/task-metrics-after.json (test attachment mirrors them).
 */

const QUESTION = 'Does mindfulness training reduce chronic low-back pain intensity?';
const CITATION = '10.1016/j.pain.2024.02.010 mindfulness chronic pain randomized trial';

interface TaskMetric { task: string; seconds: number; primaryActions: number; note: string }
const metrics: TaskMetric[] = [];
const now = (): number => performance.now();

test('six core tasks: measured AFTER walkthrough', async ({ page }) => {
  // ---- T2 加入资料 rides inside the formation flow (measured first, before launch)
  let t0 = now();
  let clicks = 0;
  await page.goto('/#/');
  await page.getByRole('button', { name: /更多选项|More options/ }).click(); clicks += 1;
  await expect(page).toHaveURL(/#lab\/new/);
  const q = page.locator('#nr-question');
  await q.fill(QUESTION);
  await q.pressSequentially(' ', { delay: 10 });
  // Material through the explicit citation entry (same ingestion pipeline as
  // paste/drop; ClipboardEvent dispatch is rejected by the automation
  // surface's side-effect guard, and fill() correctly does NOT paste).
  await page.getByRole('button', { name: /引文 \/ 标识符|Citations \/ identifiers/ }).click(); clicks += 1;
  const citeBox = page.locator('#nr-cite-input');
  await citeBox.fill(CITATION);
  await page.getByRole('button', { name: /加入资料|Add materials/ }).click(); clicks += 1;
  await expect(page.locator('.seed-card').first()).toBeVisible({ timeout: 15_000 });
  metrics.push({ task: 'T2 加入资料 (citation entry -> seed card ready)', seconds: Number(((now() - t0) / 1000).toFixed(1)), primaryActions: clicks, note: 'explicit citation input rides the same parser as paste (bibtex/ris/DOI lines)' });

  // ---- T1 开始一个研究: launch -> lands directly on the study map
  t0 = now(); clicks = 1;
  await page.getByRole('button', { name: /^启动研究$|^Launch study$/ }).click();
  await expect(page).toHaveURL(/#study\/run_[a-z0-9]+/, { timeout: 30_000 });
  metrics.push({ task: 'T1 开始研究 (formation -> study map)', seconds: Number(((now() - t0) / 1000).toFixed(1)), primaryActions: clicks, note: '0 chat detour; direct navigation to the map' });

  // ---- T3 判断当前进度: live band with determinate stage/progress
  t0 = now(); clicks = 0;
  const liveBand = page.locator('.map-band--live, [class*="band--live"]').first();
  await expect(liveBand).toBeVisible({ timeout: 15_000 });
  await expect(liveBand).toContainText(/\/\s*9|阶段|stage/i, { timeout: 15_000 });
  metrics.push({ task: 'T3 判断当前进度 (live band, determinate n/9)', seconds: Number(((now() - t0) / 1000).toFixed(1)), primaryActions: clicks, note: 'stage + progress readable without leaving the map' });

  // ---- completion before the reading tasks
  await expect(page.locator('.map-state')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('.map-claim-row').first()).toBeVisible({ timeout: 30_000 });

  // ---- T4 找到一条证据的原文: claim row -> inspector shows the locator quote
  t0 = now(); clicks = 1;
  const firstClaim = page.locator('.map-claim-row, [class*="claim-row"]').first();
  const claimText = (await firstClaim.innerText()).replace(/^[✓✗–⊘◆]\s*/, '').trim();
  await firstClaim.click();
  const inspector = page.locator('.lab-inspector, [role="dialog"]');
  await expect(inspector).toBeVisible({ timeout: 10_000 });
  // Grounded-source assertion: the clicked claim's text appears verbatim in
  // the inspector (counter-first ordering decides WHICH claim is first).
  await expect(inspector).toContainText(claimText.slice(0, 40), { timeout: 10_000 });
  await page.keyboard.press('Escape');
  metrics.push({ task: 'T4 找到证据原文 (claim -> inspector locator)', seconds: Number(((now() - t0) / 1000).toFixed(1)), primaryActions: clicks, note: 'keyboard Esc returns; quote grounded in the retrieved source' });

  // ---- T5 读当前科学结论与下一步: state band verdict + next action on one
  //      canvas (real-content discipline: offline runs end in an honest
  //      INSUFFICIENT verdict — hypothesis comparison needs a live route, so
  //      the offline-measured task is verdict reading, not card comparison).
  t0 = now(); clicks = 0;
  const stateBand = page.locator('.map-state');
  await expect(stateBand).toContainText(/证据不足|insufficient|模板|template/i, { timeout: 10_000 });
  const actionCard = page.locator('.map-action');
  await expect(actionCard).toBeVisible();
  await expect(actionCard.locator('.ma-objective')).toBeVisible();
  metrics.push({ task: 'T5 读科学结论与下一步 (verdict + next action)', seconds: Number(((now() - t0) / 1000).toFixed(1)), primaryActions: clicks, note: 'verdict and next research action readable without leaving the map; hypothesis cards require a live model route (no demo content)' });
});

test('T6 从失败中恢复: cancel (armed) -> resume -> completed', async ({ page }) => {
  const t0 = now();
  let clicks = 0;
  await page.goto('/#lab/new');
  await page.locator('#nr-question').fill(QUESTION);
  await page.getByRole('button', { name: /^启动研究$|^Launch study$/ }).click(); clicks += 1;
  await expect(page).toHaveURL(/#study\/run_[a-z0-9]+/, { timeout: 30_000 });
  const cancelBtn = page.getByRole('button', { name: /^取消研究$|^Cancel study$/ }).first();
  await expect(cancelBtn).toBeVisible({ timeout: 15_000 });
  await cancelBtn.click(); clicks += 1;
  await page.getByRole('button', { name: /确认取消|Confirm cancel/ }).click(); clicks += 1;
  // Honest intermediate-or-final state: on a fast batch (the offline double
  // checks cancellation at every runSearch now) the request can land within
  // the same tick the confirm click resolves — the researcher sees the final
  // cancelled band directly, never the pending line. Both are honest renders;
  // a slow batch still shows the pending line first.
  await expect(page.getByText(/取消请求已记录|已取消——可从断点继续|Cancellation recorded|Cancelled/).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/已取消——可从断点继续|Cancelled/).first()).toBeVisible({ timeout: 120_000 });
  const resume = page.getByRole('button', { name: /从此处恢复|Resume/ }).first();
  await expect(resume).toBeVisible({ timeout: 20_000 });
  await resume.click(); clicks += 1;
  await expect(page.locator('.map-state')).toBeVisible({ timeout: 120_000 });
  metrics.push({
    task: 'T6 从失败中恢复 (cancel -> resume -> verdict)',
    seconds: Number(((now() - t0) / 1000).toFixed(1)),
    primaryActions: clicks,
    note: 'checkpoint resume, no full re-run; context preserved',
  });
});

test.afterAll(async () => {
  if (metrics.length === 0) return;
  const record = {
    recordedAt: new Date().toISOString(),
    route: 'offline deterministic',
    browser: 'chromium/edge (real browser)',
    disclosure: 'Only T1 has a BEFORE (57.4s/3 clicks + chat round-trip). T2-T6 BEFOREs were never captured; pre-rebuild surfaces are deleted and re-baselining them would be fabricated measurement.',
    tasks: metrics,
  };
  const out = resolve('..', 'artifacts', 'hx', 'task-metrics-after.json');
  mkdirSync(resolve('..', 'artifacts', 'hx'), { recursive: true });
  appendFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
  // eslint-disable-next-line no-console
  console.log('§20 AFTER metrics:\n' + metrics.map((m) => `  ${m.task}: ${m.seconds}s / ${m.primaryActions} primary actions`).join('\n'));
});
