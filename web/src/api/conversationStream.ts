import { ApiError } from './client';
import type { Conversation } from './types';

export type ConversationPublicProgress =
  | { type: 'accepted' }
  | { type: 'steered'; text: string }
  | { type: 'phase'; phase: 'starting' | 'working' | 'using_tools' | 'composing' | 'retrying'; turn?: number }
  | { type: 'tool'; tool: string; ok: boolean; summary?: string; durationMs: number }
  | { type: 'reply_reset' }
  | { type: 'reply_delta'; text: string }
  | { type: 'completed'; conversation: Conversation }
  | { type: 'cancelled'; conversation: Conversation | null; preservedReply: string }
  | { type: 'failed'; error: { code: string; message: string; retryable: boolean }; conversation: Conversation | null; preservedReply: string };

export interface ConversationStreamEvent {
  seq: number;
  at: string;
  payload: ConversationPublicProgress;
}

export type ConversationStreamConnection = 'connecting' | 'live' | 'reconnecting';

export interface ConversationStreamHandlers {
  onEvent: (event: ConversationStreamEvent) => void;
  onConnection?: (state: ConversationStreamConnection) => void;
}

export type ConversationTurnStart =
  | { kind: 'message'; input: { text: string; seeds?: unknown } }
  | { kind: 'retry'; messageId: string };

export type ConversationTurnStreamResult =
  | { status: 'completed'; conversation: Conversation }
  | { status: 'cancelled'; conversation: Conversation | null; preservedReply: string }
  | { status: 'failed'; conversation: Conversation | null; preservedReply: string; error: { code: string; message: string; retryable: boolean } };

const BASE = '/api/v1';

const responseError = async (response: Response, path: string): Promise<ApiError> => {
  let code = `http_${response.status}`;
  let message = `${response.status} ${response.statusText || 'HTTP error'} — ${path}`;
  let retryable = response.status >= 500;
  try {
    const body = await response.json() as { error?: { code?: unknown; message?: unknown; retryable?: unknown } };
    if (typeof body.error?.code === 'string') code = body.error.code;
    if (typeof body.error?.message === 'string') message = body.error.message;
    if (typeof body.error?.retryable === 'boolean') retryable = body.error.retryable;
  } catch { /* keep status-derived failure */ }
  return new ApiError({ code, message, status: response.status, retryable });
};

const waitForReconnect = (signal: AbortSignal, attempt: number): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('aborted', 'AbortError')); return; }
    const timer = window.setTimeout(resolve, Math.min(2_000, 250 * (2 ** Math.min(attempt, 3))));
    signal.addEventListener('abort', () => {
      window.clearTimeout(timer);
      reject(new DOMException('aborted', 'AbortError'));
    }, { once: true });
  });

// Exported for the fault-injection suite (FA-PRF-03 partial-SSE case): the wire
// parser is pure (Response + TextDecoder only) so torn-frame behavior is
// verifiable outside the browser.
export const consumeSse = async (
  response: Response,
  afterSeq: number,
  handlers: ConversationStreamHandlers,
): Promise<{ lastSeq: number; terminal: ConversationTurnStreamResult | null }> => {
  if (response.body === null) throw new ApiError({ code: 'stream_empty', message: '对话流响应没有可读内容', status: 200, retryable: true });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let dataLines: string[] = [];
  let lastSeq = afterSeq;
  let terminal: ConversationTurnStreamResult | null = null;

  const deliver = (): void => {
    if (dataLines.length === 0) return;
    const data = dataLines.join('\n');
    dataLines = [];
    let event: ConversationStreamEvent;
    try { event = JSON.parse(data) as ConversationStreamEvent; } catch {
      throw new ApiError({ code: 'stream_malformed', message: '对话流包含无法解析的事件', status: 200, retryable: true });
    }
    if (!Number.isFinite(event.seq) || event.seq <= lastSeq || typeof event.payload?.type !== 'string') return;
    lastSeq = event.seq;
    handlers.onEvent(event);
    const payload = event.payload;
    if (payload.type === 'completed') terminal = { status: 'completed', conversation: payload.conversation };
    else if (payload.type === 'cancelled') terminal = { status: 'cancelled', conversation: payload.conversation, preservedReply: payload.preservedReply };
    else if (payload.type === 'failed') terminal = {
      status: 'failed', conversation: payload.conversation, preservedReply: payload.preservedReply, error: payload.error,
    };
  };
  const line = (raw: string): void => {
    const value = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (value.length === 0) { deliver(); return; }
    if (value.startsWith('data:')) dataLines.push(value.slice(5).replace(/^ /, ''));
  };

  for (;;) {
    const chunk = await reader.read();
    buffer += decoder.decode(chunk.value, { stream: !chunk.done });
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      line(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
    }
    if (chunk.done) break;
  }
  if (buffer.length > 0) line(buffer);
  deliver();
  return { lastSeq, terminal };
};

/** Start a turn (POST) or attach after refresh (start=null). Any socket drop
 * reconnects through the seq cursor; the server keeps generation alive. */
export async function streamConversationTurn(
  conversationId: string,
  start: ConversationTurnStart | null,
  handlers: ConversationStreamHandlers,
  signal: AbortSignal,
): Promise<ConversationTurnStreamResult | null> {
  let pendingStart = start;
  let lastSeq = 0;
  let connected = false;
  let reconnectAttempt = 0;

  for (;;) {
    const encodedId = encodeURIComponent(conversationId);
    const path = pendingStart?.kind === 'message'
      ? `${BASE}/conversations/${encodedId}/messages/stream`
      : pendingStart?.kind === 'retry'
        ? `${BASE}/conversations/${encodedId}/messages/${encodeURIComponent(pendingStart.messageId)}/retry/stream`
        : `${BASE}/conversations/${encodedId}/turns/active/stream?afterSeq=${lastSeq}`;
    handlers.onConnection?.(connected ? 'reconnecting' : 'connecting');
    let response: Response;
    try {
      response = await fetch(path, {
        method: pendingStart === null ? 'GET' : 'POST',
        headers: pendingStart === null ? undefined : { 'Content-Type': 'application/json' },
        body: pendingStart === null
          ? undefined
          : JSON.stringify(pendingStart.kind === 'message' ? pendingStart.input : {}),
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw new DOMException('aborted', 'AbortError');
      // POST delivery can be ambiguous after a network break. Never send it a
      // second time; attach to the server-owned active turn instead.
      pendingStart = null;
      reconnectAttempt += 1;
      await waitForReconnect(signal, reconnectAttempt);
      continue;
    }

    if (!response.ok) {
      const error = await responseError(response, path);
      if (pendingStart !== null && error.code === 'turn_in_flight') {
        pendingStart = null;
        continue;
      }
      if (pendingStart === null && error.status === 404) {
        if (!connected && start === null) return null; // normal refresh: no active turn
        throw new ApiError({
          code: 'stream_lost',
          message: '对话生成连接已中断，服务端没有可续接的活动流；已持久化的消息与回复片段仍保留。',
          status: 404,
          retryable: true,
        });
      }
      throw error;
    }

    connected = true;
    pendingStart = null;
    reconnectAttempt = 0;
    handlers.onConnection?.('live');
    const consumed = await consumeSse(response, lastSeq, handlers);
    lastSeq = consumed.lastSeq;
    if (consumed.terminal !== null) return consumed.terminal;
    reconnectAttempt += 1;
    await waitForReconnect(signal, reconnectAttempt);
  }
}

export async function cancelConversationTurn(conversationId: string, signal?: AbortSignal): Promise<boolean> {
  const path = `${BASE}/conversations/${encodeURIComponent(conversationId)}/turns/active/cancel`;
  const response = await fetch(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal,
  });
  if (!response.ok) throw await responseError(response, path);
  const body = await response.json() as { requested?: unknown };
  return body.requested === true;
}
