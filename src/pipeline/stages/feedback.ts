import type { StageContext, StageHandler, StageOutcome } from '../types.js';
import { unconsumedSignals } from './revise.js';
import { VERDICT_CLASSES, settleEntry, type VerdictClass } from '../../domain/index.js';

/**
 * feedback — intake bookkeeping (mission §33). The signal itself was already
 * persisted by the channel that received it (CLI `far research feedback`,
 * adapters, ...); this stage makes receipt auditable: every stored signal gets
 * exactly one `feedback_received` event in the run's append-only stream
 * (idempotent per signal id — an event written at intake time counts, so the
 * CLI path and this stage never double-record). Absorbing a signal is NOT done
 * here: that is the revise stage's causal revision. No LLM runs in this stage.
 *
 * Wave-S/L4: experiment-verdict signals also SETTLE the plan's registered
 * predictions on the ledger (proper scoring rules vs the ignorance baseline) —
 * the self-calibration loop closes here, deterministically.
 */
export const feedbackStage: StageHandler = {
  stage: 'feedback',

  /** Applicable whenever the run has at least one stored feedback signal. */
  applicable: async (ctx) => ctx.store.listObjects('feedback', ctx.run.id).length > 0
    ? true
    : { applicable: false as const, reason: 'no feedback signals stored for this run' },

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
      appended = 1 + appended;
    }

    // L4 settlement: experiment verdicts score the expected_relation + rank_order
    // ledger entries. The REAL executor shape (src/experiment/executor.ts
    // buildFeedback) carries the hypothesis in signal.target (kind='hypothesis')
    // and per-comparison verdicts as an ARRAY (structured.verdicts, 5-class incl.
    // insufficient_data); the singular hypothesisId/verdict shape is kept only for
    // back-compat with old fixtures. Aggregation is deterministic and conservative:
    // insufficient_data carries no information (excluded), and among informative
    // verdicts the worst news wins (falsifies > weakens > supports > inconclusive)
    // — a hypothesis with any falsifying confirmatory comparison is settled as
    // falsified, never averaged into ambivalence.
    let settledCount = 0;
    const openEntries = ctx.store
      .listObjects('prediction', ctx.run.id)
      .filter((e) => (e.kind === 'expected_relation' || e.kind === 'rank_order') && e.settledAt === undefined && e.voidReason === undefined);
    const settledEntryIds = new Set<string>();
    const WORST_FIRST: readonly VerdictClass[] = ['falsifies', 'weakens', 'supports', 'inconclusive'];
    for (const signal of signals) {
      if (signal.source !== 'experiment') continue;
      const st = signal.structured ?? {};
      const hypothesisId =
        (signal.target?.kind === 'hypothesis' ? signal.target.id : null) ??
        (typeof st.hypothesisId === 'string' ? st.hypothesisId : null);
      const rawVerdicts: string[] = Array.isArray(st.verdicts)
        ? st.verdicts.filter((v): v is string => typeof v === 'string')
        : typeof st.verdict === 'string' ? [st.verdict] : [];
      const classes = rawVerdicts.filter((v) => (VERDICT_CLASSES as readonly string[]).includes(v)) as VerdictClass[];
      const verdict = WORST_FIRST.find((c) => classes.includes(c)) ?? null;
      if (hypothesisId === null || verdict === null) continue;
      for (const entry of openEntries) {
        if (settledEntryIds.has(entry.id)) continue;
        const isExpected = entry.kind === 'expected_relation'
          && (entry.assertion as { hypothesisId?: unknown }).hypothesisId === hypothesisId;
        // rank_order asserted the tournament winner; it settles WITH its top
        // hypothesis's verdict (uniform probs => honest zero claimed skill).
        const isRankOrder = entry.kind === 'rank_order'
          && (entry.assertion as { topHypothesisId?: unknown }).topHypothesisId === hypothesisId;
        if (!isExpected && !isRankOrder) continue;
        ctx.store.putObject(
          'prediction',
          settleEntry(entry, {
            outcomeClass: verdict,
            settledAt: new Date().toISOString(),
            outcome: { signalId: signal.id, verdict, verdicts: classes },
          }),
        );
        settledEntryIds.add(entry.id);
        settledCount += 1;
      }
    }

    const pending = unconsumedSignals(ctx);
    const summary =
      `${signals.length} feedback signal(s) stored; ${appended} feedback_received event(s) appended; ` +
      `${settledCount} ledger prediction(s) settled by experiment verdict(s)` +
      `; ${pending.length} unconsumed — awaiting causal revision in the revise stage` +
      (pending.length > 0 ? `: ${pending.map((s) => s.id).join(', ')}` : '');
    return { kind: 'done', summary };
  },
};
