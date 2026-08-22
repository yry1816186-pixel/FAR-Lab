import { describe, it, expect } from 'vitest';
import { createGlmAnthropicProvider, tolerantParse } from '../eval/glm-anthropic-provider.mjs';

/** Minimal Response-like for the injected fetchImpl seam (no network in tests). */
const jsonResponse = (status: number, body: unknown): { status: number; text: () => Promise<string> } => ({
  status,
  text: async () => JSON.stringify(body),
});

const okBody = (text: string) => ({
  content: [{ type: 'text', text }],
  usage: { input_tokens: 10, output_tokens: 5 },
  model: 'glm-5.3',
});

const REQ = {
  task: 'score the hypothesis',
  systemPrompt: 'You are a judge.',
  userPayload: { hypothesis: 'x', claims: [] },
  purpose: 'judge',
  maxTokens: 100,
  temperature: 0,
};

const VALIDATE_OK = (v: unknown) => (v && typeof v === 'object' && 'score' in v ? v : new Error('missing score'));

describe('tolerantParse (judge-route tolerance layer)', () => {
  it('parses clean JSON directly', () => {
    expect(tolerantParse('{"score": 3}')).toEqual({ ok: true, value: { score: 3 } });
  });

  it('brace-slices JSON embedded in prose', () => {
    expect(tolerantParse('Here you go: {"score": 4} — hope that helps')).toEqual({ ok: true, value: { score: 4 } });
  });

  it('repairs trailing commas inside the sliced object', () => {
    expect(tolerantParse('{"score": 3,}')).toEqual({ ok: true, value: { score: 3 } });
  });

  it('fails visibly (never fabricates) when no JSON object is present', () => {
    const res = tolerantParse('no json here at all');
    expect(res.ok).toBe(false);
  });
});

describe('createGlmAnthropicProvider (injected fetch, zero network)', () => {
  it('fail-closed auth when no key is configured', async () => {
    const p = createGlmAnthropicProvider({ apiKey: '', fetchImpl: (async () => jsonResponse(200, okBody('x'))) as never });
    expect(p.liveReady).toBe(false);
    const res = await p.structuredCall(REQ as never, VALIDATE_OK as never);
    expect(res.ok).toBe(false);
  });

  it('happy path: 200 + valid JSON -> data + receipt with usage', async () => {
    const p = createGlmAnthropicProvider({ apiKey: 'k', fetchImpl: (async () => jsonResponse(200, okBody('{"score": 4}'))) as never });
    const res = await p.structuredCall(REQ as never, VALIDATE_OK as never);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual({ score: 4 });
      expect(res.receipt.modelId).toBe('glm-5.3');
      expect(res.receipt.modelVersion).toBe('glm-5.3');
      expect(res.receipt.usage.promptTokens).toBe(10);
    }
  });

  it('transport retry: 429 then 200 recovers (bounded, no fabrication)', async () => {
    let calls = 0;
    const p = createGlmAnthropicProvider({
      apiKey: 'k',
      fetchImpl: (async () => {
        calls += 1;
        return calls === 1 ? jsonResponse(429, { error: { message: 'rate' } }) : jsonResponse(200, okBody('{"score": 2}'));
      }) as never,
    });
    const res = await p.structuredCall(REQ as never, VALIDATE_OK as never);
    expect(res.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it('non-retryable HTTP error returns fail-visible immediately (no retry storm)', async () => {
    let calls = 0;
    const p = createGlmAnthropicProvider({
      apiKey: 'k',
      fetchImpl: (async () => {
        calls += 1;
        return jsonResponse(401, { error: { type: 'authentication', message: 'bad key' } });
      }) as never,
    });
    const res = await p.structuredCall(REQ as never, VALIDATE_OK as never);
    expect(res.ok).toBe(false);
    expect(calls).toBe(1);
  });

  it('corrective re-ask: schema-invalid first answer is corrected once, receipt records it', async () => {
    const seen: Array<{ role: string; content: string }> = [];
    let call = 0;
    const p = createGlmAnthropicProvider({
      apiKey: 'k',
      fetchImpl: (async (_url: string, init: { body: string }) => {
        call += 1;
        for (const m of JSON.parse(init.body).messages as Array<{ role: string; content: string }>) seen.push({ role: m.role, content: m.content.slice(0, 40) });
        return call === 1
          ? jsonResponse(200, okBody('{"wrong": 1}'))
          : jsonResponse(200, okBody('{"score": 5}'));
      }) as never,
    });
    const res = await p.structuredCall(REQ as never, VALIDATE_OK as never);
    expect(res.ok).toBe(true);
    // the second request carried the invalid assistant answer + the correction instruction
    expect(seen.some((m) => m.role === 'assistant')).toBe(true);
    expect(seen.some((m) => m.role === 'user' && m.content.startsWith('Your previous JSON was invalid'))).toBe(true);
  });

  it('validation failure on every attempt -> fail-visible, never a fabricated score', async () => {
    const p = createGlmAnthropicProvider({
      apiKey: 'k',
      fetchImpl: (async () => jsonResponse(200, okBody('{"nope": 1}'))) as never,
    });
    const res = await p.structuredCall(REQ as never, VALIDATE_OK as never);
    expect(res.ok).toBe(false);
  });
});
