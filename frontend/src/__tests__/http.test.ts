/**
 * http boundary tests — the single fetch layer: URL composition, the error
 * taxonomy (HTTP / TIMEOUT / NETWORK_ERROR / schema drift), envelope parsing,
 * and idempotency-key determinism.
 */

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ApiError, buildApiUrl, fetchJson, fnvIdempotencyKey, parseV1Response, parseV2Response } from '@/shared/api/http.ts';
import { stubFetch } from './helpers.tsx';

describe('buildApiUrl', () => {
  it('composes same-origin relative URLs by default', () => {
    expect(buildApiUrl('/api/v1/verdict')).toBe('/api/v1/verdict');
  });

  it('appends extra params', () => {
    expect(buildApiUrl('/api/v1/verdict', { limit: '5', offset: '10' })).toBe('/api/v1/verdict?limit=5&offset=10');
  });
});

describe('ApiError', () => {
  it('parses an RFC 7807 problem body', () => {
    const err = ApiError.tryParse(503, JSON.stringify({
      error_code: 'court_live_profile_unavailable',
      message: 'live profile unavailable',
      source_anchor: { fileId: null, stageId: null, callRecordId: null },
      detail: { guidance: 'Set FAR_LLM_API_KEY and retry.' },
    }));
    expect(err).not.toBeNull();
    expect(err?.httpStatus).toBe(503);
    expect(err?.errorCode).toBe('court_live_profile_unavailable');
    expect(err?.guidance()).toBe('Set FAR_LLM_API_KEY and retry.');
  });

  it('returns null for non-JSON bodies', () => {
    expect(ApiError.tryParse(500, 'Internal Server Error')).toBeNull();
  });

  it('guidance() is null when detail carries none', () => {
    expect(new ApiError(500, 'x', 'Y').guidance()).toBeNull();
  });
});

describe('envelope parsing', () => {
  it('parseV1Response unwraps data', () => {
    expect(parseV1Response<{ a: number }>({ ok: true, data: { a: 1 } }, 'GET /x').a).toBe(1);
  });

  it('parseV1Response rejects a missing success envelope', () => {
    expect(() => parseV1Response({ ok: false }, 'GET /x')).toThrowError(ApiError);
    try {
      parseV1Response({ data: 1 }, 'GET /x');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).errorCode).toBe('RESPONSE_SCHEMA_MISMATCH');
    }
  });

  it('parseV2Response decodes with the zod contract', () => {
    const schema = z.object({ n: z.number() });
    expect(parseV2Response(schema, { ok: true, data: { n: 2 } }, 'GET /y').n).toBe(2);
  });

  it('parseV2Response turns schema drift into a loud mismatch error', () => {
    const schema = z.object({ n: z.number() });
    try {
      parseV2Response(schema, { ok: true, data: { n: 'two' } }, 'GET /y');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).errorCode).toBe('RESPONSE_SCHEMA_MISMATCH');
      expect((e as ApiError).message).toContain('n');
    }
  });
});

describe('fnvIdempotencyKey', () => {
  it('is deterministic for identical inputs', () => {
    expect(fnvIdempotencyKey(['a', 'b'], 'v1')).toBe(fnvIdempotencyKey(['a', 'b'], 'v1'));
  });

  it('changes when any input part changes', () => {
    expect(fnvIdempotencyKey(['a', 'b'], 'v1')).not.toBe(fnvIdempotencyKey(['a', 'c'], 'v1'));
  });

  it('carries the prefix', () => {
    expect(fnvIdempotencyKey(['x'], 'v1').startsWith('v1-')).toBe(true);
  });
});

describe('fetchJson error taxonomy', () => {
  it('returns parsed JSON on success', async () => {
    stubFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await expect(fetchJson<{ ok: boolean }>('/x')).resolves.toEqual({ ok: true });
  });

  it('maps an HTTP problem body to ApiError with status and code', async () => {
    stubFetch(() => new Response(
      JSON.stringify({
        error_code: 'arena_live_profile_unavailable',
        message: 'no key',
        source_anchor: { fileId: null, stageId: null, callRecordId: null },
        detail: { guidance: 'configure a key' },
      }),
      { status: 503 },
    ));
    try {
      await fetchJson('/api/v1/arena');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).httpStatus).toBe(503);
      expect((e as ApiError).errorCode).toBe('arena_live_profile_unavailable');
      expect((e as ApiError).guidance()).toBe('configure a key');
    }
  });

  it('classifies a pre-response failure as NETWORK_ERROR', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    try {
      await fetchJson('/x');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).errorCode).toBe('NETWORK_ERROR');
      expect((e as ApiError).httpStatus).toBe(0);
    }
  });

  it('classifies an abort without an external signal as TIMEOUT', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new DOMException('aborted', 'AbortError'))));
    try {
      await fetchJson('/x');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).errorCode).toBe('TIMEOUT');
    }
  });

  it('honours an externally aborted signal as cancellation, not error', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new DOMException('aborted', 'AbortError'))));
    await expect(fetchJson('/x', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
