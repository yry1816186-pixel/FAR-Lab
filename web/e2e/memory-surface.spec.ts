import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * FA-HAR-06 memory-management surface e2e (offline deterministic route): a
 * completed study leaves consolidated memory items, so #memory has real rows
 * without any live route. Exercises the real HTTP surface in a real browser:
 * list + filters + expand, and one REAL audited archive through the two-step
 * armed dialog (the mutation lands in the scratch workspace's store).
 */

const QUESTION = 'Does moderate caffeine intake affect cognitive performance in healthy adults?';

async function provisionStudy(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/v1/runs', { data: { text: QUESTION } });
  expect(res.ok()).toBeTruthy();
  const { runId } = await res.json() as { runId: string };
  await expect
    .poll(async () => {
      try {
        return (await (await request.get(`/api/v1/runs/${runId}`)).json() as { status?: string }).status ?? 'no-status';
      } catch { return 'conn-error'; }
    }, { timeout: 120_000 })
    .toBe('completed');
  return runId;
}

test('memory surface: consolidated rows render, filters work, archive is a real audited mutation', async ({ page, request }) => {
  test.setTimeout(180_000);
  await provisionStudy(request);

  await page.goto('/#memory');
  await expect(page.locator('.lab-title')).toBeVisible({ timeout: 30_000 });
  // the rail marks the memory surface active
  const activeRail = page.locator('.app-rail .rail-nav-item.is-active');
  await expect(activeRail).toBeVisible();
  await expect(activeRail).toContainText('记忆');

  // consolidated memory from the completed run: at least one row renders
  const rows = page.locator('.mem-title-button');
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });
  const rowCount = await rows.count();
  expect(rowCount).toBeGreaterThanOrEqual(1);

  // expand shows the trust/provenance detail block
  await rows.first().click();
  await expect(page.locator('.mem-detail').first()).toBeVisible();

  // export link points at the real attachment route
  const exportHref = await page.locator('a[download="farlab-memory.json"]').getAttribute('href');
  expect(exportHref).toBe('/api/v1/memory/export');

  // status filter: archived starts empty, filters to the honest empty view
  await page.locator('.mem-chip', { hasText: '已归档' }).click();
  await expect(rows).toHaveCount(0);
  await page.locator('.mem-chip', { hasText: '全部' }).click();
  await expect(rows.first()).toBeVisible();

  // one REAL archive: two-step armed dialog, reason required both client and server side
  const firstRowTitle = await rows.first().textContent();
  expect(firstRowTitle).not.toBeNull();
  await page.locator('.mem-row-actions .btn--danger').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  // arm button first — the reason field only appears armed
  await page.getByRole('button', { name: '我要归档' }).click();
  // reason is required: confirm stays disabled until text is present
  const confirm = page.getByRole('button', { name: '确认归档' });
  await expect(confirm).toBeDisabled();
  await page.locator('.mem-field textarea').fill('e2e: stale consolidated item');
  await expect(confirm).toBeEnabled();
  await confirm.click();
  // the surface reloads honestly; the archived chip now shows exactly one row
  await expect(page.locator('.mem-chip', { hasText: '已归档' })).toBeVisible();
  await page.locator('.mem-chip', { hasText: '已归档' }).click();
  await expect(rows).toHaveCount(1);
});

test('memory export serves a parseable attachment over real HTTP', async ({ request }) => {
  const res = await request.get('/api/v1/memory/export');
  expect(res.ok()).toBeTruthy();
  expect(res.headers()['content-type']).toContain('application/json');
  const body = await res.json() as { items: unknown[]; cap: number };
  expect(Array.isArray(body.items)).toBe(true);
  expect(body.cap).toBe(500);
});
