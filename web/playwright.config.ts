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
// One port per concurrent lane: a second session running the suite while
// this one holds 3198 would otherwise (a) reuse a foreign scratch workspace
// and (b) kill this lane's server in its teardown. FARLAB_E2E_PORT isolates
// both (serve-e2e.mjs honors it; CI keeps the default).
const PORT = process.env.FARLAB_E2E_PORT ?? '3198';
const BASE = process.env.FARLAB_E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: BASE,
    // Local: System Edge (no download). CI: default chromium (installed by the
    // workflow); an explicitly empty PLAYWRIGHT_CHANNEL also means "default".
    channel: process.env.CI
      ? undefined
      : (process.env.PLAYWRIGHT_CHANNEL === '' ? undefined : (process.env.PLAYWRIGHT_CHANNEL ?? 'msedge')),
    trace: 'retain-on-failure',
    locale: 'zh-CN',
  },
  webServer: {
    command: 'node ../scripts/serve-e2e.mjs',
    url: `${BASE}/api/v1/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
