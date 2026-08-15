// tests/discovery/orchestration/tournament_replay_anchor.test.ts
// §2.2 补遗「Elo 确定性重放」的回归锚：一份冻结的对局台账（ratings + matches +
// meta 全量），当前 runHypothesisTournament 实现必须重放出逐字节相同的结果——
// 排序器实现变更（K 因子/枚举序/tie-break/判局规则）导致的任何分差漂移都会在此失败。
// 台账冻结于 2026-08-15（b4；输入=3 候选 × 5 确定性维度等级差异）。

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  runHypothesisTournament,
  type TournamentEntry,
} from '../../../src/discovery/orchestration/tournament.ts';
import type { HypothesisCandidate, HypothesisScorecard, ScorecardDimension } from '../../../src/research/types.ts';

function candidate(id: string): HypothesisCandidate {
  return {
    id,
    statement: `s ${id}`,
    mechanism: `m ${id}`,
    falsificationMethod: { prediction: 'p', metric: 'm', comparator: 'gt', value: 1 },
    supportingCitations: [],
    counterEvidenceCitations: [],
    relationToExistingTheory: 't',
    alternativeExplanations: [],
    observablePredictions: [],
    distinguishingObservations: [],
    noveltyRelativeToCorpus: 'n',
    assumptions: [],
    risks: [],
  };
}

const ENTRIES: readonly TournamentEntry[] = [
  { candidate: candidate('anchor-a'), strategyIndex: 0 },
  { candidate: candidate('anchor-b'), strategyIndex: 1 },
  { candidate: candidate('anchor-c'), strategyIndex: 0 },
];

const SCORECARD_GRADES: Readonly<Record<string, readonly string[]>> = {
  'anchor-a': ['A', 'A', 'B', 'C', 'B'],
  'anchor-b': ['A', 'B', 'A', 'B', 'A'],
  'anchor-c': ['B', 'A', 'C', 'A', 'C'],
};

/** Frozen 2026-08-15 — canonical JSON (sorted keys, tight separators). */
const FROZEN_RATINGS = '[{"draws":0,"elo":1231.23319,"id":"anchor-b","losses":0,"rank":1,"strategyOrigin":null,"wins":2},{"draws":0,"elo":1199.263693,"id":"anchor-a","losses":1,"rank":2,"strategyOrigin":null,"wins":1},{"draws":0,"elo":1169.503117,"id":"anchor-c","losses":2,"rank":3,"strategyOrigin":null,"wins":0}]';
const FROZEN_MATCHES = '[{"aId":"anchor-a","bId":"anchor-c","criteria":[{"aGrade":"A","bGrade":"B","dimension":"Falsifiability","point":"a"},{"aGrade":"A","bGrade":"A","dimension":"Testability","point":"none"},{"aGrade":"B","bGrade":"C","dimension":"EvidenceCoverage","point":"a"},{"aGrade":"C","bGrade":"A","dimension":"CounterEvidenceCoverage","point":"b"},{"aGrade":"B","bGrade":"C","dimension":"Risk","point":"a"}],"outcome":"a"},{"aId":"anchor-a","bId":"anchor-b","criteria":[{"aGrade":"A","bGrade":"A","dimension":"Falsifiability","point":"none"},{"aGrade":"A","bGrade":"B","dimension":"Testability","point":"a"},{"aGrade":"B","bGrade":"A","dimension":"EvidenceCoverage","point":"b"},{"aGrade":"C","bGrade":"B","dimension":"CounterEvidenceCoverage","point":"b"},{"aGrade":"B","bGrade":"A","dimension":"Risk","point":"b"}],"outcome":"b"},{"aId":"anchor-c","bId":"anchor-b","criteria":[{"aGrade":"B","bGrade":"A","dimension":"Falsifiability","point":"b"},{"aGrade":"A","bGrade":"B","dimension":"Testability","point":"a"},{"aGrade":"C","bGrade":"A","dimension":"EvidenceCoverage","point":"b"},{"aGrade":"A","bGrade":"B","dimension":"CounterEvidenceCoverage","point":"a"},{"aGrade":"C","bGrade":"A","dimension":"Risk","point":"b"}],"outcome":"b"}]';
const FROZEN_META = '{"degenerate":false,"initialRating":1200,"kFactor":32,"pairingOrder":"strategy_then_id","rounds":1}';

function buildScorecards(): Record<string, HypothesisScorecard> {
  const names = ['Falsifiability', 'Testability', 'EvidenceCoverage', 'CounterEvidenceCoverage', 'Risk'] as const;
  const out: Record<string, HypothesisScorecard> = {};
  for (const [id, grades] of Object.entries(SCORECARD_GRADES)) {
    const dimensions: ScorecardDimension[] = names.map((name, i) => ({
      name,
      grade: grades[i] as ScorecardDimension['grade'],
      rationale: 'r',
      source: 'deterministic',
    }));
    out[id] = { hypothesisId: id, dimensions, paretoOptimal: true, keyEvidenceToChangeConclusion: '' };
  }
  return out;
}

/** Stable canonical serialization (sorted keys — key-order independent). */
function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

describe('Elo deterministic replay anchor (§2.2 补遗)', () => {
  it('the CURRENT implementation replays the frozen ledger byte-identically', () => {
    const result = runHypothesisTournament(ENTRIES, buildScorecards());
    assert.equal(canonical(result.ratings), FROZEN_RATINGS);
    assert.equal(canonical(result.matches), FROZEN_MATCHES);
    assert.equal(canonical(result.meta), FROZEN_META);
  });

  it('replays are stable across repeated invocations (no hidden state)', () => {
    const one = runHypothesisTournament(ENTRIES, buildScorecards());
    const two = runHypothesisTournament(ENTRIES, buildScorecards());
    assert.deepEqual(one, two);
  });

  it('the frozen ledger is semantically sane (winner ranked 1, zero-sum-ish Elo)', () => {
    const frozen = JSON.parse(FROZEN_RATINGS) as { id: string; rank: number; elo: number }[];
    assert.equal(frozen.find((r) => r.rank === 1)!.id, 'anchor-b');
    assert.equal(frozen.find((r) => r.rank === 3)!.id, 'anchor-c');
  });
});
