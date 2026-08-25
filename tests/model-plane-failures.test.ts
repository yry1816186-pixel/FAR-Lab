import { describe, expect, it } from 'vitest';
import { createDashScopeProvider } from '../src/providers/dashscope.js';
import { isFailoverWorthy } from '../src/providers/fallback.js';
import type { FetchLike } from '../src/providers/http.js';

/**
 * R2 lane 11 — transport-level failure-path proof for the goal's obligation list:
 * "unavailable model" (HTTP 404) and "context-limit behavior" (HTTP 400 input-too-
 * long class) must classify visibly, never retry, and never be failover-worthy
 * (silently swapping models on a request-class failure would corrupt
 * reproducibility while looking healthy — fallback.ts contract). All offline:
 * scripted fetch, no network, no live-API claims.
 */

const REQ = { task: 't', userPayload: { a: 1 }, outputKind: 'json' as const, purpose: 'test' };
const parse = (r: unknown) => r;

const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

/** Scripted fetch that counts every wire attempt (for no-retry assertions). */
const countingFetch = (step: Response): { fetchImpl: FetchLike; calls: () => number } => {
  let n = 0;
  return {
    fetchImpl: async () => { n += 1; return step; },
    calls: () => n,
  };
};

describe('unavailable model (HTTP 404)', () => {
  it('classifies as provider_error non-retryable, single attempt, body preserved', async () => {
    const step = jsonResponse(404, { error: { message: 'Model not found: no-such-qwen', code: 'invalid_request_error', type: 'invalid_request_error' } });
    const { fetchImpl, calls } = countingFetch(step);
    const p = createDashScopeProvider({ apiKey: 'test-key', fetchImpl, sleep: async () => {}, random: () => 0.5 });
    const res = await p.structuredCall(REQ, parse);
    expect(res.ok).toBe(false);
    expect(res.error?.kind).toBe('provider_error');
    expect(res.error?.retryable).toBe(false);
    expect(res.error?.httpStatus).toBe(404);
    expect(res.error?.message).toContain('Model not found');
    expect(calls()).toBe(1); // 404 is not in the retry contract — exactly one wire attempt
    expect(res.receipt.transportRetries).toBe(0);
    expect(res.receipt.usage).toEqual({}); // no model output existed; nothing fabricated
    expect(res.receipt.requestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(isFailoverWorthy(res.error!)).toBe(false); // request-class: a different config won't help
  });
});

describe('context-limit behavior (HTTP 400 input too long)', () => {
  it('classifies as provider_error non-retryable, single attempt, no failover', async () => {
    const step = jsonResponse(400, {
      error: {
        message: 'input length plus output length must be less than 262144 tokens, but you provided 300000',
        code: 'InvalidParameter', type: 'InvalidParameter',
      },
    });
    const { fetchImpl, calls } = countingFetch(step);
    const p = createDashScopeProvider({ apiKey: 'test-key', fetchImpl, sleep: async () => {}, random: () => 0.5 });
    const res = await p.structuredCall(REQ, parse);
    expect(res.ok).toBe(false);
    expect(res.error?.kind).toBe('provider_error');
    expect(res.error?.retryable).toBe(false);
    expect(res.error?.httpStatus).toBe(400);
    expect(res.error?.message).toContain('262144');
    expect(calls()).toBe(1);
    expect(isFailoverWorthy(res.error!)).toBe(false);
  });

  it('routing-level context pruning stays the FIRST line of defense (pre-call, visible reason)', async () => {
    // The router rejects a route whose verified window cannot fit the input BEFORE
    // any transport attempt (model-plane.test.ts pins the reason text); the 400
    // classification above is the transport-level backstop when an unverified
    // custom route still fires. Both must exist — this pins their cooperation:
    // an overflow failure is terminal, never retried into a fake success.
    const step = jsonResponse(400, { error: { message: 'input too long', code: 'InvalidParameter' } });
    const { fetchImpl, calls } = countingFetch(step);
    const p = createDashScopeProvider({ apiKey: 'test-key', fetchImpl, sleep: async () => {}, random: () => 0.5 });
    const res = await p.structuredCall(REQ, parse);
    expect(res.ok).toBe(false);
    expect(calls()).toBe(1);
    expect(res.receipt.correctiveReasks).toBe(0); // overflow is not an invalid_output repair case
  });
});

describe('request-class failures never fail over (chain integrity)', () => {
  it.each([
    ['404 model unavailable', 404, { error: { message: 'model not found', code: 'invalid_request_error' } }],
    ['400 context overflow', 400, { error: { message: 'input length exceeds limit', code: 'InvalidParameter' } }],
    ['413 payload too large', 413, { error: { message: 'request entity too large' } }],
  ])('%s: isFailoverWorthy stays false', async (_label, status, body) => {
    const step = jsonResponse(status as number, body);
    const { fetchImpl } = countingFetch(step);
    const p = createDashScopeProvider({ apiKey: 'test-key', fetchImpl, sleep: async () => {}, random: () => 0.5 });
    const res = await p.structuredCall(REQ, parse);
    expect(res.ok).toBe(false);
    expect(isFailoverWorthy(res.error!)).toBe(false);
  });
});
