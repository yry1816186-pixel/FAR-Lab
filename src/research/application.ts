/**
 * research/application — the single application service for feedback → revision
 * (shared by the CLI and the REST API — §12.1 "CLI、API 和 Web 必须调用同一
 * application service").
 *
 * `applyFeedbackToRun` converts a FeedbackSignal into an immutable revision:
 * when the feedback triggers plan_rewrite, the plan is ACTUALLY redesigned
 * (with the feedback injected); otherwise the feedback is recorded without a
 * rewrite. Revisions never force monotonic improvement (§9.10).
 */

import type { LlmGateway } from '../llm_gateway/gateway.ts';
import type { ProviderProfile } from '../llm_gateway/types.ts';
import { designResearchPlan } from './research_plan.ts';
import { createRevision } from './revision.ts';
import type { FeedbackSignal, ResearchPlan, ResearchRun, Revision } from './types.ts';

/** Result of applying a feedback signal to a run. */
export interface ApplyFeedbackResult {
  readonly updated: ResearchRun;
  readonly revision: Revision;
  readonly planChanges: readonly string[];
  readonly unresolvedConflicts: readonly string[];
}

/** Options for applying feedback. */
export interface ApplyFeedbackOptions {
  readonly run: ResearchRun;
  readonly feedback: FeedbackSignal;
  readonly gateway: LlmGateway;
  readonly profile: ProviderProfile;
}

/**
 * Apply a FeedbackSignal to a ResearchRun: redesign the plan when triggered,
 * then record an immutable revision with frozen before/after plan snapshots.
 */
export async function applyFeedbackToRun(opts: ApplyFeedbackOptions): Promise<ApplyFeedbackResult> {
  const { run, feedback, gateway, profile } = opts;
  let newPlan: ResearchPlan = run.plan;
  const planChanges: string[] = [];
  const unresolvedConflicts: string[] = [];

  if (feedback.triggers.includes('plan_rewrite')) {
    const primary = run.hypotheses.find((h) => h.id === run.plan.primaryHypothesisId);
    if (primary === undefined) {
      unresolvedConflicts.push('plan_rewrite requested but primary hypothesis not found in run');
    } else {
      const alternatives = run.hypotheses.filter((h) => h.id !== primary.id);
      try {
        const redesigned = await designResearchPlan(gateway, profile, {
          question: run.question,
          primary,
          alternatives,
          corpus: run.corpus,
          feedbackText: feedback.text,
          stageId: 'research_plan_revision',
        });
        newPlan = redesigned.plan;
        planChanges.push(
          `plan rewritten per feedback: objectives ${run.plan.objectives.length} → ${newPlan.objectives.length}`,
        );
      } catch (err) {
        unresolvedConflicts.push(`plan_rewrite failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const metricChanges: string[] = feedback.changesScore
    ? ['score relevance re-evaluated per feedback (revision does NOT force improvement)']
    : [];

  const revision = createRevision({
    parentRevisionId: run.revisions.length > 0 ? run.revisions[run.revisions.length - 1]!.id : null,
    number: run.revisions.length + 1,
    feedback,
    changes: {
      hypothesisChanges: {
        added: [],
        removed: [],
        downgraded: [...feedback.affectsHypothesisIds],
      },
      planChanges,
      metricChanges,
      unresolvedConflicts,
    },
    beforePlan: run.plan,
    afterPlan: newPlan,
  });

  const updated: ResearchRun = {
    ...run,
    plan: newPlan,
    revisions: [...run.revisions, revision],
  };

  return { updated, revision, planChanges, unresolvedConflicts };
}
