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
  memoryNoveltyDimensionsFor,
  computeDeterministicDimensions,
  computeParetoFront,
} from './scorecard.ts';
import { admissibleHypotheses, selectPrimaryHypothesis } from './orchestrator.ts';
import { runHypothesisTournament } from '../discovery/orchestration/tournament.ts';
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
  // Memory-novelty dimensions replay from the FROZEN fan-out flags persisted
  // on the run (same single-source rule as the orchestrator's scoring stage).
  const memoryFlags = new Map(
    (run.discovery?.fanout?.memoryFlagged ?? []).map((f) => [f.id, f.marker]),
  );
  const memoryDims = memoryNoveltyDimensionsFor(run.hypotheses, memoryFlags);
  const reScorecards: Record<string, ReturnType<typeof buildScorecard>> = {};
  const reBindings: Record<string, CitationBinding> = {};
  for (const h of run.hypotheses) {
    const binding = bindCitations(h, resolver);
    reBindings[h.id] = binding;
    const storedBinding = run.bindings[h.id];
    if (storedBinding === undefined || storedBinding.allBound !== binding.allBound) {
      failures.push(`citation binding MISMATCH for ${h.id}`);
    }
    const deterministic = [
      ...computeDeterministicDimensions(h, binding, run.critiques[h.id]),
      ...(memoryDims.get(h.id) ?? []),
    ];
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
  //    An empty pool means no hypothesis is both fully-bound and falsifiable —
  //    under the fail-closed contract a stored run may not have a primary at
  //    all in that state; a selected primary is a contract violation.
  //    The deterministic tournament is REPLAYED from the frozen hypothesis
  //    order + recomputed scorecards (pure — byte-reproducible), so the
  //    selection rule matches the orchestrator exactly.
  const pool = admissibleHypotheses(run.hypotheses, reBindings, recomputedFalsifiability);
  const scoredEntries = run.hypotheses
    .map((candidate, strategyIndex) => ({ candidate, strategyIndex }))
    .filter((e) => reScorecards[e.candidate.id] !== undefined);
  const tournament =
    scoredEntries.length >= 2 ? runHypothesisTournament(scoredEntries, reScorecards) : undefined;
  if (pool.length === 0) {
    failures.push(
      'primary selection FORBIDDEN (no hypothesis is both fully citation-bound and falsifiable, ' +
        'yet a primary was stored — fail-closed contract violated)',
    );
  } else {
    const primary = selectPrimaryHypothesis(pool, reScorecards, tournament);
    if (primary.id !== run.plan.primaryHypothesisId) {
      failures.push(`primary-hypothesis MISMATCH (recomputed ${primary.id}, stored ${run.plan.primaryHypothesisId})`);
    }
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

  // 7. Discovery tournament (fully recomputable — pure over the frozen
  //    hypothesis order + scorecards). A persisted tournament block that does
  //    not replay byte-for-byte is a tamper/evidence mismatch, fail-closed.
  if (run.discovery?.tournament != null) {
    if (tournament === undefined) {
      failures.push(
        'discovery tournament MISMATCH (stored tournament but fewer than 2 scored hypotheses recompute)',
      );
    } else if (
      JSON.stringify(tournament.ratings) !== JSON.stringify(run.discovery.tournament.ratings) ||
      JSON.stringify(tournament.matches) !== JSON.stringify(run.discovery.tournament.matches) ||
      tournament.meta.degenerate !== run.discovery.tournament.meta.degenerate
    ) {
      failures.push('discovery tournament MISMATCH (stored ranking does not replay from frozen scorecards)');
    }
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
      ...(run.discovery?.tournament != null ? ['discovery_tournament'] : []),
    ],
    notVerifiable: ['model_generation', 'model_critique_dimensions', 'citation_resolution_retrieval'],
  };
}
