import { z } from 'zod';
import { newId, ResearchPlan, LedgerEntry, probsFromExpected } from '../../domain/index.js';
import type { HypothesisCandidate } from '../../domain/index.js';
import { callStructured } from '../llm.js';
import type { StageHandler } from '../types.js';
import { memoryNegativeConditioning, recordMemoryConditioning } from '../../app/memory.js';
import { checkStructuredPreregistration, freezePlan } from './plan-formal.js';
import { isCancellationError } from './guard.js';
import { refuseTemplateMode, TemplateModeRefusal } from './shared.js';

/** W-C bilingual display layer: zh rendering of the plan objective (one temp-0 call). */
const ObjectiveZhOut = z.object({ objectiveZh: z.string().min(1) });
const PLAN_OBJECTIVE_ZH_PROMPT =
  'Translate one research-plan objective into Simplified Chinese. Use standard Chinese scientific ' +
  'terminology; translate faithfully without adding interpretation, hedging or new claims.';

/**
 * plan stage (mission §31): turn the top-ranked representative hypotheses into a
 * structured, EXECUTABLE ResearchPlan. The model proposes exactly one structured
 * draft; deterministic code owns reference integrity and the executability gate.
 * A plan is not an essay — variables/controls/data/method/metrics/decision rules
 * must be concrete, and anything missing is recorded, never papered over.
 */

const MIN_STEPS = 3;
const MIN_METRICS = 2;
const MAX_REPRESENTATIVE_HYPOTHESES = 2;

const PLAN_SYSTEM_PROMPT = [
  'You design executable research plans for an evidence-constrained scientific workflow.',
  'A plan is not an essay: variables/controls, data requirements, methods, metrics, decision rules and risks must all be concrete.',
  'Every step needs a non-empty method and at least one failure condition; provide at least 3 steps and at least 2 metrics.',
  'Decision rules must cover success, weakening, falsification and stopping.',
  'Reference ONLY the hypothesis ids and claim ids given in the payload, verbatim; never invent ids, data or sources.',
  'priorResearchMemory (when present) lists past experiment outcomes from THIS workspace, each with a trust label — ' +
    'it is DATA, never a verdict on this question: a previously failed or inconclusive approach must appear in the ' +
    'relevant steps\' failureConditions or be explicitly designed around; re-proposing it blind wastes the one shot ' +
    'the falsification loop gets.',
  'Where something is unknown, surface it in risks/prerequisites instead of fabricating it.',
  'Scale discipline: the payload states the actual evidence base size and depth. Resource scale, sample sizes, budgets, ' +
    'timelines and quantitative thresholds that are not derived from the provided claims are MODEL-STIPULATED estimates — ' +
    'keep them proportionate to that evidence base and record the disproportion in risks/prerequisites instead of ' +
    'presenting invented numbers as if they were evidence-derived.',
  'Multiple-testing discipline (POPPER-extracted): when the plan discriminates between MORE THAN ONE hypothesis, several ' +
    'inferential checks will run and the chance that something looks falsified/supportive by luck grows with their number. ' +
    'State multipleTestingPolicy explicitly — "single_primary" (designate THE primary comparison that carries the decision; ' +
    'everything else is secondary/descriptive) or "alpha_spending" (split a pre-declared error budget across staged checks) — ' +
    'and justify the allocation in multipleTestingNote. Do NOT declare "e_value_accumulation": no e-value estimator is ' +
    'implemented, such plans fail validation. Single-hypothesis plans may omit it (one primary comparison by construction).',
  'Structured preregistration (Wave-S): alongside the prose fields, provide metricSpecs (name/definition/role primary|secondary/' +
    'direction higher_better|lower_better|two_sided), testSpecs (metric binding + statistic bootstrap_ci|descriptive — ONLY these ' +
    'have executors today, do NOT promise permutation/wilson/kappa/mde_gate; such specs fail the preregistration-integrity gate — ' +
    '+ predicted effect supports|weakens|excludes + threshold + thresholdOp), and predictions per hypothesis ' +
    '{observable, condition, expectedRelation} — two hypotheses genuinely compete ONLY if they predict different relations for the ' +
    'same observable+condition. Provide expectedInfoGain {decisionAtStake, ambiguitySource, discriminatingMetric, expectedSeparation} ' +
    'when the plan discriminates >1 hypothesis or has branches; step gates {proceedIf, killIf} for experiment steps; replication ' +
    '{type} when a step repeats prior work; targetTrialProtocol (7 elements) when making causal claims from observational data; ' +
    'and measurable/estimand/controlRun one-liners when applicable. Thresholds must follow the metric direction (a higher_better ' +
    'metric succeeds at ">= threshold" and weakens/excludes at "<= threshold"). Leave a field absent rather than fabricating it — ' +
    'absence is disclosed, fabrication is not tolerated.',
  'Problem-model alignment (AOSSA): when the payload carries problemModel, its objectives are the ground ' +
    'truth for what the plan must discriminate and its selectedMethods are the method families chosen for this ' +
    'objective — plan steps must operate INSIDE those families (a numerical_simulation selection means solver ' +
    'steps with discretization-error analysis, not a literature screen). Deviating from a selected family is ' +
    'legal only as an explicitly justified additional lane recorded in risks.',
].join(' ');

/** Model-output shape: the full plan minus server-owned fields (id/runId/createdAt/check). */
/** Model step ids and dep refs are arbitrary strings ('task_1', 's1'); the server owns canonical ids. */
const PlanStepShapeLooseId = ResearchPlan.shape.steps.element
  .omit({ id: true })
  .extend({ id: z.string().min(1), dependsOn: z.array(z.string().min(1)).default([]) });

const PlanDraftSchema = ResearchPlan.omit({
  id: true,
  runId: true,
  createdAt: true,
  executabilityCheck: true,
}).extend({
  steps: z.array(PlanStepShapeLooseId),
});
type PlanDraft = z.infer<typeof PlanDraftSchema>;

/** Deterministically remap model step ids to canonical task_<rand> ids, rewriting inputs/dependsOn. */
const canonicalizeStepIds = (draft: PlanDraft): PlanDraft => {
  const mapping = new Map<string, string>();
  for (const step of draft.steps) {
    const canonical = newId('task');
    mapping.set(step.id, canonical);
    step.id = canonical;
  }
  for (const step of draft.steps) {
    step.inputs = step.inputs.map((ref) => mapping.get(ref) ?? ref);
    step.dependsOn = step.dependsOn.map((dep) => mapping.get(dep) ?? dep);
  }
  return draft;
};

export interface ExecutabilityCheck {
  passed: boolean;
  missing: string[];
  statisticalDesignNote?: string;
}

/**
 * Deterministic executability gate (pure function). Encodes the §31 essentials that
 * zod counts/cross-references cannot express on their own. Unknown hypothesis ids
 * are reported as failures; callers render `missing` verbatim to humans.
 *
 * Step-reference integrity (W2): LLMs fabricate sequential-looking step ids
 * (`task_1a2b…`) that are not ids of any step in this plan. Inputs may carry non-task
 * refs (claim ids, free-text resource names) — only refs starting with `task_` must
 * resolve to a real step id of this plan. dependsOn refs must ALL resolve; a dangling
 * dependency makes the step ordering undefined, so it is a hard failure.
 */
export const checkPlanExecutability = (
  plan: Pick<
    ResearchPlan,
    'objective' | 'hypothesisIds' | 'steps' | 'metrics' | 'decisionRules' | 'dataRequirements' | 'multipleTestingPolicy'
  >,
  knownHypothesisIds: Iterable<string>,
): ExecutabilityCheck => {
  const missing: string[] = [];
  if (!plan.objective.trim()) missing.push('objective 为空');
  if (plan.hypothesisIds.length === 0) missing.push('hypothesisIds 为空：计划未绑定任何假设');
  const known = new Set(knownHypothesisIds);
  for (const id of plan.hypothesisIds) {
    if (!known.has(id)) missing.push(`hypothesisIds 引用不存在的假设：${id}`);
  }
  if (plan.steps.length < MIN_STEPS) missing.push(`steps 数量不足：${plan.steps.length} < ${MIN_STEPS}`);
  const stepIds = new Set(plan.steps.map((s) => s.id));
  plan.steps.forEach((step, i) => {
    if (!step.method.trim()) missing.push(`steps[${i}]「${step.title}」缺少 method`);
    if (step.failureConditions.length === 0) missing.push(`steps[${i}]「${step.title}」缺少 failureConditions`);
    for (const ref of step.inputs) {
      if (ref.startsWith('task_') && !stepIds.has(ref)) {
        missing.push(`steps[${i}]「${step.title}」inputs 含无效步骤引用（task_ 前缀必须为本 plan 内真实 step id）：${ref}`);
      }
    }
    for (const dep of step.dependsOn) {
      if (!stepIds.has(dep)) {
        missing.push(`steps[${i}]「${step.title}」dependsOn 引用不存在的步骤：${dep}`);
      }
    }
  });
  if (plan.metrics.length < MIN_METRICS) missing.push(`metrics 数量不足：${plan.metrics.length} < ${MIN_METRICS}`);
  const ruleFields: readonly [keyof ResearchPlan['decisionRules'], string][] = [
    ['successCriterion', '成功判据'],
    ['weakeningCriterion', '弱化判据'],
    ['falsificationCriterion', '证伪判据'],
    ['stopCriterion', '判停判据'],
  ];
  for (const [field, label] of ruleFields) {
    if (!plan.decisionRules[field].trim()) missing.push(`decisionRules 缺少${label}（${field} 为空）`);
  }
  // POPPER-extracted multiple-testing discipline (D-024 Wave-3 #5): multi-hypothesis
  // plans run several inferential checks; an explicit policy is REQUIRED, no silent
  // default. Single-hypothesis plans have one primary comparison by construction.
  if (plan.hypothesisIds.length > 1 && plan.multipleTestingPolicy === undefined) {
    missing.push(
      'multipleTestingPolicy 缺失：区分多个假设的计划必须显式声明多重检验纪律（single_primary / alpha_spending / e_value_accumulation），未声明的多重比较会膨胀假发现率',
    );
  }
  plan.dataRequirements.forEach((req, i) => {
    if (req.variables.length === 0) missing.push(`dataRequirements[${i}]「${req.name}」未声明 variables`);
  });
  // Statistical-design advisory (W-G follow-up; Maastricht QA-checklist pattern):
  // quantitative metrics (rates/ratios/threshold comparisons) with NO statistical design
  // element (power, sample size, effect size, significance, CI) leave the plan executable
  // but statistically under-specified. Advisory only — never fails the gate: qualitative
  // plans legitimately omit statistical design.
  const quantitative = plan.metrics.some((m) => /(rate|ratio|percent|frequency|difference|fold|比率|频率)/i.test(m))
    || /[≥<>=]\s*\d/.test(plan.decisionRules.successCriterion);
  const hasStatsDesign = [plan.objective, ...plan.metrics, ...Object.values(plan.decisionRules), ...plan.dataRequirements.map((d) => d.name)]
    .some((t) => /(power|sample size|effect size|significance|confidence interval|alpha|功效|样本量|效应量|显著性)/i.test(t));
  const statisticalDesignNote = quantitative && !hasStatsDesign
    ? '定量指标缺少统计设计要素（power/样本量/效应量/显著性水平）——计划可执行但统计上欠规范，建议实施前补齐'
    : undefined;
  return { passed: missing.length === 0, missing, ...(statisticalDesignNote !== undefined ? { statisticalDesignNote } : {}) };
};

interface DroppedStepRef {
  stepIndex: number;
  stepTitle: string;
  ref: string;
}

interface StepRefSanitizeResult {
  /** Invalid `task_` refs removed from step.inputs — warning severity, logged loudly. */
  droppedInputs: DroppedStepRef[];
  /** Invalid dependsOn refs removed — dependency loss, escalated into executabilityCheck.missing. */
  droppedDeps: DroppedStepRef[];
}

/**
 * Post-generation sanitization (deterministic, no LLM): strip fabricated task
 * references from the model draft BEFORE it is persisted. inputs keep non-task refs
 * (claim ids / free text); dependsOn entries that do not resolve to a real step id
 * are removed and reported by the caller — never silently papered over.
 */
const sanitizeStepTaskReferences = (draft: PlanDraft): StepRefSanitizeResult => {
  const stepIds = new Set(draft.steps.map((s) => s.id));
  const result: StepRefSanitizeResult = { droppedInputs: [], droppedDeps: [] };
  draft.steps.forEach((step, i) => {
    step.inputs = step.inputs.filter((ref) => {
      if (ref.startsWith('task_') && !stepIds.has(ref)) {
        result.droppedInputs.push({ stepIndex: i, stepTitle: step.title, ref });
        return false;
      }
      return true;
    });
    step.dependsOn = step.dependsOn.filter((dep) => {
      if (!stepIds.has(dep)) {
        result.droppedDeps.push({ stepIndex: i, stepTitle: step.title, ref: dep });
        return false;
      }
      return true;
    });
  });
  return result;
};

export const planStage: StageHandler = {
  stage: 'plan',
  applicable: async (ctx) => ctx.store.listObjects('plan', ctx.run.id).length === 0,

  execute: async (ctx) => {
    try {
      return await planExecute(ctx);
    } catch (e) {
      // Real-content discipline (2026-08-29): a template plan never persists;
      // the stage re-runs on resume once a live route serves the run.
      if (e instanceof TemplateModeRefusal) return { kind: 'skipped', reason: e.message };
      throw e;
    }
  },
};

async function planExecute(ctx: Parameters<NonNullable<StageHandler['execute']>>[0]): Promise<ReturnType<NonNullable<StageHandler['execute']>>> {
    if (ctx.cancelled()) throw new Error('cancelled by user');
    const runId = ctx.run.id;

    const question = ctx.store.getObject('question', ctx.run.questionId);
    const hypotheses = ctx.store.listObjects('hypothesis', runId);
    const scorecards = ctx.store
      .listObjects('scorecard', runId)
      .sort((a, b) => a.rank - b.rank);

    // Top-K (K<=2) representatives by scorecard rank; fall back to raw candidates when unranked.
    let representatives: HypothesisCandidate[] = [];
    if (scorecards.length > 0) {
      const byId = new Map(hypotheses.map((h) => [h.id, h] as const));
      representatives = scorecards
        .slice(0, MAX_REPRESENTATIVE_HYPOTHESES)
        .map((s) => byId.get(s.hypothesisId))
        .filter((h): h is HypothesisCandidate => h !== undefined);
    } else {
      ctx.log('no scorecards found — planning directly from stored hypotheses (capped at 2)');
    }
    if (representatives.length === 0) {
      representatives = hypotheses.slice(0, MAX_REPRESENTATIVE_HYPOTHESES);
    }
    if (representatives.length === 0) {
      // Honest abstention: with no hypotheses there is nothing a truthful plan could
      // contain. Skipping (visible) beats fabricating a plan or hard-failing the run.
      return {
        kind: 'skipped',
        reason: 'no defensible hypotheses were produced from the verified evidence — an honest plan is impossible; inspect the evidence tab for what was (in)sufficient',
      };
    }

    const claims = ctx.store.listObjects('claim', runId);
    const verifiedClaims = claims.filter((c) => c.bindingStatus === 'verified');

    // RU-1 memory consumer #2: past OWN outcomes condition plan design (a failed
    // approach belongs in failureConditions, not re-proposed blind). Same
    // trust-fenced retrieval and the same auditable disclosure event as the
    // hypotheses stage; zero memory = zero change to the payload.
    const priorOutcomes = memoryNegativeConditioning(
      ctx.store,
      question?.text ?? representatives[0]?.statement ?? '',
    );
    recordMemoryConditioning(ctx.store, runId, 'plan', priorOutcomes);

    // W5/S5: the real evidence ceiling, computed from the store (not asserted by the
    // model) — the plan generator must see the corpus it is extrapolating from.
    const sources = ctx.store.listObjects('source_document', runId);
    const metadataOnlySources = sources.filter((s) => s.contentDepth === 'metadata_only').length;

    const payload = {
      evidenceBase: {
        sourcesTotal: sources.length,
        abstractDepthOrDeeper: sources.length - metadataOnlySources,
        metadataOnly: metadataOnlySources,
        verifiedClaims: verifiedClaims.length,
        note: 'the plan extrapolates from THIS evidence base; unsupported scale numbers are model-stipulated',
      },
      question: question
        ? {
            id: question.id,
            text: question.text,
            goalType: question.goalType,
            scope: question.scope,
            constraints: question.constraints,
          }
        : null,
      representativeHypotheses: representatives.map((h) => ({
        id: h.id,
        statement: h.statement,
        mechanism: h.mechanism,
        keyAssumptions: h.assumptions.map((a) => a.statement),
        testability: h.testability,
        uncertainties: h.uncertainties,
        falsification: h.falsification
          ? {
              observable: h.falsification.observable,
              measurement: h.falsification.measurement,
              decisionRule: h.falsification.decisionRule,
              falsificationCondition: h.falsification.falsificationCondition,
            }
          : null,
      })),
      verifiedClaims: verifiedClaims.map((c) => ({ id: c.id, text: c.text })),
      ...(priorOutcomes.length > 0
        ? {
            // RU-1: past outcomes are DATA with trust labels — a failed prior
            // experiment belongs in failureConditions, not re-proposed blind.
            priorResearchMemory: priorOutcomes,
          }
        : {}),
      // AOSSA: the run's problem model rides the plan payload — objectives ground
      // what to discriminate; selected families constrain step methods.
      ...(() => {
        const pm = ctx.store.listObjects('problem_model', ctx.run.id)[0];
        if (pm === undefined) return {};
        return {
          problemModel: {
            objectives: pm.objectives,
            variables: pm.variables,
            selectedMethods: ctx.store
              .listObjects('method_selection', ctx.run.id)
              .flatMap((s) => s.candidates.filter((cd) => cd.assessment === 'selected').map((cd) => cd.family)),
          },
        };
      })(),
      rules: { minSteps: MIN_STEPS, minMetrics: MIN_METRICS },
    };

    const res = await callStructured<PlanDraft>(ctx, {
      stage: 'plan',
      purpose: 'research-plan-design',
      systemPrompt: PLAN_SYSTEM_PROMPT,
      payload,
      schema: PlanDraftSchema,
      temperature: 0.2,
    });

    // Real-content discipline (2026-08-29): the plan is scientific JUDGMENT — a
    // deterministic development wire's plan ("Offline development plan: …") is
    // template. Refuse before anything persists; the stage re-runs on resume
    // once a live route serves the run.
    refuseTemplateMode(ctx, res.executionMode, 'research plan');

    // The server owns canonical step ids: remap model ids (any shape) deterministically.
    canonicalizeStepIds(res.data);

    // Reference integrity for claims: keep only ids that actually exist (drop, loudly).
    const knownClaimIds = new Set(claims.map((c) => c.id));
    const droppedClaimIds = res.data.evidenceClaimIds.filter((id) => !knownClaimIds.has(id));
    if (droppedClaimIds.length > 0) {
      ctx.log(`dropping evidenceClaimIds that do not exist in store: ${droppedClaimIds.join(', ')}`);
    }

    // Reference integrity for steps: fabricated task_ refs are stripped before persist.
    const refSanitize = sanitizeStepTaskReferences(res.data);
    for (const d of refSanitize.droppedInputs) {
      ctx.log(
        `warning: dropped invalid task_ input ref (not a step id of this plan): steps[${d.stepIndex}]「${d.stepTitle}」inputs=${d.ref}`,
      );
    }
    for (const d of refSanitize.droppedDeps) {
      ctx.log(`dropped invalid dependsOn ref: steps[${d.stepIndex}]「${d.stepTitle}」dependsOn=${d.ref}`);
    }

    const plan = ResearchPlan.parse({
      ...res.data,
      id: newId('pln'),
      runId,
      evidenceClaimIds: res.data.evidenceClaimIds.filter((id) => knownClaimIds.has(id)),
      createdAt: new Date().toISOString(),
    });
    // A dropped dependency leaves the step ordering undefined — recorded in `missing`,
    // never silent; dropped input refs stay warning-level (ctx.log above).
    const check = checkPlanExecutability(plan, hypotheses.map((h) => h.id));
    // Wave-S g2/g3: the structured preregistration layer is audited exactly when present.
    const structured = checkStructuredPreregistration(plan, hypotheses.map((h) => h.id));
    const missing = [
      ...check.missing,
      ...structured.errors.map((e) => `结构化预注册校验：${e}`),
      ...refSanitize.droppedDeps.map(
        (d) => `steps[${d.stepIndex}]「${d.stepTitle}」依赖缺失：dependsOn 引用 ${d.ref} 不在本 plan 内，已剔除`,
      ),
    ];
    // g13 freeze (RR stage-1): register the content hash BEFORE anything can drift.
    const now = new Date().toISOString();
    const freeze = freezePlan(plan, now);
    plan.planHash = freeze.planHash;
    plan.frozenAt = freeze.frozenAt;
    plan.executabilityCheck = {
      passed: missing.length === 0,
      missing,
      structuredWarnings: structured.warnings,
    };
    ctx.store.putObject('plan', plan);

    // L4 self-calibration loop: forward predictions go on the ledger at EMISSION time —
    // every structured prediction and the tournament's top call become scoreable claims.
    for (const p of plan.predictions) {
      ctx.store.putObject(
        'prediction',
        LedgerEntry.parse({
          id: newId('prd'),
          runId,
          kind: 'expected_relation',
          stage: 'plan',
          predictor: 'plan-structured-preregistration',
          assertion: {
            hypothesisId: p.hypothesisId,
            observable: p.observable,
            condition: p.condition,
            expectedRelation: p.expectedRelation,
          },
          probs: probsFromExpected(p.expectedRelation),
          predictedAt: now,
          settlesWith: 'experiment_verdict',
        }),
      );
    }
    const topScorecard = scorecards[0];
    if (topScorecard !== undefined) {
      ctx.store.putObject(
        'prediction',
        LedgerEntry.parse({
          id: newId('prd'),
          runId,
          kind: 'rank_order',
          stage: 'rank',
          predictor: 'rank-tournament-bt',
          assertion: { topHypothesisId: topScorecard.hypothesisId },
          predictedAt: now,
          settlesWith: 'experiment_verdict',
        }),
      );
    }

    // W-C bilingual display layer: one temperature-0 call renders the objective in
    // Simplified Chinese (display aid; failure degrades visibly, never blocks).
    let zhNote: string | null = null;
    if (ctx.zhDisplay) {
      try {
        const zh = await callStructured<z.infer<typeof ObjectiveZhOut>>(ctx, {
          stage: 'plan',
          purpose: 'bilingual-zh:objective',
          systemPrompt: PLAN_OBJECTIVE_ZH_PROMPT,
          payload: { objective: plan.objective },
          schema: ObjectiveZhOut,
          temperature: 0,
        });
        // Real-content discipline: a template zh rendering must not be written
        // onto a real plan — the surrounding catch records the skip visibly.
        refuseTemplateMode(ctx, zh.executionMode, 'zh objective translation');
        if (zh.data.objectiveZh.trim().length > 0) {
          const stored = ctx.store.getObject('plan', plan.id);
          if (stored !== null && stored.objectiveZh === undefined) {
            ctx.store.putObject('plan', { ...stored, objectiveZh: zh.data.objectiveZh });
          }
          zhNote = 'objective translated to zh';
        }
      } catch (e) {
        if (isCancellationError(e)) throw e;
        zhNote = `zh skipped (${e instanceof Error ? e.message : String(e)})`;
      }
    }

    const summary =
      (plan.executabilityCheck.passed
        ? `plan ${plan.id} covers ${plan.hypothesisIds.length} hypothesis(es); executabilityCheck passed; frozen ${plan.planHash.slice(0, 12)}; ${plan.predictions.length} prediction(s) on ledger`
        : `plan ${plan.id} persisted with executabilityCheck FAILED — missing: ${plan.executabilityCheck.missing.join('; ')}`) +
      (priorOutcomes.length > 0 ? `; memory conditioning (RU-1): ${priorOutcomes.length} prior workspace outcome(s) with trust labels informed design` : '') +
      (zhNote !== null ? `; zh display: ${zhNote}` : '');
    ctx.log(summary);
    return { kind: 'done', summary };
}
