import { z } from 'zod';
import { newId, ExperimentSpec } from '../domain/index.js';
import type { ResearchPlan } from '../domain/plan.js';
import type { ModelProvider } from '../shared/ports.js';
import { strictSchemaOrUndefined } from '../providers/http.js';

/**
 * B8: research-plan -> ExperimentSpec drafting.
 *
 * Division of truth (constitution §7): the MODEL proposes within a CLOSED
 * declarative space (builder ids, an OpenML dataset id, declared columns);
 * DETERMINISTIC code validates (checkExperimentSpec at execution) and, when
 * the plan's data requirements carry no resolvable tabular dataset, the stage
 * SKIPS honestly instead of inventing one. Nothing here fabricates data.
 *
 * Honesty constraints baked into the draft:
 *  - comparisons carry thresholdProvenance: 'model_stipulated' — the plan's
 *    free-text decision rules cannot be verified deterministically, so the
 *    draft NEVER claims evidence-derived thresholds;
 *  - no hypothesisId binding + an explicit exploratoryNote (D-085: binding a
 *    hypothesis requires operator approval the loop cannot grant itself);
 *  - the LLM never sees credentials/URLs; dataset choice is one integer id
 *    resolved (and re-validated) by the deterministic acquisition layer.
 */

export type SpecDraftOutcome =
  | { kind: 'spec'; spec: ExperimentSpec }
  | { kind: 'skip'; reason: string };

const CLASSIFIER_BUILDERS = ['logistic_regression', 'random_forest_classifier', 'gradient_boosting_classifier', 'dummy_most_frequent'] as const;

const DraftOut = z.object({
  /** false = the plan cannot be honored as a tabular ML experiment (honest skip). */
  feasible: z.boolean(),
  skipReason: z.string().min(10).optional(),
  openmlDatasetId: z.number().int().positive().optional(),
  targetColumn: z.string().min(1).optional(),
  /** Models only required when feasible=true (enforced below, not by the array
   *  bound: an infeasible verdict legitimately carries no models). */
  models: z.array(z.object({
    name: z.string().min(1).max(60),
    builderId: z.enum(CLASSIFIER_BUILDERS),
    hyperparams: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  })).max(4).default([]),
}).superRefine((d, ctx) => {
  if (d.feasible && (d.models.length === 0 || d.openmlDatasetId === undefined || d.targetColumn === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'feasible=true requires openmlDatasetId, targetColumn and >=1 model' });
  }
});

const SYSTEM_PROMPT =
  'You convert a research plan into ONE tabular ML experiment spec draft, or declare it infeasible. ' +
  'Feasible ONLY when the plan\'s data requirements plausibly map to a PUBLIC tabular OpenML dataset ' +
  '(classification). If the plan needs wet-lab data, private records, imaging, or text corpora, set ' +
  'feasible=false with a skipReason naming what is missing. Choose an existing OpenML dataset id you ' +
  'are confident exists (classic tabular benchmarks); the targetColumn must be a real column of that ' +
  'dataset. Prefer 2-3 models that differ structurally (e.g. logistic_regression vs ' +
  'random_forest_classifier) so comparisons discriminate. hyperparams keys must match sklearn parameter ' +
  'names (e.g. n_estimators, max_depth, C). Output JSON only.';

export const draftSpecFromPlan = async (
  plan: ResearchPlan,
  questionText: string,
  provider: ModelProvider,
): Promise<SpecDraftOutcome> => {
  const res = await provider.structuredCall(
    {
      task: 'experiment-spec-draft',
      systemPrompt: SYSTEM_PROMPT,
      userPayload: {
        outputContract: '{feasible: boolean, skipReason?: string, openmlDatasetId?: number, targetColumn?: string, models: [{name, builderId: "logistic_regression"|"random_forest_classifier"|"gradient_boosting_classifier"|"dummy_most_frequent", hyperparams: object}]}',
        input: {
          researchQuestion: questionText,
          objective: plan.objective,
          dataRequirements: plan.dataRequirements.map((d) => ({ name: d.name, availability: d.availability, variables: d.variables })),
          variables: plan.variables,
          metrics: plan.metrics,
          decisionRules: {
            success: plan.decisionRules.successCriterion,
            falsification: plan.decisionRules.falsificationCriterion,
          },
          hypothesisIds: plan.hypothesisIds,
        },
      },
      outputKind: 'json',
      temperature: 0.1,
      maxTokens: 2048,
      jsonSchema: strictSchemaOrUndefined(DraftOut),
      purpose: 'experiment-spec-draft',
    },
    (raw) => {
      const parsed = DraftOut.safeParse(raw);
      return parsed.success ? parsed.data : new Error(`draft schema failed: ${parsed.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).slice(0, 4).join('; ')}`);
    },
  );
  if (!res.ok || res.data === undefined) {
    // Drafting failure is a SKIP-with-reason, not a run failure: experiments
    // ENRICH the loop; their absence must not kill an otherwise complete run.
    return { kind: 'skip', reason: `spec drafting failed (${res.error?.kind ?? 'unknown'}): ${(res.error?.message ?? '').slice(0, 140)}` };
  }
  const draft = res.data;
  if (!draft.feasible || draft.openmlDatasetId === undefined || draft.targetColumn === undefined || draft.models.length === 0) {
    return { kind: 'skip', reason: draft.skipReason ?? 'plan data requirements do not map to a public tabular dataset' };
  }
  // The plan's free-text decision rule cannot seed a verified numeric threshold:
  // the draft marks every threshold as model-stipulated (auditable, honest).
  const spec = ExperimentSpec.parse({
    id: newId('xsp'),
    runId: plan.runId,
    planId: plan.id,
    // Plan steps carry TaskIds of their own; the draft binds the plan's first
    // analysis step if one exists, else mints a synthetic step reference.
    planStepId: plan.steps[0]?.id ?? newId('task'),
    question: questionText.slice(0, 500),
    datasets: [{
      source: { resolver: 'openml', openmlId: draft.openmlDatasetId },
      targetColumn: draft.targetColumn,
      split: { method: 'random_stratified', ratios: { train: 0.7, val: 0.15, test: 0.15 }, seed: 42 },
    }],
    models: draft.models.map((m, i) => ({
      name: m.name,
      builderId: m.builderId,
      hyperparams: m.hyperparams,
      seed: 42 + i,
      tags: [`plan:${plan.id.slice(0, 10)}`],
    })),
    metrics: ['accuracy'],
    comparisons: draft.models.length >= 2
      ? [{
          id: `cmp_${plan.id.slice(4, 12)}`,
          metricKey: 'accuracy',
          kind: 'paired_diff',
          modelAIdx: 0,
          modelBIdx: 1,
          direction: 'above',
          threshold: 0,
          thresholdProvenance: 'model-stipulated',
          primary: true,
        }]
      : [{
          id: `cmp_${plan.id.slice(4, 12)}`,
          metricKey: 'accuracy',
          kind: 'absolute',
          modelIdx: 0,
          direction: 'above',
          threshold: 0.5,
          thresholdProvenance: 'model-stipulated',
          primary: true,
        }],
    statistics: {
      test: 'paired_bootstrap_ci',
      alpha: 0.05,
      nBoot: 2000,
      analysisSeed: 42,
      ciLevel: 0.95,
    },
    compute: { device: 'local', maxParallel: 1, timeoutMs: 600_000 },
    // No hypothesis binding + explicit exploratory label (D-085): promoting an
    // exploratory screen to a hypothesis verdict needs operator approval.
    exploratoryNote: `Plan-drafted exploratory screen for ${plan.id}: thresholds are model-stipulated; hypothesis-bound confirmatory specs require operator approval.`,
    approvals: [],
    validation: { passed: false, missing: ['pending deterministic validation at execution'] },
    createdAt: new Date().toISOString(),
  });
  return { kind: 'spec', spec };
};
