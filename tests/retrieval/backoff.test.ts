/**
 * tests/retrieval/backoff.test.ts — pure backoff helpers (directive §7):
 * RFC 9110 dual-format Retry-After parsing, AWS full-jitter formula bounds,
 * transient-status classification, and the X-RateLimit budget tracker.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseRetryAfterMs,
  computeBackoffDelayMs,
  isTransientRetrievalStatus,
  RateBudgetTracker,
  BACKOFF_DEFAULTS,
} from '../../src/retrieval/backoff.ts';

describe('parseRetryAfterMs (RFC 9110 §10.2.3 dual format)', () => {
  it('parses delay-seconds', () => {
    assert.equal(parseRetryAfterMs('120'), 120_000);
    assert.equal(parseRetryAfterMs('0'), 0);
  });

  it('parses HTTP-date into a delta from now (RFC example date)', () => {
    const fixedNow = Date.parse('1999-12-31T23:59:00Z');
    const now = () => fixedNow;
    const delta = parseRetryAfterMs('Fri, 31 Dec 1999 23:59:59 GMT', now);
    assert.equal(delta, 59_000);
  });

  it('clamps past HTTP-dates to 0 (never a negative wait)', () => {
    const delta = parseRetryAfterMs('Fri, 31 Dec 1999 23:59:59 GMT', () =>
      Date.parse('2026-08-15T00:00:00Z'),
    );
    assert.equal(delta, 0);
  });

  it('returns null for absent/invalid values (callers fall back to jitter)', () => {
    assert.equal(parseRetryAfterMs(null), null);
    assert.equal(parseRetryAfterMs(undefined), null);
    assert.equal(parseRetryAfterMs('  '), null);
    assert.equal(parseRetryAfterMs('soon'), null);
  });
});

describe('computeBackoffDelayMs (AWS full jitter)', () => {
  it('delay = random() × min(cap, base × 2^attempt) — exact at fixed random', () => {
    assert.equal(computeBackoffDelayMs(0, {}, () => 0.5), 500); // 0.5 × min(8000, 1000)
    assert.equal(computeBackoffDelayMs(2, {}, () => 1), 4000); // 1 × min(8000, 4000)
    assert.equal(computeBackoffDelayMs(5, {}, () => 1), 8000); // capped
  });

  it('stays within [0, min(cap, base×2^attempt)) for many random draws', () => {
    for (let i = 0; i < 200; i += 1) {
      const r = i / 200;
      const d = computeBackoffDelayMs(1, {}, () => r);
      assert.ok(d >= 0 && d < 2000, `delay ${d} out of [0,2000) at r=${r}`);
    }
  });

  it('defaults: 3 retries / 1000ms base / 8000ms cap', () => {
    assert.deepEqual(BACKOFF_DEFAULTS, { maxRetries: 3, baseDelayMs: 1000, capMs: 8000 });
  });
});

describe('isTransientRetrievalStatus', () => {
  it('retries throttling + upstream transients, never permanent errors', () => {
    assert.equal(isTransientRetrievalStatus(429), true);
    assert.equal(isTransientRetrievalStatus(503), true);
    assert.equal(isTransientRetrievalStatus(504), true);
    assert.equal(isTransientRetrievalStatus(400), false);
    assert.equal(isTransientRetrievalStatus(401), false);
    assert.equal(isTransientRetrievalStatus(403), false);
    assert.equal(isTransientRetrievalStatus(404), false);
  });
});

describe('RateBudgetTracker (OpenAlex X-RateLimit-* model)', () => {
  const headersOf = (entries: Record<string, string>): Headers =>
    new Headers(entries);

  it('tracks remaining from response headers and flags exhaustion at the floor', () => {
    const t = new RateBudgetTracker(50);
    t.updateFromHeaders('api.openalex.org', headersOf({ 'x-ratelimit-remaining': '100' }));
    assert.equal(t.isExhausted('api.openalex.org'), false);
    t.updateFromHeaders('api.openalex.org', headersOf({ 'x-ratelimit-remaining': '50' }));
    assert.equal(t.isExhausted('api.openalex.org'), true); // at floor = exhausted
    assert.equal(t.getRemaining('api.openalex.org'), 50);
  });

  it('computes the reset delay from x-ratelimit-reset seconds', () => {
    const t = new RateBudgetTracker();
    const nowMs = Date.now();
    t.updateFromHeaders('api.openalex.org', headersOf({ 'x-ratelimit-reset': '84544' }));
    const delay = t.getResetDelayMs('api.openalex.org', () => nowMs);
    assert.ok(delay !== null && Math.abs(delay - 84_544_000) < 5, `reset delay ~84544000ms, got ${delay}`);
  });

  it('sources that do not report budgets never block', () => {
    const t = new RateBudgetTracker();
    t.updateFromHeaders('export.arxiv.org', headersOf({ 'content-type': 'text/plain' }));
    assert.equal(t.getRemaining('export.arxiv.org'), null);
    assert.equal(t.isExhausted('export.arxiv.org'), false);
  });

  it('ignores malformed header values (never blocks on garbage)', () => {
    const t = new RateBudgetTracker();
    t.updateFromHeaders('api.openalex.org', headersOf({ 'x-ratelimit-remaining': 'many' }));
    assert.equal(t.getRemaining('api.openalex.org'), null);
    assert.equal(t.isExhausted('api.openalex.org'), false);
  });
});
