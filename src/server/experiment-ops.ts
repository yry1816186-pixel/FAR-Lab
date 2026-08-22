import { z } from 'zod';
import { ExperimentSpec, checkExperimentSpec } from '../domain/index.js';
import type { App } from '../app/composition.js';

/**
 * BP-5 confirmatory binding approval: the researcher converts a plan-drafted
 * (exploratory) experiment spec into CONFIRMATORY hypotheses-bound comparisons.
 *
 * Scientific contract (mirrors the D-085 P0-1 discipline the executor enforces):
 * - each binding declares comparisonId + hypothesisId (+ mde when the drafted
 *   comparison has none — the g5 hard gate requires it once bound);
 * - the approval snapshots the hypothesis's CURRENT falsification decision rule,
 *   so a later hypothesis edit cannot silently invalidate the correspondence
 *   (the staleness uncertainty BP-2 adds makes any such drift visible);
 * - the spec version bumps and re-validates (fail-closed: an invalid resulting
 *   spec is REJECTED and nothing is persisted);
 * - re-execution then produces verdict-capable (non-exploratory) StatReports
 *   whose feedback enters the causal revision chain.
 */

export type ExperimentOpErrorCode = 'not_found' | 'target_not_found' | 'validation';

export class ExperimentOpError extends Error {
  constructor(readonly status: number, readonly code: ExperimentOpErrorCode, message: string) {
    super(message);
  }
}

const badRequest = (message: string): ExperimentOpError => new ExperimentOpError(400, 'validation', message);

export const ApproveExperimentBody = z.object({
  approvedBy: z.string().min(2).max(120),
  bindings: z.array(z.object({
    comparisonId: z.string().min(1),
    hypothesisId: z.string().min(1),
    /** Required only when the drafted comparison lacks an MDE (g5 hard gate for bound comparisons). */
    mde: z.number().positive().optional(),
  })).min(1).max(8),
  /** Optional researcher note recorded in the audit event. */
  note: z.string().max(2_000).optional(),
});
export type ApproveExperimentInput = z.infer<typeof ApproveExperimentBody>;

export interface ApproveExperimentResult {
  specId: string;
  version: number;
  boundComparisons: Array<{ comparisonId: string; hypothesisId: string }>;
  validationPassed: boolean;
  missing: string[];
}

export function approveExperiment(app: App, runId: string, specId: string, rawBody: unknown): ApproveExperimentResult {
  const parsed = ApproveExperimentBody.safeParse(rawBody);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw badRequest(`invalid approve request: ${issues}`);
  }
  const { approvedBy, bindings, note } = parsed.data;
  if (app.store.getRun(runId) === null) throw new ExperimentOpError(404, 'not_found', `run ${runId} not found`);
  const spec = app.store.getObject('experiment_spec', specId);
  if (spec === null || spec.runId !== runId) {
    throw new ExperimentOpError(404, 'target_not_found', `experiment spec ${specId} not found in run ${runId}`);
  }

  // Resolve every binding against real objects BEFORE mutating anything.
  const comparisons = new Map(spec.comparisons.map((c) => [c.id, c]));
  const hypotheses = new Map(app.store.listObjects('hypothesis', runId).map((h) => [h.id, h]));
  const resolved = bindings.map((b) => {
    const comp = comparisons.get(b.comparisonId);
    if (comp === undefined) throw new ExperimentOpError(404, 'target_not_found', `comparison ${b.comparisonId} not found in spec ${specId}`);
    const hyp = hypotheses.get(b.hypothesisId);
    if (hyp === undefined) throw new ExperimentOpError(404, 'target_not_found', `hypothesis ${b.hypothesisId} not found in run ${runId}`);
    const rule = hyp.falsification?.decisionRule;
    if (rule === undefined || rule.trim().length === 0) {
      throw badRequest(`hypothesis ${b.hypothesisId} has no falsification decision rule to snapshot — run critique_falsify first or edit the hypothesis`);
    }
    const mde = comp.mde !== undefined ? comp.mde : b.mde;
    if (mde === undefined) {
      throw badRequest(`comparison ${b.comparisonId} declares no MDE and the binding supplies none — confirmatory comparisons must state their minimum detectable effect (g5)`);
    }
    return { comp, hyp, mde, rule };
  });

  // Build the next spec version: bound comparisons + covering approvals, then RE-VALIDATE.
  const boundIds = new Set(resolved.map((r) => r.comp.id));
  const nextComparisons = spec.comparisons.map((c) => {
    if (!boundIds.has(c.id)) return c;
    const r = resolved.find((x) => x.comp.id === c.id)!;
    return { ...c, hypothesisId: r.hyp.id, ...(c.mde === undefined ? { mde: r.mde } : {}) };
  });
  const approvalsByHyp = new Map<string, { hypothesisId: string; comparisonIds: string[]; decisionRuleSnapshot: string; approvedBy: string; approvedAt: string }>();
  const now = new Date().toISOString();
  for (const r of resolved) {
    const existing = approvalsByHyp.get(r.hyp.id);
    if (existing !== undefined) existing.comparisonIds.push(r.comp.id);
    else approvalsByHyp.set(r.hyp.id, {
      hypothesisId: r.hyp.id,
      comparisonIds: [r.comp.id],
      decisionRuleSnapshot: r.rule,
      approvedBy,
      approvedAt: now,
    });
  }
  // An exploratory note on a spec that now binds hypotheses is stale — drop it (the
  // binding IS the declaration of confirmatory intent).
  const next = ExperimentSpec.safeParse({
    ...spec,
    version: spec.version + 1,
    comparisons: nextComparisons,
    approvals: [...spec.approvals.filter((a) => ![...approvalsByHyp.keys()].includes(a.hypothesisId)), ...approvalsByHyp.values()],
    exploratoryNote: undefined,
    createdAt: spec.createdAt,
  });
  if (!next.success) throw badRequest(`resulting spec failed schema validation: ${next.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  const validation = checkExperimentSpec(next.data, {
    hypothesisIds: resolved.map((r) => r.hyp.id),
    allowLocalDatasets: false,
  });
  if (!validation.passed) {
    throw badRequest(`resulting spec FAILED confirmatory validation (nothing persisted): ${validation.missing.join('; ')}`);
  }

  app.store.putObject('experiment_spec', next.data);
  app.store.appendEvent(runId, {
    type: 'note',
    detail: {
      reason: 'experiment_binding_approved',
      specId,
      version: next.data.version,
      boundComparisons: resolved.map((r) => ({ comparisonId: r.comp.id, hypothesisId: r.hyp.id })),
      approvedBy,
      ...(note !== undefined ? { note } : {}),
      actor: 'human',
    },
  });
  return {
    specId,
    version: next.data.version,
    boundComparisons: resolved.map((r) => ({ comparisonId: r.comp.id, hypothesisId: r.hyp.id })),
    validationPassed: true,
    missing: [],
  };
}
