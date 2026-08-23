import type { Store } from '../persistence/store.js';

/**
 * Evaluator family (AVO fusion G8): AVO's scoring function f generalizes to a
 * FAMILY of scientific evaluators (directive §3: correctness, evidence
 * alignment, falsifiability, information gain, novelty, uncertainty,
 * reproducibility, ...). FAR-Lab already owns the hard ones elsewhere —
 * preregistered statistics (experiment.ts), quality gates (quality-gate.ts),
 * rank/tournament scorecards. This module adds the missing LEGIBLE family:
 * pure, deterministic, per-run scientific-health evaluators whose outputs are
 * audit records (never silent scores). LLM judgment never feeds these.
 *
 * Discipline: read-only over the store; closed id set; every output carries
 * human-readable detail so UX can disclose WHY, not just a number.
 */

export const EVALUATOR_IDS = [
  'evidence_balance', // counter-evidence present and not drowned out
  'falsifiability', // hypotheses carry falsification specs / testable predictions
  'hypothesis_diversity', // structurally distinct strategies represented
  'provenance_completeness', // claims trace to sources via receipts
  'uncertainty_transparency', // uncertainties declared where due
] as const;
export type EvaluatorId = (typeof EVALUATOR_IDS)[number];

export type EvaluatorStatus = 'pass' | 'warn' | 'fail';

export interface EvaluatorOutput {
  id: EvaluatorId;
  status: EvaluatorStatus;
  /** Human- and agent-readable rationale; never empty. */
  detail: string;
  metrics: Record<string, number>;
}

export interface EvaluatorContext {
  store: Store;
  runId: string;
  now: string;
}

const COUNTER_RELATIONS = new Set(['contradicts', 'weakens', 'fails_to_replicate', 'alternative_explanation']);

type Evaluator = (ctx: EvaluatorContext) => EvaluatorOutput;

const evaluateEvidenceBalance: Evaluator = ({ store, runId }) => {
  const rels = store.listObjects('evidence_relation', runId);
  const counter = rels.filter((r) => COUNTER_RELATIONS.has(r.relation)).length;
  const support = rels.filter((r) => r.relation === 'supports' || r.relation === 'replicates').length;
  if (rels.length === 0) {
    const metrics: Record<string, number> = { total: 0, counter, support };
    return { id: 'evidence_balance', status: 'warn', detail: 'no evidence relations recorded yet — nothing to balance', metrics };
  }
  if (counter === 0) {
    return { id: 'evidence_balance', status: 'warn', detail: `all ${support} relations are supporting — no counter-evidence searched or found yet (a scoped "none found" record satisfies this)`, metrics: { total: rels.length, counter, support } };
  }
  const ratio = counter / Math.max(1, support + counter);
  return { id: 'evidence_balance', status: ratio < 0.1 ? 'warn' : 'pass', detail: `${counter} counter vs ${support} supporting relations`, metrics: { total: rels.length, counter, support, counterRatio: Number(ratio.toFixed(3)) } };
};

const evaluateFalsifiability: Evaluator = ({ store, runId }) => {
  const hyps = store.listObjects('hypothesis', runId);
  if (hyps.length === 0) {
    const metrics: Record<string, number> = { hypotheses: 0 };
    return { id: 'falsifiability', status: 'warn', detail: 'no hypotheses yet — falsifiability not assessable', metrics };
  }
  const withSpec = hyps.filter((h) => h.falsification !== undefined || (h.predictions?.length ?? 0) > 0).length;
  return {
    id: 'falsifiability',
    status: withSpec === hyps.length ? 'pass' : withSpec === 0 ? 'fail' : 'warn',
    detail: withSpec === hyps.length
      ? `all ${hyps.length} hypotheses carry a falsification spec or predictions`
      : `only ${withSpec}/${hyps.length} hypotheses carry a falsification spec or predictions — draft them before execution`,
    metrics: { hypotheses: hyps.length, withSpec },
  };
};

const evaluateHypothesisDiversity: Evaluator = ({ store, runId }) => {
  const hyps = store.listObjects('hypothesis', runId);
  if (hyps.length === 0) {
    return { id: 'hypothesis_diversity', status: 'warn', detail: 'no hypotheses yet', metrics: { hypotheses: 0, strategies: 0 } };
  }
  const strategies = new Set(hyps.map((h) => h.derivation?.strategy ?? 'unknown'));
  return {
    id: 'hypothesis_diversity',
    status: strategies.size >= 2 ? 'pass' : 'fail',
    detail: `${strategies.size} distinct generation strateg${strategies.size === 1 ? 'y' : 'ies'} across ${hyps.length} hypotheses — single-strategy sets risk paraphrase-only diversity`,
    metrics: { hypotheses: hyps.length, strategies: strategies.size },
  };
};

const evaluateProvenanceCompleteness: Evaluator = ({ store, runId }) => {
  const claims = store.listObjects('claim', runId);
  if (claims.length === 0) {
    const metrics: Record<string, number> = { claims: 0, sourced: 0 };
    return { id: 'provenance_completeness', status: 'warn', detail: 'no claims yet — provenance not assessable', metrics };
  }
  // Grounding = the claim carries at least one locator into a retrieved payload
  // (ScientificClaim admits nothing without locators; alignment-checked subset
  // is the stricter tier reported in metrics).
  const sourced = claims.filter((c) => (c.locators?.length ?? 0) > 0).length;
  const aligned = claims.filter((c) => c.alignmentChecked).length;
  return {
    id: 'provenance_completeness',
    status: sourced === claims.length ? (aligned === claims.length ? 'pass' : 'warn') : sourced === 0 ? 'fail' : 'warn',
    detail: `${sourced}/${claims.length} claims carry grounding locators; ${aligned} alignment-checked`,
    metrics: { claims: claims.length, sourced, aligned },
  };
};

const evaluateUncertaintyTransparency: Evaluator = ({ store, runId }) => {
  const hyps = store.listObjects('hypothesis', runId);
  if (hyps.length === 0) {
    return { id: 'uncertainty_transparency', status: 'warn', detail: 'no hypotheses yet — uncertainty declarations not assessable', metrics: { hypotheses: 0, withUncertainties: 0 } };
  }
  const withU = hyps.filter((h) => (h.uncertainties?.length ?? 0) > 0).length;
  return {
    id: 'uncertainty_transparency',
    status: withU > 0 ? 'pass' : 'warn',
    detail: `${withU}/${hyps.length} hypotheses declare uncertainties — undeclared uncertainty reads as false confidence`,
    metrics: { hypotheses: hyps.length, withUncertainties: withU },
  };
};

const EVALUATORS: Record<EvaluatorId, Evaluator> = {
  evidence_balance: evaluateEvidenceBalance,
  falsifiability: evaluateFalsifiability,
  hypothesis_diversity: evaluateHypothesisDiversity,
  provenance_completeness: evaluateProvenanceCompleteness,
  uncertainty_transparency: evaluateUncertaintyTransparency,
};

/** Run the full family in canonical order. Pure; read-only; never throws on empty state. */
export const runEvaluators = (ctx: EvaluatorContext): EvaluatorOutput[] =>
  EVALUATOR_IDS.map((id) => EVALUATORS[id](ctx));
