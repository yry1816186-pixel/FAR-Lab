import { execFileSync } from 'node:child_process';

/**
 * Honest environment gate for suites that drive the REAL python sidecar via uv
 * (experiment-runtime). These tests are meaningless without a provisioned uv +
 * locked project env; on machines without them they fail with confusing 120s
 * timeouts, so the suites skip with an explicit reason instead (same discipline
 * as the dockerReady() guard in gateway.test.ts).
 *
 * Cached at module level: detection spawns one `uv --version` per process.
 */
let cached: boolean | null = null;

export const uvAvailable = (): boolean => {
  if (cached !== null) return cached;
  try {
    execFileSync('uv', ['--version'], { stdio: ['ignore', 'ignore', 'ignore'] });
    cached = true;
  } catch {
    cached = false;
  }
  return cached;
};

export const UV_SKIP_REASON =
  'uv toolchain not available — provision uv (https://docs.astral.sh/uv/) and run `uv sync` in experiment-runtime to enable real-sidecar suites';
