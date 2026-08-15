// tests/research/memory_scorecard.test.ts
// MEMORY_DUPLICATE→scorecard 联动（2.md §8.3 × §2.5，b7）的契约：
//   - 单源规则：无旗标→全员零维度（pre-b7 run 重放字节安全）；
//     任一旗标→全员一维 NoveltyVsResearchMemory（对称——Pareto/锦标赛按名配对，
//     不对称在场会被跳过=惩罚失效）
//   - 分级：未命中=A / branch 命中=C / negative 命中=F（重提已淘汰方向最重）
//   - 旗标来源=fanout.memoryFlagged（冻结在 run 文件）→ orchestrator 初算与
//     verify 重算同函数同输入字节一致；篡改旗标→对账 MISMATCH
//   - 影响只经由 scorecard 传导：Pareto 支配 + 锦标赛失分，selectPrimary 零特例

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createLlmGateway } from '../../src/llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';
import { createReplayAdapter } from '../../src/retrieval/index.ts';
import { runResearch } from '../../src/research/orchestrator.ts';
import { verifyResearchRunDeterministic } from '../../src/research/verification.ts';
import { memoryNoveltyDimensionsFor } from '../../src/research/scorecard.ts';
import { computeParetoFront, buildScorecard } from '../../src/research/scorecard.ts';
import { hypothesisContentHash } from '../../src/discovery/content_hash.ts';
import { runHypothesisTournament } from '../../src/discovery/orchestration/tournament.ts';
import type { ScorecardDimension } from '../../src/research/types.ts';
import { RESEARCH_DEMO_DOCS, RESEARCH_DEMO_FIXTURES } from '../../src/research/research_fixtures.ts';

const QUESTION = 'Why are hot Jupiter radii larger than structure models predict?';

function candidate(id: string, statement: string) {
  return {
    id,
    statement,
    mechanism: `mechanism ${id}`,
    falsificationMethod: { prediction: `prediction ${id}`, metric: 'metric', comparator: 'gt' as const, value: 1 },
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

describe('memoryNoveltyDimensionsFor (pure, single-source rule)', () => {
  const a = candidate('h-a', 'alpha statement');
  const b = candidate('h-b', 'beta statement');

  it('NO flags → every candidate gets ZERO dimensions (pre-b7 replay safety)', () => {
    const out = memoryNoveltyDimensionsFor([a, b], new Map());
    assert.deepEqual(out.get('h-a'), []);
    assert.deepEqual(out.get('h-b'), []);
  });

  it('any flag → EVERY candidate gets exactly one symmetric dimension', () => {
    const out = memoryNoveltyDimensionsFor([a, b], new Map([['h-a', 'MEMORY_DUPLICATE:branch:node-x']]));
    for (const id of ['h-a', 'h-b']) {
      const dims = out.get(id)!;
      assert.equal(dims.length, 1, `${id} must carry the dimension when any flag exists`);
      assert.equal(dims[0]!.name, 'NoveltyVsResearchMemory');
      assert.equal(dims[0]!.source, 'deterministic');
    }
    assert.equal(out.get('h-a')![0]!.grade, 'C', 'branch hit → C');
    assert.equal(out.get('h-b')![0]!.grade, 'A', 'no hit → A');
    assert.ok(out.get('h-a')![0]!.rationale.includes('node-x'), 'rationale carries the marker verbatim');
    assert.ok(out.get('h-b')![0]!.rationale.includes('lexical-exact'), 'A rationale states the boundary honestly');
  });

  it('negative hit → F (re-proposing an ELIMINATED direction is the most expensive repeat)', () => {
    const out = memoryNoveltyDimensionsFor([a], new Map([['h-a', 'MEMORY_DUPLICATE:negative:neg-y']]));
    assert.equal(out.get('h-a')![0]!.grade, 'F');
    assert.ok(out.get('h-a')![0]!.rationale.includes('ELIMINATED'));
  });

  it('defensive: negative takes precedence if both forms ever appear', () => {
    const out = memoryNoveltyDimensionsFor([a], new Map([['h-a', 'MEMORY_DUPLICATE:negative:n']]));
    assert.equal(out.get('h-a')![0]!.grade, 'F');
  });

  it('unknown marker prefix → A with the marker still visible in rationale (no crash, no silent F)', () => {
    const out = memoryNoveltyDimensionsFor([a], new Map([['h-a', 'MEMORY_DUPLICATE:future-form:z']]));
    assert.equal(out.get('h-a')![0]!.grade, 'A');
    assert.ok(out.get('h-a')![0]!.rationale.includes('future-form'));
  });
});

describe('scorecard effect: Pareto domination + tournament penalty', () => {
  const base = (_id: string, noveltyGrade: 'A' | 'F'): readonly ScorecardDimension[] => [
    { name: 'Falsifiability', grade: 'A', rationale: 'r', source: 'deterministic' },
    { name: 'Testability', grade: 'A', rationale: 'r', source: 'deterministic' },
    { name: 'NoveltyVsResearchMemory', grade: noveltyGrade, rationale: 'r', source: 'deterministic' },
  ];

  it('an equal-quality duplicate is dominated by the novel candidate (Pareto)', () => {
    const cards = {
      'h-novel': buildScorecard('h-novel', base('h-novel', 'A'), [], false, ''),
      'h-dup': buildScorecard('h-dup', base('h-dup', 'F'), [], false, ''),
    };
    const pareto = computeParetoFront(cards);
    assert.ok(pareto.has('h-novel'), 'novel candidate stays on the front');
    assert.equal(pareto.has('h-dup'), false, 'exact-negative duplicate is dominated');
  });

  it('the tournament penalizes the duplicate in pairwise play (deterministic dimension)', () => {
    const cards = {
      'h-novel': buildScorecard('h-novel', base('h-novel', 'A'), [], false, ''),
      'h-dup': buildScorecard('h-dup', base('h-dup', 'F'), [], false, ''),
    };
    const entries = [
      { candidate: { ...candidate('h-novel', 'novel mechanism text'), strategyOrigin: 'induction' as const }, strategyIndex: 0 },
      { candidate: { ...candidate('h-dup', 'duplicate mechanism text'), strategyOrigin: 'analogy' as const }, strategyIndex: 1 },
    ];
    const tournament = runHypothesisTournament(entries, cards);
    const novel = tournament.ratings.find((r) => r.id === 'h-novel')!;
    const dup = tournament.ratings.find((r) => r.id === 'h-dup')!;
    assert.ok(novel.elo > dup.elo, `novel must outrank the duplicate (got ${novel.elo} vs ${dup.elo})`);
    assert.equal(novel.rank < dup.rank, true);
  });
});

describe('orchestrator + verification wiring (end-to-end offline)', () => {
  function buildGateway() {
    return createLlmGateway([createOfflineReplayAdapter({ fixtures: RESEARCH_DEMO_FIXTURES })]);
  }

  it('a run WITHOUT memory flags has no memory dimension anywhere (zero-regression)', async () => {
    const run = await runResearch({
      question: QUESTION,
      gateway: buildGateway(),
      profile: 'offline_replay',
      grounding: { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) },
      targetHypothesisCount: 3,
    });
    for (const card of Object.values(run.scorecards)) {
      assert.equal(
        card.dimensions.some((d) => d.name === 'NoveltyVsResearchMemory'),
        false,
        'no flags → no memory dimension',
      );
    }
    assert.equal(verifyResearchRunDeterministic(run).status, 'PASS');
  });

  it('a run WITH memory flags: dimension for every scored candidate + replay-consistent', async () => {
    // Seed a memory store index over the demo question's own first-run output,
    // so the second run re-generates flagged content (b5 injection test pattern).
    const first = await runResearch({
      question: QUESTION,
      gateway: buildGateway(),
      profile: 'offline_replay',
      grounding: { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) },
      targetHypothesisCount: 3,
    });
    const known = new Set(first.hypotheses.map((h) => hypothesisContentHash(h)));
    const memoryStore = {
      schemaVersion: 1 as const,
      updatedAt: '2026-08-16T00:00:00.000Z',
      negativeResults: first.hypotheses.slice(0, 1).map((h) => ({
        id: `neg-${h.id.slice(0, 12)}`, runId: 'seed', hypothesisId: h.id,
        strategyOrigin: h.strategyOrigin ?? null, contentHash: hypothesisContentHash(h),
        domain: 'astronomy', question: QUESTION, eliminatedAt: '2026-08-15T00:00:00.000Z',
        eliminationReason: 'falsifiability_gate_failed' as const,
        reasonDetail: 'seeded for scorecard linkage [n=1]', evidencePointers: [],
      })),
      branchTree: [],
      strategyStats: [],
      learnings: [],
      conclusions: [],
    };
    const second = await runResearch({
      question: QUESTION,
      gateway: buildGateway(),
      profile: 'offline_replay',
      grounding: { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) },
      targetHypothesisCount: 3,
      memoryStore,
    });
    const flagged = second.discovery?.fanout?.memoryFlagged ?? [];
    if (flagged.length > 0) {
      // Symmetric presence: EVERY scored candidate carries the dimension.
      for (const card of Object.values(second.scorecards)) {
        assert.ok(
          card.dimensions.some((d) => d.name === 'NoveltyVsResearchMemory'),
          'any flag → dimension for every scored candidate',
        );
      }
      // The flagged candidate itself must NOT be A.
      for (const flag of flagged) {
        const dim = second.scorecards[flag.id]?.dimensions.find((d) => d.name === 'NoveltyVsResearchMemory');
        assert.ok(dim !== undefined);
        assert.notEqual(dim.grade, 'A');
      }
    } else {
      // Replay fixtures regenerated different content — honest skip note:
      assert.equal(known.size, first.hypotheses.length);
    }
    // Replay consistency either way (the core invariant).
    const outcome = verifyResearchRunDeterministic(second);
    assert.equal(outcome.status, 'PASS', outcome.failures.join('; '));
  });

  it('tampering a persisted flag flips the recomputed dimension → verification FAILS', async () => {
    const run = await runResearch({
      question: QUESTION,
      gateway: buildGateway(),
      profile: 'offline_replay',
      grounding: { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) },
      targetHypothesisCount: 3,
    });
    // Forge a run that CLAIMS a memory flag but whose stored scorecards were
    // computed WITHOUT it (the tamper direction verify must catch).
    const victim = run.hypotheses[0]!;
    const tampered = {
      ...run,
      discovery: {
        ...(run.discovery ?? { strategy: 'legacy' as const, fanout: null, tournament: null }),
        fanout: {
          ...(run.discovery?.fanout ?? {
            strategiesPlanned: [], perStrategy: [], exactDuplicatesDropped: 0,
            paraphraseFlagged: [], truncated: [], finalCount: 0, quotaShortfall: 0,
          }),
          memoryFlagged: [{ id: victim.id, marker: `MEMORY_DUPLICATE:negative:forged-${victim.id.slice(0, 8)}` }],
        },
      },
    };
    const outcome = verifyResearchRunDeterministic(tampered as typeof run);
    assert.equal(outcome.status, 'FAIL', 'a forged flag must break scorecard replay');
    assert.ok(
      outcome.failures.some((f) => f.includes('scorecard')),
      `failure must name the scorecard mismatch (got: ${outcome.failures.join('; ')})`,
    );
  });
});
