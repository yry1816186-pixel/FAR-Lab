import { WorkflowPlanSchema, type WorkflowPlan } from '../domain/workflow-plan.js';
import type { Store } from '../persistence/store.js';

/**
 * Kernel planner v1 (Ω ADR D4) — DETERMINISTIC policy, no LLM in the control logic
 * (P8): a problem whose persisted problem model shows contested mechanisms (>=2
 * governing relations or >=2 presupposed causal claims) earns an adversarial
 * counter-evidence-debate step inserted after the ranked hypothesis set stabilizes.
 * The revision is a persisted plan object + audit event; nothing silent.
 */

export const CONTESTED_MIN_RELATIONS = 2;
export const CONTESTED_MIN_CAUSAL_CLAIMS = 2;

export interface ContestednessVerdict {
  contested: boolean;
  hasProblemModel: boolean;
  governingRelations: number;
  causalClaims: number;
}

export const contestednessOf = (store: Store, runId: string): ContestednessVerdict => {
  const pm = store.listObjects('problem_model', runId).at(-1);
  if (pm === undefined) {
    return { contested: false, hasProblemModel: false, governingRelations: 0, causalClaims: 0 };
  }
  const governingRelations = pm.formalization.governingRelations.length;
  const causalClaims = pm.statisticalPremises.causalClaims.length;
  return {
    contested: governingRelations >= CONTESTED_MIN_RELATIONS || causalClaims >= CONTESTED_MIN_CAUSAL_CLAIMS,
    hasProblemModel: true,
    governingRelations,
    causalClaims,
  };
};

/**
 * Build the kernel revision of a default plan: the debate step is inserted after the
 * `rank` stage step and the following step's dependency is re-pointed through it, so
 * the plan's dependency chain stays semantically exact (not just order-exact).
 * Returns null when the run is not contested, has no problem model, or the plan was
 * already revised (idempotent — one kernel revision per lineage).
 */
export const kernelPlanRevisionFor = (store: Store, runId: string, plan: WorkflowPlan, at = new Date().toISOString()): WorkflowPlan | null => {
  if (plan.origin !== 'default') return null;
  if (plan.steps.some((s) => s.kind === 'agent')) return null;
  const verdict = contestednessOf(store, runId);
  if (!verdict.contested) return null;
  const rankIdx = plan.steps.findIndex((s) => s.kind === 'stage' && s.target === 'rank');
  if (rankIdx < 0 || rankIdx === plan.steps.length - 1) return null;
  const debateId = `debate-${plan.version + 1}`;
  const debateStep = {
    id: debateId,
    kind: 'agent' as const,
    target: 'counter-evidence-debate',
    after: [plan.steps[rankIdx]!.id],
    completion: { kind: 'agent_result_ok' as const },
    attemptCap: 1,
  };
  const steps = [...plan.steps];
  steps.splice(rankIdx + 1, 0, debateStep);
  const follower = steps[rankIdx + 2];
  if (follower !== undefined) {
    steps[rankIdx + 2] = { ...follower, after: [debateId] };
  }
  return WorkflowPlanSchema.parse({
    ...plan,
    id: `${plan.id}-v${plan.version + 1}`,
    version: plan.version + 1,
    origin: 'kernel' as const,
    createdAt: at,
    revisedFrom: plan.id,
    steps,
  });
};
