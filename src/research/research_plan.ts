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

import type { CorpusSnapshot } from '../retrieval/corpus.ts';
import { sanitizeExternalContent } from '../llm_gateway/sanitizer.ts';
import type { LlmGateway } from '../llm_gateway/gateway.ts';
import type { ProviderProfile } from '../llm_gateway/types.ts';
import { callStructuredJson, type CallMeta } from './llm.ts';
import { PlanBodyZod } from './schemas.ts';
import type { HypothesisCandidate, ResearchPlan } from './types.ts';

/** Render the corpus as a citation allowlist for the model context (sanitized). */
function renderCorpusAllowlist(corpus: CorpusSnapshot): string {
  if (corpus.documentCount === 0) {
    return '(the corpus is empty — the plan must not reference any specific paper)';
  }
  const lines: string[] = [];
  for (const doc of corpus.documents) {
    const abstract = doc.abstract === null ? '(no abstract available)' : doc.abstract;
    lines.push(`- ${doc.documentId} :: ${doc.title} :: ${abstract}`);
  }
  const joined = lines.join('\n');
  return sanitizeExternalContent(joined).text;
}

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
  /**
   * Override the fixture/stage key (offline_replay registry matches on this).
   * Revision passes use 'research_plan_revision' so the offline demo shows a
   * REAL plan diff; live adapters ignore the label.
   */
  readonly stageId?: string;
}

/**
 * Design the executable research plan for the selected primary hypothesis.
 * Returns the plan plus the provider CallMeta for the stage receipt.
 */
export async function designResearchPlan(
  gateway: LlmGateway,
  profile: ProviderProfile,
  opts: DesignPlanOptions,
): Promise<{ plan: ResearchPlan; meta: CallMeta }> {
  const alternativesText = opts.alternatives.length === 0
    ? '(no alternatives retained)'
    : opts.alternatives.map((a) => `- ${a.statement}`).join('\n');
  const allowlist = renderCorpusAllowlist(opts.corpus);

  const system = [
    'You are a research-methods planner. Design a CONCRETE, EXECUTABLE research',
    'plan to test the primary hypothesis. Do NOT give vague advice — name data',
    'sources, variables + units, statistical methods + their assumptions, sample',
    'size / power rationale, multiplicity handling, missing/outlier strategy,',
    'success/failure/inconclusive/stopping conditions, intermediate checkpoints,',
    'budget, risks, reproducibility steps, next-round decision rules, and which',
    'steps require human approval.',
    '',
    'GROUNDING RULE: the plan may reference ONLY the documents in the untrusted',
    'corpus data below (by documentId). If the corpus is empty, do not name any',
    'specific paper. Do NOT invent papers, DOIs, or datasets you cannot see.',
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
    `Grounding corpus (${opts.corpus.documentCount} documents — untrusted data):`,
    allowlist,
    ...(opts.feedbackText !== undefined && opts.feedbackText.trim().length > 0
      ? ['', 'Reviewer feedback to incorporate into the revised plan:', opts.feedbackText]
      : []),
  ].join('\n');

  const { data: body, meta } = await callStructuredJson(
    gateway,
    profile,
    opts.stageId ?? 'research_plan',
    PlanBodyZod,
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  );

  return {
    plan: {
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
    } satisfies ResearchPlan,
    meta,
  };
}
