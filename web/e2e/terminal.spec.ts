import { expect, test } from '@playwright/test';

/**
 * Extensibility lane E2E — the integrated terminal surface, driven end-to-end
 * through the REAL server (real login-shell session, real SSE stream, real
 * stdin input). The marker command runs `node` on the machine executing the
 * suite (same requirement as the root vitest shell tests). No PTY claims:
 * this exercises the line-based command workflow the UI documents.
 */

test('terminal: create a session, run a real command, see its output, kill it', async ({ page }) => {
  await page.goto('/#/');

  // Rail entry (zh default locale per config) → the terminal surface region.
  await page.locator('nav.app-rail').getByRole('button', { name: '终端' }).click();
  const surface = page.getByRole('region', { name: '集成终端' });
  await expect(surface).toBeVisible();
  // The honest no-PTY disclosure is visible (never a fake terminal).
  await expect(surface.getByText(/vim\/htop/)).toBeVisible();

  // Create a session — a REAL login shell spawns server-side.
  await surface.getByRole('button', { name: /新建会话/ }).click();
  const input = surface.getByRole('textbox', { name: '终端输入' });
  await expect(input).toBeEnabled({ timeout: 30_000 });

  // Run a real command and wait for its output through the SSE stream.
  await input.fill('node -e "console.log(\'e2e-term-marker\')"');
  await input.press('Enter');
  await expect(surface.locator('.term-pre')).toContainText('e2e-term-marker', { timeout: 45_000 });

  // Kill the session — the tab flips to the exited state.
  await surface.getByRole('button', { name: '结束会话' }).click();
  await expect(surface.locator('.term-tab', { hasText: '已退出' })).toBeVisible({ timeout: 30_000 });
});
