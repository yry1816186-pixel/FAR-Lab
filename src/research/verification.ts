/**
 * research/verification — deterministic recompute of a ResearchRun
 * (single source of truth for `far research verify` and `far research evaluate`).
 *
 * Recomputes from the FROZEN inputs: corpus rootHash, citation binding,
 * deterministic scorecard dimensions, Pareto front, and primary-hypothesis
 * selection. Model-generated text is acknowledged as not recomputable and is
 * not part of the comparison (§3.6).
 */

import { createCorpusSnapshot, CitationResolver } from '../retrieval/index.ts';
import { bindCitations } from './citation.ts';
import { computeCitationGateReport } from './citation_gate.ts';
import { computeFalsifiabilityGateReport } from './falsifiability_gate.ts';
import {
  buildScorecard,
  computeDeterministicDimensions,
  computeParetoFront,
} from './scorecard.ts';
import { admissibleHypotheses, selectPrimaryHypothesis } from './orchestrator.ts';
import type { CitationBinding, ResearchRun } from './types.ts';

/** The outcome of a deterministic recompute. */
export interface VerificationOutcome {
  readonly status: 'PASS' | 'FAIL';
  readonly failures: readonly string[];
  readonly verified: readonly string[];
  readonly notVerifiable: readonly string[];
}

/** Recompute the deterministic layer of a ResearchRun and compare to stored. */
export function verifyResearchRunDeterministic(run: ResearchRun): VerificationOutcome {
  const failures: string[] = [];

  // 1. Corpus rootHash (tamper detection).
  const corpus = createCorpusSnapshot(run.corpus.documents, run.corpus.sourceQueries);
  if (corpus.rootHash !== run.corpus.rootHash) {
    failures.push('corpus rootHash MISMATCH (tampered corpus)');
  }
  const resolver = new CitationResolver(corpus);

  // 2. Citation binding + deterministic dimensions + scorecards.
  const reScorecards: Record<string, ReturnType<typeof buildScorecard>> = {};
  const reBindings: Record<string, CitationBinding> = {};
  for (const h of run.hypotheses) {
    const binding = bindCitations(h, resolver);
    reBindings[h.id] = binding;
    const storedBinding = run.bindings[h.id];
    if (storedBinding === undefined || storedBinding.allBound !== binding.allBound) {
      failures.push(`citation binding MISMATCH for ${h.id}`);
    }
    const deterministic = computeDeterministicDimensions(h, binding, run.critiques[h.id]);
    reScorecards[h.id] = buildScorecard(
      h.id,
      deterministic,
      run.scorecards[h.id]?.dimensions.filter((d) => d.source === 'model') ?? [],
      false,
      run.scorecards[h.id]?.keyEvidenceToChangeConclusion ?? '',
    );
  }
  const pareto = computeParetoFront(reScorecards);
  for (const id of Object.keys(reScorecards)) {
    reScorecards[id] = { ...reScorecards[id]!, paretoOptimal: pareto.has(id) };
  }
  const recomputedFalsifiability = computeFalsifiabilityGateReport(run.hypotheses);

  // 3. Deterministic dimensions + Pareto comparison (model dims excluded).
  for (const h of run.hypotheses) {
    const stored = run.scorecards[h.id];
    const recomputed = reScorecards[h.id];
    if (stored === undefined || recomputed === undefined) continue;
    const storedDet = stored.dimensions.filter((d) => d.source === 'deterministic');
    const recomputedDet = recomputed.dimensions.filter((d) => d.source === 'deterministic');
    if (JSON.stringify(storedDet) !== JSON.stringify(recomputedDet)) {
      failures.push(`deterministic scorecard MISMATCH for ${h.id}`);
    }
    if (stored.paretoOptimal !== recomputed.paretoOptimal) {
      failures.push(`Pareto-front MISMATCH for ${h.id}`);
    }
  }

  // 4. Primary selection (same admissible-pool rule as the orchestrator).
  const pool = admissibleHypotheses(run.hypotheses, reBindings, recomputedFalsifiability);
  const primary = selectPrimaryHypothesis(pool, reScorecards);
  if (primary.id !== run.plan.primaryHypothesisId) {
    failures.push(`primary-hypothesis MISMATCH (recomputed ${primary.id}, stored ${run.plan.primaryHypothesisId})`);
  }

  // 5. Citation gate (recomputed from frozen bindings; resolvedViaRetrieval is
  //    live-resolution provenance and is not recomputable).
  const recomputedCitationGate = computeCitationGateReport({
    bindings: reBindings,
    primaryHypothesisId: run.plan.primaryHypothesisId,
  });
  if (
    recomputedCitationGate.boundRate !== run.citationGate.boundRate ||
    recomputedCitationGate.unboundEvidenceCount !== run.citationGate.unboundEvidenceCount ||
    recomputedCitationGate.gateVerdict !== run.citationGate.gateVerdict ||
    recomputedCitationGate.primaryAllBound !== run.citationGate.primaryAllBound
  ) {
    failures.push('citation gate MISMATCH (stored report does not recompute from the frozen bindings)');
  }

  // 6. Falsifiability gate (fully recomputable — pure over frozen hypotheses).
  if (JSON.stringify(recomputedFalsifiability) !== JSON.stringify(run.falsifiabilityGate)) {
    failures.push('falsifiability gate MISMATCH (stored report does not recompute)');
  }

  return {
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    failures,
    verified: [
      'corpus_rootHash',
      'citation_binding',
      'deterministic_scorecard',
      'pareto_front',
      'primary_selection',
      'citation_gate',
      'falsifiability_gate',
    ],
    notVerifiable: ['model_generation', 'model_critique_dimensions', 'citation_resolution_retrieval'],
  };
}
