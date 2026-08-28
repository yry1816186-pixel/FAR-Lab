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

/**
 * State of the plan-vs-experiment leg (shared by the iteration controller and the
 * execute stage's applicability gate — ONE owner of the semantics). A plan counts
 * as unexecuted when no plan-drafted experiment has completed, OR when the plan was
 * causally REVISED after the last completed experiment (revise re-freezes the plan:
 * frozenAt moves past the experiment's endedAt — a new registration deserving a new
 * experiment, with the spec-level sequential-analysis guard disclosing re-testing).
 */
export type ExperimentLegStatus =
  | { kind: 'no_plan' }
  | { kind: 'unexecuted'; planId: string }
  | { kind: 'unexecutable'; planId: string; reason: string }
  | { kind: 'plan_revised_since_experiment'; planId: string; frozenAt: string; lastExperimentEndedAt: string }
  | { kind: 'current'; planId: string };

/**
 * Skip markers that mean "the leg never actually ran" (transport/budget), NOT a
 * scientific executability verdict — those must stay retryable as 'unexecuted'.
 * The scientific verdict carries a per-experiment-type breakdown instead
 * (e.g. "tabular: Requires wet-lab …; literature-pool: … violates …").
 */
const TRANSPORTAL_SKIP_MARKERS = ['model call failed', 'budget'] as const;

const isScientificUnexecutableSkip = (reason: string | undefined): boolean => {
  if (reason === undefined || reason === '') return false;
  return !TRANSPORTAL_SKIP_MARKERS.some((m) => reason.startsWith(m));
};

export const experimentLegStatus = (store: Store, runId: string): ExperimentLegStatus => {
  const plan = store.listObjects('plan', runId).at(-1);
  if (plan === undefined) return { kind: 'no_plan' };
  const lastCompleted = store
    .listObjects('experiment_run', runId)
    .filter((r) => r.specId.startsWith('xsp_') && r.status === 'completed')
    .sort((a, b) => (b.endedAt ?? b.createdAt).localeCompare(a.endedAt ?? a.createdAt))[0];
  if (lastCompleted === undefined) {
    // The execute stage's LAST attempt may already carry the deterministic
    // per-type executability verdict (spec drafted, then every experiment type
    // judged unavailable). That is a scientific conclusion, not a retryable
    // gap: re-presenting EXECUTE_PLANNED_EXPERIMENT would loop the same verdict
    // forever (observed live on the 2026-08-28 gold run).
    const execStage = store.getRun(runId)?.stages.find((s) => s.stage === 'execute');
    const execSkipReason = execStage?.error;
    if (execStage?.state === 'skipped' && execSkipReason !== undefined && isScientificUnexecutableSkip(execSkipReason)) {
      return { kind: 'unexecutable', planId: plan.id, reason: execSkipReason };
    }
    return { kind: 'unexecuted', planId: plan.id };
  }
  const frozenAt = plan.frozenAt ?? null;
  const endedAt = lastCompleted.endedAt ?? null;
  if (frozenAt !== null && endedAt !== null && frozenAt > endedAt) {
    return { kind: 'plan_revised_since_experiment', planId: plan.id, frozenAt, lastExperimentEndedAt: endedAt };
  }
  return { kind: 'current', planId: plan.id };
};

/** Hypothesis/plan fields whose change is SEMANTIC (not bookkeeping) for the delta count. */
const HYPOTHESIS_SCOPE_FIELDS = new Set(['statement', 'mechanism', 'predictions']);
const PLAN_SCOPE_FIELDS = new Set(['steps', 'metrics', 'decisionRules']);

/**
 * Lane-06: revisions that changed scientific content vs cosmetic rewrites. Derived
 * deterministically from persisted version_diff entries: an entry counts when a scope
 * field changed OR a wired revision predicate flagged a violation (falsifiability not
 * retained / decision rules silently changed). Pure function of stored state.
 */
export const countSemanticRevisions = (store: Store, runId: string): number => {
  let semantic = 0;
  for (const diff of store.listObjects('version_diff', runId)) {
    for (const entry of diff.entries) {
      const scope = entry.objectType === 'hypothesis'
        ? HYPOTHESIS_SCOPE_FIELDS
        : entry.objectType === 'plan'
          ? PLAN_SCOPE_FIELDS
          : null;
      const scopeChanged = scope !== null && entry.changedFields.some((f) => scope.has(f));
      const predicateViolation = entry.semanticFlags.some(
        (f) => f === 'falsifiability_retained:false' || f === 'decision_rules_preserved:false',
      );
      if (scopeChanged || predicateViolation) semantic += 1;
    }
  }
  return semantic;
};

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
    semanticRevisionChanges: countSemanticRevisions(store, runId),
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

  const leg = experimentLegStatus(store, runId);
  if (leg.kind !== 'no_plan') {
    const plan = store.listObjects('plan', runId).at(-1)!;
    const hypothesisIds = new Set(store.listObjects('hypothesis', runId).map((h) => h.id));
    const executable = checkPlanExecutability(plan, hypothesisIds).passed;
    const because = leg.kind === 'unexecuted' ? 'never_executed' : leg.kind === 'plan_revised_since_experiment' ? 'revised_since' : null;
    if (because !== null && executable) {
      const rationale = leg.kind === 'plan_revised_since_experiment'
        ? `plan ${plan.id} was causally revised (re-frozen ${leg.frozenAt.slice(0, 19)}) after the last completed experiment (${leg.lastExperimentEndedAt.slice(0, 19)}) — the revised registration deserves its own experiment`
        : `plan ${plan.id} passes the deterministic executability check but no experiment has completed — reopening execute -> feedback -> revise -> export`;
      return {
        decision: 'continue',
        reopenStages: EXPERIMENT_LEG,
        record: buildRecord(runId, round, decidedAt, snapshot, {
          decision: 'continue',
          continueTrigger: { kind: 'executable_plan_unexecuted', planId: plan.id, because },
          reopenStages: EXPERIMENT_LEG,
          rationale,
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
  if (leg.kind !== 'no_plan' && store.listObjects('experiment_run', runId).some((r) => r.status === 'completed')) {
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
