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
import {
  buildScorecard,
  computeDeterministicDimensions,
  computeParetoFront,
} from './scorecard.ts';
import { selectPrimaryHypothesis } from './orchestrator.ts';
import type { ResearchRun } from './types.ts';

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
  for (const h of run.hypotheses) {
    const binding = bindCitations(h, resolver);
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

  // 4. Primary selection.
  const primary = selectPrimaryHypothesis(run.hypotheses, reScorecards);
  if (primary.id !== run.plan.primaryHypothesisId) {
    failures.push(`primary-hypothesis MISMATCH (recomputed ${primary.id}, stored ${run.plan.primaryHypothesisId})`);
  }

  return {
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    failures,
    verified: ['corpus_rootHash', 'citation_binding', 'deterministic_scorecard', 'pareto_front', 'primary_selection'],
    notVerifiable: ['model_generation', 'model_critique_dimensions'],
  };
}
