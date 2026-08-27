import { defineConfig } from '@playwright/test';

/**
 * HX §19 — browser E2E as a first-class repo capability.
 * Core journey under test: #/ home (judgment queue + studies index) -> #lab/new
 * (question formation, route picker) -> launch -> #study/<id> (Research Map:
 * question/evidence/hypotheses/verdict on one canvas) -> inspector -> back home.
 *
 * The suite runs against a REAL server (root dist + this web build) on an
 * isolated scratch workspace, driving the deterministic OFFLINE model route —
 * no keys, no network, receipts stamped test-mode. System Edge locally
 * (channel) / chromium in CI; no browser download required for local runs.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: process.env.FARLAB_E2E_BASE_URL ?? 'http://127.0.0.1:3198',
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'msedge',
    trace: 'retain-on-failure',
    locale: 'zh-CN',
  },
  webServer: {
    command: 'node ../scripts/serve-e2e.mjs',
    url: 'http://127.0.0.1:3198/api/v1/health',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
