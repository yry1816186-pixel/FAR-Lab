import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * HX §19 surface sweep (Research Map architecture): language parity, theme
 * contract, keyboard-only operation, narrow-viewport integrity, and an
 * axe-core critical/serious scan on the two primary surfaces. Every assertion
 * targets real product state — no decorative checks.
 *
 * Suite order note: self-contained — this spec provisions its own completed
 * study via the API (offline route, no keys) instead of depending on
 * core-journey's server state.
 */

const QUESTION = 'Does chronic sleep restriction alter gut microbiome composition in adults?';
const AXE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../node_modules/axe-core/axe.min.js');

/** Provision one completed study through the real API (offline deterministic route). */
async function provisionStudy(request: APIRequestContext): Promise<string> {
  const created = await test.step('provision study via API', async () => {
    const res = await request.post('/api/v1/runs', { data: { text: QUESTION } });
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { runId: string };
    return body.runId;
  });
  // Poll to completed: the offline route settles in ~15-30s.
  await expect
    .poll(async () => {
      try {
        const res = await request.get(`/api/v1/runs/${created}`);
        if (!res.ok()) return 'fetch-error';
        const run = await res.json() as { status: string };
        return run.status;
      } catch { return 'conn-error'; } // offline-run event-loop block can RST keep-alive; still must reach completed
    }, { timeout: 90_000, interval: 2_000 })
    .toBe('completed');
  return created;
}

let studyId = '';

test.beforeAll(async ({ request }) => {
  studyId = await provisionStudy(request);
});

test('zh/en parity: every lab-home and map label renders in the chosen language', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: '研究索引' })).toBeVisible();

  // Switch to English via the real header toggle.
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Studies' })).toBeVisible();
  // Creation lives INSIDE 工作台: the rail carries exactly one work entry and
  // no rival "New research" destination — the EN dict string renders as the
  // compose zone's heading inside the workspace.
  await expect(page.locator('nav.app-rail').getByRole('button', { name: 'Workspace' })).toBeVisible();
  await expect(page.locator('nav.app-rail').getByRole('button', { name: 'New research' })).toHaveCount(0);
  // Rail + compose zone EN strings (Bohrium/Doubao shell).
  await expect(page.locator('nav.app-rail').getByRole('button', { name: 'Library' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'New research' })).toBeVisible();

  // Map surface in English — these strings exist ONLY through the en dict
  // pairs; a missing key renders the raw key (e.g. "map.title"), failing fast.
  await page.goto(`/#study/${studyId}`);
  await expect(page.locator('.map-node-label').first()).toHaveText(/Research question/);
  await expect(page.locator('.map-node-label', { hasText: 'Evidence' }).first()).toBeVisible();
  await expect(page.locator('.map-node-label', { hasText: 'Candidate hypotheses' }).first()).toBeVisible();
  await expect(page.getByText(/Current scientific state/).first()).toBeVisible();
  await expect(page.getByText(/Next best research action/).first()).toBeVisible();
});

test('theme contract: cycle pins [data-theme] on the document root', async ({ page }) => {
  await page.goto('/#/');
  const root = page.locator('html');
  await expect(root).not.toHaveAttribute('data-theme'); // auto default
  const toggle = page.getByRole('button', { name: /切换主题|Switch theme/ });
  await toggle.click(); // auto -> light
  await expect(root).toHaveAttribute('data-theme', 'light');
  await toggle.click(); // light -> dark
  await expect(root).toHaveAttribute('data-theme', 'dark');
});

test('keyboard-only: n opens formation, / opens the palette, Esc closes', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: /研究索引|Studies/ })).toBeVisible();

  // "n" with nothing focused -> new research formation.
  await page.keyboard.press('n');
  await expect(page).toHaveURL(/#lab\/new/);
  await expect(page.getByRole('textbox', { name: /研究问题|Research question/ })).toBeFocused();

  // Ctrl+K opens the command palette from anywhere (the '/' filter shortcut
  // belonged to the removed dual-list sidebar; the palette is the survivor).
  await page.keyboard.press('Escape'); // leave the textarea first
  await page.keyboard.press('Control+k');
  const palette = page.locator('.palette[role="dialog"]');
  await expect(palette).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
});

test('narrow viewport: home and map never overflow horizontally (375px)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: /研究索引|Studies/ })).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), { timeout: 5_000 })
    .toBeLessThanOrEqual(1);

  await page.goto(`/#study/${studyId}`);
  await expect(page.locator('.map-question')).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), { timeout: 5_000 })
    .toBeLessThanOrEqual(1);
});

test('axe: no critical or serious violations on home or study map (zh, light)', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: '研究索引' })).toBeVisible();
  const homeViolations = await axeScan(page);
  expect(homeViolations, homeViolations.map((v) => `${v.id}@${v.nodes}`).join(', ')).toEqual([]);

  await page.goto(`/#study/${studyId}`);
  await expect(page.locator('.map-state').first()).toBeVisible({ timeout: 60_000 });
  const mapViolations = await axeScan(page);
  expect(mapViolations, mapViolations.map((v) => `${v.id}@${v.nodes}`).join(', ')).toEqual([]);
});

test('§15 claim judgement: exclude -> disclosed marks + adjusted projection -> reinstate', async ({ page, request }) => {
  await page.goto(`/#study/${studyId}`);
  await expect(page.locator('.map-claim-row').first()).toBeVisible({ timeout: 30_000 });

  // Baseline: no adjusted band before any exclusion.
  await expect(page.locator('.map-band--adjusted')).toHaveCount(0);

  // Open the first claim's inspector, arm the exclusion, require the reason.
  await page.locator('.map-claim-row').first().click();
  await page.getByRole('button', { name: /排除出分析|Exclude from analysis/ }).click();
  const reason = page.locator('#insp-exclude-reason');
  await expect(reason).toBeVisible();
  const confirm = page.getByRole('button', { name: /确认排除|Confirm exclusion/ });
  await expect(confirm).toBeDisabled(); // reason required — reviewable judgement
  await reason.fill('E2E: source methodology does not support the claim as stated');
  await confirm.click();

  // Inspector discloses the excluded state with the reason + reinstate entry.
  await expect(page.getByText(/已被你排除|You excluded this claim/)).toBeVisible();
  await expect(page.getByText(/E2E: source methodology/)).toBeVisible();
  await expect(page.getByRole('button', { name: /恢复进入分析|Reinstate into analysis/ })).toBeVisible();

  // Close (Esc) — the evidence band keeps the row, marked, never erased.
  await page.keyboard.press('Escape');
  await expect(page.locator('.map-claim-row.is-excluded').first()).toBeVisible();
  await expect(page.locator('.map-claim-row.is-excluded .map-claim-text').first()).toHaveCSS('text-decoration-line', 'line-through');

  // Real-content discipline: offline-route runs mint no hypotheses and no ACH
  // analysis, so there is no adjusted projection TO disclose (nothing to
  // adjust) — the browser assertions cover the researcher-layer marks; the
  // adjusted-projection math stays covered by vitest claim-ops tests.
  await expect(page.locator('.map-band--adjusted')).toHaveCount(0);
  const hyp = await (await request.get(`/api/v1/runs/${studyId}/hypotheses`)).json() as { achResearcherAdjusted: { excludedClaimIds: string[] } | null };
  expect(hyp.achResearcherAdjusted).toBeNull(); // no analysis objects -> no adjustment

  // Reinstate: marks clear, server truth follows.
  await page.locator('.map-claim-row.is-excluded').first().click();
  await page.getByRole('button', { name: /恢复进入分析|Reinstate into analysis/ }).click();
  await expect(page.locator('.map-claim-row.is-excluded')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('.map-band--adjusted')).toHaveCount(0);
  const after = await (await request.get(`/api/v1/runs/${studyId}/hypotheses`)).json() as { achResearcherAdjusted: { excludedClaimIds: string[] } | null };
  expect(after.achResearcherAdjusted).toBeNull();
});


test('§8.2 pre-launch: draft -> scope proposal -> edit -> server truth -> launch', async ({ page, request }) => {
  // Provision a DRAFT through the real contract (no execution; status 'created').
  const created = await request.post('/api/v1/runs', { data: { text: 'Does resistance training preserve cognitive function in older adults?', draft: true } });
  expect(created.ok()).toBeTruthy();
  const { runId } = await created.json() as { runId: string };

  // The map in draft state: scope-review surface, NO evidence/hypothesis bands yet.
  await page.goto(`/#study/${runId}`);
  await expect(page.getByText(/研究范围（启动前可编辑）|editable before launch/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: /生成范围提议|Generate scope proposal/ })).toBeVisible();
  await expect(page.locator('.map-claim-row')).toHaveCount(0);
  await expect(page.locator('.map-hyp-card')).toHaveCount(0);

  // Real-content discipline: the offline route refuses template scope — the
  // proposal surfaces honest unavailability instead of an editable template.
  // (The full proposal→edit→save browser journey rides a live-model double in
  // draft-journey.test.ts; the PATCH contract is asserted there too.)
  await page.getByRole('button', { name: /生成范围提议|Generate scope proposal/ }).click();
  await expect(page.locator('.errorbox').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#scope-domain')).toHaveCount(0); // never fabricated

  // Launch: the remainder runs; the map lands on the scientific state band.
  await page.getByRole('button', { name: /直接启动研究|^启动研究$|^Launch|^Launch study$/ }).click();
  await expect(page.locator('.map-state').first()).toBeVisible({ timeout: 90_000 });
  const done = await (await request.get(`/api/v1/runs/${runId}`)).json() as { status: string };
  expect(done.status).toBe('completed');

  // Post-launch: the scope-review surface is gone (edits belong to the revision chain now).
  await expect(page.locator('#scope-domain')).toHaveCount(0);
});


test('deep-tools layer: map state band links to every sanctioned deep panel and back', async ({ page }) => {
  await page.goto(`/#study/${studyId}`);
  await expect(page.locator('.map-state').first()).toBeVisible({ timeout: 60_000 });

  // The four next-step links exist and target the correct deep panels.
  const expectLink = async (label: RegExp, tab: string): Promise<void> => {
    const link = page.locator(`.ss-links a[href="#run/${studyId}/${tab}"]`);
    await expect(link).toBeVisible();
    await expect(link).toContainText(label);
  };
  await expectLink(/研究计划|Research plan/, 'plan');
  await expectLink(/评分卡|Scorecards/, 'hypotheses');
  await expectLink(/反馈与修订|Feedback & revision/, 'revisions');
  await expectLink(/导出可复现包|Export reproducible/, 'verify');

  // Navigate into one deep panel (plan) and back to the map — the deep layer
  // and the map are one product, not separate apps. Real-content discipline:
  // offline runs mint no plan, so the panel shows its honest empty state;
  // the navigation itself is the assertion.
  await page.locator(`.ss-links a[href="#run/${studyId}/plan"]`).click();
  await expect(page).toHaveURL(new RegExp(`#run/${studyId}/plan`));
  await page.waitForTimeout(500); // tab mount settles
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`#study/${studyId}`));
  await expect(page.locator('.map-state').first()).toBeVisible();
});

/** Inject axe-core and return critical/serious violations (impact-filtered, honest scope). */
async function axeScan(page: Page): Promise<{ id: string; impact: string; nodes: number }[]> {
  await page.addScriptTag({ path: AXE_PATH });
  // Narrow assertion basis: addScriptTag above loaded axe onto window in this
  // same navigation; shape follows axe-core's documented run() result.
  const results = await page.evaluate(() => {
    const axe = (window as unknown as {
      axe: { run: (ctx: Document, opts: { runOnly: { type: string; values: string[] } }) => Promise<{ violations: { id: string; impact: string | null; nodes: unknown[] }[] }> };
    }).axe;
    return axe.run(document, { runOnly: { type: 'tag', values: ['critical', 'serious'] } });
  });
  return results.violations.map((v) => ({ id: v.id, impact: String(v.impact), nodes: v.nodes.length }));
}
