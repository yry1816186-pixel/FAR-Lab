import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 60_000,
    pool: 'forks',
    env: {
      // Product default is 600 ms per-provider pacing (http.ts); the suite
      // exercises pacing through its own dedicated tests with injected clocks,
      // so the default here is an explicit off to keep unrelated provider
      // tests from inheriting real 600 ms waits between back-to-back calls.
      FARLAB_MIN_CALL_INTERVAL_MS: '0',
      // CLI renderer tests assert plain-text output; the vendored picocolors
      // honors NO_COLOR above every other switch, so pinning it here keeps
      // the suite hermetic against CI environments that set CI=true (which
      // would otherwise force colors on and break plain-text assertions).
      NO_COLOR: '1',
      // Automated tests are an allowed consumer of the in-process test double
      // (see src/app/provider-resolver.ts); the vitest process must carry the
      // same gate key scripts/serve-e2e.mjs sets for the browser E2E harness.
      FARLAB_TEST_DOUBLE: '1',
    },
  },
});
