import type { StageContext, StageHandler, StageOutcome } from '../types.js';
import { unconsumedSignals } from './revise.js';

/**
 * feedback — intake bookkeeping (mission §33). The signal itself was already
 * persisted by the channel that received it (CLI `far research feedback`,
 * adapters, ...); this stage makes receipt auditable: every stored signal gets
 * exactly one `feedback_received` event in the run's append-only stream
 * (idempotent per signal id — an event written at intake time counts, so the
 * CLI path and this stage never double-record). Absorbing a signal is NOT done
 * here: that is the revise stage's causal revision. No LLM runs in this stage.
 */
export const feedbackStage: StageHandler = {
  stage: 'feedback',

  /** Applicable whenever the run has at least one stored feedback signal. */
  applicable: async (ctx) => ctx.store.listObjects('feedback', ctx.run.id).length > 0,

  async execute(ctx: StageContext): Promise<StageOutcome> {
    const signals = ctx.store.listObjects('feedback', ctx.run.id);
    if (signals.length === 0) {
      return { kind: 'skipped', reason: 'no feedback signals stored for this run' };
    }
    // Idempotent per signal id: never append a second feedback_received for one signal.
    const alreadyRecorded = new Set(
      ctx.store
        .listEvents(ctx.run.id)
        .filter((e) => e.type === 'feedback_received')
        .map((e) => (e.detail as { feedbackId?: unknown }).feedbackId)
        .filter((id): id is string => typeof id === 'string'),
    );
    let appended = 0;
    for (const signal of signals) {
      if (alreadyRecorded.has(signal.id)) continue;
      ctx.store.appendEvent(ctx.run.id, {
        type: 'feedback_received',
        detail: { feedbackId: signal.id, source: signal.source, target: signal.target ?? null },
      });
      appended += 1;
    }
    const pending = unconsumedSignals(ctx);
    const summary =
      `${signals.length} feedback signal(s) stored; ${appended} feedback_received event(s) appended; ` +
      `${pending.length} unconsumed — awaiting causal revision in the revise stage` +
      (pending.length > 0 ? `: ${pending.map((s) => s.id).join(', ')}` : '');
    return { kind: 'done', summary };
  },
};
