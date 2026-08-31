import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp, type App } from '../src/app/composition.js';
import { ConversationSchema, type Conversation } from '../src/domain/index.js';
import { createDashScopeProvider } from '../src/providers/dashscope.js';
import { createApiServer, type ApiServer } from '../src/server/api.js';

interface TurnPayload {
  type: string;
  [key: string]: unknown;
}

interface TurnEvent {
  seq: number;
  at: string;
  payload: TurnPayload;
}

interface OpenServer {
  app: App;
  api: ApiServer;
  base: string;
  dir: string;
}

const openServers: OpenServer[] = [];

afterEach(async () => {
  while (openServers.length > 0) {
    const server = openServers.pop()!;
    await server.api.stop();
    server.app.close();
    fs.rmSync(server.dir, { recursive: true, force: true });
  }
});

const openApi = async (fetchImpl: (url: string, init: RequestInit) => Promise<Response>): Promise<OpenServer> => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-conversation-stream-'));
  const provider = createDashScopeProvider({
    apiKey: 'test-fixture-key-conversation-stream',
    fetchImpl,
    sleep: async () => {},
  });
  const app = await createApp({ dataDir: dir, providerOverride: provider });
  const api = createApiServer(app, {
    port: 0,
    executor: (runId) => Promise.resolve(app.store.getRun(runId)),
    staticRoot: path.join(dir, 'no-web-dist'),
  });
  const base = `http://127.0.0.1:${await api.start()}`;
  const opened = { app, api, base, dir };
  openServers.push(opened);
  return opened;
};

const postJson = async (base: string, route: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> => {
  const response = await fetch(`${base}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
};

const getConversation = async (base: string, id: string): Promise<Conversation> => {
  const response = await fetch(`${base}/api/v1/conversations/${id}`);
  const body = await response.json() as { conversation: unknown };
  return ConversationSchema.parse(body.conversation);
};

const createConversation = async (base: string): Promise<string> => {
  const created = await postJson(base, '/api/v1/conversations', { title: '流式会话回归' });
  expect(created.status).toBe(201);
  return (created.body.conversation as { id: string }).id;
};

const openAiFrame = (delta: Record<string, unknown>, finishReason: string | null = null): string =>
  `data: ${JSON.stringify({
    id: 'chatcmpl-stream-test',
    object: 'chat.completion.chunk',
    model: 'qwen-plus',
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })}\r\n\r\n`;

const finishFrame = (): string =>
  `data: ${JSON.stringify({
    id: 'chatcmpl-stream-test',
    object: 'chat.completion.chunk',
    model: 'qwen-plus',
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 7, total_tokens: 17 },
  })}\r\n\r\ndata: [DONE]\r\n\r\n`;

const bytesResponse = (wire: string, delayMs = 0): Response => {
  const bytes = new TextEncoder().encode(wire);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const publish = (): void => {
        // Deliberately split arbitrary UTF-8 bytes, including inside CJK codepoints.
        for (let at = 0; at < bytes.length; at += 11) controller.enqueue(bytes.slice(at, at + 11));
        controller.close();
      };
      if (delayMs > 0) setTimeout(publish, delayMs);
      else publish();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8' } });
};

const completedResponse = (raw: string, opts: { thinking?: string; delayMs?: number } = {}): Response => {
  const answerChunks = raw.match(/[\s\S]{1,13}/g) ?? [];
  const wire = [
    ...(opts.thinking !== undefined ? [openAiFrame({ reasoning_content: opts.thinking })] : []),
    ...answerChunks.map((content) => openAiFrame({ content })),
    finishFrame(),
  ].join('');
  return bytesResponse(wire, opts.delayMs ?? 0);
};

const interruptedResponse = (rawPrefix: string, signal?: AbortSignal): Response => {
  const initial = new TextEncoder().encode(
    (rawPrefix.match(/[\s\S]{1,11}/g) ?? []).map((content) => openAiFrame({ content })).join(''),
  );
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(initial);
      const abort = (): void => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        controller.error(error);
      };
      if (signal?.aborted === true) abort();
      else signal?.addEventListener('abort', abort, { once: true });
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8' } });
};

const queuedFetch = (
  responders: Array<(init: RequestInit) => Response | Promise<Response>>,
  requestBodies: Array<Record<string, unknown>> = [],
): ((url: string, init: RequestInit) => Promise<Response>) =>
  async (_url, init) => {
    const responder = responders.shift();
    if (responder === undefined) throw new Error('test fetch queue exhausted');
    requestBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
    return responder(init);
  };

class TurnSseReader {
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private readonly decoder = new TextDecoder();
  private buffer = '';
  private rawText = '';
  private readonly parsed: TurnEvent[] = [];

  constructor(response: Response) {
    if (response.body === null) throw new Error('SSE response has no body');
    this.reader = response.body.getReader();
  }

  events(): readonly TurnEvent[] { return this.parsed; }
  raw(): string { return this.rawText; }
  lastSeq(): number { return this.parsed.at(-1)?.seq ?? 0; }

  async waitFor(predicate: (event: TurnEvent) => boolean, timeoutMs = 5_000): Promise<TurnEvent> {
    const existing = this.parsed.find(predicate);
    if (existing !== undefined) return existing;
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('timed out waiting for conversation SSE event');
      const next = await this.readOnce(remaining);
      if (next.done) throw new Error('conversation SSE ended before the expected event');
      this.consume(next.value);
      const found = this.parsed.find(predicate);
      if (found !== undefined) return found;
    }
  }

  async readToEnd(timeoutMs = 5_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('timed out waiting for conversation SSE end');
      const next = await this.readOnce(remaining);
      if (next.done) {
        this.consume(undefined, true);
        return;
      }
      this.consume(next.value);
    }
  }

  async cancel(): Promise<void> { await this.reader.cancel(); }

  private readOnce(timeoutMs: number): Promise<ReadableStreamReadResult<Uint8Array>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SSE read timeout')), timeoutMs);
      void this.reader.read().then(
        (value) => { clearTimeout(timer); resolve(value); },
        (error: unknown) => { clearTimeout(timer); reject(error); },
      );
    });
  }

  private consume(chunk?: Uint8Array, done = false): void {
    const text = this.decoder.decode(chunk, { stream: !done });
    this.rawText += text;
    this.buffer += text;
    let boundary = this.buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const frame = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      const data = frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n');
      if (data.length > 0) this.parsed.push(JSON.parse(data) as TurnEvent);
      boundary = this.buffer.indexOf('\n\n');
    }
  }
}

const waitUntil = async (predicate: () => boolean, timeoutMs = 5_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('condition did not become true in time');
};

const finishAction = (reply: string): string => JSON.stringify({
  action: 'finish',
  reason: 'scripted streaming finish',
  result: { reply, clarifyingQuestions: [], candidates: [], readyToConverge: false },
});

describe('conversation turn HTTP/SSE production path', () => {
  it('streams only the schema-projected reply, then lands tools, thinking and the authoritative conversation', async () => {
    const useTool = JSON.stringify({ action: 'use_tool', tool: 'list_runs', args: { limit: 5 }, reason: 'private raw tool action' });
    const reply = '流式回复完整落地。';
    const finish = finishAction(reply);
    const bodies: Array<Record<string, unknown>> = [];
    const server = await openApi(queuedFetch([
      () => completedResponse(useTool, { thinking: '内部推理不得作为增量事件泄漏。' }),
      () => completedResponse(finish),
    ], bodies));
    const conversationId = await createConversation(server.base);

    const response = await fetch(`${server.base}/api/v1/conversations/${conversationId}/messages/stream`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '检查工作区后回答。' }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const stream = new TurnSseReader(response);
    await stream.readToEnd();

    const events = stream.events();
    expect(events.at(0)?.payload.type).toBe('accepted');
    expect(events.some((event) => event.payload.type === 'tool' && event.payload.tool === 'list_runs')).toBe(true);
    expect(events.filter((event) => event.payload.type === 'reply_delta').map((event) => String(event.payload.text)).join('')).toBe(reply);
    const completed = events.find((event) => event.payload.type === 'completed');
    expect(completed).toBeDefined();
    const conversation = ConversationSchema.parse(completed?.payload.conversation);
    const agentMessage = conversation.messages.at(-1);
    expect(agentMessage?.role).toBe('agent');
    expect(agentMessage?.content).toContain(reply);
    expect(agentMessage?.thinking).toContain('内部推理');
    expect(agentMessage?.toolTrace?.some((trace) => trace.tool === 'list_runs')).toBe(true);

    const incremental = JSON.stringify(events.filter((event) => event.payload.type !== 'completed'));
    expect(incremental).not.toContain('内部推理不得作为增量事件泄漏');
    expect(incremental).not.toContain('private raw tool action');
    expect(incremental).not.toContain('"args":{"limit":5}');
    expect(stream.raw()).not.toContain(useTool);
    expect(bodies).toHaveLength(2);
    expect(bodies.every((body) => body.stream === true)).toBe(true);
  });

  it('keeps paid work alive after a socket disconnect and replays strictly after Last-Event-ID', async () => {
    const reply = '断线后仍由服务端完成。';
    const server = await openApi(queuedFetch([
      () => completedResponse(finishAction(reply), { delayMs: 100 }),
    ]));
    const conversationId = await createConversation(server.base);
    const response = await fetch(`${server.base}/api/v1/conversations/${conversationId}/messages/stream`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '开始后我会断开。' }),
    });
    const first = new TurnSseReader(response);
    await first.waitFor((event) => event.payload.type === 'accepted');
    const cursor = first.lastSeq();
    await first.cancel();

    await waitUntil(() => server.app.store.getObject('conversation', conversationId)?.messages.some((message) => message.role === 'agent') === true);
    const replayResponse = await fetch(`${server.base}/api/v1/conversations/${conversationId}/turns/active/stream`, {
      headers: { 'Last-Event-ID': String(cursor) },
    });
    expect(replayResponse.status).toBe(200);
    const replay = new TurnSseReader(replayResponse);
    await replay.readToEnd();
    expect(replay.events().every((event) => event.seq > cursor)).toBe(true);
    const completed = replay.events().find((event) => event.payload.type === 'completed');
    expect(completed).toBeDefined();
    expect(JSON.stringify(completed?.payload)).toContain(reply);
  });

  it('rejects a concurrent start, preserves a cancelled prefix, and replaces rather than concatenates it on retry', async () => {
    const oldPrefix = '第一次尝试的有效前缀';
    const newPrefix = '第二次尝试的新前缀';
    const oldWire = `{"action":"finish","reason":"cancel one","result":{"reply":"${oldPrefix}`;
    const newWire = `{"action":"finish","reason":"cancel two","result":{"reply":"${newPrefix}`;
    const server = await openApi(queuedFetch([
      (init) => interruptedResponse(oldWire, init.signal),
      (init) => interruptedResponse(newWire, init.signal),
    ]));
    const conversationId = await createConversation(server.base);
    const firstResponse = await fetch(`${server.base}/api/v1/conversations/${conversationId}/messages/stream`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '请生成一个可取消回复。' }),
    });
    const first = new TurnSseReader(firstResponse);
    await first.waitFor((event) => event.payload.type === 'reply_delta');

    const concurrent = await postJson(server.base, `/api/v1/conversations/${conversationId}/messages/stream`, { text: '不得并发落库。' });
    expect(concurrent.status).toBe(409);
    expect((concurrent.body.error as { code: string }).code).toBe('turn_in_flight');
    const cancel = await postJson(server.base, `/api/v1/conversations/${conversationId}/turns/active/cancel`, {});
    expect(cancel.status).toBe(202);
    expect(cancel.body.requested).toBe(true);
    await first.readToEnd();
    const cancelled = first.events().find((event) => event.payload.type === 'cancelled');
    expect(cancelled?.payload.preservedReply).toBe(oldPrefix);

    const afterFirst = await getConversation(server.base, conversationId);
    const researcher = afterFirst.messages.at(-1);
    expect(researcher?.role).toBe('researcher');
    expect(researcher?.replyDraft).toBe(oldPrefix);
    const retryResponse = await fetch(
      `${server.base}/api/v1/conversations/${conversationId}/messages/${researcher?.id ?? ''}/retry/stream`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
    );
    expect(retryResponse.status).toBe(200);
    const retry = new TurnSseReader(retryResponse);
    await retry.waitFor(() => retry.events()
      .filter((event) => event.payload.type === 'reply_delta')
      .map((event) => String(event.payload.text))
      .join('') === newPrefix);
    const duringRetry = await getConversation(server.base, conversationId);
    const throttledDraft = duringRetry.messages.at(-1)?.replyDraft ?? '';
    expect(throttledDraft.length).toBeGreaterThan(0);
    expect(newPrefix.startsWith(throttledDraft)).toBe(true);
    expect(throttledDraft).not.toContain(oldPrefix);

    await postJson(server.base, `/api/v1/conversations/${conversationId}/turns/active/cancel`, {});
    await retry.readToEnd();
    const retryCancelled = retry.events().find((event) => event.payload.type === 'cancelled');
    expect(retryCancelled?.payload.preservedReply).toBe(newPrefix);
    const finalSnapshot = ConversationSchema.parse(retryCancelled?.payload.conversation);
    expect(finalSnapshot.messages.at(-1)?.replyDraft).toBe(newPrefix);
  });
});
