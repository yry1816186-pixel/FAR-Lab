import { z } from 'zod';
import { ConstraintSet, ResearchQuestion, ScientificGoalType } from '../../domain/index.js';
import { callStructured } from '../llm.js';
import type { StageContext, StageHandler, StageOutcome } from '../types.js';
import { throwIfCancelled } from './guard.js';

/**
 * Refinement contract — a strict subset of the domain ResearchQuestion fields.
 * Schema shapes are reused from the domain modules (single owner), so the LLM
 * output can only fill fields the canonical question actually has.
 */
const ScopeRefinement = z.object({
  domain: z.string().min(1),
  phenomena: z.array(z.string().min(1)).min(1),
  inScope: z.array(z.string().min(1)).default([]),
  outOfScope: z.array(z.string().min(1)).default([]),
  goalType: ScientificGoalType,
  constraints: ConstraintSet,
});
type ScopeRefinement = z.infer<typeof ScopeRefinement>;

const SYSTEM_PROMPT = `You refine a user's research question into a structured, falsifiable scope.
Return ONE JSON object with exactly these fields:
- "domain": the scientific domain of the question (keep the question's own language),
- "phenomena": one or more concrete phenomena the question asks about,
- "inScope": aspects explicitly inside the scope of the question,
- "outOfScope": aspects explicitly excluded by the question,
- "goalType": exactly one of "explanatory", "predictive", "interventional", "methodological", "exploratory",
- "constraints": an object with arrays "assumptions", "dataConstraints", "resourceConstraints", "ethicalConstraints", "methodologicalConstraints".
Rules:
- Preserve the original meaning of the question. NEVER invent background, prior results, data or citations that are not stated in the question.
- Prefer empty arrays over fabricating entries.
- Keep descriptive fields in the question's own language.`;

export const scopeStage: StageHandler = {
  stage: 'scope',
  applicable: async () => true,

  async execute(ctx: StageContext): Promise<StageOutcome> {
    throwIfCancelled(ctx);
    const question = ctx.store.getObject('question', ctx.run.questionId);
    if (!question) {
      throw new Error(
        `scope: question ${ctx.run.questionId} not found in store — refusing to refine without the user's question`,
      );
    }

    // Single structured call. A provider failure throws out of callStructured
    // (fail-closed) — this stage never silently proceeds with an empty scope.
    const res = await callStructured<ScopeRefinement>(ctx, {
      stage: 'scope',
      purpose: 'scope-refinement',
      systemPrompt: SYSTEM_PROMPT,
      payload: {
        questionText: question.text,
        currentScope: question.scope,
        currentGoalType: question.goalType,
      },
      schema: ScopeRefinement,
      temperature: 0.2,
    });
    const r = res.data;

    // Real-content discipline (owner directive 2026-08-29): a deterministic
    // development wire's refinement is template scaffolding, not analysis of
    // the user's question. Refuse adoption — the user's own scope stands and
    // every surface stays truthful (the proposal panel reports unavailability).
    if (ctx.productRun === true && res.executionMode === 'test') {
      return {
        kind: 'skipped',
        reason:
          'model route is the deterministic development wire — template scope output is refused as scientific content; configure a live model route to obtain a real scope refinement',
      };
    }

    // Original text/background/id/createdAt are preserved verbatim; unrefined
    // scope boundary fields (temporal/spatial/population) survive the merge.
    const refined = ResearchQuestion.parse({
      ...question,
      goalType: r.goalType,
      scope: {
        ...question.scope,
        domain: r.domain,
        phenomena: r.phenomena,
        inScope: r.inScope,
        outOfScope: r.outOfScope,
      },
      constraints: { ...question.constraints, ...r.constraints },
    });
    ctx.store.putObject('question', refined);

    return {
      kind: 'done',
      summary:
        `scope refined: domain="${r.domain}"; ${r.phenomena.length} phenomena; ` +
        `in/out scope ${r.inScope.length}/${r.outOfScope.length}; goalType=${r.goalType}`,
    };
  },
};
