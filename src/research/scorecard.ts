/**
 * research/scorecard — deterministic multi-dimensional scoring + Pareto front
 * (directive §9.8).
 *
 * This module is PURE (no LLM, no I/O). It computes the dimensions that can be
 * determined programmatically from a hypothesis + its citation binding + its
 * critique:
 *   - Falsifiability       (has a valid falsification method?)
 *   - Testability          (metric + threshold fully specified?)
 *   - EvidenceCoverage     (how many supporting citations bound?)
 *   - CounterEvidenceCoverage (how many counter citations bound?)
 *   - Risk                 (worst critique severity)
 *
 * The SUBJECTIVE dimensions (ScientificPlausibility, NoveltyRelativeToCorpus,
 * MethodologicalSoundness, ExpectedInformationGain, DataAvailability,
 * ExecutionCost) are produced by the independent critique pass with
 * source='model' — this module NEVER invents them (directive §9.8: model
 * critique / program-computed / human / gate must stay separate; the model is
 * never allowed to emit a single total score that gets accepted wholesale).
 *
 * Pareto front: a hypothesis is dominated when another is >= in every
 * comparable dimension and > in at least one. NOT_APPLICABLE dimensions are
 * excluded from the comparison (they carry no information).
 */

import type {
  CitationBinding,
  CritiqueReport,
  HypothesisCandidate,
  HypothesisScorecard,
  ScorecardDimension,
  ScoreGrade,
} from './types.ts';

/** Ordinal grade value for Pareto dominance (higher = better). */
const GRADE_VALUE: Readonly<Record<ScoreGrade, number>> = {
  A: 5,
  B: 4,
  C: 3,
  D: 2,
  F: 1,
  NOT_APPLICABLE: Number.NEGATIVE_INFINITY,
};

/** A falsification method is fully specified when metric + threshold are present. */
function falsificationSpecified(method: HypothesisCandidate['falsificationMethod']): boolean {
  if (method.metric.trim().length === 0) {
    return false;
  }
  if (method.comparator === 'gt' || method.comparator === 'lt') {
    return method.value !== undefined;
  }
  // comparator === 'range'
  return method.lower !== undefined && method.upper !== undefined;
}

/** Worst critique severity for a hypothesis (none → A). */
function critiqueGrade(report: CritiqueReport | undefined): ScoreGrade {
  if (report === undefined || report.findings.length === 0) {
    return 'A';
  }
  if (report.findings.some((f) => f.severity === 'critical')) {
    return 'F';
  }
  if (report.findings.some((f) => f.severity === 'major')) {
    return 'C';
  }
  return 'B'; // only minor findings
}

/**
 * Compute the DETERMINISTIC dimensions for one hypothesis.
 *
 * Pure: same (candidate, binding, critique) → same dimensions, byte-for-byte.
 */
export function computeDeterministicDimensions(
  candidate: HypothesisCandidate,
  binding: CitationBinding,
  critique?: CritiqueReport,
): readonly ScorecardDimension[] {
  const dims: ScorecardDimension[] = [];

  // Falsifiability (deterministic gate) — the falsifiability_gate enforces this
  // upstream, so a candidate reaching here should already be falsifiable; the
  // grade still reflects spec completeness honestly.
  const fullySpecified = falsificationSpecified(candidate.falsificationMethod);
  dims.push({
    name: 'Falsifiability',
    grade: fullySpecified ? 'A' : 'F',
    rationale: fullySpecified
      ? `falsification method ${candidate.falsificationMethod.metric} with ${candidate.falsificationMethod.comparator} threshold specified`
      : 'falsification method incomplete (missing metric or threshold)',
    source: 'deterministic',
  });

  // Testability (deterministic) — metric present but threshold incomplete.
  const hasMetric = candidate.falsificationMethod.metric.trim().length > 0;
  dims.push({
    name: 'Testability',
    grade: fullySpecified ? 'A' : hasMetric ? 'C' : 'F',
    rationale: fullySpecified
      ? 'metric + threshold fully specified'
      : hasMetric
        ? 'metric present but threshold incomplete'
        : 'no measurable metric',
    source: 'deterministic',
  });

  // EvidenceCoverage (deterministic) — bound supporting citations.
  const supportCount = binding.boundSupporting.length;
  dims.push({
    name: 'EvidenceCoverage',
    grade: supportCount >= 3 ? 'A' : supportCount === 2 ? 'B' : supportCount === 1 ? 'C' : 'D',
    rationale: `${supportCount} bound supporting citation(s)`,
    source: 'deterministic',
  });

  // CounterEvidenceCoverage (deterministic) — bound counter citations.
  const counterCount = binding.boundCounter.length;
  dims.push({
    name: 'CounterEvidenceCoverage',
    grade: counterCount >= 2 ? 'A' : counterCount === 1 ? 'B' : 'C',
    rationale: `${counterCount} bound counter-evidence citation(s) (honest engagement with refuting evidence)`,
    source: 'deterministic',
  });

  // Risk (deterministic from critique severity).
  const riskGrade = critiqueGrade(critique);
  dims.push({
    name: 'Risk',
    grade: riskGrade,
    rationale:
      critique === undefined || critique.findings.length === 0
        ? 'no critique findings'
        : `worst critique severity: ${
            critique.findings.some((f) => f.severity === 'critical')
              ? 'critical'
              : critique.findings.some((f) => f.severity === 'major')
                ? 'major'
                : 'minor'
          }`,
    source: 'deterministic',
  });

  return dims;
}

/**
 * Compute the Pareto front over a set of scorecards (pure).
 *
 * A hypothesis is Pareto-optimal iff no OTHER hypothesis has grade >= it in
 * every comparable dimension and > it in at least one. NOT_APPLICABLE and
 * absent dimensions are skipped (they carry no ordering information).
 */
export function computeParetoFront(
  scorecards: Readonly<Record<string, HypothesisScorecard>>,
): ReadonlySet<string> {
  const ids = Object.keys(scorecards);
  const result = new Set<string>();

  for (const id of ids) {
    const mine = scorecards[id];
    if (mine === undefined) continue;
    let dominated = false;
    for (const otherId of ids) {
      if (otherId === id) continue;
      const other = scorecards[otherId];
      if (other === undefined) continue;
      if (dominates(other, mine)) {
        dominated = true;
        break;
      }
    }
    if (!dominated) {
      result.add(id);
    }
  }
  return result;
}

/** Does `a` dominate `b` (>= everywhere comparable, > somewhere)? */
function dominates(a: HypothesisScorecard, b: HypothesisScorecard): boolean {
  const aDims = new Map(a.dimensions.map((d) => [d.name, d]));
  const bDims = new Map(b.dimensions.map((d) => [d.name, d]));

  let strictlyBetter = false;
  for (const [name, bd] of bDims) {
    const ad = aDims.get(name);
    if (ad === undefined) continue;
    const av = GRADE_VALUE[ad.grade];
    const bv = GRADE_VALUE[bd.grade];
    // NOT_APPLICABLE carries no ordering information — skip the dimension.
    if (av === Number.NEGATIVE_INFINITY || bv === Number.NEGATIVE_INFINITY) {
      continue;
    }
    if (av < bv) {
      return false; // a is worse on some dimension → cannot dominate b
    }
    if (av > bv) {
      strictlyBetter = true;
    }
  }
  return strictlyBetter;
}

/**
 * Cross-run memory-novelty dimensions (directive §8.3 × §2.5, b7).
 *
 * Rule (single source — the orchestrator at scoring time AND verification at
 * replay time both call THIS function, never their own copies):
 *   - NO memory flags in the run  ->  every candidate gets ZERO dimensions
 *     (pre-b7 runs stay byte-identical on replay; old stored scorecards never
 *     gain a dimension retroactively).
 *   - ANY flag present            ->  EVERY candidate gets exactly one
 *     `NoveltyVsResearchMemory` dimension, symmetric across the field so the
 *     Pareto front and the pairwise tournament actually compare it (both
 *     pair dimensions BY NAME — an asymmetric dimension would be silently
 *     skipped).
 *
 * Grades: A = no exact cross-run content match; C = exact match with a still
 * relevant explored branch (no cross-run novelty); F = re-proposes an
 * ELIMINATED direction (negative-results ledger hit — the most expensive
 * repeat). Cannot-prove: this dimension proves LEXICAL-EXACT repetition
 * (content-hash identity); it does NOT prove semantic novelty (a grade-A
 * candidate may still paraphrase a known idea — embedding-based detection is
 * deliberately out of adjudication paths, directive §6.8).
 */
export function memoryNoveltyDimensionsFor(
  candidates: readonly HypothesisCandidate[],
  memoryFlags: ReadonlyMap<string, string>,
): ReadonlyMap<string, readonly ScorecardDimension[]> {
  const out = new Map<string, readonly ScorecardDimension[]>(candidates.map((c) => [c.id, []]));
  if (memoryFlags.size === 0) return out;
  for (const candidate of candidates) {
    const marker = memoryFlags.get(candidate.id);
    out.set(
      candidate.id,
      [
        {
          name: 'NoveltyVsResearchMemory',
          grade:
            marker === undefined
              ? 'A'
              : marker.startsWith('MEMORY_DUPLICATE:negative:')
                ? 'F'
                : marker.startsWith('MEMORY_DUPLICATE:branch:')
                  ? 'C'
                  : 'A',
          rationale:
            marker === undefined
              ? 'no exact cross-run memory content-hash match (lexical-exact check only — not a semantic-novelty proof)'
              : `${marker} — exact content match against research memory (${marker.startsWith('MEMORY_DUPLICATE:negative:') ? 'an ELIMINATED direction' : 'an explored branch'})`,
          source: 'deterministic',
        },
      ],
    );
  }
  return out;
}

/**
 * Build a full HypothesisScorecard from deterministic dimensions + optional
 * model-critique dimensions (merged, never collapsed to a single number).
 */
export function buildScorecard(
  hypothesisId: string,
  deterministic: readonly ScorecardDimension[],
  modelDimensions: readonly ScorecardDimension[],
  paretoOptimal: boolean,
  keyEvidenceToChangeConclusion: string,
): HypothesisScorecard {
  return {
    hypothesisId,
    dimensions: [...deterministic, ...modelDimensions],
    paretoOptimal,
    keyEvidenceToChangeConclusion,
  };
}
