import { describe, it, expect } from 'vitest';
import { createZaiProvider, ZAI_BASE_URL } from '../src/providers/zai.js';
import type { FetchLike } from '../src/providers/http.js';
import type { StructuredCallRequest, StructuredCallResult } from '../src/shared/ports.js';

/**
 * Anthropic-Messages wire tests for the zai provider (open.bigmodel.cn /api/anthropic,
 * probe-verified 2026-08-22). All fetches are stubbed — no network, fake key only.
 * Assertions cover the WIRE SHAPE (url/headers/body), response parsing incl. the
 * stop_reason→finishReason mapping that feeds the W7-F2 truncation discipline, and
 * the quota-vs-rate classification that must never blindly retry balance errors.
 */

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

const stubFetch = (
  respond: (c: Captured) => { status: number; text: string; headers?: Record<string, string> },
): { fetchImpl: FetchLike; calls: Captured[] } => {
  const calls: Captured[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const captured: Captured = {
      url: String(url),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: JSON.parse(String(init?.body ?? '{}')),
    };
    calls.push(captured);
    const r = respond(captured);
    return {
      status: r.status,
      ok: r.status === 200,
      text: async () => r.text,
      headers: new Map(Object.entries(r.headers ?? {})) as unknown as Headers,
    } as Response;
  };
  return { fetchImpl, calls };
};

const REQ: StructuredCallRequest = {
  task: 'test:probe',
  systemPrompt: 'You reply with JSON only.',
  userPayload: { input: 'value' },
  outputKind: 'json',
  temperature: 0,
  maxTokens: 512,
  purpose: 'test',
};

const parse = (raw: unknown) => (typeof (raw as { ok?: unknown })?.ok === 'boolean' ? (raw as { ok: boolean }) : new Error('bad'));

const okBody = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'glm-4.6',
    content: [{ type: 'text', text: '{"ok":true}' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 11, output_tokens: 7 },
    ...over,
  });

describe('zai provider on the Anthropic Messages wire', () => {
  it('sends the Anthropic wire shape: /v1/messages URL, x-api-key + anthropic-version headers, top-level system, user-only messages, required max_tokens', async () => {
    const { fetchImpl, calls } = stubFetch(() => ({ status: 200, text: okBody() }));
    const provider = createZaiProvider({ apiKey: 'fake-key', fetchImpl, sleep: async () => {} });
    const res = await provider.structuredCall(REQ, parse);
    expect(res.ok).toBe(true);
    expect(calls).toHaveLength(1);
    const c = calls[0]!;
    expect(c.url).toBe(`${ZAI_BASE_URL}/v1/messages`);
    expect(c.url).toContain('open.bigmodel.cn/api/anthropic/v1/messages');
    expect(c.headers['x-api-key']).toBe('fake-key');
    expect(c.headers['anthropic-version']).toBe('2023-06-01');
    expect(c.headers['authorization']).toBeUndefined();
    const body = c.body as Record<string, unknown>;
    expect(body['model']).toBe('glm-4.6');
    expect(body['max_tokens']).toBe(512);
    expect(typeof body['system']).toBe('string');
    expect(String(body['system'])).toContain('You reply with JSON only.');
    const messages = body['messages'] as Array<{ role: string; content: string }>;
    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe('user');
    expect(messages[0]?.content).toContain('"input"');
    // no OpenAI-compat fields on this wire
    expect(body['response_format']).toBeUndefined();
    expect(body['tools']).toBeUndefined();
  });

  it('defaults max_tokens to 4096 when the caller sets none (protocol requires the field)', async () => {
    const { fetchImpl, calls } = stubFetch(() => ({ status: 200, text: okBody() }));
    const provider = createZaiProvider({ apiKey: 'fake-key', fetchImpl, sleep: async () => {} });
    const { maxTokens: _drop, ...reqNoMax } = REQ;
    await provider.structuredCall(reqNoMax as StructuredCallRequest, parse);
    expect((calls[0]?.body as Record<string, unknown>)['max_tokens']).toBe(4096);
  });

  it('maps stop_reason max_tokens -> finishReason length (W7-F2 truncation discipline input) and end_turn -> stop; carries usage', async () => {
    const { fetchImpl } = stubFetch(() => ({ status: 200, text: okBody({ stop_reason: 'max_tokens' }) }));
    const provider = createZaiProvider({ apiKey: 'fake-key', fetchImpl, sleep: async () => {} });
    const res = (await provider.structuredCall(REQ, parse)) as Extract<StructuredCallResult<unknown>, { ok: true }>;
    expect(res.receipt.finishReason).toBe('length');
    expect(res.receipt.usage).toEqual({ promptTokens: 11, completionTokens: 7 });
    expect(res.receipt.modelVersion).toBe('glm-4.6');

    const { fetchImpl: f2 } = stubFetch(() => ({ status: 200, text: okBody({ stop_reason: 'end_turn' }) }));
    const p2 = createZaiProvider({ apiKey: 'fake-key', fetchImpl: f2, sleep: async () => {} });
    const r2 = (await p2.structuredCall(REQ, parse)) as Extract<StructuredCallResult<unknown>, { ok: true }>;
    expect(r2.receipt.finishReason).toBe('stop');
  });

  it('joins multiple text blocks and fails closed on a 200 with no text blocks', async () => {
    const { fetchImpl } = stubFetch(() => ({
      status: 200,
      text: okBody({ content: [{ type: 'text', text: '{"ok":' }, { type: 'text', text: 'true}' }] }),
    }));
    const provider = createZaiProvider({ apiKey: 'fake-key', fetchImpl, sleep: async () => {} });
    const res = await provider.structuredCall(REQ, parse);
    expect(res.ok).toBe(true);

    const { fetchImpl: fBad } = stubFetch(() => ({ status: 200, text: okBody({ content: [] }) }));
    const pBad = createZaiProvider({ apiKey: 'fake-key', fetchImpl: fBad, sleep: async () => {} });
    const rBad = await pBad.structuredCall(REQ, parse);
    expect(rBad.ok).toBe(false);
    if (!rBad.ok) expect(rBad.error.message).toContain('no text content blocks');
  });

  it('classifies 429 with balance text as quota_exceeded (never retried) on this wire', async () => {
    let calls = 0;
    const { fetchImpl } = stubFetch(() => {
      calls += 1;
      return { status: 429, text: JSON.stringify({ type: 'error', error: { type: 'too_many_requests', message: '余额不足或无可用资源包,请充值。' } }) };
    });
    const provider = createZaiProvider({ apiKey: 'fake-key', fetchImpl, sleep: async () => {} });
    const res = await provider.structuredCall(REQ, parse);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.kind).toBe('quota_exceeded');
      expect(res.error.retryable).toBe(false);
    }
    expect(calls).toBe(1); // balance errors are terminal — no retry loop
  });

  it('corrective re-asks append to the last message in place (role alternation preserved; no assistant/system messages injected)', async () => {
    let n = 0;
    const { fetchImpl, calls } = stubFetch(() => {
      n += 1;
      return n === 1 ? { status: 200, text: okBody({ content: [{ type: 'text', text: 'not json' }] }) } : { status: 200, text: okBody() };
    });
    const provider = createZaiProvider({ apiKey: 'fake-key', fetchImpl, sleep: async () => {} });
    const res = await provider.structuredCall(REQ, parse);
    expect(res.ok).toBe(true);
    expect(calls.length).toBe(2);
    const first = (calls[0]?.body as Record<string, unknown>)['messages'] as Array<{ role: string }>;
    const second = (calls[1]?.body as Record<string, unknown>)['messages'] as Array<{ role: string }>;
    expect(second).toHaveLength(first.length); // correction appended in place, no new message
    expect(second.every((m) => m.role === 'user')).toBe(true);
  });
});
