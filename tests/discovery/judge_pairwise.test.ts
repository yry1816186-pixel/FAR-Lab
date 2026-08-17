// tests/discovery/judge_pairwise.test.ts
// LLM-as-judge pairwise comparison (2.md §2.2 R10·T0) 契约：
//   - 种子确定性：sha256(runId) 派生 seed；同输入 → 逐字节相同 pairs/orders；
//     不同 runId（10 个）→ 至少出现不同的 A/B 指派（seed 真的在随机化展示顺序）
//   - 双向一致性数学：不一致率 = 翻转对/总对数；0.3 恰好不触发警告（严格大于），
//     0.4 / 0.6 触发（任务书「60% consistent → warning off」与其自身阈值规则
//     inconsistencyRate > 0.3 矛盾——0.4 > 0.3；本测试以模块契约的阈值规则为准）
//   - fail-closed：缺方向/重复方向/胜者不在对内/未知 pairIndex 一律 throw（无假数据）
//   - CLI：无 key → judge_live_profile_unavailable 非零退出且 stdout 零伪造；
//     注入确定性 fake judge 跑通 human + json 双输出；out-of-pair 胜者拒判
//   - 纯函数无 Math.random/Date.now（双跑 deepEqual 钉死）

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildJudgePairs,
  buildJudgePrompts,
  computePositionConsistency,
  deriveJudgeOrderSeed,
  POSITION_BIAS_WARNING_THRESHOLD,
  type JudgePair,
  type JudgeResponse,
} from '../../src/discovery/judge_pairwise.ts';
import {
  parseJudgePairwiseArgs,
  runJudgePairwise,
  type JudgePairwiseJsonOutput,
} from '../../src/cli/commands/judge_pairwise.ts';
import { RunStore } from '../../src/research/run_lifecycle.ts';
import type { HypothesisCandidate, ResearchRun } from '../../src/research/types.ts';

const FIVE_IDS = ['h-alpha', 'h-beta', 'h-gamma', 'h-delta', 'h-epsilon'] as const;

// ── 纯逻辑层 ─────────────────────────────────────────────────────────────────

describe('deriveJudgeOrderSeed', () => {
  it('is deterministic and sha256-shaped (same runId → same seed)', () => {
    const a = deriveJudgeOrderSeed('run-2026-08-16-a');
    const b = deriveJudgeOrderSeed('run-2026-08-16-a');
    assert.equal(a, b);
    assert.match(a, /^[0-9a-f]{64}$/);
  });

  it('differs across runIds (10 distinct runIds → 10 distinct seeds)', () => {
    const seeds = Array.from({ length: 10 }, (_, i) => deriveJudgeOrderSeed(`run-${i}`));
    assert.equal(new Set(seeds).size, 10);
  });
});

describe('buildJudgePairs', () => {
  it('double-run determinism: identical ids+seed → deep-equal pairs', () => {
    const seed = deriveJudgeOrderSeed('run-det');
    assert.deepEqual(buildJudgePairs(FIVE_IDS, seed), buildJudgePairs(FIVE_IDS, seed));
  });

  it('round-robin completeness: 5 ids → 10 unique unordered pairs, contiguous indexes', () => {
    const pairs = buildJudgePairs(FIVE_IDS, 'seed-fixed');
    assert.equal(pairs.length, 10);
    assert.deepEqual(
      pairs.map((p) => p.pairIndex),
      Array.from({ length: 10 }, (_, i) => i),
    );
    const combos = pairs.map((p) => [p.aId, p.bId].sort().join('|'));
    assert.equal(new Set(combos).size, 10, 'no duplicated pairing');
    // every expected combination present exactly once
    const expected = new Set<string>();
    for (let i = 0; i < FIVE_IDS.length; i += 1) {
      for (let j = i + 1; j < FIVE_IDS.length; j += 1) {
        expected.add([FIVE_IDS[i]!, FIVE_IDS[j]!].sort().join('|'));
      }
    }
    assert.deepEqual(new Set(combos), expected);
    for (const p of pairs) {
      assert.ok(p.aId !== p.bId);
      assert.ok((FIVE_IDS as readonly string[]).includes(p.aId));
      assert.ok((FIVE_IDS as readonly string[]).includes(p.bId));
    }
  });

  it('input-order independent: same id SET → same pairs (internal id-sorted pairing)', () => {
    const seed = 'seed-order-independence';
    const a = buildJudgePairs(['h-c', 'h-a', 'h-b'], seed);
    const b = buildJudgePairs(['h-b', 'h-c', 'h-a'], seed);
    assert.deepEqual(a, b);
  });

  it('order assignment varies across seeds (10 runId-derived seeds → ≥2 distinct assignments)', () => {
    const base = buildJudgePairs(FIVE_IDS, deriveJudgeOrderSeed('run-0'));
    const variants = Array.from({ length: 9 }, (_, i) =>
      buildJudgePairs(FIVE_IDS, deriveJudgeOrderSeed(`run-${i + 1}`)),
    );
    const differs = variants.filter((v) => !assertDeepEqualNoThrow(base, v));
    assert.ok(
      differs.length >= 1,
      `at least one of 9 seeds must flip an A/B assignment (got ${differs.length} differing)`,
    );
  });

  it('throws on <2 ids and on duplicate ids', () => {
    assert.throws(() => buildJudgePairs(['h-only'], 'seed'), /at least 2/);
    assert.throws(() => buildJudgePairs(['h-1', 'h-1'], 'seed'), /duplicate/);
  });
});

describe('buildJudgePrompts', () => {
  const pair: JudgePair = { pairIndex: 0, aId: 'h-a', bId: 'h-b' };
  const summaries = {
    'h-a': { id: 'h-a', statement: 'statement A', mechanism: 'mechanism A', prediction: 'pred A' },
    'h-b': { id: 'h-b', statement: 'statement B', mechanism: 'mechanism B' },
  };

  it('direction ab presents aId first; direction ba presents bId first', () => {
    const ab = buildJudgePrompts(pair, 'ab', summaries);
    const ba = buildJudgePrompts(pair, 'ba', summaries);
    assert.ok(ab.userPrompt.indexOf('h-a') < ab.userPrompt.indexOf('h-b'), 'ab must list h-a first');
    assert.ok(ba.userPrompt.indexOf('h-b') < ba.userPrompt.indexOf('h-a'), 'ba must list h-b first');
    // answer instruction echoes the presentation order
    assert.ok(ab.userPrompt.includes('[h-a, h-b]'));
    assert.ok(ba.userPrompt.includes('[h-b, h-a]'));
  });

  it('prompt carries pick-one-of-two structured instruction + position-is-not-evidence rule', () => {
    const { systemPrompt, userPrompt } = buildJudgePrompts(pair, 'ab', summaries);
    assert.ok(systemPrompt.includes('winnerId'));
    assert.ok(systemPrompt.includes('MUST pick exactly one'));
    assert.ok(systemPrompt.includes('NOT evidence'));
    assert.ok(userPrompt.includes('more promising'));
    // hypothesis content is present (the judge sees real content, not bare ids)
    assert.ok(userPrompt.includes('statement A') && userPrompt.includes('statement B'));
    assert.ok(userPrompt.includes('mechanism A') && userPrompt.includes('mechanism B'));
    // falsifiable prediction rendered only when provided
    assert.ok(userPrompt.includes('falsifiable prediction: pred A'));
    assert.ok(!userPrompt.includes('pred B'));
  });

  it('throws when a pair member has no content in the map', () => {
    assert.throws(
      () => buildJudgePrompts(pair, 'ab', { 'h-a': summaries['h-a']! }),
      /missing: h-b/,
    );
  });
});

/** Craft bidirectional responses for `pairs` with the given indexes order-flipped. */
function makeResponses(pairs: readonly JudgePair[], inconsistentIndexes: ReadonlySet<number>): JudgeResponse[] {
  return pairs.flatMap((p) => {
    const abWinner = p.aId;
    const baWinner = inconsistentIndexes.has(p.pairIndex) ? p.bId : p.aId;
    return [
      { pairIndex: p.pairIndex, direction: 'ab' as const, winnerId: abWinner },
      { pairIndex: p.pairIndex, direction: 'ba' as const, winnerId: baWinner },
    ];
  });
}

describe('computePositionConsistency', () => {
  const seed = deriveJudgeOrderSeed('run-math');
  const pairs = buildJudgePairs(FIVE_IDS, seed);

  it('exact math: 3/10 inconsistent → rate exactly 0.3 → warning OFF (strictly-greater boundary)', () => {
    const report = computePositionConsistency(makeResponses(pairs, new Set([0, 3, 7])), {
      pairs,
      orderRandomizationSeed: seed,
    });
    assert.equal(report.totalPairs, 10);
    assert.equal(report.consistentPairs, 7);
    assert.equal(report.inconsistentPairs, 3);
    assert.equal(report.inconsistencyRate, 0.3);
    assert.equal(report.positionBiasWarning, false);
    assert.equal(POSITION_BIAS_WARNING_THRESHOLD, 0.3);
  });

  it('4/10 inconsistent (60% consistent) → rate 0.4 → warning ON (threshold rule: 0.4 > 0.3)', () => {
    const report = computePositionConsistency(makeResponses(pairs, new Set([0, 3, 7, 9])), {
      pairs,
      orderRandomizationSeed: seed,
    });
    assert.equal(report.inconsistencyRate, 0.4);
    assert.equal(report.positionBiasWarning, true);
  });

  it('6/10 inconsistent (40% consistent) → rate 0.6 → warning ON', () => {
    const report = computePositionConsistency(makeResponses(pairs, new Set([0, 1, 3, 5, 7, 9])), {
      pairs,
      orderRandomizationSeed: seed,
    });
    assert.equal(report.inconsistencyRate, 0.6);
    assert.equal(report.positionBiasWarning, true);
  });

  it('all consistent → rate 0, no warning; all flipped → rate 1, warning', () => {
    const clean = computePositionConsistency(makeResponses(pairs, new Set()), {
      pairs,
      orderRandomizationSeed: seed,
    });
    assert.equal(clean.inconsistencyRate, 0);
    assert.equal(clean.positionBiasWarning, false);
    assert.ok(clean.pairs.every((d) => d.consistent && d.abWinnerId === d.baWinnerId));

    const flipped = computePositionConsistency(makeResponses(pairs, new Set(pairs.map((p) => p.pairIndex))), {
      pairs,
      orderRandomizationSeed: seed,
    });
    assert.equal(flipped.inconsistencyRate, 1);
    assert.equal(flipped.positionBiasWarning, true);
    assert.ok(flipped.pairs.every((d) => !d.consistent));
  });

  it('per-pair detail echoes pair ids + both directional winners; seed recorded', () => {
    const report = computePositionConsistency(makeResponses(pairs, new Set([2])), {
      pairs,
      orderRandomizationSeed: seed,
    });
    assert.equal(report.orderRandomizationSeed, seed);
    const d2 = report.pairs.find((d) => d.pairIndex === 2)!;
    assert.equal(d2.aId, pairs[2]!.aId);
    assert.equal(d2.bId, pairs[2]!.bId);
    assert.equal(d2.abWinnerId, pairs[2]!.aId);
    assert.equal(d2.baWinnerId, pairs[2]!.bId);
    assert.equal(d2.consistent, false);
  });

  it('fail-closed: missing direction / duplicate direction / out-of-pair winner / unknown pairIndex / empty pairs', () => {
    const full = makeResponses(pairs, new Set());
    assert.throws(
      () => computePositionConsistency(full.slice(0, full.length - 1), { pairs, orderRandomizationSeed: seed }),
      /missing direction/,
    );
    assert.throws(
      () => computePositionConsistency([...full, full[0]!], { pairs, orderRandomizationSeed: seed }),
      /duplicate judge response/,
    );
    const bogus = full.map((r, i) => (i === 0 ? { ...r, winnerId: 'h-bogus' } : r));
    assert.throws(
      () => computePositionConsistency(bogus, { pairs, orderRandomizationSeed: seed }),
      /not a member of pair/,
    );
    assert.throws(
      () =>
        computePositionConsistency([...full, { pairIndex: 99, direction: 'ab', winnerId: 'x' }], {
          pairs,
          orderRandomizationSeed: seed,
        }),
      /unknown pairIndex/,
    );
    assert.throws(() => computePositionConsistency([], { pairs: [], orderRandomizationSeed: seed }), /at least one pair/);
  });

  it('double-run determinism: same inputs twice → deep-equal reports (no hidden entropy)', () => {
    const responses = makeResponses(pairs, new Set([1, 4]));
    const ctx = { pairs, orderRandomizationSeed: seed } as const;
    assert.deepEqual(computePositionConsistency(responses, ctx), computePositionConsistency(responses, ctx));
  });
});

// ── CLI 层（依赖注入·不触网） ────────────────────────────────────────────────

function candidate(id: string): HypothesisCandidate {
  return {
    id,
    statement: `statement ${id}`,
    mechanism: `mechanism ${id}`,
    falsificationMethod: {
      prediction: `prediction ${id}`,
      metric: 'pearson r',
      comparator: 'gt',
      value: 0,
    },
    supportingCitations: [],
    counterEvidenceCitations: [],
    relationToExistingTheory: 'theory',
    alternativeExplanations: [],
    observablePredictions: [],
    distinguishingObservations: [],
    noveltyRelativeToCorpus: 'novel',
    assumptions: [],
    risks: [],
    strategyOrigin: 'induction',
  };
}

function doc(doi: string) {
  return {
    documentId: `doc-${doi}`,
    sourceType: 'openalex' as const,
    sourceName: 'OpenAlex',
    title: 't',
    authors: [],
    year: 2024,
    doi,
    persistentIdentifier: doi,
    url: 'u',
    canonicalUrl: 'https://example.org/canonical',
    publicationDate: '2024-01-01',
    retrievedAt: '2026-08-16T00:00:00.000Z',
    retrievalQuery: 'q',
    retrievalMethod: 'replay',
    citation: 'c',
    abstract: null,
    contentHash: 'x'.repeat(64),
    rawHash: 'r'.repeat(64),
    normalizedHash: 'n'.repeat(64),
    parserVersion: 'p1',
    licenseMetadata: null,
  };
}

/** Minimal valid v4 run (adapts the adjudication test fixture) with N hypotheses. */
function fixtureRun(runId: string, hypothesisIds: readonly string[]): ResearchRun {
  const primaryId = hypothesisIds[0]!;
  return {
    runId,
    question: 'which mechanisms inflate hot jupiters?',
    gateReport: {
      question: 'q?',
      verdict: 'RESEARCHABLE',
      reasons: [],
      safetyRisks: [],
      scope: { domain: 'astronomy', domainHints: [], questionLength: 2 },
      decomposition: null,
      requiresEthicsGate: false,
      assessedAt: 't',
      schemaVersion: 1,
    },
    corpus: {
      snapshotId: 'snap',
      rootHash: 'h'.repeat(64),
      documentCount: 1,
      documents: [doc('10.1000/a')],
      sourceQueries: ['q'],
      createdAt: 't',
    },
    hypotheses: hypothesisIds.map(candidate),
    bindings: {},
    critiques: {},
    scorecards: {},
    discovery: null,
    plan: {
      objectives: [],
      primaryHypothesisId: primaryId,
      alternativeHypothesisIds: [],
      preregisteredPredictions: [],
      dataRequirements: [],
      inclusionExclusionCriteria: [],
      variables: [],
      design: 'd',
      analysisDag: [],
      tools: [],
      statisticalMethods: [],
      sampleSizeRationale: 's',
      multiplicityHandling: 'm',
      missingOutlierStrategy: 'x',
      stoppingConditions: [],
      checkpoints: [],
      budget: 'b',
      risks: [],
      reproducibility: [],
      nextRoundDecisionRules: [],
      humanApprovalRequired: [],
    },
    revisions: [],
    observations: [],
    stageReceipts: [],
    citationGate: {
      boundRate: 1,
      totalCited: 0,
      boundCount: 0,
      unboundEvidenceCount: 0,
      resolvedViaRetrieval: [],
      perHypothesis: {},
      primaryRequiresAllBound: true,
      primaryAllBound: true,
      gateVerdict: 'PASS',
    },
    falsifiabilityGate: {
      perHypothesis: Object.fromEntries(hypothesisIds.map((id) => [id, { passed: true, errors: [] }])),
      allPassed: true,
    },
    environment: { gitCommit: null, gitDirty: null, nodeVersion: 'v', platform: 't', lockfileHash: null, packageVersion: null },
    modes: { modelExecutionMode: 'LIVE', retrievalExecutionMode: 'LIVE', experimentExecutionMode: 'NOT_EXECUTED' },
    runMode: 'LIVE',
    startedAt: 't',
    schemaVersion: 4,
  } satisfies ResearchRun;
}

interface Captured {
  out: string;
  err: string;
}

function sinks(): { cap: Captured; stdout: (t: string) => void; stderr: (t: string) => void } {
  const cap: Captured = { out: '', err: '' };
  return { cap, stdout: (t) => { cap.out += t; }, stderr: (t) => { cap.err += t; } };
}

/** Deterministic consistent judge: always picks the lexicographically smaller id. */
function consistentFakeJudge(calls: { pair: JudgePair; direction: string; prompts: { userPrompt: string } }[] = []) {
  return async ({ pair, direction, prompts }: {
    pair: JudgePair;
    direction: 'ab' | 'ba';
    prompts: { userPrompt: string };
  }) => {
    calls.push({ pair, direction, prompts });
    return {
      winnerId: pair.aId < pair.bId ? pair.aId : pair.bId,
      tokenUsage: { inputTokens: 100, outputTokens: 5, totalTokens: 105, measured: true },
    };
  };
}

describe('runJudgePairwise (CLI, injected judge — no network)', () => {
  it('fail-closed without a live key: exit 2, judge_live_profile_unavailable, zero fabricated stdout', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-judge-nokey-'));
    try {
      const store = new RunStore(join(dir, 'runs'));
      store.saveRun('run-x', fixtureRun('run-x', ['h-1', 'h-2', 'h-3']));
      const { cap, stdout, stderr } = sinks();
      const code = await runJudgePairwise({ runId: 'run-x', store, apiKey: '', stdout, stderr });
      assert.equal(code, 2);
      assert.ok(cap.err.includes('judge_live_profile_unavailable'), `stderr must carry the family error code (got: ${cap.err})`);
      assert.ok(cap.err.includes('fabricate'), 'must state the no-fabrication rule');
      assert.equal(cap.out, '', 'stdout must stay empty — no report, no fabricated winners');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('unknown runId → exit 1 with a load error', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-judge-unknown-'));
    try {
      const store = new RunStore(join(dir, 'runs'));
      const { cap, stdout, stderr } = sinks();
      const code = await runJudgePairwise({ runId: 'run-missing', store, apiKey: '', stdout, stderr });
      assert.equal(code, 1);
      assert.ok(cap.err.includes('cannot load run run-missing'));
      assert.equal(cap.out, '');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('run with <2 hypotheses → exit 1 with the honest count message', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-judge-single-'));
    try {
      const store = new RunStore(join(dir, 'runs'));
      store.saveRun('run-single', fixtureRun('run-single', ['h-only']));
      const { cap, stdout, stderr } = sinks();
      const code = await runJudgePairwise({ runId: 'run-single', store, apiKey: '', stdout, stderr });
      assert.equal(code, 1);
      assert.ok(cap.err.includes('has 1 registered hypothesis'));
      assert.equal(cap.out, '');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('missing runId → exit 2 usage error', async () => {
    const { cap, stdout, stderr } = sinks();
    const code = await runJudgePairwise({ runId: '', apiKey: '', stdout, stderr });
    assert.equal(code, 2);
    assert.ok(cap.err.includes('missing runId'));
  });

  it('consistent fake judge → exit 0; human output with real numbers; prompts honor direction', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-judge-consistent-'));
    try {
      const store = new RunStore(join(dir, 'runs'));
      store.saveRun('run-c', fixtureRun('run-c', ['h-1', 'h-2', 'h-3']));
      const calls: { pair: JudgePair; direction: string; prompts: { userPrompt: string } }[] = [];
      const { cap, stdout, stderr } = sinks();
      const code = await runJudgePairwise({
        runId: 'run-c',
        store,
        stdout,
        stderr,
        judge: consistentFakeJudge(calls),
      });
      assert.equal(code, 0);
      // 3 hypotheses → 3 pairs × 2 directions = 6 sequential judge calls
      assert.equal(calls.length, 6);
      assert.deepEqual(calls.map((c) => c.direction), ['ab', 'ba', 'ab', 'ba', 'ab', 'ba']);
      // direction honored in the actual prompt sent to the judge
      for (const c of calls) {
        const first = c.direction === 'ab' ? c.pair.aId : c.pair.bId;
        const second = c.direction === 'ab' ? c.pair.bId : c.pair.aId;
        assert.ok(c.prompts.userPrompt.indexOf(first) < c.prompts.userPrompt.indexOf(second));
      }
      assert.ok(cap.out.includes('inconsistent : 0'), `human output must show 0 inconsistent (got: ${cap.out})`);
      assert.ok(cap.out.includes('(0%)'));
      assert.ok(!cap.out.includes('POSITION BIAS WARNING'));
      assert.ok(cap.out.includes('reference signal only'), 'honesty line present');
      assert.ok(cap.out.includes(deriveJudgeOrderSeed('run-c').slice(0, 16)), 'recorded seed shown');
      assert.equal(cap.err, '');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('position-biased fake judge → json output: rate 1.0, warning on, tokens accumulated, seed recorded', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-judge-biased-'));
    try {
      const store = new RunStore(join(dir, 'runs'));
      store.saveRun('run-b', fixtureRun('run-b', ['h-1', 'h-2', 'h-3']));
      const { cap, stdout, stderr } = sinks();
      // always picks the FIRST-PRESENTED id → every pair flips with direction
      const biased = async ({ pair, direction }: { pair: JudgePair; direction: 'ab' | 'ba' }) => ({
        winnerId: direction === 'ab' ? pair.aId : pair.bId,
        tokenUsage: { inputTokens: 10, outputTokens: 2, totalTokens: 12, measured: false },
      });
      const code = await runJudgePairwise({
        runId: 'run-b',
        store,
        json: true,
        stdout,
        stderr,
        judge: biased,
      });
      assert.equal(code, 0);
      const payload = JSON.parse(cap.out) as JudgePairwiseJsonOutput;
      assert.equal(payload.schemaVersion, 'far.judge_pairwise.report.v1');
      assert.equal(payload.runId, 'run-b');
      assert.equal(payload.judgeSource, 'injected_test_double');
      assert.equal(payload.judgeCalls, 6);
      assert.equal(payload.report.totalPairs, 3);
      assert.equal(payload.report.inconsistentPairs, 3);
      assert.equal(payload.report.inconsistencyRate, 1);
      assert.equal(payload.report.positionBiasWarning, true);
      assert.equal(payload.report.orderRandomizationSeed, deriveJudgeOrderSeed('run-b'));
      assert.deepEqual(payload.tokenUsage, { inputTokens: 60, outputTokens: 12, totalTokens: 72, measured: false });
      assert.ok(payload.honesty.cannotProve.includes('verbosity'));
      assert.equal(payload.honesty.referenceSignalOnly, true);
      assert.equal(cap.err, '');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('judge naming an out-of-pair winner → exit 1, refusal message, no report on stdout', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-judge-bogus-'));
    try {
      const store = new RunStore(join(dir, 'runs'));
      store.saveRun('run-r', fixtureRun('run-r', ['h-1', 'h-2']));
      const { cap, stdout, stderr } = sinks();
      const bogus = async () => ({ winnerId: 'h-bogus', tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } });
      const code = await runJudgePairwise({ runId: 'run-r', store, stdout, stderr, judge: bogus });
      assert.equal(code, 1);
      assert.ok(cap.err.includes('h-bogus'));
      assert.ok(cap.err.includes('refusing to fabricate'));
      assert.equal(cap.out, '');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('judge throwing → exit 1 with the propagated failure (no partial report)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-judge-throwing-'));
    try {
      const store = new RunStore(join(dir, 'runs'));
      store.saveRun('run-t', fixtureRun('run-t', ['h-1', 'h-2']));
      const { cap, stdout, stderr } = sinks();
      const failing = async () => {
        throw new Error('rate limit exhausted');
      };
      const code = await runJudgePairwise({ runId: 'run-t', store, stdout, stderr, judge: failing });
      assert.equal(code, 1);
      assert.ok(cap.err.includes('rate limit exhausted'));
      assert.ok(cap.err.includes('pair 0'));
      assert.equal(cap.out, '');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('parseJudgePairwiseArgs', () => {
  it('defaults: bare runId → auto profile, json off', () => {
    assert.deepEqual(parseJudgePairwiseArgs(['run-1']), { runId: 'run-1', profile: 'auto', json: false });
  });

  it('parses --json + --profile competition_aliyun_qwen', () => {
    const parsed = parseJudgePairwiseArgs(['run-1', '--json', '--profile', 'competition_aliyun_qwen']);
    assert.deepEqual(parsed, { runId: 'run-1', profile: 'competition_aliyun_qwen', json: true });
  });

  it('rejects offline_replay (no offline judge exists — fabricated winners forbidden) and unknown flags', () => {
    assert.throws(
      () => parseJudgePairwiseArgs(['run-1', '--profile', 'offline_replay']),
      /no offline judge/,
    );
    assert.throws(() => parseJudgePairwiseArgs(['run-1', '--bogus']), /unknown argument/);
  });
});

/** deepEqual without throwing (used to count differing variants above). */
function assertDeepEqualNoThrow(a: unknown, b: unknown): boolean {
  try {
    assert.deepEqual(a, b);
    return true;
  } catch {
    return false;
  }
}
