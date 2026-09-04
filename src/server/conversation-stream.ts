import type { Conversation } from '../domain/conversation.js';
import type { ConversationTurnProgress } from './conversation-agent.js';
import { ConversationError, type ConversationTurnRuntime } from './conversations.js';

/** Public turn stream. It contains only user-visible phases, sanitized tool
 * summaries and the structurally projected reply — never raw action JSON or
 * private model reasoning. */
export type ConversationStreamPayload =
  | { type: 'accepted' }
  | { type: 'steered'; text: string }
  | ConversationTurnProgress
  | { type: 'completed'; conversation: Conversation }
  | { type: 'cancelled'; conversation: Conversation | null; preservedReply: string }
  | { type: 'failed'; error: { code: string; message: string; retryable: boolean }; conversation: Conversation | null; preservedReply: string };

export interface SequencedConversationStreamEvent {
  seq: number;
  at: string;
  payload: ConversationStreamPayload;
}

type Listener = (event: SequencedConversationStreamEvent) => void;

interface ActiveTurn {
  conversationId: string;
  controller: AbortController;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  seq: number;
  events: SequencedConversationStreamEvent[];
  listeners: Set<Listener>;
  reply: string;
  cleanupTimer: NodeJS.Timeout | null;
}

export class ConversationTurnHub {
  private readonly turns = new Map<string, ActiveTurn>();
  private readonly steers = new Map<string, string[]>();

  constructor(
    private readonly snapshot: (conversationId: string) => Conversation | null,
    private readonly retainMs = 10 * 60_000,
  ) {}

  start(
    conversationId: string,
    work: (runtime: ConversationTurnRuntime) => Promise<Conversation>,
  ): void {
    const prior = this.turns.get(conversationId);
    if (prior?.status === 'running') {
      throw new ConversationError(409, 'turn_in_flight', 'this conversation already has a turn running — reconnect to its active stream');
    }
    if (prior?.cleanupTimer !== null && prior?.cleanupTimer !== undefined) clearTimeout(prior.cleanupTimer);
    const turn: ActiveTurn = {
      conversationId,
      controller: new AbortController(),
      status: 'running',
      seq: 0,
      events: [],
      listeners: new Set(),
      reply: '',
      cleanupTimer: null,
    };
    this.turns.set(conversationId, turn);
    this.emit(turn, { type: 'accepted' });

    // Start after the caller has had a chance to subscribe to the POST stream.
    void Promise.resolve()
      .then(() => work({
        signal: turn.controller.signal,
        steer: () => this.takeSteer(conversationId),
        onProgress: (progress) => {
          if (progress.type === 'reply_reset') turn.reply = '';
          else if (progress.type === 'reply_delta') turn.reply = `${turn.reply}${progress.text}`.slice(0, 40_000);
          this.emit(turn, progress);
        },
      }))
      .then((conversation) => {
        turn.status = 'completed';
        this.emit(turn, { type: 'completed', conversation });
        this.scheduleCleanup(turn);
      })
      .catch((error: unknown) => {
        const cancelled = turn.controller.signal.aborted
          || (error instanceof ConversationError && error.code === 'turn_cancelled');
        const conversation = this.snapshot(conversationId);
        if (cancelled) {
          turn.status = 'cancelled';
          this.emit(turn, { type: 'cancelled', conversation, preservedReply: turn.reply });
        } else {
          turn.status = 'failed';
          this.emit(turn, {
            type: 'failed',
            error: {
              code: error instanceof ConversationError ? error.code : 'internal',
              message: error instanceof Error ? error.message : String(error),
              retryable: error instanceof ConversationError
                ? error.code === 'conversation_model_failed' || error.code === 'turn_in_flight'
                : true,
            },
            conversation,
            preservedReply: turn.reply,
          });
        }
        this.scheduleCleanup(turn);
      });
  }

  subscribe(
    conversationId: string,
    afterSeq: number,
    listener: Listener,
  ): { replay: SequencedConversationStreamEvent[]; unsubscribe: () => void; running: boolean } | null {
    const turn = this.turns.get(conversationId);
    if (turn === undefined) return null;
    turn.listeners.add(listener);
    return {
      replay: turn.events.filter((event) => event.seq > afterSeq),
      unsubscribe: () => { turn.listeners.delete(listener); },
      running: turn.status === 'running',
    };
  }

  /** Queue a mid-turn steering message (FA-HAR-05): the running turn's
   * loop polls it between turns and injects it into the session transcript.
   * False when no turn is running (the researcher should post a message). */
  steer(conversationId: string, text: string): boolean {
    const turn = this.turns.get(conversationId);
    if (turn === undefined || turn.status !== 'running') return false;
    const queued = text.slice(0, 20_000);
    const queue = this.steers.get(conversationId) ?? [];
    // 8 pending steers is already pathological researcher behavior; drop the
    // oldest so the queue stays bounded and the newest intent wins.
    if (queue.length >= 8) queue.shift();
    queue.push(queued);
    this.steers.set(conversationId, queue);
    this.emit(turn, { type: 'steered', text: queued });
    return true;
  }

  private takeSteer(conversationId: string): string | null {
    const queue = this.steers.get(conversationId);
    if (queue === undefined || queue.length === 0) return null;
    const text = queue.shift();
    if (queue.length === 0) this.steers.delete(conversationId);
    return text ?? null;
  }

  cancel(conversationId: string): boolean {
    const turn = this.turns.get(conversationId);
    if (turn === undefined || turn.status !== 'running') return false;
    turn.controller.abort(new DOMException('cancelled by researcher', 'AbortError'));
    return true;
  }

  close(): void {
    for (const turn of this.turns.values()) {
      if (turn.cleanupTimer !== null) clearTimeout(turn.cleanupTimer);
      if (turn.status === 'running') turn.controller.abort(new DOMException('server stopping', 'AbortError'));
      turn.listeners.clear();
    }
    this.turns.clear();
    this.steers.clear();
  }

  private emit(turn: ActiveTurn, payload: ConversationStreamPayload): void {
    const event: SequencedConversationStreamEvent = {
      seq: ++turn.seq,
      at: new Date().toISOString(),
      payload,
    };
    turn.events.push(event);
    // 5k real provider chunks is already far beyond a normal 40k-char reply.
    // Keep the terminal facts and a bounded replay without unbounded process RAM.
    if (turn.events.length > 5_000) turn.events.splice(0, turn.events.length - 5_000);
    for (const listener of turn.listeners) {
      try { listener(event); } catch { turn.listeners.delete(listener); }
    }
  }

  private scheduleCleanup(turn: ActiveTurn): void {
    turn.cleanupTimer = setTimeout(() => {
      if (this.turns.get(turn.conversationId) === turn) {
        this.turns.delete(turn.conversationId);
        this.steers.delete(turn.conversationId);
      }
    }, this.retainMs);
    turn.cleanupTimer.unref();
  }
}
