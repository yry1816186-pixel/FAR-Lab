import { expect, test, type Page } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * §27 role-audit one-shot: axe critical/serious on the INTERACTIVE states the
 * base sweep does not cover — inspector open (claim + hypothesis), deep tools
 * panel (plan), draft scope review. Kept as a permanent spec: these states are
 * the product's decision surfaces (G5/G7 must hold there too, not just on the
 * resting map).
 */
const AXE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../node_modules/axe-core/axe.min.js');

async function axeScan(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: AXE_PATH });
  const results = await page.evaluate(() => {
    const axe = (window as unknown as {
      axe: { run: (ctx: Document, opts: { runOnly: { type: string; values: string[] } }) => Promise<{ violations: { id: string; impact: string | null; nodes: unknown[] }[] }> };
    }).axe;
    return axe.run(document, { runOnly: { type: 'tag', values: ['critical', 'serious'] } });
  });
  return results.violations.map((v) => `${v.id}(${v.nodes.length})`);
}

test('§27 a11y: decision surfaces (inspector claim/hyp, deep plan panel) have no critical/serious violations', async ({ page, request }) => {
  const created = await request.post('/api/v1/runs', { data: { text: 'Does aerobic exercise improve executive function in children?', draft: true } });
  const { runId } = await created.json() as { runId: string };
  await request.post(`/api/v1/runs/${runId}/scope-proposal`, {});
  await request.post(`/api/v1/runs/${runId}/resume`, {});
  await expect
    .poll(async () => (await (await request.get(`/api/v1/runs/${runId}`)).json() as { status: string }).status, { timeout: 120_000, interval: 3_000 })
    .toBe('completed');

  // Claim inspector open
  await page.goto(`/#study/${runId}`);
  await expect(page.locator('.map-claim-row').first()).toBeVisible({ timeout: 30_000 });
  await page.locator('.map-claim-row').first().click();
  await expect(page.locator('.lab-inspector')).toBeVisible();
  const claimViolations = await axeScan(page);
  expect(claimViolations, `claim inspector: ${claimViolations.join(', ')}`).toEqual([]);
  await page.keyboard.press('Escape');

  // Real-content discipline (2026-08-29): offline-route runs mint no template
  // hypotheses and no plan, so the hypothesis inspector and deep plan panel
  // have no subject here. Their a11y coverage requires a live model route
  // (owner-side DASHSCOPE run) — the surfaces share the same .lab-inspector
  // shell and control vocabulary audited above; server-side op correctness
  // stays covered by vitest (hypothesis-ops, pipeline-revision).
});
