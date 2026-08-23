import { createHash } from 'node:crypto';
import type { Store } from '../persistence/store.js';
import type { RunBudgetView } from './run-budget.js';
import type { RunStageName } from '../domain/run.js';
import {
  newId,
  IterationRecord,
  type IterationSnapshot,
  type IterationStop,
  type IterationTrigger,
} from '../domain/index.js';
import { checkPlanExecutability } from '../pipeline/stages/plan.js';
import { canonicalJson } from '../shared/crypto.js';

/**
 * Research iteration controller (research-loop lane, goal §5): after each
 * COMPLETED pass of the stage machine, decide — deterministically — whether
 * another bounded round has actionable work. No LLM judges whether to continue:
 * iteration proceeds only on named falsification-loop legs (unconsumed feedback,
 * executable-but-unexecuted plan) and stops on round cap / budget / no-material-
 * delta / no actionable work (research/oss-capability-diff-2026-08-23.md
 * rejected unbounded tree search as data-dredging; this controller is the
 * discipline-bounded answer).
 */

/** Total rounds per execution (initial pass + N extra). Clamped 1..10; env-overridable for harnesses. */
export const MAX_ITERATION_ROUNDS = Math.min(10, Math.max(1, Number(process.env.FARLAB_MAX_ITERATION_ROUNDS ?? 3) || 3));

/** Meta keys persisted with the run (store meta table, same family as qg:*). */
export const iterationRoundKey = (runId: string) => `iter:round:${runId}`;
export const iterationFingerprintKey = (runId: string) => `iter:fp:${runId}`;

const FEEDBACK_LEG: readonly RunStageName[] = ['feedback', 'revise', 'export'];
const EXPERIMENT_LEG: readonly RunStageName[] = ['execute', 'feedback', 'revise', 'export'];

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');

/** Material domain counts of the run right now — the no-delta fingerprint input. */
export const computeIterationSnapshot = (store: Store, runId: string, round: number): IterationSnapshot => {
  const claims = store.listObjects('claim', runId);
  const hypotheses = store.listObjects('hypothesis', runId);
  const scorecards = store.listObjects('scorecard', runId);
  const plans = store.listObjects('plan', runId);
  const revisions = store.listObjects('revision', runId);
  const signals = store.listObjects('feedback', runId);
  const experimentRuns = store.listObjects('experiment_run', runId);
  const effectEstimates = store.listObjects('effect_estimate', runId);
  const consumed = new Set(revisions.map((r) => r.triggerFeedbackId));

  const material = {
    claims: claims.length,
    verifiedClaims: claims.filter((c) => c.bindingStatus === 'verified').length,
    hypotheses: hypotheses.length,
    hypothesisVersionSum: hypotheses.reduce((a, h) => a + h.version, 0),
    scorecards: scorecards.length,
    plans: plans.length,
    revisions: revisions.length,
    experimentRunsCompleted: experimentRuns.filter((r) => r.status === 'completed').length,
    feedbackSignals: signals.length,
    feedbackConsumed: signals.filter((s) => consumed.has(s.id)).length,
    effectEstimates: effectEstimates.length,
  };
  return { round, ...material, fingerprint: sha(canonicalJson(material)) };
};

export interface IterationDecision {
  decision: 'continue' | 'stop';
  /** Stages to reopen for the next round (empty on stop). */
  reopenStages: readonly RunStageName[];
  /** Ready-to-persist record; the caller owns idempotent persistence + events. */
  record: IterationRecord;
}

const buildRecord = (
  runId: string,
  round: number,
  decidedAt: string,
  snapshot: IterationSnapshot,
  fields: {
    decision: 'continue' | 'stop';
    continueTrigger?: IterationTrigger;
    stopReason?: IterationStop;
    reopenStages?: readonly RunStageName[];
    rationale: string;
    unblockHints?: string[];
  },
): IterationRecord =>
  IterationRecord.parse({
    id: newId('itr'),
    runId,
    round,
    decidedAt,
    decision: fields.decision,
    ...(fields.continueTrigger !== undefined ? { continueTrigger: fields.continueTrigger } : {}),
    ...(fields.stopReason !== undefined ? { stopReason: fields.stopReason } : {}),
    reopenStages: fields.reopenStages ?? [],
    rationale: fields.rationale,
    snapshot,
    unblockHints: fields.unblockHints ?? [],
  });

/**
 * Pure decision procedure over persisted state. Stop rules run FIRST (a stop
 * rule must never be overridden by a trigger); continue triggers run in
 * priority order and the first hit wins.
 */
export const evaluateIteration = (opts: {
  store: Store;
  runId: string;
  /** The pass that just finished (1 = initial). */
  round: number;
  budget: RunBudgetView;
  decidedAt?: string;
}): IterationDecision => {
  const { store, runId, round, budget } = opts;
  const decidedAt = opts.decidedAt ?? new Date().toISOString();
  const snapshot = computeIterationSnapshot(store, runId, round);

  // ---- stop rules (deterministic, checked first) ----
  if (round >= MAX_ITERATION_ROUNDS) {
    return {
      decision: 'stop',
      reopenStages: [],
      record: buildRecord(runId, round, decidedAt, snapshot, {
        decision: 'stop',
        stopReason: { kind: 'round_cap', rounds: MAX_ITERATION_ROUNDS },
        rationale: `iteration round cap reached (${round}/${MAX_ITERATION_ROUNDS}) — further rounds need new feedback or an approved experiment`,
        unblockHints: [
          'add a feedback signal (expert judgment / new literature / reviewer comment) and resume — feedback reopens the loop',
          'approve a drafted experiment: far experiment approve <specId> --by <you> --hypothesis <hypId>, then far experiment rerun <specId>',
        ],
      }),
    };
  }
  if (budget.cap !== null && !budget.hasRemaining()) {
    return {
      decision: 'stop',
      reopenStages: [],
      record: buildRecord(runId, round, decidedAt, snapshot, {
        decision: 'stop',
        stopReason: { kind: 'budget_exhausted', spent: budget.spent, cap: budget.cap },
        rationale: `run budget exhausted (spent ${budget.spent} of cap ${budget.cap}) — iteration cannot afford another round`,
        unblockHints: ['raise FARLAB_RUN_TOKEN_BUDGET and resume — budget-exhausted legs reopen automatically'],
      }),
    };
  }
  const prevFingerprint = store.getMeta(iterationFingerprintKey(runId));
  if (round > 1 && prevFingerprint === snapshot.fingerprint) {
    return {
      decision: 'stop',
      reopenStages: [],
      record: buildRecord(runId, round, decidedAt, snapshot, {
        decision: 'stop',
        stopReason: { kind: 'no_material_delta' },
        rationale: 'round produced no material change in domain state (identical material fingerprint) — continuing would thrash, not research',
        unblockHints: ['inject NEW information before continuing: feedback signal, additional literature, or an approved experiment'],
      }),
    };
  }

  // ---- continue triggers (priority order, first hit wins) ----
  const revisions = store.listObjects('revision', runId);
  const consumed = new Set(revisions.map((r) => r.triggerFeedbackId));
  const unconsumed = store
    .listObjects('feedback', runId)
    .filter((s) => !consumed.has(s.id))
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id));
  if (unconsumed.length > 0) {
    return {
      decision: 'continue',
      reopenStages: FEEDBACK_LEG,
      record: buildRecord(runId, round, decidedAt, snapshot, {
        decision: 'continue',
        continueTrigger: { kind: 'unconsumed_feedback', signalIds: unconsumed.map((s) => s.id) },
        reopenStages: FEEDBACK_LEG,
        rationale: `${unconsumed.length} feedback signal(s) await causal absorption — reopening feedback -> revise -> export`,
      }),
    };
  }

  const plan = store.listObjects('plan', runId).at(-1);
  if (plan !== undefined) {
    const hasCompletedRun = store
      .listObjects('experiment_run', runId)
      .some((r) => r.specId.startsWith('xsp_') && r.status === 'completed');
    const hypothesisIds = new Set(store.listObjects('hypothesis', runId).map((h) => h.id));
    const executable = checkPlanExecutability(plan, hypothesisIds).passed;
    if (!hasCompletedRun && executable) {
      return {
        decision: 'continue',
        reopenStages: EXPERIMENT_LEG,
        record: buildRecord(runId, round, decidedAt, snapshot, {
          decision: 'continue',
          continueTrigger: { kind: 'executable_plan_unexecuted', planId: plan.id },
          reopenStages: EXPERIMENT_LEG,
          rationale: `plan ${plan.id} passes the deterministic executability check but no experiment has completed — reopening execute -> feedback -> revise -> export`,
        }),
      };
    }
  }

  // ---- no actionable work: honest stop with what WOULD unblock a round ----
  const unblockHints: string[] = [];
  const approvedUnrun = store
    .listObjects('experiment_spec', runId)
    .filter((spec) => spec.approvals.length > 0)
    .filter((spec) => !store.listObjects('experiment_run', runId).some((r) => r.specId === spec.id && r.status === 'completed'));
  for (const spec of approvedUnrun.slice(0, 3)) {
    unblockHints.push(`approved experiment spec ${spec.id} has no completed run: far experiment rerun ${spec.id}`);
  }
  if (plan !== undefined && store.listObjects('experiment_run', runId).some((r) => r.status === 'completed')) {
    unblockHints.push('falsification loop has executed evidence — add expert/literature feedback to drive a causal revision round');
  }
  return {
    decision: 'stop',
    reopenStages: [],
    record: buildRecord(runId, round, decidedAt, snapshot, {
      decision: 'stop',
      stopReason: { kind: 'no_actionable_work' },
      rationale: 'no actionable iteration leg: no unconsumed feedback, and the plan leg has no executable unexecuted work',
      unblockHints,
    }),
  };
};
