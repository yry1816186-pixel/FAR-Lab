import { diffArtifacts } from '../../domain/artifact-diff.js';
import { z } from 'zod';
import { canonicalJson } from '../../shared/crypto.js';
import type { StageContext, StageHandler, StageOutcome } from '../types.js';
import { callStructured } from '../llm.js';
import {
  DecisionRules,
  HypothesisCandidate,
  PlanStep,
  ResearchPlan,
  Revision,
  RevisionOperation,
  VersionDiff,
  newId,
} from '../../domain/index.js';
import { revisionPredicates, type RevisionPredicateVector } from '../../domain/revision-predicates.js';
import type {
  FeedbackSignal,
  HypothesisCandidate as Hypothesis,
  ResearchPlan as Plan,
  VersionDiffEntry,
} from '../../domain/index.js';
import { assertNotCancelled, isRepresentative, refuseTemplateMode, TemplateModeRefusal } from './shared.js';
import { checkPlanExecutability } from './plan.js';
import { alphaSpendLedger, checkStructuredPreregistration, freezePlan } from './plan-formal.js';

/**
 * revise — mission §33/§34: feedback must cause a CAUSAL revision, never
 * "receive feedback -> prompt again -> new answer". For every unconsumed
 * FeedbackSignal this stage runs an explicit causal-analysis model call that
 * names WHICH persisted objects the feedback forces to change and WHY, then a
 * per-object revision call rewrites the content (hypothesis: version+1 with the
 * previous version archived as a content-addressed artifact; plan: steps/
 * metrics/decisionRules re-gated by the deterministic executability check).
 * The result is persisted as a Revision (operations with before/after + the
 * causal chain) plus a VersionDiff (changed fields, semantic summary, remaining
 * uncertainties). QualityDelta is recorded as what it is: an uncalibrated LLM
 * self-assessment — "inconclusive" is a legitimate outcome. Consumption is
 * recorded only by Revision creation, which makes re-running idempotent.
 */

// ---------------------------------------------------------------------------
// model output schemas (strict — provider failures throw, nothing is faked)
// ---------------------------------------------------------------------------

const AffectedRef = z.object({
  objectType: z.enum(['hypothesis', 'plan', 'claim', 'scope']),
  objectId: z.string().min(1),
  reason: z.string().min(1),
});

const CausalAnalysisOut = z.object({
  affected: z.array(AffectedRef).default([]),
  causalChain: z.string().min(1),
  expectedQualityDelta: z.object({
    status: z.enum(['improved', 'neutral', 'worse', 'inconclusive']),
    claim: z.string().min(1),
  }),
});

const HypothesisRevisionOut = z.object({
  statement: z.string().min(1),
  mechanism: z.string().min(1),
  /** Complete new assumption list: kept ones verbatim (identity preserved), invalidated ones dropped, new ones added. */
  assumptions: z
    .array(
      z.object({
        statement: z.string().min(1),
        kind: z.enum(['empirical', 'theoretical', 'methodological', 'stipulated']),
      }),
    )
    .min(1),
  predictions: z.array(z.string().min(1)).min(1),
  addedUncertainties: z.array(z.string().min(1)).default([]),
  revisionRationale: z.string().min(1),
});

const PlanRevisionOut = z.object({
  steps: z.array(PlanStep).min(1),
  metrics: z.array(z.string().min(1)).min(1),
  decisionRules: DecisionRules,
  /** Optional so single-hypothesis plans stay valid; multi-hypothesis plans REVISION must
   * carry the discipline (the post-revision executability gate re-requires it — audit P2-2:
   * without this field a pre-D-025 multi-hypothesis plan could never pass revision again). */
  multipleTestingPolicy: z.enum(['single_primary', 'alpha_spending', 'e_value_accumulation']).optional(),
  multipleTestingNote: z.string().optional(),
  revisionRationale: z.string().min(1),
});

// ---------------------------------------------------------------------------
// system prompts
// ---------------------------------------------------------------------------

const CAUSAL_ANALYSIS_PROMPT = [
  'You are the causal-revision analyst of an evidence-constrained research workflow.',
  'Given one feedback signal and the CURRENT object graph (representative hypotheses, plan, claims, question scope),',
  'decide WHICH persisted objects this feedback FORCES to change and why. Reference ONLY objectIds copied verbatim',
  'from the payload (hypothesis/plan/claim ids; the question id counts as scope) — invented ids are dropped.',
  'Each affected entry needs a reason stating the causal pressure, not a restatement of the feedback.',
  'causalChain explains HOW the feedback propagates from its entry point through the affected objects.',
  'expectedQualityDelta is your honest expectation: "inconclusive" is legitimate; never promise improvement you cannot argue for.',
].join(' ');

const HYPOTHESIS_REVISION_PROMPT = [
  'You revise one scientific hypothesis under incoming feedback. Return the FULL revised content:',
  'statement and mechanism rewritten where the feedback demands it; the complete new assumption list',
  '(keep unchanged assumptions verbatim so identity is preserved, drop assumptions the feedback invalidates,',
  'add new ones where needed); updated predictions; addedUncertainties the revision exposes.',
  'Never erase existing uncertainties — only add. revisionRationale states what changed and why, causally tied to the feedback.',
].join(' ');

const PLAN_REVISION_PROMPT = [
  'You revise one executable research plan under incoming feedback. Return the complete revised steps,',
  'metrics and decisionRules. Keep existing step ids (format task_<26 lowercase alphanumerics>) for steps that',
  'survive; give new steps fresh ids of the same format; dependsOn must only reference step ids present in your',
  'returned steps. Every step keeps a non-empty method and at least one failure condition.',
  'When the plan discriminates more than one hypothesis, also state multipleTestingPolicy',
  '(single_primary / alpha_spending / e_value_accumulation) and justify it in multipleTestingNote —',
  'the deterministic gate rejects multi-hypothesis revisions without an explicit discipline.',
  'revisionRationale states what changed and why, causally tied to the feedback.',
].join(' ');

// ---------------------------------------------------------------------------
// deterministic bookkeeping (pure, no LLM)
// ---------------------------------------------------------------------------

/**
 * Signals not yet consumed by any Revision. Consumption is recorded ONLY by
 * revision creation (FeedbackSignal carries no consumed flag on purpose);
 * this predicate is therefore the single owner of "unconsumed".
 */
export const unconsumedSignals = (ctx: StageContext): FeedbackSignal[] => {
  const consumed = new Set(ctx.store.listObjects('revision', ctx.run.id).map((r) => r.triggerFeedbackId));
  return ctx.store
    .listObjects('feedback', ctx.run.id)
    .filter((s) => !consumed.has(s.id))
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id));
};

interface ObjectGraph {
  hypotheses: Map<string, Hypothesis>;
  plans: Map<string, Plan>;
  claimIds: Set<string>;
  questionId: string;
}

interface AffectedTargets {
  hypotheses: { hyp: Hypothesis; reason: string }[];
  plans: { plan: Plan; reason: string }[];
  /** Valid claim references: causally affected, but W2 has no automated claim revision path. */
  claimIds: string[];
  /** Valid scope (= question) references: same honest limitation as claims. */
  scopeIds: string[];
  /** Non-existent references, dropped and surfaced in the stage summary. */
  invalid: string[];
}

/** Existence-oracle filtering of model-named references: invalid ids never reach revision execution. */
const validateAffected = (affected: z.infer<typeof AffectedRef>[], graph: ObjectGraph): AffectedTargets => {
  const out: AffectedTargets = { hypotheses: [], plans: [], claimIds: [], scopeIds: [], invalid: [] };
  const seen = new Set<string>();
  for (const ref of affected) {
    const key = `${ref.objectType}:${ref.objectId}`;
    if (seen.has(key)) continue; // duplicate reference — first reason wins
    seen.add(key);
    if (ref.objectType === 'hypothesis' && graph.hypotheses.has(ref.objectId)) {
      out.hypotheses.push({ hyp: graph.hypotheses.get(ref.objectId)!, reason: ref.reason });
    } else if (ref.objectType === 'plan' && graph.plans.has(ref.objectId)) {
      out.plans.push({ plan: graph.plans.get(ref.objectId)!, reason: ref.reason });
    } else if (ref.objectType === 'claim' && graph.claimIds.has(ref.objectId)) {
      out.claimIds.push(ref.objectId);
    } else if (ref.objectType === 'scope' && ref.objectId === graph.questionId) {
      out.scopeIds.push(ref.objectId);
    } else {
      out.invalid.push(key);
    }
  }
  return out;
};

const truncate = (s: string, n = 200): string => (s.length <= n ? s : `${s.slice(0, Math.max(0, n - 3))}...`);

// ---------------------------------------------------------------------------
// per-object revision execution
// ---------------------------------------------------------------------------

interface RevisedObject {
  before: string; // version label of the pre-revision state
  after: string; // version label of the post-revision state
  archiveRef: string; // content-addressed artifact holding the full pre-revision object
  changedFields: string[];
  rationale: string;
  /** RU-12 GO-1: the post-revision OBJECT itself — the structured-diff walker
   * diffs it against the pre-revision object to emit RFC 6902 ops. */
  revised: unknown;
  /** Lane-06: deterministic revision-quality predicates (RU-14 A8.4, now wired) —
   * decision-rule preservation, falsifiability retention, scope delta. Revision
   * quality never rests on LLM self-report (qualityDelta). */
  predicates?: RevisionPredicateVector;
}

const reviseHypothesis = async (
  ctx: StageContext,
  signal: FeedbackSignal,
  hyp: Hypothesis,
  reason: string,
  causalChain: string,
): Promise<RevisedObject & { updatedUncertainties: string[] }> => {
  const out = await callStructured<z.infer<typeof HypothesisRevisionOut>>(ctx, {
    stage: 'revise',
    purpose: `hypothesis-revision:${hyp.id}`,
    systemPrompt: HYPOTHESIS_REVISION_PROMPT,
    payload: {
      feedback: { id: signal.id, source: signal.source, content: signal.content, target: signal.target ?? null },
      causalReason: reason,
      causalChain,
      hypothesis: {
        id: hyp.id,
        version: hyp.version,
        statement: hyp.statement,
        mechanism: hyp.mechanism,
        assumptions: hyp.assumptions.map((a) => ({
          id: a.id,
          statement: a.statement,
          kind: a.kind,
          backingClaimIds: a.backingClaimIds,
        })),
        predictions: hyp.predictions,
        uncertainties: hyp.uncertainties,
        falsification: hyp.falsification
          ? {
              decisionRule: hyp.falsification.decisionRule,
              falsificationCondition: hyp.falsification.falsificationCondition,
            }
          : null,
      },
    },
    schema: HypothesisRevisionOut,
    // SCIENCE lane: judgment-stage decoding pinned (was provider default).
    temperature: 0,
  });
  // Real-content discipline: a template revision must never overwrite a real
  // hypothesis — the archive below would lie about what changed and why.
  refuseTemplateMode(ctx, out.executionMode, `hypothesis revision for ${hyp.id}`);

  // version history is evidence: archive the exact pre-revision object before mutating
  const before = HypothesisCandidate.parse({ ...hyp });
  const archive = await ctx.artifacts.put(JSON.stringify(before, null, 2));

  // assumption reconciliation: unchanged statements keep id/backing/uncertainty; new ones get fresh non-colliding ids
  const byStatement = new Map(hyp.assumptions.map((a) => [a.statement.trim(), a] as const));
  const numericIds = hyp.assumptions
    .map((a) => /^a(\d+)$/.exec(a.id))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]));
  let nextId = Math.max(-1, ...numericIds) + 1;
  const assumptions = out.data.assumptions.map((a) => {
    const kept = byStatement.get(a.statement.trim());
    if (kept) return { ...kept, statement: a.statement, kind: a.kind };
    return { id: `a${nextId++}`, statement: a.statement, kind: a.kind, backingClaimIds: [] };
  });

  // uncertainties are only ever ADDED to (constitution §7: never erase negative evidence/unknowns)
  const uncertainties = [...hyp.uncertainties, ...out.data.addedUncertainties];
  if (hyp.falsification !== undefined) {
    uncertainties.push(
      `falsification spec predates revision to v${hyp.version + 1} (trigger ${signal.id}); re-validate before decision use`,
    );
  }

  const after = HypothesisCandidate.parse({
    ...hyp,
    version: hyp.version + 1,
    statement: out.data.statement,
    mechanism: out.data.mechanism,
    assumptions,
    predictions: out.data.predictions,
    uncertainties: [...new Set(uncertainties)],
    derivation: {
      ...hyp.derivation,
      rationale: `${hyp.derivation.rationale} | causal-revision v${hyp.version + 1} via ${signal.id}: ${out.data.revisionRationale}`,
    },
  });

  // ---- Lane-06: deterministic revision-quality predicates (RU-14 A8.4 wiring) ----
  // The predicates score before→after MECHANICALLY: decision-rule preservation
  // (silent weakening is caught), falsifiability retention (the revised hypothesis
  // must stay testable and keep its predictions/spec), scope delta. Violations are
  // disclosed on the object (monotonic uncertainty) — never silently absorbed.
  const predicates = revisionPredicates(before, after);
  const predicateNotes: string[] = [];
  if (!predicates.falsifiabilityRetained) {
    predicateNotes.push(
      `revision-quality: falsifiability NOT retained (${predicates.falsifiability.detail}) — the revision must not quietly make the hypothesis untestable`,
    );
  }
  if (!predicates.decisionRulesPreserved) {
    predicateNotes.push(
      `revision-quality: decision rules changed silently (changed: ${predicates.rulePreservation.changedRules.join(', ') || 'none'}; dropped: ${predicates.rulePreservation.droppedRules.join(', ') || 'none'}) — weakening a decision rule requires an explicit rationale`,
    );
  }
  if (predicateNotes.length > 0) {
    after.uncertainties = [...new Set([...after.uncertainties, ...predicateNotes])];
  }
  ctx.store.putObject('hypothesis', after);

  // Key-order-canonical comparison (WP2 F1): JSON.stringify reflects insertion order,
  // so a semantically identical `after` whose object keys enumerate differently would
  // report false changedFields — the audit trail must not lie. canonicalJson sorts keys,
  // matching what the export hashes actually compare.
  const changedFields = (
    ['statement', 'mechanism', 'assumptions', 'predictions', 'uncertainties', 'version'] as const
  ).filter((f) => canonicalJson(hyp[f]) !== canonicalJson(after[f]));
  return {
    before: `v${before.version} — ${truncate(before.statement)}`,
    after: `v${after.version} — ${truncate(after.statement)}`,
    archiveRef: archive.ref,
    changedFields,
    rationale: out.data.revisionRationale,
    updatedUncertainties: after.uncertainties,
    revised: after,
    predicates,
  };
};

const revisePlan = async (
  ctx: StageContext,
  signal: FeedbackSignal,
  plan: Plan,
  reason: string,
  causalChain: string,
  knownHypothesisIds: string[],
): Promise<RevisedObject & { executabilityPassed?: boolean }> => {
  const out = await callStructured<z.infer<typeof PlanRevisionOut>>(ctx, {
    stage: 'revise',
    purpose: `plan-revision:${plan.id}`,
    systemPrompt: PLAN_REVISION_PROMPT,
    payload: {
      feedback: { id: signal.id, source: signal.source, content: signal.content, target: signal.target ?? null },
      causalReason: reason,
      causalChain,
      plan: {
        id: plan.id,
        objective: plan.objective,
        hypothesisIds: plan.hypothesisIds,
        steps: plan.steps.map((s) => ({
          id: s.id,
          title: s.title,
          kind: s.kind,
          method: s.method,
          failureConditions: s.failureConditions,
          dependsOn: s.dependsOn,
        })),
        metrics: plan.metrics,
        decisionRules: plan.decisionRules,
      },
    },
    schema: PlanRevisionOut,
    // SCIENCE lane: judgment-stage decoding pinned (was provider default).
    temperature: 0,
  });
  // Real-content discipline: a template plan revision must never overwrite a
  // real (frozen, preregistered) plan — same refusal class as hypothesis revision.
  refuseTemplateMode(ctx, out.executionMode, `plan revision for ${plan.id}`);

  const before = ResearchPlan.parse({ ...plan });
  const archive = await ctx.artifacts.put(JSON.stringify(before, null, 2));
  const after = ResearchPlan.parse({
    ...plan,
    steps: out.data.steps,
    metrics: out.data.metrics,
    decisionRules: out.data.decisionRules,
    ...(out.data.multipleTestingPolicy !== undefined ? { multipleTestingPolicy: out.data.multipleTestingPolicy } : {}),
    ...(out.data.multipleTestingNote !== undefined ? { multipleTestingNote: out.data.multipleTestingNote } : {}),
  });
  // deterministic re-gate after revision (mission §31: missing pieces are recorded, never papered over)
  // Wave-S: the structured preregistration layer is re-audited too, and the revised plan
  // is RE-FROZEN (a revision is a new registration; the pre-revision plan is archived above).
  const baseCheck = checkPlanExecutability(after, knownHypothesisIds);
  const structuredCheck = checkStructuredPreregistration(after, knownHypothesisIds);
  const refreeze = freezePlan(after, new Date().toISOString());
  after.planHash = refreeze.planHash;
  after.frozenAt = refreeze.frozenAt;
  after.executabilityCheck = {
    passed: baseCheck.passed && structuredCheck.errors.length === 0,
    missing: [...baseCheck.missing, ...structuredCheck.errors.map((e) => `结构化预注册校验：${e}`)],
    structuredWarnings: structuredCheck.warnings,
  };
  // g6: re-testing the same hypothesis across versions spends error budget — disclosed.
  const alphaLedger = alphaSpendLedger([before, after]);
  if (alphaLedger.length > 0) {
    ctx.log(
      `g6 α-spend across versions: ${alphaLedger
        .map((r) => `${r.hypothesisId} versions=${r.versions} cumulativeAlpha=${r.totalAlpha}`)
        .join('; ')}`,
    );
  }
  ctx.store.putObject('plan', after);

  const changedFields = (['steps', 'metrics', 'decisionRules', 'executabilityCheck'] as const).filter(
    // Lane-06: canonical key-sorted comparison (same WP2 F1 fix the hypothesis path
    // already had) — JSON.stringify insertion order must never fabricate a change.
    (f) => canonicalJson(plan[f]) !== canonicalJson(after[f]),
  );
  return {
    before: `pre-revision — metrics: ${truncate(before.metrics.join('; '), 120)}`,
    after: `revised — metrics: ${truncate(after.metrics.join('; '), 120)}`,
    archiveRef: archive.ref,
    changedFields,
    rationale: out.data.revisionRationale,
    executabilityPassed: after.executabilityCheck?.passed,
    revised: after,
  };
};

// ---------------------------------------------------------------------------
// stage handler
// ---------------------------------------------------------------------------

export const reviseStage: StageHandler = {
  stage: 'revise',

  async applicable(ctx) {
    return unconsumedSignals(ctx).length > 0;
  },

  async execute(ctx: StageContext): Promise<StageOutcome> {
    try {
      return await reviseExecute(ctx);
    } catch (e) {
      // Real-content discipline (2026-08-29): template revisions never mint; the
      // feedback signals stay unconsumed and are re-processed on resume under a
      // live route.
      if (e instanceof TemplateModeRefusal) return { kind: 'skipped', reason: e.message };
      throw e;
    }
  },
};

async function reviseExecute(ctx: StageContext): Promise<StageOutcome> {
    const runId = ctx.run.id;
    const pending = unconsumedSignals(ctx);
    if (pending.length === 0) {
      return { kind: 'skipped', reason: 'no unconsumed feedback signals (every signal already has a revision)' };
    }

    const notes: string[] = [];
    const warnings: string[] = [];
    const unhandled: string[] = [];
    const artifactRefs: string[] = [];
    let revisionsCreated = 0;

    for (const signal of pending) {
      assertNotCancelled(ctx, 'revise');
      // Fresh object graph per signal: an earlier signal in this pass may already have revised objects.
      const hypotheses = ctx.store.listObjects('hypothesis', runId);
      const plans = ctx.store.listObjects('plan', runId);
      const claims = ctx.store.listObjects('claim', runId);
      const question = ctx.store.getObject('question', ctx.run.questionId);
      const representatives = hypotheses.filter(isRepresentative);

      // ---- causal analysis: which persisted objects does this feedback force to change, and why ----
      const analysis = await callStructured<z.infer<typeof CausalAnalysisOut>>(ctx, {
        stage: 'revise',
        purpose: 'causal-revision-analysis',
        systemPrompt: CAUSAL_ANALYSIS_PROMPT,
        payload: {
          feedback: { id: signal.id, source: signal.source, content: signal.content, target: signal.target ?? null },
          hypotheses: representatives.map((h) => ({
            id: h.id,
            version: h.version,
            statement: h.statement,
            mechanism: h.mechanism,
            assumptions: h.assumptions.map((a) => a.statement),
            predictions: h.predictions,
          })),
          plans: plans.map((p) => ({
            id: p.id,
            objective: p.objective,
            steps: p.steps.map((s) => ({ id: s.id, title: s.title, kind: s.kind, method: s.method })),
            metrics: p.metrics,
            decisionRules: p.decisionRules,
          })),
          claimsSummary: claims.map((c) => ({ id: c.id, text: c.text, bindingStatus: c.bindingStatus })),
          question: question ? { id: question.id, text: question.text } : null,
        },
        schema: CausalAnalysisOut,
        // SCIENCE lane: judgment-stage decoding pinned (was provider default).
        temperature: 0,
      });
      // Real-content discipline (2026-08-29): the causal analysis decides what
      // this feedback FORCES to change — a deterministic development wire's
      // verdict is template. Refuse before any revision mints; the signal stays
      // unconsumed and is re-analyzed on resume under a live route.
      refuseTemplateMode(ctx, analysis.executionMode, 'causal revision analysis');

      const targets = validateAffected(analysis.data.affected, {
        hypotheses: new Map(representatives.map((h) => [h.id, h] as const)),
        plans: new Map(plans.map((p) => [p.id, p] as const)),
        claimIds: new Set(claims.map((c) => c.id)),
        questionId: ctx.run.questionId,
      });
      if (targets.invalid.length > 0) {
        warnings.push(`${signal.id}: dropped non-existent reference(s): ${targets.invalid.join(', ')}`);
      }
      if (targets.claimIds.length > 0 || targets.scopeIds.length > 0) {
        const flagged = [
          ...targets.claimIds.map((id) => `claim:${id}`),
          ...targets.scopeIds.map((id) => `scope:${id}`),
        ].join(', ');
        unhandled.push(`${signal.id}: causally affected but no automated revision path (flagged for review): ${flagged}`);
      }

      // ---- revision execution per affected object ----
      const operations: z.infer<typeof RevisionOperation>[] = [];
      const diffEntries: VersionDiffEntry[] = [];
      const versionLabels: { from: string; to: string }[] = [];
      const remainingUncertainties: string[] = [];
      const objectNotes: string[] = [];

      for (const { hyp, reason } of targets.hypotheses) {
        const revised = await reviseHypothesis(ctx, signal, hyp, reason, analysis.data.causalChain);
        artifactRefs.push(revised.archiveRef);
        operations.push({
          objectType: 'hypothesis',
          objectId: hyp.id,
          operation: 'refine',
          before: `${revised.before} (archived full object: ${revised.archiveRef})`,
          after: revised.after,
          reason,
        });
        // RU-12 GO-1: id-anchored structured ops ride the diff entry — the
        // revision chain is field-explainable (walker over archived before vs after)
        const hypDiff = diffArtifacts(hyp, revised.revised, { idKeys: ['id', 'observable', 'label'] });
        // Lane-06: deterministic predicate flags ride the entry so downstream
        // consumers (iteration material-delta, audits, UI) can read revision
        // quality without re-deriving it or trusting LLM self-report.
        const p = revised.predicates;
        const predicateFlags = p === undefined ? [] : [
          `falsifiability_retained:${p.falsifiabilityRetained}`,
          `decision_rules_preserved:${p.decisionRulesPreserved}`,
          `scope_delta:${p.scope.changedFields.join('+') || 'none'}`,
        ];
        diffEntries.push({
          objectType: 'hypothesis',
          objectId: hyp.id,
          summary: revised.rationale,
          changedFields: revised.changedFields,
          patchOps: hypDiff.ops,
          semanticFlags: [...hypDiff.semanticFlags, ...predicateFlags],
        });
        if (p !== undefined && !p.falsifiabilityRetained) {
          warnings.push(`${hyp.id}: revision v${hyp.version + 1} did NOT retain falsifiability (${p.falsifiability.detail}) — disclosed on the object`);
        }
        if (p !== undefined && !p.decisionRulesPreserved) {
          warnings.push(
            `${hyp.id}: revision v${hyp.version + 1} silently changed decision rules (changed: ${p.rulePreservation.changedRules.join(', ') || 'none'}; dropped: ${p.rulePreservation.droppedRules.join(', ') || 'none'})`,
          );
        }
        versionLabels.push({ from: `${hyp.id}@v${hyp.version}`, to: `${hyp.id}@v${hyp.version + 1}` });
        remainingUncertainties.push(...revised.updatedUncertainties);
        objectNotes.push(`hypothesis ${hyp.id} v${hyp.version}->v${hyp.version + 1} (${revised.changedFields.join('+')})`);
      }

      for (const { plan, reason } of targets.plans) {
        const revised = await revisePlan(ctx, signal, plan, reason, analysis.data.causalChain, hypotheses.map((h) => h.id));
        artifactRefs.push(revised.archiveRef);
        operations.push({
          objectType: 'plan',
          objectId: plan.id,
          operation: 'modify',
          before: `${plan.id} ${revised.before} (archived full object: ${revised.archiveRef})`,
          after: `${plan.id} ${revised.after}`,
          reason,
        });
        const planDiff = diffArtifacts(plan, revised.revised, { idKeys: ['id', 'label', 'metricKey'] });
        diffEntries.push({
          objectType: 'plan',
          objectId: plan.id,
          summary: revised.rationale,
          changedFields: revised.changedFields,
          patchOps: planDiff.ops,
          semanticFlags: planDiff.semanticFlags,
        });
        versionLabels.push({ from: `${plan.id}@pre-revision`, to: `${plan.id}@revised` });
        objectNotes.push(
          `plan ${plan.id} revised (${revised.changedFields.join('+')}, executabilityCheck.passed=${revised.executabilityPassed})`,
        );
      }

      if (operations.length === 0) {
        // Honest no-op: the signal stays unconsumed (it still needs attention) and nothing is fabricated.
        unhandled.push(`${signal.id}: analysis named no revisable object — no revision persisted, signal stays unconsumed`);
        continue;
      }

      // ---- persist the causal record: Revision + VersionDiff + audit event ----
      const revision = Revision.parse({
        id: newId('rev'),
        runId,
        triggerFeedbackId: signal.id,
        causalReason: analysis.data.causalChain,
        operations,
        fromVersionLabel: versionLabels.map((l) => l.from).join('; '),
        toVersionLabel: versionLabels.map((l) => l.to).join('; '),
        qualityDelta: {
          status: analysis.data.expectedQualityDelta.status,
          claim:
            `${analysis.data.expectedQualityDelta.claim} ` +
            `[producer: LLM self-assessment (${analysis.provider}/${analysis.modelId}); ` +
            'calibration: uncalibrated — expectation, not an empirical measurement]',
          evidenceRefs: [],
        },
        createdAt: new Date().toISOString(),
      });
      ctx.store.putObject('revision', revision);

      const diff = VersionDiff.parse({
        revisionId: revision.id,
        runId,
        entries: diffEntries,
        semanticSummary:
          `feedback ${signal.id} (source=${signal.source}) propagated: ${analysis.data.causalChain} ` +
          `Objects changed: ${diffEntries.map((e) => `${e.objectType} ${e.objectId}`).join(', ')}.`,
        remainingUncertainties: [...new Set(remainingUncertainties)],
      });
      ctx.store.putObject('version_diff', diff);

      ctx.store.appendEvent(runId, {
        type: 'revision_created',
        detail: {
          revisionId: revision.id,
          triggerFeedbackId: signal.id,
          objects: diffEntries.map((e) => `${e.objectType}:${e.objectId}`),
        },
      });
      revisionsCreated += 1;
      notes.push(`rev ${revision.id} <- ${signal.id}: ${objectNotes.join('; ')}; qualityDelta=${revision.qualityDelta.status}`);
    }

    const parts = [
      `consumed ${pending.length} feedback signal(s); created ${revisionsCreated} revision(s) with version diff(s).`,
      ...notes,
    ];
    if (warnings.length > 0) parts.push(`warnings: ${warnings.join(' | ')}`);
    if (unhandled.length > 0) parts.push(`not executed: ${unhandled.join(' | ')}`);
    return { kind: 'done', summary: parts.join(' '), ...(artifactRefs.length > 0 ? { artifacts: artifactRefs } : {}) };
}
