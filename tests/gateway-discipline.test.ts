import { describe, it, expect } from 'vitest';
import { remoteTimeoutWrap, truncateOutput, TRUNCATION_MARKER, shellQuote } from '../src/experiment/gateway.js';

/**
 * Wave-S ag2 — remote kill discipline + output truncation (pure-function tier; the
 * container e2e lives in remote-executor tests and is env-gated on a live Docker device).
 */

describe('remoteTimeoutWrap (ag2: remote-side TERM→KILL, no orphaned training)', () => {
  it('wraps the command in coreutils timeout with kill-after escalation', () => {
    const wrapped = remoteTimeoutWrap('python3 /tmp/x/train_eval.py /tmp/x/payload.json', 90_000);
    expect(wrapped).toContain('timeout --signal=TERM --kill-after=5 90 sh -c ');
    expect(wrapped).toContain(shellQuote('python3 /tmp/x/train_eval.py /tmp/x/payload.json'));
  });

  it('sub-second budgets round up to 1s (never a zero/negative timeout)', () => {
    expect(remoteTimeoutWrap('true', 1)).toContain('timeout --signal=TERM --kill-after=5 1 sh -c');
  });

  it('quotes hostile commands safely (single quotes escaped)', () => {
    const wrapped = remoteTimeoutWrap("rm -rf '/tmp/o'brien'", 5_000);
    expect(wrapped).toContain(shellQuote("rm -rf '/tmp/o'brien'"));
    // the escaped quote sequence must appear, proving the inner quote cannot terminate the wrapper
    expect(wrapped.includes(`'\\''`)).toBe(true);
  });
});

describe('truncateOutput (ag2: fixed marker, never silent clipping)', () => {
  it('passes through short output untouched', () => {
    expect(truncateOutput('short', 100)).toBe('short');
  });
  it('caps at the limit and appends the fixed marker', () => {
    const long = 'x'.repeat(250);
    const out = truncateOutput(long, 100);
    expect(out.length).toBe(100 + 1 + TRUNCATION_MARKER.length);
    expect(out.endsWith(TRUNCATION_MARKER)).toBe(true);
  });
});
