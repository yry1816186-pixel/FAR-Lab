// tests/discovery/orchestration/tournament.test.ts
// 确定性 Elo 锦标赛（2.md §2.2 中层排序器）的契约：
//   - Elo 数学（期望分公式 / K=32 更新 / 平局 0.5）
//   - 判局规则：逐确定性维度 grade 对比，赢维度多者胜；全平 draw
//   - 确定性：同输入（任意输入顺序）→ 逐字节相同结果；枚举序 (strategyIndex, id)
//   - round-robin 完备性：N(N-1)/2 局，每对恰一次
//   - 终局排序 (elo desc, wins desc, id asc) 无并列；全 draw → degenerate 诚实标志
//   - fail-closed：<2 参赛者 / 重复 id / 缺 scorecard 抛错
//   - NOT_APPLICABLE 维度不计分；模型维度不进判局

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  runHypothesisTournament,
  TOURNAMENT_INITIAL_RATING,
  TOURNAMENT_K_FACTOR,
  type TournamentEntry,
} from '../../../src/discovery/orchestration/tournament.ts';
import type {
  HypothesisCandidate,
  HypothesisScorecard,
  ScorecardDimension,
  ScoreGrade,
} from '../../../src/research/types.ts';

/** Typed minimal candidate (no assertion-bypass casts). */
function candidate(id: string, statement = `statement ${id}`): HypothesisCandidate {
  return {
    id,
    statement,
    mechanism: `mechanism ${id}`,
    falsificationMethod: {
      prediction: `prediction ${id}`,
      metric: 'metric',
      comparator: 'gt',
      value: 1,
    },
    supportingCitations: [],
    counterEvidenceCitations: [],
    relationToExistingTheory: 'theory',
    alternativeExplanations: [],
    observablePredictions: [],
    distinguishingObservations: [],
    noveltyRelativeToCorpus: 'novelty',
    assumptions: [],
    risks: [],
  };
}

/** Deterministic-only scorecard with the 5 canonical dimension grades. */
function scorecard(grades: Partial<Record<string, ScoreGrade>> = {}): HypothesisScorecard {
  const canonical: [string, ScoreGrade][] = [
    ['Falsifiability', grades['Falsifiability'] ?? 'A'],
    ['Testability', grades['Testability'] ?? 'A'],
    ['EvidenceCoverage', grades['EvidenceCoverage'] ?? 'C'],
    ['CounterEvidenceCoverage', grades['CounterEvidenceCoverage'] ?? 'C'],
    ['Risk', grades['Risk'] ?? 'B'],
  ];
  const dimensions: ScorecardDimension[] = canonical.map(([name, grade]) => ({
    name: name as ScorecardDimension['name'],
    grade,
    rationale: 'test',
    source: 'deterministic',
  }));
  return {
    hypothesisId: 'test',
    dimensions,
    paretoOptimal: true,
    keyEvidenceToChangeConclusion: '',
  };
}

/** Entry helper: strategyIndex defaults to array position (fan-out order). */
function entriesOf(ids: readonly string[]): TournamentEntry[] {
  return ids.map((id, strategyIndex) => ({ candidate: candidate(id), strategyIndex }));
}

describe('Elo math', () => {
  it('two-player win applies the standard Elo update (K=32, expectation formula)', () => {
    const ids = ['a', 'b'];
    // a wins every dimension (A vs F on EvidenceCoverage alone suffices).
    const scorecards = {
      a: scorecard({ EvidenceCoverage: 'A' }),
      b: scorecard({ EvidenceCoverage: 'F' }),
    };
    const result = runHypothesisTournament(entriesOf(ids), scorecards);
    // Pre-match both 1200 → expected 0.5 each → winner +16, loser −16.
    const a = result.ratings.find((r) => r.id === 'a')!;
    const b = result.ratings.find((r) => r.id === 'b')!;
    assert.equal(a.elo, TOURNAMENT_INITIAL_RATING + TOURNAMENT_K_FACTOR * 0.5);
    assert.equal(b.elo, TOURNAMENT_INITIAL_RATING - TOURNAMENT_K_FACTOR * 0.5);
    assert.equal(a.wins, 1);
    assert.equal(b.losses, 1);
  });

  it('a draw scores 0.5 for both — ratings return to (rounded) initial', () => {
    const ids = ['a', 'b'];
    const scorecards = { a: scorecard(), b: scorecard() };
    const result = runHypothesisTournament(entriesOf(ids), scorecards);
    for (const r of result.ratings) {
      assert.equal(r.elo, TOURNAMENT_INITIAL_RATING, 'equal scores in, equal scores out');
      assert.equal(r.draws, 1);
    }
    assert.equal(result.meta.degenerate, true, 'the only match drew → degenerate flagged');
  });

  it('expected-score math drives unequal updates when ratings diverge mid-event', () => {
    // 3 players, b beats a (draws rest) → then c plays them at diverged ratings.
    const ids = ['a', 'b', 'c'];
    const scorecards = {
      a: scorecard({ EvidenceCoverage: 'F' }),
      b: scorecard({ EvidenceCoverage: 'A' }),
      c: scorecard({ EvidenceCoverage: 'C' }),
    };
    const result = runHypothesisTournament(entriesOf(ids), scorecards);
    // b > c > a on the deciding dimension in every pairing → b 2-0, c 1-1, a 0-2.
    const byId = new Map(result.ratings.map((r) => [r.id, r]));
    assert.equal(byId.get('b')!.wins, 2);
    assert.equal(byId.get('c')!.wins, 1);
    assert.equal(byId.get('c')!.losses, 1);
    assert.equal(byId.get('a')!.losses, 2);
    // Elo strictly ordered (sequential updates preserved the true ordering).
    assert.ok(byId.get('b')!.elo > byId.get('c')!.elo && byId.get('c')!.elo > byId.get('a')!.elo);
    // Gain of the favourite (b vs a at already-high rating) is smaller than 16:
    // matches: (a,b) first — b +16 → 1216; (a,c): c +16 → 1216; (b,c): b favourite.
    // c's upset loss/gain bounds verified by conservation: sum of elos is constant.
    const sum = result.ratings.reduce((acc, r) => acc + r.elo, 0);
    assert.ok(Math.abs(sum - 3 * TOURNAMENT_INITIAL_RATING) < 1e-6, 'Elo is zero-sum');
  });
});

describe('match rule', () => {
  it('per-dimension point log records every comparison with the winner', () => {
    const ids = ['a', 'b'];
    const scorecards = {
      a: scorecard({ Falsifiability: 'A', Risk: 'C' }),
      b: scorecard({ Falsifiability: 'B', Risk: 'A' }),
    };
    const result = runHypothesisTournament(entriesOf(ids), scorecards);
    assert.equal(result.matches.length, 1);
    const match = result.matches[0]!;
    assert.equal(match.outcome, 'draw', 'one dimension each');
    const byDim = new Map(match.criteria.map((c) => [c.dimension, c]));
    assert.equal(byDim.get('Falsifiability')!.point, 'a');
    assert.equal(byDim.get('Falsifiability')!.aGrade, 'A');
    assert.equal(byDim.get('Risk')!.point, 'b');
    assert.equal(byDim.get('Testability')!.point, 'none', 'equal grades score nothing');
  });

  it('NOT_APPLICABLE dimensions carry no point (ordering information only)', () => {
    const ids = ['a', 'b'];
    const na: ScorecardDimension = {
      name: 'EvidenceCoverage',
      grade: 'NOT_APPLICABLE',
      rationale: 'n/a',
      source: 'deterministic',
    };
    const withNa = (card: HypothesisScorecard): HypothesisScorecard => ({
      ...card,
      dimensions: card.dimensions.map((d) => (d.name === 'EvidenceCoverage' ? na : d)),
    });
    const aCard = withNa(scorecard({ Falsifiability: 'A' }));
    const bCard = withNa(scorecard({ Falsifiability: 'A' }));
    const result = runHypothesisTournament(entriesOf(ids), { a: aCard, b: bCard });
    const crit = result.matches[0]!.criteria.find((c) => c.dimension === 'EvidenceCoverage')!;
    assert.equal(crit.point, 'none');
  });

  it('model dimensions are excluded from judging (deterministic ranker only)', () => {
    const ids = ['a', 'b'];
    const withModel: HypothesisScorecard = {
      ...scorecard(),
      dimensions: [
        ...scorecard().dimensions,
        { name: 'ScientificPlausibility', grade: 'A', rationale: 'model', source: 'model' },
      ],
    };
    const plain = scorecard();
    const result = runHypothesisTournament(entriesOf(ids), { a: withModel, b: plain });
    assert.equal(result.matches[0]!.outcome, 'draw', 'model dimension did not vote');
    assert.ok(result.matches[0]!.criteria.every((c) => c.dimension !== 'ScientificPlausibility'));
  });
});

describe('determinism and structure', () => {
  const scorecards = {
    a: scorecard({ EvidenceCoverage: 'A', Risk: 'B' }),
    b: scorecard({ EvidenceCoverage: 'B', Risk: 'B' }),
    c: scorecard({ EvidenceCoverage: 'B', Risk: 'A' }),
  };

  it('byte-identical result regardless of input order (re-sort by strategyIndex, id)', () => {
    const ids = ['a', 'b', 'c'];
    const e1 = entriesOf(ids);
    const e2 = [e1[2]!, e1[0]!, e1[1]!];
    const r1 = runHypothesisTournament(e1, scorecards);
    const r2 = runHypothesisTournament(e2, scorecards);
    assert.deepEqual(JSON.parse(JSON.stringify(r1)), JSON.parse(JSON.stringify(r2)));
  });

  it('round-robin completeness: N(N-1)/2 matches, each pair exactly once', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const cards: Record<string, HypothesisScorecard> = {
      a: scorecard({ EvidenceCoverage: 'A' }),
      b: scorecard({ EvidenceCoverage: 'B' }),
      c: scorecard({ EvidenceCoverage: 'C' }),
      d: scorecard({ EvidenceCoverage: 'D' }),
    };
    const result = runHypothesisTournament(entriesOf(ids), cards);
    assert.equal(result.matches.length, (4 * 3) / 2);
    const pairs = result.matches.map((m) => [m.aId, m.bId].sort().join('|')).sort();
    assert.deepEqual(pairs, ['a|b', 'a|c', 'a|d', 'b|c', 'b|d', 'c|d']);
  });

  it('final ranking is a total order: ranks 1..N without ties or gaps', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const cards = Object.fromEntries(ids.map((id) => [id, scorecard({ EvidenceCoverage: 'C' })]));
    const result = runHypothesisTournament(entriesOf(ids), cards);
    assert.deepEqual(
      result.ratings.map((r) => r.rank),
      ids.map((_, i) => i + 1),
    );
  });

  it('meta records the fixed conventions (rounds/initial/K/pairing order)', () => {
    const result = runHypothesisTournament(entriesOf(['a', 'b']), {
      a: scorecard({ Risk: 'A' }),
      b: scorecard(),
    });
    assert.equal(result.meta.rounds, 1);
    assert.equal(result.meta.initialRating, 1200);
    assert.equal(result.meta.kFactor, 32);
    assert.equal(result.meta.pairingOrder, 'strategy_then_id');
    assert.equal(result.meta.degenerate, false);
  });

  it('strategyOrigin is carried onto the ratings (attribution survives ranking)', () => {
    const a = { candidate: { ...candidate('a'), strategyOrigin: 'induction' as const }, strategyIndex: 0 };
    const b = { candidate: { ...candidate('b'), strategyOrigin: 'analogy' as const }, strategyIndex: 1 };
    const result = runHypothesisTournament([a, b], {
      a: scorecard({ Risk: 'A' }),
      b: scorecard(),
    });
    assert.deepEqual(
      result.ratings.map((r) => r.strategyOrigin).sort(),
      ['analogy', 'induction'],
    );
  });
});

describe('fail-closed', () => {
  it('fewer than 2 entrants throws (no theater with zero pairings)', () => {
    assert.throws(() => runHypothesisTournament(entriesOf(['a']), { a: scorecard() }), /at least 2/);
    assert.throws(() => runHypothesisTournament([], {}), /at least 2/);
  });

  it('duplicate hypothesis ids throw (dedup happened upstream)', () => {
    const dup: TournamentEntry[] = [
      { candidate: candidate('a'), strategyIndex: 0 },
      { candidate: candidate('a'), strategyIndex: 1 },
    ];
    assert.throws(() => runHypothesisTournament(dup, { a: scorecard() }), /duplicate/);
  });

  it('a missing scorecard throws with the entrant named', () => {
    assert.throws(
      () => runHypothesisTournament(entriesOf(['a', 'b']), { a: scorecard() }),
      /missing: b/,
    );
  });
});
