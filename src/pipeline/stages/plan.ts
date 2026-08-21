import { z } from 'zod';
import { newId, ResearchPlan } from '../../domain/index.js';
import type { HypothesisCandidate } from '../../domain/index.js';
import { callStructured } from '../llm.js';
import type { StageHandler } from '../types.js';

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
  'Where something is unknown, surface it in risks/prerequisites instead of fabricating it.',
].join(' ');

/** Model-output shape: the full plan minus server-owned fields (id/runId/createdAt/check). */
const PlanDraftSchema = ResearchPlan.omit({
  id: true,
  runId: true,
  createdAt: true,
  executabilityCheck: true,
});
type PlanDraft = z.infer<typeof PlanDraftSchema>;

export interface ExecutabilityCheck {
  passed: boolean;
  missing: string[];
}

/**
 * Deterministic executability gate (pure function). Encodes the §31 essentials that
 * zod counts/cross-references cannot express on their own. Unknown hypothesis ids
 * are reported as failures; callers render `missing` verbatim to humans.
 */
export const checkPlanExecutability = (
  plan: Pick<
    ResearchPlan,
    'objective' | 'hypothesisIds' | 'steps' | 'metrics' | 'decisionRules' | 'dataRequirements'
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
  plan.steps.forEach((step, i) => {
    if (!step.method.trim()) missing.push(`steps[${i}]「${step.title}」缺少 method`);
    if (step.failureConditions.length === 0) missing.push(`steps[${i}]「${step.title}」缺少 failureConditions`);
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
  plan.dataRequirements.forEach((req, i) => {
    if (req.variables.length === 0) missing.push(`dataRequirements[${i}]「${req.name}」未声明 variables`);
  });
  return { passed: missing.length === 0, missing };
};

export const planStage: StageHandler = {
  stage: 'plan',
  applicable: async (ctx) => ctx.store.listObjects('plan', ctx.run.id).length === 0,

  execute: async (ctx) => {
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
      throw new Error(`plan stage: run ${runId} has no hypotheses to plan for`);
    }

    const claims = ctx.store.listObjects('claim', runId);
    const verifiedClaims = claims.filter((c) => c.bindingStatus === 'verified');

    const payload = {
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

    // Reference integrity for claims: keep only ids that actually exist (drop, loudly).
    const knownClaimIds = new Set(claims.map((c) => c.id));
    const droppedClaimIds = res.data.evidenceClaimIds.filter((id) => !knownClaimIds.has(id));
    if (droppedClaimIds.length > 0) {
      ctx.log(`dropping evidenceClaimIds that do not exist in store: ${droppedClaimIds.join(', ')}`);
    }

    const plan = ResearchPlan.parse({
      ...res.data,
      id: newId('pln'),
      runId,
      evidenceClaimIds: res.data.evidenceClaimIds.filter((id) => knownClaimIds.has(id)),
      createdAt: new Date().toISOString(),
    });
    plan.executabilityCheck = checkPlanExecutability(plan, hypotheses.map((h) => h.id));
    ctx.store.putObject('plan', plan);

    const summary = plan.executabilityCheck.passed
      ? `plan ${plan.id} covers ${plan.hypothesisIds.length} hypothesis(es); executabilityCheck passed`
      : `plan ${plan.id} persisted with executabilityCheck FAILED — missing: ${plan.executabilityCheck.missing.join('; ')}`;
    ctx.log(summary);
    return { kind: 'done', summary };
  },
};
