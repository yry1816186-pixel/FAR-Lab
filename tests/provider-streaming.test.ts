import { describe, expect, it } from 'vitest';
import type { StructuredCallRequest, StructuredOutputEvent } from '../src/shared/ports.js';
import { runOpenAICompatStructuredCall } from '../src/providers/http.js';

interface HypothesisOut { hypothesis: string }

const parseHypothesis = (raw: unknown): HypothesisOut | Error => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return new Error('object required');
  const hypothesis = (raw as Record<string, unknown>).hypothesis;
  return typeof hypothesis === 'string' && hypothesis.length > 0
    ? { hypothesis }
    : new Error('hypothesis required');
};

const RAW = '{"hypothesis":"流式证据绑定减少无依据结论"}';

const request = (events: StructuredOutputEvent[], signal?: AbortSignal): StructuredCallRequest => ({
  task: 'stream one hypothesis',
  systemPrompt: 'Return JSON.',
  userPayload: { topic: 'streaming' },
  outputKind: 'json',
  purpose: 'provider-stream-test',
  onOutput: (event) => events.push(event),
  ...(signal !== undefined ? { signal } : {}),
});

const dataFrame = (value: unknown): string => `data: ${JSON.stringify(value)}\r\n\r\n`;

/** Real WHATWG response body split across arbitrary UTF-8 boundaries. */
const sseResponse = (frames: string): Response => {
  const bytes = new TextEncoder().encode(frames);
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (let at = 0; at < bytes.length; at += 7) controller.enqueue(bytes.slice(at, at + 7));
      controller.close();
    },
  }), { status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8' } });
};

const rawChunks = (): string[] => RAW.match(/[\s\S]{1,9}/g) ?? [];

describe('structured provider SSE dialects', () => {
  it('OpenAI-compatible: streams answer bytes, retains reasoning separately, and requests usage frames', async () => {
    const events: StructuredOutputEvent[] = [];
    let sentBody: Record<string, unknown> = {};
    const frames = [
      dataFrame({ model: 'qwen-streamed', choices: [{ index: 0, delta: { reasoning_content: '内部推理' }, finish_reason: null }] }),
      ...rawChunks().map((content) => dataFrame({ model: 'qwen-streamed', choices: [{ index: 0, delta: { content }, finish_reason: null }] })),
      dataFrame({ model: 'qwen-streamed', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 4, completion_tokens: 8, total_tokens: 12 } }),
      'data: [DONE]\r\n\r\n',
    ].join('');
    const result = await runOpenAICompatStructuredCall(
      { providerName: 'openai-stream-test', baseUrl: 'https://unit.test/v1', apiKey: 'test-fixture-key-openai-stream', modelId: 'qwen', executionMode: 'test' },
      request(events),
      parseHypothesis,
      {
        fetchImpl: async (_url, init) => {
          sentBody = JSON.parse(String(init.body)) as Record<string, unknown>;
          return sseResponse(frames);
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(result.data?.hypothesis).toContain('证据绑定');
    expect(result.thinking).toBe('内部推理');
    expect(result.receipt.usage.totalTokens).toBe(12);
    expect(events.map((event) => event.type)).toEqual([
      'attempt_started', ...rawChunks().map(() => 'delta'), 'attempt_completed',
    ]);
    expect(events.filter((event) => event.type === 'delta').map((event) => event.text).join('')).toBe(RAW);
    expect(JSON.stringify(events)).not.toContain('内部推理');
    expect(sentBody.stream).toBe(true);
    expect(sentBody.stream_options).toEqual({ include_usage: true });
  });

  it('Anthropic Messages: normalizes text/thinking deltas and terminal usage without mixing channels', async () => {
    const events: StructuredOutputEvent[] = [];
    let sentBody: Record<string, unknown> = {};
    const frames = [
      dataFrame({ type: 'message_start', message: { model: 'glm-streamed', usage: { input_tokens: 5 } } }),
      dataFrame({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: '分析竞争机制' } }),
      ...rawChunks().map((text) => dataFrame({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text } })),
      dataFrame({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 9 } }),
      dataFrame({ type: 'message_stop' }),
    ].join('');
    const result = await runOpenAICompatStructuredCall(
      { providerName: 'anthropic-stream-test', baseUrl: 'https://unit.test/api/anthropic', apiKey: 'test-fixture-key-anthropic-stream', modelId: 'glm', executionMode: 'test', wire: 'anthropic' },
      request(events),
      parseHypothesis,
      {
        fetchImpl: async (_url, init) => {
          sentBody = JSON.parse(String(init.body)) as Record<string, unknown>;
          return sseResponse(frames);
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(result.thinking).toBe('分析竞争机制');
    expect(result.receipt.modelVersion).toBe('glm-streamed');
    expect(result.receipt.usage).toMatchObject({ promptTokens: 5, completionTokens: 9 });
    expect(events.filter((event) => event.type === 'delta').map((event) => event.text).join('')).toBe(RAW);
    expect(JSON.stringify(events)).not.toContain('竞争机制');
    expect(sentBody.stream).toBe(true);
    expect(sentBody.thinking).toEqual({ type: 'disabled' });
  });

  it('Gemini native: keeps thought parts private and streams only answer parts from the native endpoint', async () => {
    const events: StructuredOutputEvent[] = [];
    let requestedUrl = '';
    const frames = [
      dataFrame({ modelVersion: 'gemini-streamed', candidates: [{ content: { parts: [{ text: '内部思考', thought: true }] } }] }),
      ...rawChunks().map((text) => dataFrame({ modelVersion: 'gemini-streamed', candidates: [{ content: { parts: [{ text }] } }] })),
      dataFrame({ modelVersion: 'gemini-streamed', candidates: [{ content: { parts: [] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 6, candidatesTokenCount: 10, totalTokenCount: 16, thoughtsTokenCount: 3 } }),
    ].join('');
    const result = await runOpenAICompatStructuredCall(
      { providerName: 'gemini-stream-test', baseUrl: 'https://generativelanguage.googleapis.com', apiKey: 'test-fixture-key-gemini-stream', modelId: 'gemini-test', executionMode: 'test', wire: 'gemini' },
      request(events),
      parseHypothesis,
      {
        fetchImpl: async (url) => {
          requestedUrl = url;
          return sseResponse(frames);
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(result.thinking).toBe('内部思考');
    expect(result.receipt.usage).toMatchObject({ promptTokens: 6, completionTokens: 10, totalTokens: 16, reasoningTokens: 3 });
    expect(events.filter((event) => event.type === 'delta').map((event) => event.text).join('')).toBe(RAW);
    expect(JSON.stringify(events)).not.toContain('内部思考');
    expect(requestedUrl).toContain('/v1beta/models/gemini-test:streamGenerateContent?alt=sse');
  });

  it('caller abort interrupts but does not discard an already projected prefix', async () => {
    const events: StructuredOutputEvent[] = [];
    const controller = new AbortController();
    const prefix = '{"hypothesis":"已接收前缀';
    const fetchImpl = async (_url: string, init: RequestInit): Promise<Response> => {
      const initial = new TextEncoder().encode(dataFrame({
        model: 'qwen-streamed',
        choices: [{ index: 0, delta: { content: prefix }, finish_reason: null }],
      }));
      return new Response(new ReadableStream<Uint8Array>({
        start(streamController) {
          streamController.enqueue(initial);
          const abort = (): void => {
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            streamController.error(error);
          };
          init.signal?.addEventListener('abort', abort, { once: true });
        },
      }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
    };
    const pending = runOpenAICompatStructuredCall(
      { providerName: 'abort-stream-test', baseUrl: 'https://unit.test/v1', apiKey: 'test-fixture-key-abort-stream', modelId: 'qwen', executionMode: 'test' },
      request(events, controller.signal),
      parseHypothesis,
      { fetchImpl },
    );
    while (!events.some((event) => event.type === 'delta')) await new Promise((resolve) => setTimeout(resolve, 1));
    controller.abort();
    const result = await pending;

    expect(result.ok).toBe(false);
    expect(result.error?.retryable).toBe(false);
    expect(events).toContainEqual({ type: 'attempt_interrupted', reason: 'caller_abort' });
    expect(events.some((event) => event.type === 'attempt_discarded')).toBe(false);
    expect(events.filter((event) => event.type === 'delta').map((event) => event.text).join('')).toBe(prefix);
  });
});
