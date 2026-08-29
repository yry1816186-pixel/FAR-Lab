import { expect, test, type Locator } from '@playwright/test';

/**
 * Extensibility lane E2E — the GLOBAL terminal panel, driven end-to-end
 * through the REAL server (real login-shell sessions, real SSE streams, real
 * stdin input). The marker command runs `node` on the machine executing the
 * suite (same requirement as the root vitest shell tests). No PTY claims:
 * this exercises the line-based command workflow the UI documents.
 *
 * Markers are built at runtime (`['e2e','term','a'].join('-')`) so the literal
 * marker never appears in the typed command: the client ECHOES the line it
 * sends, and an assertion satisfied by that echo would prove nothing.
 */

const print = (marker: string): string => `node -e "console.log(['${marker.split('-').join("','")}'].join('-'))"`;

/**
 * The e2e server is shared (and re-used between runs), so sessions really do
 * survive a reload — which is the behavior under test. Clear them through the
 * UI first so this file's counts are deterministic instead of inherited.
 */
const clearSessions = async (panel: Locator): Promise<void> => {
  for (let i = 0; i < 8; i += 1) {
    const kill = panel.getByRole('button', { name: '结束会话' });
    if (await kill.count() === 0) break;
    await kill.first().click();
  }
  await expect(panel.getByRole('button', { name: '结束会话' })).toHaveCount(0, { timeout: 30_000 });
  for (let i = 0; i < 8; i += 1) {
    const dismiss = panel.getByRole('button', { name: '关闭标签页' });
    if (await dismiss.count() === 0) break;
    await dismiss.first().click();
  }
  await expect(panel.locator('.term-session-tab')).toHaveCount(0, { timeout: 30_000 });
};

test('terminal: toggle the global panel, run a real command, kill the session', async ({ page }) => {
  await page.goto('/#/');

  // The terminal is SHELL chrome (IDE convention), not a rail destination:
  // the rail must NOT carry it, and the status bar must.
  await expect(page.locator('nav.app-rail').getByRole('button', { name: '终端' })).toHaveCount(0);

  await page.locator('footer.status-bar').getByRole('button', { name: /终端/ }).click();
  const panel = page.getByRole('region', { name: '集成终端' });
  await expect(panel).toBeVisible();
  // The honest no-PTY disclosure is visible (never a fake terminal).
  await expect(panel.getByText(/vim\/htop/)).toBeVisible();
  await clearSessions(panel);

  // Create a session — a REAL login shell spawns server-side. The header "+"
  // and the empty-state button share the label by design (both create a real
  // session); the first one is the panel action.
  await panel.getByRole('button', { name: '新建会话' }).first().click();
  const input = panel.getByRole('textbox', { name: '终端输入' });
  await expect(input).toBeEnabled({ timeout: 30_000 });

  // Run a real command and wait for its output through the SSE stream.
  await input.fill(print('e2e-term-marker'));
  await input.press('Enter');
  await expect(panel.locator('.term-pre')).toContainText('e2e-term-marker', { timeout: 45_000 });

  // Kill the session — the tab flips to the exited state.
  await panel.getByRole('button', { name: '结束会话' }).click();
  await expect(panel.locator('.term-session-tab', { hasText: '已退出' })).toBeVisible({ timeout: 30_000 });
});

test('terminal: multiple sessions run side by side and survive navigation', async ({ page }) => {
  await page.goto('/#/');

  // Ctrl+` — the IDE-standard toggle — opens the panel from anywhere.
  await page.keyboard.press('Control+`');
  const panel = page.getByRole('region', { name: '集成终端' });
  await expect(panel).toBeVisible();
  // Start from a known state: this suite shares one server, so leftovers are
  // real sessions (they survive reloads — the point of the panel).
  await clearSessions(panel);

  const input = panel.getByRole('textbox', { name: '终端输入' });
  await panel.getByRole('button', { name: '新建会话' }).first().click();
  await expect(input).toBeEnabled({ timeout: 30_000 });
  await input.fill(print('e2e-term-a'));
  await input.press('Enter');
  await expect(panel.locator('.term-pre')).toContainText('e2e-term-a', { timeout: 45_000 });

  // Second session: Ctrl+Shift+` (new terminal) — both tabs must stay. It is
  // pressed right after a send, which is exactly the interleaving that used to
  // drop the request on the shared in-flight flag.
  await page.keyboard.press('Control+Shift+`');
  await expect(panel.locator('.term-session-tab')).toHaveCount(2, { timeout: 30_000 });
  await expect(panel.locator('.term-pre')).not.toContainText('e2e-term-a', { timeout: 5_000 });
  await input.fill(print('e2e-term-b'));
  await input.press('Enter');
  await expect(panel.locator('.term-pre')).toContainText('e2e-term-b', { timeout: 45_000 });

  // Switching back shows the FIRST transcript: a background session kept
  // streaming into its own buffer (not just the visible one).
  await panel.locator('.term-session-tab').first().click();
  await expect(panel.locator('.term-pre')).toContainText('e2e-term-a', { timeout: 30_000 });

  // Reloading / navigating does not kill the panel or its sessions — the
  // server-side ring replays the transcript into the re-mounted panel.
  await page.goto('/#library');
  await expect(page.getByRole('region', { name: '集成终端' })).toBeVisible();
  await expect(page.locator('.term-session-tab')).toHaveCount(2, { timeout: 30_000 });
  await page.locator('.term-session-tab').first().click();
  await expect(page.locator('.term-pre')).toContainText('e2e-term-a', { timeout: 30_000 });
});
