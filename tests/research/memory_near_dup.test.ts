/**
 * tests/research/memory_near_dup.test.ts — 语义近邻查重（day-r13，backlog T2）。
 *
 * 证明：
 *   - buildMemoryStatementReferences：negatives + 仅 ACTIVE 分支（validTo=null）；
 *     superseded 分支是谱系史不是重复，不得参与近邻筛查
 *   - fanout 近邻旗标：改写（paraphrase）命中 ≥ MEMORY_NEAR_DUP_THRESHOLD →
 *     MEMORY_NEAR_DUP:<kind>:<id>:simXXXX 冻结入 run（标记无选择权——候选不被丢）
 *   - 精确哈希优先于近邻（同候选两者皆命中时报精确族）
 *   - 不同题域语句互不命中（假阳性方向边界）
 *   - references 缺席 → memoryFlagged undefined（pre-day-r13 调用方字节稳定）
 *   - scorecard：MEMORY_NEAR_DUP:negative → F / branch → C（与精确族同级），
 *     rationale 区分 paraphrase-with-similarity 与 exact identity
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createLlmGateway } from '../../src/llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';
import { createReplayAdapter } from '../../src/retrieval/index.ts';
import { runResearch } from '../../src/research/orchestrator.ts';
import {
  buildMemoryStatementReferences,
  emptyMemoryStore,
  type ResearchMemoryStore,
  type BranchNode,
  type NegativeResultEntry,
} from '../../src/research/memory.ts';
import { memoryNoveltyDimensionsFor } from '../../src/research/scorecard.ts';
import {
  paraphraseSimilarity,
  MEMORY_NEAR_DUP_THRESHOLD,
} from '../../src/discovery/novelty/lexical_similarity.ts';
import { RESEARCH_DEMO_DOCS, RESEARCH_DEMO_FIXTURES } from '../../src/research/research_fixtures.ts';
import type { HypothesisCandidate } from '../../src/research/types.ts';

const QUESTION = 'Why are hot Jupiter radii larger than structure models predict?';

function buildGateway() {
  return createLlmGateway([createOfflineReplayAdapter({ fixtures: RESEARCH_DEMO_FIXTURES })]);
}

function branch(over: Partial<BranchNode>): BranchNode {
  return {
    id: 'node-x', parentId: null, contentHash: 'e'.repeat(64), runId: 'r-old',
    hypothesisId: 'h-old', strategyOrigin: 'induction', domain: 'astronomy',
    question: QUESTION, statement: 'placeholder branch statement',
    validFrom: '2026-08-14T00:00:00.000Z', validTo: null, invalidReason: null,
    supersededByNodeIds: [], counterEvidenceCount: 0, isPrimary: true,
    ...over,
  };
}

function negative(over: Partial<NegativeResultEntry>): NegativeResultEntry {
  return {
    id: 'neg-x', runId: 'r-old', hypothesisId: 'h-old', strategyOrigin: 'inversion',
    contentHash: 'f'.repeat(64), domain: 'astronomy', question: QUESTION,
    eliminatedAt: '2026-08-14T00:00:00.000Z', eliminationReason: 'falsifiability_gate_failed',
    reasonDetail: 'gate errors: empty prediction [gateErrors=1]', evidencePointers: [],
    ...over,
  };
}

describe('buildMemoryStatementReferences', () => {
  it('includes negatives and ACTIVE branches, excludes superseded branch history', () => {
    const store: ResearchMemoryStore = {
      ...emptyMemoryStore(),
      negativeResults: [negative({ id: 'neg-1', statement: 'eliminated direction A' })],
      branchTree: [
        branch({ id: 'node-active', statement: 'active branch B', validTo: null }),
        branch({
          id: 'node-dead', statement: 'superseded branch C', validTo: '2026-08-15T00:00:00.000Z',
          invalidReason: 'superseded_by',
        }),
      ],
    };
    const refs = buildMemoryStatementReferences(store);
    assert.deepEqual(
      refs.map((r) => r.marker),
      ['MEMORY_DUPLICATE:negative:neg-1', 'MEMORY_DUPLICATE:branch:node-active'],
    );
    assert.ok(!refs.some((r) => r.marker.includes('node-dead')), 'superseded branches must not screen');
  });

  it('empty store → empty references (near-dup screen inert, no behavior change)', () => {
    assert.equal(buildMemoryStatementReferences(emptyMemoryStore()).length, 0);
  });
});

describe('fan-out near-duplicate flagging (end-to-end through runResearch)', () => {
  it('a paraphrase of an ELIMINATED direction is flagged MEMORY_NEAR_DUP:negative (not dropped)', async () => {
    // First run regenerates the deterministic demo hypotheses; paraphrase the
    // primary's statement as a seeded negative (no exact-hash collision).
    const first = await runResearch({
      question: QUESTION,
      gateway: buildGateway(),
      profile: 'offline_replay',
      grounding: { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) },
      targetHypothesisCount: 3,
    });
    const target = first.hypotheses[0]!;
    // Deterministic surface rewrite: drop one mid-sentence word and swap a
    // connective — keeps trigram overlap high without changing the idea.
    const words = target.statement.split(' ');
    assert.ok(words.length >= 6, 'fixture statement long enough to paraphrase');
    const paraphrase = words.length > 8
      ? [...words.slice(0, 3), ...words.slice(4)].join(' ') // remove word #4
      : [...words.slice(0, 2), ...words.slice(3)].join(' ');
    const sim = paraphraseSimilarity(target.statement, paraphrase);
    assert.ok(
      sim >= MEMORY_NEAR_DUP_THRESHOLD,
      `fixture paraphrase must clear the threshold (got ${sim.toFixed(4)} < ${MEMORY_NEAR_DUP_THRESHOLD}) — adjust the rewrite, not the threshold`,
    );
    const store: ResearchMemoryStore = {
      ...emptyMemoryStore(),
      negativeResults: [negative({ id: 'neg-para', statement: paraphrase })],
    };
    const second = await runResearch({
      question: QUESTION,
      gateway: buildGateway(),
      profile: 'offline_replay',
      grounding: { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) },
      targetHypothesisCount: 3,
      memoryStore: store,
    });
    // Same offline pipeline → the same hypotheses regenerate; the flagged one
    // must be present (marking has NO selection power) and carry the near-dup
    // family with the negative kind and the frozen similarity.
    assert.equal(second.hypotheses.length, first.hypotheses.length, 'no candidate dropped');
    const flagged = (second.discovery?.fanout?.memoryFlagged ?? []).find((f) => f.id === target.id);
    assert.ok(flagged !== undefined, `expected a MEMORY_NEAR_DUP flag for ${target.id}`);
    assert.match(flagged.marker, /^MEMORY_NEAR_DUP:negative:neg-para:sim0\.\d{4}$/);
    // Determinism: the frozen similarity matches a direct recomputation
    // (4-decimal rounding tolerance — toFixed(4) halves at 5e-5).
    const frozen = Number(flagged.marker.match(/sim(\d+\.\d+)$/)![1]);
    assert.ok(Math.abs(frozen - sim) < 5e-5, `frozen ${frozen} vs recomputed ${sim}`);
  });

  it('an exact content-hash hit takes precedence over the near-dup family', async () => {
    const first = await runResearch({
      question: QUESTION,
      gateway: buildGateway(),
      profile: 'offline_replay',
      grounding: { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) },
      targetHypothesisCount: 3,
    });
    const target = first.hypotheses[0]!;
    const { hypothesisContentHash } = await import('../../src/discovery/content_hash.ts');
    // Seed BOTH the exact hash and a paraphrase reference pointing at another
    // id — the exact family must win (it identifies identity, not similarity).
    const paraphrase = target.statement.replace(/\s+/g, ' ').trim();
    const store: ResearchMemoryStore = {
      ...emptyMemoryStore(),
      negativeResults: [negative({ id: 'neg-exact', contentHash: hypothesisContentHash(target), statement: target.statement })],
      branchTree: [branch({ id: 'node-decoy', statement: paraphrase })],
    };
    const second = await runResearch({
      question: QUESTION,
      gateway: buildGateway(),
      profile: 'offline_replay',
      grounding: { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) },
      targetHypothesisCount: 3,
      memoryStore: store,
    });
    const flagged = (second.discovery?.fanout?.memoryFlagged ?? []).find((f) => f.id === target.id);
    assert.ok(flagged !== undefined);
    assert.match(flagged.marker, /^MEMORY_DUPLICATE:negative:neg-exact$/);
  });

  it('a statement from an unrelated domain stays unflagged (false-positive boundary)', async () => {
    const store: ResearchMemoryStore = {
      ...emptyMemoryStore(),
      negativeResults: [negative({
        id: 'neg-astro',
        statement: 'Liquid xenon detectors exclude weakly interacting massive particles below 6 GeV cross-section thresholds',
        domain: 'particle-physics',
      })],
    };
    const run = await runResearch({
      question: QUESTION,
      gateway: buildGateway(),
      profile: 'offline_replay',
      grounding: { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) },
      targetHypothesisCount: 3,
      memoryStore: store,
    });
    assert.equal((run.discovery?.fanout?.memoryFlagged ?? []).length, 0, 'cross-domain statement must not flag');
  });
});

describe('memoryNoveltyDimensionsFor — near-dup grade mapping', () => {
  const cand = (id: string): HypothesisCandidate => ({
    id, statement: 's', mechanism: 'm', predictions: [], evidenceRefs: [],
    falsificationMethod: { kind: 'statistical_test', description: 'd' },
    limitations: [], strategyOrigin: 'inversion', domain: 'astronomy',
  } as unknown as HypothesisCandidate);

  it('MEMORY_NEAR_DUP:negative grades F with paraphrase rationale; branch grades C', () => {
    const out = memoryNoveltyDimensionsFor(
      [cand('h1'), cand('h2')],
      new Map<string, string>([
        ['h1', 'MEMORY_NEAR_DUP:negative:neg-9:sim0.8421'],
        ['h2', 'MEMORY_NEAR_DUP:branch:node-9:sim0.9102'],
      ]),
    );
    const d1 = out.get('h1')![0]!;
    assert.equal(d1.name, 'NoveltyVsResearchMemory');
    assert.equal(d1.grade, 'F');
    assert.ok(d1.rationale.includes('lexical near-duplicate'));
    assert.ok(d1.rationale.includes('ELIMINATED'));
    assert.ok(d1.rationale.includes('0.80'));
    const d2 = out.get('h2')![0]!;
    assert.equal(d2.grade, 'C');
    assert.ok(d2.rationale.includes('explored branch'));
  });

  it('exact-family markers keep their pre-day-r13 rationale bytes (replay stability)', () => {
    const out = memoryNoveltyDimensionsFor(
      [cand('h1')],
      new Map([['h1', 'MEMORY_DUPLICATE:negative:neg-1']]),
    );
    const d = out.get('h1')![0]!;
    assert.equal(d.grade, 'F');
    assert.equal(
      d.rationale,
      'MEMORY_DUPLICATE:negative:neg-1 — exact content match against research memory (an ELIMINATED direction)',
    );
  });

  it('unknown marker family still grades A (forward-compatible, never silently punitive)', () => {
    const out = memoryNoveltyDimensionsFor(
      [cand('h1')],
      new Map([['h1', 'MEMORY_SOMETHING_ELSE:x']]),
    );
    assert.equal(out.get('h1')![0]!.grade, 'A');
  });
});
