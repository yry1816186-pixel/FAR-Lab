/**
 * discovery/orchestration/tournament — deterministic Elo ranking of candidate
 * hypotheses (directive §2.2 medium layer, Appendix B skeleton).
 *
 * Co-scientist systems (Google AI co-scientist, llnl) use pairwise LLM debate
 * + Elo to rank hypotheses — relative comparison resists absolute-score
 * inflation. Their costs: LLM debate per pairing (O(N²) model calls) and, in
 * the llnl implementation, RANDOM tie-breaks that make rankings non-
 * reproducible. FAR-Lab's tournament keeps the pairwise/elo structure but
 * derives every match verdict from DETERMINISTIC scorecard dimensions:
 * zero model calls, byte-for-byte reproducible, ties resolved by a fixed
 * (elo, wins, id) triple — Elo only orders; adjudication power stays with the
 * deterministic kernel (falsifiability/citation gates, FEC, R0-R9).
 *
 * Match rule: for each deterministic dimension present in BOTH scorecards
 * (grade ≠ NOT_APPLICABLE), the higher grade scores one point; the candidate
 * with more points wins the match, equal points is a draw. Elo updates are
 * sequential in the fixed pairing enumeration order (strategyIndex, id) —
 * documented as a ranking convention, not a strength estimator.
 *
 * Zero-entropy discipline: no Date.now / Math.random / process.env — pure.
 */

import type { HypothesisCandidate, HypothesisScorecard, ScoreGrade } from '../../research/types.ts';
import type { StrategyId } from '../types.ts';

/** Standard Elo parameters (llnl-verified defaults; chess convention). */
export const TOURNAMENT_INITIAL_RATING = 1200;
export const TOURNAMENT_K_FACTOR = 32;

/** Ordinal grade value shared with the scorecard Pareto logic (higher = better). */
const GRADE_VALUE: Readonly<Record<ScoreGrade, number>> = {
  A: 5,
  B: 4,
  C: 3,
  D: 2,
  F: 1,
  NOT_APPLICABLE: Number.NEGATIVE_INFINITY,
};

/** One competitor. strategyIndex is the fan-out/candidate order (deterministic pairing anchor). */
export interface TournamentEntry {
  readonly candidate: HypothesisCandidate;
  /** Position in the fan-out merge order (legacy single-source runs: input order). */
  readonly strategyIndex: number;
}

/** Per-dimension point log for one match (auditable: WHY a match went the way it did). */
export interface MatchCriterion {
  readonly dimension: string;
  readonly aGrade: ScoreGrade;
  readonly bGrade: ScoreGrade;
  readonly point: 'a' | 'b' | 'none';
}

export interface TournamentMatch {
  readonly aId: string;
  readonly bId: string;
  readonly outcome: 'a' | 'b' | 'draw';
  readonly criteria: readonly MatchCriterion[];
}

export interface TournamentRating {
  readonly id: string;
  readonly strategyOrigin: StrategyId | null;
  readonly elo: number;
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
  readonly rank: number;
}

export interface TournamentResult {
  /** Ratings ordered by rank (best first). */
  readonly ratings: readonly TournamentRating[];
  /** Every match with its full criterion log, in pairing order. */
  readonly matches: readonly TournamentMatch[];
  readonly meta: {
    readonly rounds: 1;
    readonly initialRating: number;
    readonly kFactor: number;
    readonly pairingOrder: 'strategy_then_id';
    /**
     * True when every match was a draw — the deterministic dimensions carried
     * ZERO ordering information and the final ranking degenerated to the
     * (wins, id) deterministic anchor. Surfaced honestly, never hidden.
     */
    readonly degenerate: boolean;
  };
}

/** Standard Elo expectation of `a` against `b`. */
function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

/** Deterministic comparison key for pairing enumeration and final ranking. */
function entrySortKey(entry: TournamentEntry): { strategyIndex: number; id: string } {
  return { strategyIndex: entry.strategyIndex, id: entry.candidate.id };
}

/**
 * Run the round-robin tournament. Pure: the same entries (in any input order)
 * always produce the byte-identical result — internal order is re-derived
 * from (strategyIndex, id).
 *
 * @throws when entries contain duplicate hypothesis ids, or fewer than 2
 *         entries are provided (a tournament needs at least one pairing).
 */
export function runHypothesisTournament(
  entries: readonly TournamentEntry[],
  scorecards: Readonly<Record<string, HypothesisScorecard>>,
): TournamentResult {
  if (entries.length < 2) {
    throw new Error(`tournament requires at least 2 entrants, got ${entries.length}`);
  }
  const ids = new Set(entries.map((e) => e.candidate.id));
  if (ids.size !== entries.length) {
    throw new Error('tournament entries contain duplicate hypothesis ids');
  }

  const ordered = [...entries].sort((a, b) => {
    const ka = entrySortKey(a);
    const kb = entrySortKey(b);
    if (ka.strategyIndex !== kb.strategyIndex) return ka.strategyIndex - kb.strategyIndex;
    return ka.id < kb.id ? -1 : ka.id > kb.id ? 1 : 0;
  });

  const elo = new Map<string, number>(ordered.map((e) => [e.candidate.id, TOURNAMENT_INITIAL_RATING]));
  const record = new Map<string, { wins: number; draws: number; losses: number }>(
    ordered.map((e) => [e.candidate.id, { wins: 0, draws: 0, losses: 0 }]),
  );
  const matches: TournamentMatch[] = [];

  // Round-robin over the fixed enumeration order — sequential Elo updates make
  // the rating evolution deterministic given this order.
  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      const a = ordered[i]!;
      const b = ordered[j]!;
      const match = playMatch(a.candidate.id, b.candidate.id, scorecards);
      matches.push(match);

      const scoreA = match.outcome === 'a' ? 1 : match.outcome === 'draw' ? 0.5 : 0;
      const ratingA = elo.get(a.candidate.id)!;
      const ratingB = elo.get(b.candidate.id)!;
      const expectedA = expectedScore(ratingA, ratingB);
      elo.set(a.candidate.id, ratingA + TOURNAMENT_K_FACTOR * (scoreA - expectedA));
      elo.set(b.candidate.id, ratingB + TOURNAMENT_K_FACTOR * (1 - scoreA - (1 - expectedA)));

      const recA = record.get(a.candidate.id)!;
      const recB = record.get(b.candidate.id)!;
      if (match.outcome === 'a') {
        recA.wins += 1;
        recB.losses += 1;
      } else if (match.outcome === 'b') {
        recB.wins += 1;
        recA.losses += 1;
      } else {
        recA.draws += 1;
        recB.draws += 1;
      }
    }
  }

  // Final ranking: (elo desc, wins desc, id asc) — zero randomness, total order.
  const ranked = [...ordered].sort((a, b) => {
    const eloA = elo.get(a.candidate.id)!;
    const eloB = elo.get(b.candidate.id)!;
    if (eloA !== eloB) return eloB - eloA;
    const winsA = record.get(a.candidate.id)!.wins;
    const winsB = record.get(b.candidate.id)!.wins;
    if (winsA !== winsB) return winsB - winsA;
    return a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0;
  });

  return {
    ratings: ranked.map((entry, index) => {
      const rec = record.get(entry.candidate.id)!;
      return {
        id: entry.candidate.id,
        strategyOrigin: entry.candidate.strategyOrigin ?? null,
        elo: Math.round(elo.get(entry.candidate.id)! * 1e6) / 1e6,
        wins: rec.wins,
        draws: rec.draws,
        losses: rec.losses,
        rank: index + 1,
      };
    }),
    matches,
    meta: {
      rounds: 1,
      initialRating: TOURNAMENT_INITIAL_RATING,
      kFactor: TOURNAMENT_K_FACTOR,
      pairingOrder: 'strategy_then_id',
      degenerate: matches.every((m) => m.outcome === 'draw'),
    },
  };
}

/**
 * Play one match on deterministic dimensions only. Model-critique dimensions
 * are deliberately excluded: they are not reproducible across LIVE runs and
 * the medium-layer ranker must stay deterministic (LLM debate ranking is the
 * later debate.ts orchestration, explicitly labeled non-deterministic).
 */
function playMatch(
  aId: string,
  bId: string,
  scorecards: Readonly<Record<string, HypothesisScorecard>>,
): TournamentMatch {
  const aCard = scorecards[aId];
  const bCard = scorecards[bId];
  if (aCard === undefined || bCard === undefined) {
    throw new Error(
      `tournament requires a scorecard for every entrant (missing: ${aCard === undefined ? aId : bId})`,
    );
  }
  const aDims = new Map(
    aCard.dimensions.filter((d) => d.source === 'deterministic').map((d) => [d.name, d.grade]),
  );
  const bDims = new Map(
    bCard.dimensions.filter((d) => d.source === 'deterministic').map((d) => [d.name, d.grade]),
  );

  let pointsA = 0;
  let pointsB = 0;
  const criteria: MatchCriterion[] = [];
  // Dimension order: the scorecard's own dimension order (deterministic producer).
  for (const [name, aGrade] of aDims) {
    const bGrade = bDims.get(name);
    if (bGrade === undefined) continue;
    const av = GRADE_VALUE[aGrade];
    const bv = GRADE_VALUE[bGrade];
    // NOT_APPLICABLE carries no ordering information — logged, no point.
    let point: MatchCriterion['point'] = 'none';
    if (av !== Number.NEGATIVE_INFINITY && bv !== Number.NEGATIVE_INFINITY) {
      if (av > bv) {
        pointsA += 1;
        point = 'a';
      } else if (bv > av) {
        pointsB += 1;
        point = 'b';
      }
    }
    criteria.push({ dimension: name, aGrade, bGrade, point });
  }

  return {
    aId,
    bId,
    outcome: pointsA > pointsB ? 'a' : pointsB > pointsA ? 'b' : 'draw',
    criteria,
  };
}
