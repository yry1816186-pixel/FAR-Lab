import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp, type App } from '../src/app/composition.js';
import { createApiServer, type ApiServer } from '../src/server/api.js';

/**
 * FA-PRF-03 chaos case #3 (SSE mid-stream drop + reconnect, zero dup / zero loss):
 * the client connection dies mid-turn; reattach through the seq cursor must
 * redeliver everything after the last seen seq exactly once and still land the
 * terminal event + the conversation reply. Driven over the real HTTP server
 * with the repo's own SSE reader (TurnSseReader-equivalent wire parsing).
 */

interface TurnPayload { type: string; [key: string]: unknown }
interface TurnEvent { seq: number; at: string; payload: TurnPayload }

const openServers: Array<{ app: App; api: ApiServer; base: string; dir: string }> = [];

import { afterEach } from 'vitest';
afterEach(async () => {
  while (openServers.length > 0) {
    const s = openServers.pop()!;
    await s.api.stop();
    s.app.close();
    fs.rmSync(s.dir, { recursive: true, force: true });
  }
});

class WireReader {
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private readonly decoder = new TextDecoder();
  private buffer = '';
  readonly events: TurnEvent[] = [];

  constructor(response: Response) {
    if (response.body === null) throw new Error('no body');
    this.reader = response.body.getReader();
  }

  async waitFor(predicate: (event: TurnEvent) => boolean, timeoutMs = 8000): Promise<TurnEvent> {
    const existing = this.events.find(predicate);
    if (existing !== undefined) return existing;
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('timed out waiting for conversation SSE event');
      const next = await this.readOnce(remaining);
      if (next.done) throw new Error('conversation SSE ended before the expected event');
      this.consume(next.value);
      const found = this.events.find(predicate);
      if (found !== undefined) return found;
    }
  }

  async readToEnd(timeoutMs = 8000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('SSE read timeout');
      const next = await this.readOnce(remaining);
      if (next.done) return;
      this.consume(next.value);
    }
  }

  cancel(): Promise<void> { return this.reader.cancel(); }

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
      if (data.length > 0) this.events.push(JSON.parse(data) as TurnEvent);
      boundary = this.buffer.indexOf('\n\n');
    }
  }
}

describe('SSE mid-stream drop + reconnect (FA-PRF-03 chaos)', () => {
  it('client drop mid-turn: seq-cursor reconnect loses nothing, duplicates nothing, terminal lands', async () => {
    const useTool = JSON.stringify({ action: 'use_tool', tool: 'list_runs', args: { limit: 5 }, reason: '先看工作区' });
    const reply = '断线重连零丢失验证回复。';
    const finish = JSON.stringify({ action: 'finish', reason: 'done', result: { reply, clarifyingQuestions: [], candidates: [], readyToConverge: false } });
    const frame = (delta: Record<string, unknown>, finishReason: string | null = null): string =>
      `data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', model: 'm', choices: [{ index: 0, delta, finish_reason: finishReason }] })}\r\n\r\n`;
    const wire = (raw: string): string =>
      (raw.match(/[\s\S]{1,13}/g) ?? []).map((content) => frame({ content })).join('')
      + `data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', model: 'm', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 9, completion_tokens: 6, total_tokens: 15 } })}\r\n\r\ndata: [DONE]\r\n\r\n`;

    // model call 1 (use_tool) streams slowly enough to drop the client mid-flight;
    // call 2 (finish) releases only after the reconnect has attached.
    let releaseSecondCall!: () => void;
    const secondCallGate = new Promise<void>((resolve) => { releaseSecondCall = resolve; });
    const slowStream = (raw: string, chunkDelayMs: number): Response => {
      const wireText = wire(raw);
      const bytes = new TextEncoder().encode(wireText);
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          let at = 0;
          const tick = (): void => {
            if (at >= bytes.length) { controller.close(); return; }
            controller.enqueue(bytes.slice(at, at + 14));
            at += 14;
            setTimeout(tick, chunkDelayMs);
          };
          setTimeout(tick, 60);
        },
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8' } });
    };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-reconnect-'));
    const { createDashScopeProvider } = await import('../src/providers/dashscope.js');
    let call = 0;
    const provider = createDashScopeProvider({
      apiKey: 'test-fixture-key-reconnect',
      sleep: async () => {},
      fetchImpl: async () => {
        call += 1;
        return call === 1 ? slowStream(useTool, 40) : secondCallGate.then(() => slowStream(finish, 10));
      },
    });
    const app = await createApp({ dataDir: dir, providerOverride: provider });
    const api = createApiServer(app, { port: 0, executor: (runId) => Promise.resolve(app.store.getRun(runId)), staticRoot: path.join(dir, 'no-web') });
    const base = `http://127.0.0.1:${await api.start()}`;
    openServers.push({ app, api, base, dir });

    const conv = await fetch(`${base}/api/v1/conversations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '重连混沌' }) }).then((r) => r.json() as Promise<{ conversation: { id: string } }>);
    const conversationId = conv.conversation.id;

    const first = await fetch(`${base}/api/v1/conversations/${conversationId}/messages/stream`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '开始，然后用工具看看。' }),
    });
    expect(first.status).toBe(200);
    const reader1 = new WireReader(first);
    const seenWorking = await reader1.waitFor((e) => e.payload.type === 'phase' && e.payload.phase === 'working');
    const lastSeq = seenWorking.seq;
    await reader1.cancel(); // CLIENT DROP mid-stream

    // reconnect through the seq cursor while the turn is still running
    const second = await fetch(`${base}/api/v1/conversations/${conversationId}/turns/active/stream?afterSeq=${lastSeq}`);
    expect(second.status).toBe(200);
    const reader2 = new WireReader(second);
    releaseSecondCall(); // let the finish call proceed now that we are attached
    const completed = await reader2.waitFor((e) => e.payload.type === 'completed' || e.payload.type === 'failed');
    expect(completed.payload.type).toBe('completed');
    await reader2.readToEnd();

    const seqs = [...reader1.events, ...reader2.events].map((e) => e.seq);
    expect(new Set(seqs).size).toBe(seqs.length); // zero duplicates across the drop
    expect(reader2.events.map((e) => e.seq)).toEqual(reader2.events.map((e) => e.seq).sort((a, b) => a - b));
    expect(reader2.events.every((e) => e.seq > lastSeq)).toBe(true); // cursor honored: nothing replayed from before
    expect(seqs.length).toBeGreaterThan(4);

    const finalConv = await fetch(`${base}/api/v1/conversations/${conversationId}`).then((r) => r.json() as Promise<{ conversation: { messages: Array<{ role: string; content: string }> } }>);
    expect(finalConv.conversation.messages.some((m) => m.role === 'agent' && m.content === reply)).toBe(true);
  });
});
