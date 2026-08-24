/**
 * Live run-event subscription (SSE over fetch, zero deps). Connects to
 * GET /runs/:id/events/stream, parses frames incrementally (liveCore parser),
 * and reconnects with the Last-Event-ID cursor on transport drops — the same
 * resume contract the server stream implements. Pure policy lives in
 * liveCore; this module owns only I/O and timers.
 *
 * State honesty: onState reports 'connecting' | 'live' | 'reconnecting'; the
 * UI shows exactly that — no invented progress. Reconnects are unbounded but
 * delay-capped; close() aborts everything.
 */
import { backoffDelayMs, emptySseState, parseSseChunk, type SseParseState } from './liveCore.ts';
import { eventStreamUrl, type RunEvent } from './api.ts';

export type LiveState = 'connecting' | 'live' | 'reconnecting';

export interface LiveSubscription {
  close(): void;
}

export interface SubscribeOptions {
  runId: string;
  /** Start cursor: resume after this seq (server honors afterSeq/Last-Event-ID). */
  fromSeq?: number;
  signal?: AbortSignal;
  onEvent: (e: RunEvent) => void;
  onState?: (s: LiveState) => void;
  /** Test hook: replaces fetch (default global). */
  fetchImpl?: typeof fetch;
  /** Test hook: replaces the reconnect delay sleep. */
  sleepImpl?: (ms: number) => Promise<void>;
}

interface SsePayload {
  seq: number;
  at: string;
  type: string;
  stage?: string;
  detail?: Record<string, unknown>;
}

const isRunEvent = (v: unknown): v is SsePayload => {
  if (v === null || typeof v !== 'object') return false;
  const p = v as Partial<SsePayload>;
  return typeof p.seq === 'number' && typeof p.at === 'string' && typeof p.type === 'string';
};

export function subscribeRunEvents(opts: SubscribeOptions): LiveSubscription {
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleepImpl ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const controller = new AbortController();
  const external = opts.signal;
  const onExternalAbort = (): void => controller.abort();
  external?.addEventListener('abort', onExternalAbort, { once: true });

  let cursor = opts.fromSeq ?? 0;
  let attempt = 0;
  let closed = false;

  const finish = (): void => {
    if (closed) return;
    closed = true;
    controller.abort();
    external?.removeEventListener('abort', onExternalAbort);
  };

  const loop = async (): Promise<void> => {
    while (!closed) {
      try {
        const headers: Record<string, string> = { accept: 'text/event-stream' };
        if (cursor > 0) headers['last-event-id'] = String(cursor);
        const res = await doFetch(eventStreamUrl(opts.runId, cursor), {
          signal: controller.signal,
          headers,
        });
        if (!res.ok || res.body === null) throw new Error(`stream → ${res.status}`);
        attempt = 0; // connected cleanly
        opts.onState?.('live');
        let parse: SseParseState = emptySseState();
        const decoder = new TextDecoder();
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break; // server closed (10-min lifetime) — reconnect with cursor
          const parsed = parseSseChunk(parse, decoder.decode(value, { stream: true }));
          parse = parsed.state;
          for (const m of parsed.messages) {
            if (m.event !== 'run-event') continue;
            try {
              const payload: unknown = JSON.parse(m.data);
              if (!isRunEvent(payload)) continue;
              if (payload.seq > cursor) cursor = payload.seq;
              const { seq, at, type } = payload;
              opts.onEvent({ seq, at, type, ...(payload.stage !== undefined ? { stage: payload.stage } : {}), ...(payload.detail !== undefined ? { detail: payload.detail } : {}) });
            } catch {
              // A malformed frame must not kill the stream; skip it.
            }
          }
        }
      } catch (e) {
        if (closed || external?.aborted) return;
        // Transport error — honest reconnect with capped backoff.
        void e;
      }
      if (closed) return;
      opts.onState?.('reconnecting');
      await sleep(backoffDelayMs(attempt));
      attempt += 1;
    }
  };

  opts.onState?.('connecting');
  void loop();
  return { close: finish };
}
