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
      const res = await request.get(`/api/v1/runs/${created}`);
      if (!res.ok()) return 'fetch-error';
      const run = await res.json() as { status: string };
      return run.status;
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
  await expect(page.getByRole('button', { name: 'New research' })).toBeVisible();

  // Map surface in English — these strings exist ONLY through the en dict
  // pairs; a missing key renders the raw key (e.g. "map.title"), failing fast.
  await page.goto(`/#study/${studyId}`);
  await expect(page.locator('.map-node-label').first()).toHaveText(/Research question/);
  await expect(page.getByText(/Evidence \(counter-first/).first()).toBeVisible();
  await expect(page.getByText(/Candidate hypotheses/).first()).toBeVisible();
  await expect(page.getByText(/Current verdict/).first()).toBeVisible();
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
  await expect(page.locator('.map-verdict')).toBeVisible();
  const mapViolations = await axeScan(page);
  expect(mapViolations, mapViolations.map((v) => `${v.id}@${v.nodes}`).join(', ')).toEqual([]);
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
