/**
 * research/research_plan — design a structured, executable research plan
 * (directive §9.9).
 *
 * The plan is NOT a list of vague suggestions: it must name data, variables,
 * statistical methods, stopping conditions, and human-approval gates. The
 * primary/alternative hypothesis IDs are filled in DETERMINISTICALLY by the
 * caller (from the scorecard selection) — the model never picks the winner by
 * a single total score (directive §9.8).
 */

import { z } from 'zod';
import type { CorpusSnapshot } from '../retrieval/corpus.ts';
import type { LlmGateway } from '../llm_gateway/gateway.ts';
import type { ProviderProfile } from '../llm_gateway/types.ts';
import { callStructuredJson } from './llm.ts';
import type { HypothesisCandidate, ResearchPlan } from './types.ts';

/** zod schema for the plan body (ids are filled deterministically by caller). */
const PlanBodyZod = z.object({
  objectives: z.array(z.string()),
  preregisteredPredictions: z.array(z.string()),
  dataRequirements: z.array(z.string()),
  inclusionExclusionCriteria: z.array(z.string()),
  variables: z.array(z.string()),
  design: z.string(),
  analysisDag: z.array(z.string()),
  tools: z.array(z.string()),
  statisticalMethods: z.array(z.string()),
  sampleSizeRationale: z.string(),
  multiplicityHandling: z.string(),
  missingOutlierStrategy: z.string(),
  stoppingConditions: z.array(z.string()),
  checkpoints: z.array(z.string()),
  budget: z.string(),
  risks: z.array(z.string()),
  reproducibility: z.array(z.string()),
  nextRoundDecisionRules: z.array(z.string()),
  humanApprovalRequired: z.array(z.string()),
});

/** Options for plan design. */
export interface DesignPlanOptions {
  /** The scientific question. */
  readonly question: string;
  /** The selected primary hypothesis. */
  readonly primary: HypothesisCandidate;
  /** The alternative hypotheses retained in the plan. */
  readonly alternatives: readonly HypothesisCandidate[];
  /** The grounding corpus. */
  readonly corpus: CorpusSnapshot;
  /** Optional feedback to incorporate into the revised plan (revision pass). */
  readonly feedbackText?: string;
}

/**
 * Design the executable research plan for the selected primary hypothesis.
 */
export async function designResearchPlan(
  gateway: LlmGateway,
  profile: ProviderProfile,
  opts: DesignPlanOptions,
): Promise<ResearchPlan> {
  const alternativesText = opts.alternatives.length === 0
    ? '(no alternatives retained)'
    : opts.alternatives.map((a) => `- ${a.statement}`).join('\n');

  const system = [
    'You are a research-methods planner. Design a CONCRETE, EXECUTABLE research',
    'plan to test the primary hypothesis. Do NOT give vague advice — name data',
    'sources, variables + units, statistical methods + their assumptions, sample',
    'size / power rationale, multiplicity handling, missing/outlier strategy,',
    'success/failure/inconclusive/stopping conditions, intermediate checkpoints,',
    'budget, risks, reproducibility steps, next-round decision rules, and which',
    'steps require human approval.',
    '',
    'Output JSON only, no markdown fences.',
  ].join('\n');

  const user = [
    `Research question: ${opts.question}`,
    '',
    'PRIMARY hypothesis:',
    `statement: ${opts.primary.statement}`,
    `mechanism: ${opts.primary.mechanism}`,
    `falsificationMethod: ${JSON.stringify(opts.primary.falsificationMethod)}`,
    '',
    'Alternative hypotheses (kept as fallbacks):',
    alternativesText,
    '',
    `Grounding corpus document count: ${opts.corpus.documentCount} (titles available to the caller).`,
    ...(opts.feedbackText !== undefined && opts.feedbackText.trim().length > 0
      ? ['', 'Reviewer feedback to incorporate into the revised plan:', opts.feedbackText]
      : []),
  ].join('\n');

  const body = await callStructuredJson(gateway, profile, 'research_plan', PlanBodyZod, [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);

  return {
    objectives: body.objectives,
    primaryHypothesisId: opts.primary.id,
    alternativeHypothesisIds: opts.alternatives.map((a) => a.id),
    preregisteredPredictions: body.preregisteredPredictions,
    dataRequirements: body.dataRequirements,
    inclusionExclusionCriteria: body.inclusionExclusionCriteria,
    variables: body.variables,
    design: body.design,
    analysisDag: body.analysisDag,
    tools: body.tools,
    statisticalMethods: body.statisticalMethods,
    sampleSizeRationale: body.sampleSizeRationale,
    multiplicityHandling: body.multiplicityHandling,
    missingOutlierStrategy: body.missingOutlierStrategy,
    stoppingConditions: body.stoppingConditions,
    checkpoints: body.checkpoints,
    budget: body.budget,
    risks: body.risks,
    reproducibility: body.reproducibility,
    nextRoundDecisionRules: body.nextRoundDecisionRules,
    humanApprovalRequired: body.humanApprovalRequired,
  };
}
