import type { Store } from '../persistence/store.js';
import type { ArtifactStore, ModelProvider } from '../shared/ports.js';
import {
  ExperimentSpec, MetaAnalysisSpec, BindingApproval,
  type HypothesisCandidate, type ExperimentRun, type StatReport, type FeedbackSignal,
} from '../domain/index.js';

/**
 * D-085 P0-1 operator surface: hypothesis-bound (confirmatory) experiments need a
 * HUMAN approval covering the binding — the loop cannot grant it to itself. This
 * module is that product action, shared by the ML (experiment_spec) and the
 * statistical_meta (meta_spec) paths:
 *
 *   bind   : optionally attach --hypothesis to the primary comparison(s)
 *   approve: append BindingApprovals (snapshot from the hypothesis' own decision rule)
 *   version: bumped — a bound/approved analysis is a NEW spec version (never a
 *            silent mutation of the exploratory spec that already ran)
 *
 * After approval, `rerunSpec` executes the stored spec and the confirmatory verdict
 * feeds the causal revision loop (feedback -> revise -> export).
 */

export type ApprovedSpec =
  | { kind: 'ml'; spec: ExperimentSpec }
  | { kind: 'meta'; spec: MetaAnalysisSpec };

export type ApproveOutcome =
  | { kind: 'approved'; spec: ApprovedSpec; approvalsAdded: number; boundHypothesisIds: string[] }
  | { kind: 'error'; code: number; message: string };

/** Find a stored spec by id across both spec kinds (id namespace xsp_ is shared). */
export const findSpec = (store: Store, specId: string): ApprovedSpec | null => {
  const ml = store.getObject('experiment_spec', specId);
  if (ml !== null) return { kind: 'ml', spec: ml };
  const meta = store.getObject('meta_spec', specId);
  if (meta !== null) return { kind: 'meta', spec: meta };
  return null;
};

const snapshotFor = (hyp: HypothesisCandidate): string =>
  hyp.falsification?.decisionRule !== undefined
    ? `${hyp.statement} — decision rule: ${hyp.falsification.decisionRule}`
    : `${hyp.statement} (no registered falsification decision rule — snapshot is the hypothesis statement)`;

export const approveSpec = (
  store: Store,
  specId: string,
  input: { by: string; hypothesis?: string; mde?: number },
): ApproveOutcome => {
  const found = findSpec(store, specId);
  if (found === null) return { kind: 'error', code: 1, message: `spec not found: ${specId}` };
  const at = new Date().toISOString();

  if (found.kind === 'ml') {
    let spec = found.spec;
    const hypotheses = store.listObjects('hypothesis', spec.runId) as HypothesisCandidate[];
    if (input.hypothesis !== undefined) {
      const hyp = hypotheses.find((h) => h.id === input.hypothesis);
      if (hyp === undefined) return { kind: 'error', code: 2, message: `unknown hypothesis ${input.hypothesis} in run ${spec.runId}` };
      spec = ExperimentSpec.parse({
        ...spec,
        comparisons: spec.comparisons.map((c) =>
          c.primary && c.hypothesisId === undefined ? { ...c, hypothesisId: input.hypothesis } : c,
        ),
      });
    }
    // g5 hard gate: bound comparisons MUST declare an MDE — the operator supplies it
    // at approval time (a confirmatory binding without a detectable-effect design is
    // exactly what the gate exists to prevent).
    if (input.mde !== undefined) {
      spec = ExperimentSpec.parse({
        ...spec,
        comparisons: spec.comparisons.map((c) =>
          c.hypothesisId !== undefined && c.mde === undefined ? { ...c, mde: input.mde } : c,
        ),
      });
    }
    const bound = spec.comparisons.filter((c) => c.hypothesisId !== undefined);
    if (bound.length === 0) {
      return { kind: 'error', code: 2, message: 'no hypothesis-bound comparison — pass --hypothesis <hypId> to bind the primary comparison first' };
    }
    const missingMde = bound.filter((c) => c.mde === undefined);
    if (missingMde.length > 0) {
      return { kind: 'error', code: 2, message: `hypothesis-bound comparison(s) ${missingMde.map((c) => c.id).join(', ')} declare no mde — pass --mde <value> (minimum detectable effect) with the approval` };
    }
    const byHyp = new Map<string, string[]>();
    for (const c of bound) {
      const list = byHyp.get(c.hypothesisId!) ?? [];
      list.push(c.id);
      byHyp.set(c.hypothesisId!, list);
    }
    const approvals: BindingApproval[] = [];
    for (const [hypId, comparisonIds] of byHyp) {
      const hyp = hypotheses.find((h) => h.id === hypId);
      if (hyp === undefined) return { kind: 'error', code: 2, message: `comparison binds unknown hypothesis ${hypId}` };
      if (spec.approvals.some((ap) => ap.hypothesisId === hypId && comparisonIds.some((cid) => ap.comparisonIds.includes(cid)))) continue;
      approvals.push({
        hypothesisId: hypId,
        comparisonIds,
        decisionRuleSnapshot: snapshotFor(hyp),
        approvedBy: input.by,
        approvedAt: at,
      });
    }
    spec = ExperimentSpec.parse({
      ...spec,
      version: spec.version + 1,
      approvals: [...spec.approvals, ...approvals],
      exploratoryNote: undefined,
      validation: { passed: false, missing: ['pending deterministic validation at execution'] },
    });
    store.putObjectEvented('experiment_spec', spec, {
      type: 'note',
      detail: { reason: 'binding_approval', spec: spec.id, version: spec.version, by: input.by, approvals: approvals.length },
    }, at);
    return { kind: 'approved', spec: { kind: 'ml', spec }, approvalsAdded: approvals.length, boundHypothesisIds: [...byHyp.keys()] };
  }

  // meta path
  let spec = found.spec;
  const hypotheses = store.listObjects('hypothesis', spec.runId) as HypothesisCandidate[];
  if (input.hypothesis !== undefined) {
    const hyp = hypotheses.find((h) => h.id === input.hypothesis);
    if (hyp === undefined) return { kind: 'error', code: 2, message: `unknown hypothesis ${input.hypothesis} in run ${spec.runId}` };
    spec = MetaAnalysisSpec.parse({
      ...spec,
      comparison: { ...spec.comparison, hypothesisId: input.hypothesis },
    });
  }
  const hypId = spec.comparison.hypothesisId;
  if (hypId === undefined) {
    return { kind: 'error', code: 2, message: 'no hypothesis-bound comparison — pass --hypothesis <hypId> to bind the meta comparison first' };
  }
  const hyp = hypotheses.find((h) => h.id === hypId);
  if (hyp === undefined) return { kind: 'error', code: 2, message: `comparison binds unknown hypothesis ${hypId}` };
  const cid = spec.comparison.id;
  if (spec.approvals.some((ap) => ap.hypothesisId === hypId && ap.comparisonIds.includes(cid))) {
    return { kind: 'approved', spec: { kind: 'meta', spec }, approvalsAdded: 0, boundHypothesisIds: [hypId] };
  }
  spec = MetaAnalysisSpec.parse({
    ...spec,
    version: spec.version + 1,
    approvals: [...spec.approvals, {
      hypothesisId: hypId,
      comparisonIds: [cid],
      decisionRuleSnapshot: snapshotFor(hyp),
      approvedBy: input.by,
      approvedAt: at,
    }],
    exploratoryNote: undefined,
    validation: { passed: false, missing: ['pending deterministic validation at execution'] },
  });
  store.putObjectEvented('meta_spec', spec, {
    type: 'note',
    detail: { reason: 'binding_approval', spec: spec.id, version: spec.version, by: input.by },
  }, at);
  return { kind: 'approved', spec: { kind: 'meta', spec }, approvalsAdded: 1, boundHypothesisIds: [hypId] };
};

export interface RerunResult {
  run: ExperimentRun;
  statReports: StatReport[];
  feedback: FeedbackSignal[];
}

/** Execute a stored spec directly (its LATEST persisted version) — the post-approval confirmatory run. */
export const rerunSpec = async (
  store: Store,
  artifacts: ArtifactStore,
  specId: string,
  deps: { provider?: ModelProvider; allowLocalDatasets?: boolean; shouldCancel?: () => boolean },
): Promise<RerunResult & { kind: 'ml' | 'meta' }> => {
  const found = findSpec(store, specId);
  if (found === null) throw new Error(`spec not found: ${specId}`);
  if (found.kind === 'ml') {
    const { executeExperiment } = await import('./executor.js');
    const out = await executeExperiment(store, artifacts, found.spec, {
      allowLocalDatasets: deps.allowLocalDatasets,
      shouldCancel: deps.shouldCancel,
    });
    return { kind: 'ml', run: out.run, statReports: out.statReports, feedback: out.feedback };
  }
  if (deps.provider === undefined) {
    throw new Error('statistical_meta rerun requires a model provider for effect-estimate extraction');
  }
  const { executeMetaAnalysis } = await import('./executor-meta.js');
  const out = await executeMetaAnalysis(store, artifacts, found.spec, {
    provider: deps.provider,
    shouldCancel: deps.shouldCancel,
  });
  return { kind: 'meta', run: out.run, statReports: out.statReports, feedback: out.feedback };
};

/** Guard used by the CLI to reject approve/rerun on specs with wrong-shaped ids. */
export const SPEC_ID_RE = /^xsp_[0-9a-z]{20,32}$/;
