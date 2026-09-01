import { defineConfig, devices } from '@playwright/test';

/**
 * HX §19 — browser E2E as a first-class repo capability.
 * Core journey under test: #/ home (judgment queue + studies index) -> #lab/new
 * (question formation, route picker) -> launch -> #study/<id> (Research Map:
 * question/evidence/hypotheses/verdict on one canvas) -> inspector -> back home.
 *
 * The suite runs against a REAL server (root dist + this web build) on an
 * isolated scratch workspace, driving the deterministic OFFLINE model route —
 * no keys, no network, receipts stamped test-mode.
 *
 * Three explicit projects: the System-Edge channel trick is chromium-only
 * (firefox/webkit reject any channel), so it lives on the chromium project
 * alone and `--project=firefox` works out of the box locally. CI selects with
 * --project; running plain `npx playwright test` covers all three.
 */
// One port per concurrent lane: a second session running the suite while
// this one holds 3198 would otherwise (a) reuse a foreign scratch workspace
// and (b) kill this lane's server in its teardown. FARLAB_E2E_PORT isolates
// both (serve-e2e.mjs honors it; CI keeps the default).
const PORT = process.env.FARLAB_E2E_PORT ?? '3198';
const BASE = process.env.FARLAB_E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

// Local chromium: System Edge (no download). CI: the chromium the workflow
// installs; an explicitly empty PLAYWRIGHT_CHANNEL also means "default".
const chromiumChannel = process.env.CI
  ? undefined
  : (process.env.PLAYWRIGHT_CHANNEL === '' ? undefined : (process.env.PLAYWRIGHT_CHANNEL ?? 'msedge'));

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  // 1 retry everywhere: the perf-vitals specs measure wall-clock paint times and
  // a locally loaded machine (parallel builds/servers) can push a healthy app
  // past budget on one draw; a real regression fails twice (CI already had 1).
  retries: 1,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
    locale: 'zh-CN',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: chromiumChannel },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'node ../scripts/serve-e2e.mjs',
    url: `${BASE}/api/v1/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
