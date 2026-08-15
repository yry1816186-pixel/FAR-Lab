/**
 * tests/retrieval/http_hardening.test.ts — the hardened HTTP layer (R1/R2/R3):
 * structured errors, Retry-After-aware backoff, budget guard, persistent
 * cache replay (idempotent retrievedAt), per-host serialization + interval,
 * and polite UA. All network access is stubbed; waits are injected fakes.
 *
 * Cache isolation: every test points FAR_RETRIEVAL_CACHE_DIR at a throwaway
 * dir — the default `.far/cache/retrieval` must never receive stub bodies
 * (they would poison future live runs).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  fetchTextFromAllowlistedHost,
  RetrievalHttpError,
  resetRetrievalHttpDefaultsForTests,
  HOST_MIN_INTERVAL_MS,
} from '../../src/retrieval/http.ts';

const OPENALEX_URL = 'https://api.openalex.org/works?search=test';

type FetchCall = { readonly url: string; readonly init: RequestInit };

/** Stub globalThis.fetch with a scripted sequence of Responses (or throwers). */
function fakeFetch(script: ReadonlyArray<Response | Error>): FetchCall[] {
  const calls: FetchCall[] = [];
  const queue = [...script];
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = queue.shift();
    if (next instanceof Error) throw next;
    if (next === undefined) throw new Error('unexpected extra fetch call');
    return next;
  }) as typeof globalThis.fetch;
  return calls;
}

const okResponse = (body = '{"results":[]}', headers: Record<string, string> = {}) =>
  new Response(body, { status: 200, headers });
const statusResponse = (status: number, headers: Record<string, string> = {}, body = '') =>
  new Response(body, { status, headers });
const noSleep = async (): Promise<void> => {};

describe('fetchTextFromAllowlistedHost (hardened R1/R2/R3)', () => {
  let scratchDir: string;

  beforeEach(() => {
    scratchDir = mkdtempSync(join(tmpdir(), 'far-retrieval-http-'));
    process.env.FAR_RETRIEVAL_CACHE_DIR = scratchDir;
    resetRetrievalHttpDefaultsForTests();
  });

  afterEach(() => {
    delete process.env.FAR_RETRIEVAL_CACHE_DIR;
    delete process.env.FAR_RETRIEVAL_CACHE;
    delete process.env.OPENALEX_MAILTO;
    rmSync(scratchDir, { recursive: true, force: true });
  });

  describe('structured errors + backoff', () => {
    it('non-2xx throws a structured RetrievalHttpError (message keeps the legacy substring)', async () => {
      const calls = fakeFetch([statusResponse(429)]);
      await assert.rejects(
        () => fetchTextFromAllowlistedHost(OPENALEX_URL, {}, 1000, { maxRetries: 0, sleep: noSleep }),
        (err: unknown) => {
          assert.ok(err instanceof RetrievalHttpError);
          assert.equal(err.status, 429);
          assert.equal(err.kind, 'http-status');
          assert.match(err.message, /non-2xx status 429 from /);
          return true;
        },
      );
      assert.equal(calls.length, 1);
    });

    it('429 retries with Retry-After (RFC delay-seconds) then succeeds', async () => {
      const waits: number[] = [];
      const calls = fakeFetch([
        statusResponse(429, { 'retry-after': '1' }),
        okResponse('{"ok":true}'),
      ]);
      const result = await fetchTextFromAllowlistedHost(OPENALEX_URL, {}, 1000, {
        maxRetries: 2,
        sleep: async (ms) => {
          waits.push(ms);
        },
      });
      assert.equal(result.body, '{"ok":true}');
      assert.notEqual(result.cacheHit, true);
      assert.deepEqual(waits, [1000], 'Retry-After=1s must be honored exactly');
      assert.equal(calls.length, 2);
    });

    it('full-jitter local backoff when no Retry-After is present', async () => {
      const waits: number[] = [];
      fakeFetch([statusResponse(503), okResponse()]);
      await fetchTextFromAllowlistedHost(OPENALEX_URL, {}, 1000, {
        sleep: async (ms) => {
          waits.push(ms);
        },
        random: () => 0.5,
      });
      assert.equal(waits.length, 1);
      assert.equal(waits[0], 500, 'jitter 0.5 × min(8000, 1000×2^0) = 500');
    });

    it('server-demanded wait beyond the stall ceiling surfaces instead of sleeping', async () => {
      const waits: number[] = [];
      fakeFetch([statusResponse(429, { 'retry-after': '3600' })]);
      await assert.rejects(
        () =>
          fetchTextFromAllowlistedHost(OPENALEX_URL, {}, 1000, {
            sleep: async (ms) => {
              waits.push(ms);
            },
          }),
        (err: unknown) => {
          assert.ok(err instanceof RetrievalHttpError);
          assert.equal(err.status, 429);
          assert.equal(err.retryAfterMs, 3_600_000);
          return true;
        },
      );
      assert.deepEqual(waits, [], 'no sleep for a 1-hour server wait');
    });

    it('permanent status (404) never retries', async () => {
      const calls = fakeFetch([statusResponse(404)]);
      await assert.rejects(
        () => fetchTextFromAllowlistedHost(OPENALEX_URL, {}, 1000, { sleep: noSleep }),
        (err: unknown) => {
          assert.ok(err instanceof RetrievalHttpError);
          assert.equal(err.status, 404);
          return true;
        },
      );
      assert.equal(calls.length, 1, 'permanent errors are single-shot');
    });

    it('network errors are structured (kind=network, legacy message) and retried', async () => {
      fakeFetch([
        new TypeError('fetch failed'),
        new TypeError('fetch failed'),
        new TypeError('fetch failed'),
        new TypeError('fetch failed'),
      ]);
      await assert.rejects(
        () => fetchTextFromAllowlistedHost(OPENALEX_URL, {}, 1000, { sleep: noSleep }),
        (err: unknown) => {
          assert.ok(err instanceof RetrievalHttpError);
          assert.equal(err.kind, 'network');
          assert.equal(err.status, 0);
          assert.match(err.message, /fetch failed for /);
          return true;
        },
      );
    });

    it('budget guard: X-RateLimit-Remaining at floor refuses the NEXT request locally', async () => {
      const calls = fakeFetch([
        okResponse('{"results":[]}', { 'x-ratelimit-remaining': '50', 'x-ratelimit-reset': '84544' }),
      ]);
      const first = await fetchTextFromAllowlistedHost(OPENALEX_URL, {}, 1000, { sleep: noSleep });
      assert.equal(first.status, 200);
      await assert.rejects(
        () => fetchTextFromAllowlistedHost(`${OPENALEX_URL}&page=2`, {}, 1000, { sleep: noSleep }),
        (err: unknown) => {
          assert.ok(err instanceof RetrievalHttpError);
          assert.equal(err.kind, 'budget');
          assert.equal(err.status, 429);
          assert.equal(err.rateLimitRemaining, 50);
          return true;
        },
      );
      assert.equal(calls.length, 1, 'the doomed request must not hit the network');
    });
  });

  describe('persistent cache (R2)', () => {
    it('second identical request is served from cache with the ORIGINAL retrievedAt', async () => {
      const calls = fakeFetch([okResponse('{"body":"v1"}')]);
      const first = await fetchTextFromAllowlistedHost(OPENALEX_URL, {}, 1000, { sleep: noSleep });
      assert.notEqual(first.cacheHit, true);
      const firstRetrievedAt = first.retrievedAt ?? '';

      const second = await fetchTextFromAllowlistedHost(OPENALEX_URL, {}, 1000, { sleep: noSleep });
      assert.equal(second.cacheHit, true);
      assert.equal(second.body, '{"body":"v1"}');
      assert.equal(second.retrievedAt, firstRetrievedAt, 'replay must reuse the recorded timestamp');
      assert.equal(calls.length, 1, 'the cached request must not refetch');

      // Exactly one envelope on disk, keyed by sha256(url) (no user text in path).
      const files = readdirSync(scratchDir);
      assert.equal(files.length, 1);
      assert.match(files[0]!, /^[0-9a-f]{64}\.json$/);
      const envelope = JSON.parse(readFileSync(join(scratchDir, files[0]!), 'utf8')) as { url: string };
      assert.equal(envelope.url, OPENALEX_URL);
    });

    it('FAR_RETRIEVAL_CACHE=0 disables the cache entirely', async () => {
      process.env.FAR_RETRIEVAL_CACHE = '0';
      resetRetrievalHttpDefaultsForTests();
      const calls = fakeFetch([okResponse('a'), okResponse('a')]);
      await fetchTextFromAllowlistedHost(OPENALEX_URL, {}, 1000, { sleep: noSleep });
      const second = await fetchTextFromAllowlistedHost(OPENALEX_URL, {}, 1000, { sleep: noSleep });
      assert.notEqual(second.cacheHit, true);
      assert.equal(calls.length, 2);
    });

    it('expired envelopes (TTL) are misses, not stale serves', async () => {
      const calls = fakeFetch([okResponse('fresh')]);
      await fetchTextFromAllowlistedHost(OPENALEX_URL, {}, 1000, { sleep: noSleep });
      // Rewind storedAt by rewriting the envelope with a 2-day-old timestamp
      // (OpenAlex TTL = 24h → expired).
      const files = readdirSync(scratchDir);
      const path = join(scratchDir, files[0]!);
      const envelope = JSON.parse(readFileSync(path, 'utf8')) as { storedAt: string };
      const stale = new Date(Date.parse(envelope.storedAt) - 2 * 24 * 60 * 60 * 1000).toISOString();
      const { writeFileSync } = await import('node:fs');
      writeFileSync(path, JSON.stringify({ ...envelope, storedAt: stale }), 'utf8');
      calls.push(...fakeFetch([okResponse('refetched')])); // fakeFetch re-stubs; queue=[refetched]
      const result = await fetchTextFromAllowlistedHost(OPENALEX_URL, {}, 1000, { sleep: noSleep });
      assert.notEqual(result.cacheHit, true);
      assert.equal(result.body, 'refetched');
    });
  });

  describe('serialization + politeness (R1/R3)', () => {
    it('concurrent requests to one host never overlap and honor the min interval', async () => {
      let inFlight = 0;
      let maxInFlight = 0;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 10));
        inFlight -= 1;
        return okResponse('{"x":1}');
      }) as typeof globalThis.fetch;
      try {
        const t0 = performance.now();
        await Promise.all([
          fetchTextFromAllowlistedHost(`${OPENALEX_URL}&a=1`, {}, 5000, { sleep: noSleep }),
          fetchTextFromAllowlistedHost(`${OPENALEX_URL}&a=2`, {}, 5000, { sleep: noSleep }),
        ]);
        const elapsed = performance.now() - t0;
        assert.equal(maxInFlight, 1, 'per-host requests must be fully serialized');
        assert.ok(
          elapsed >= HOST_MIN_INTERVAL_MS['api.openalex.org']! - 10,
          `elapsed ${elapsed.toFixed(1)}ms must be ≥ ~${HOST_MIN_INTERVAL_MS['api.openalex.org']}ms`,
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('arXiv interval is 3000ms (official TOU: 1 request / 3 seconds)', () => {
      assert.equal(HOST_MIN_INTERVAL_MS['export.arxiv.org'], 3000);
    });

    it('User-Agent carries the configured mailto contact (polite pool)', async () => {
      process.env.OPENALEX_MAILTO = 'research@example.org';
      resetRetrievalHttpDefaultsForTests();
      const calls = fakeFetch([okResponse()]);
      await fetchTextFromAllowlistedHost(OPENALEX_URL, {}, 1000, { sleep: noSleep });
      const headers = calls[0]!.init.headers as Record<string, string>;
      assert.match(headers['User-Agent']!, /mailto:research@example\.org/);
    });
  });
});
