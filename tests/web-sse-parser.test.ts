import { describe, expect, it } from 'vitest';
import { consumeSse } from '../web/src/api/conversationStream';
import { ApiError } from '../web/src/api/client';

/** SSE wire bytes split at ARBITRARY boundaries (mid-JSON, mid-CJK-codepoint). */
const responseOver = (chunks: string[]): Response => {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
};

const frame = (payload: unknown): string =>
  `seq-frame\n` + `data: ${JSON.stringify(payload)}\n\n`;

describe('web SSE wire parser (FA-PRF-03 partial-SSE chaos)', () => {
  it('delivers every event when frames are split mid-JSON and inside CJK codepoints', async () => {
    const wire = [
      frame({ seq: 1, at: 't', payload: { type: 'accepted' } }),
      frame({ seq: 2, at: 't', payload: { type: 'reply_delta', text: '中文字符跨块切割' } }),
      frame({ seq: 3, at: 't', payload: { type: 'reply_delta', text: 'tail' } }),
    ].join('');
    // 1-byte chunks: every possible tear boundary, including inside multibyte chars.
    const chunks = wire.match(/[\s\S]/gu) ?? [];
    const seen: number[] = [];
    const { lastSeq, terminal } = await consumeSse(responseOver(chunks), 0, {
      onEvent: (event) => { seen.push(event.seq); },
    });
    expect(seen).toEqual([1, 2, 3]);
    expect(lastSeq).toBe(3);
    expect(terminal).toBeNull();
  });

  it('dedups by seq cursor: replayed events at or below afterSeq are dropped', async () => {
    const wire = [
      frame({ seq: 1, at: 't', payload: { type: 'reply_delta', text: 'old' } }),
      frame({ seq: 4, at: 't', payload: { type: 'reply_delta', text: 'new' } }),
    ].join('');
    const seen: string[] = [];
    const { lastSeq } = await consumeSse(responseOver([wire]), 1, {
      onEvent: (event) => { seen.push((event.payload as { text: string }).text); },
    });
    expect(seen).toEqual(['new']);
    expect(lastSeq).toBe(4);
  });

  it('fails visibly on a complete-but-malformed frame (never fabricates an event)', async () => {
    const wire = `data: {seq: 7, not json\n\n`;
    await expect(consumeSse(responseOver([wire]), 0, { onEvent: () => {} })).rejects.toMatchObject({
      code: 'stream_malformed',
      retryable: true,
    });
    expect(ApiError).toBeDefined();
  });

  it('detects the terminal completed payload', async () => {
    const wire = [
      frame({ seq: 5, at: 't', payload: { type: 'reply_delta', text: 'x' } }),
      frame({ seq: 6, at: 't', payload: { type: 'completed', conversation: { id: 'c1' } } }),
    ].join('');
    const { terminal, lastSeq } = await consumeSse(responseOver([wire]), 0, { onEvent: () => {} });
    expect(terminal).toMatchObject({ status: 'completed' });
    expect(lastSeq).toBe(6);
  });
});
