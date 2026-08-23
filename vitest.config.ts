import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 60_000,
    pool: 'forks',
    env: {
      // CLI renderer tests assert plain-text output; the vendored picocolors
      // honors NO_COLOR above every other switch, so pinning it here keeps
      // the suite hermetic against CI environments that set CI=true (which
      // would otherwise force colors on and break plain-text assertions).
      NO_COLOR: '1',
    },
  },
});
