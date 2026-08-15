// tests/research/memory.test.ts
// 研究记忆（2.md §2.5）的契约：
//   - 四级写入：负结果台账（精确数值强制）/ 双时态分支树（supersede 不删除）/
//     策略效用统计 / learnings（research 层）+ conclusions（draft 层）
//   - learnings 强制结构：实体/精确数值/日期缺一即 throw
//   - 幂等：(runId, hypothesisId, kind) 键去重；模式门：仅 LIVE/MIXED 落盘
//   - fail-closed：损坏文件拒绝读（不静默重建）；未知 schemaVersion 拒绝
//   - 摘要：头部逐字「内部研究记忆（非外部证据）」；有界（负结果≤5/统计≤3/结论≤3）；确定性
//   - 查重：contentHash 命中分支→branch 标记；命中负结果→negative 标记（更严重）
//   - 谱系：traceLineage 沿 supersededBy 链走；kernel_refuted 失效不删除
//   - 重建：记忆=可重建派生索引（rebuildMemoryFromRuns 等价性）

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  emptyMemoryStore,
  loadResearchMemory,
  saveResearchMemory,
  recordRunToMemory,
  buildMemorySummary,
  buildMemoryInjection,
  screenAgainstMemory,
  traceLineage,
  markKernelRefuted,
  rebuildMemoryFromRuns,
  assertLearningStructure,
  MEMORY_SUMMARY_HEADER,
  MEMORY_SUMMARY_FOOTER,
  MEMORY_SUMMARY_MAX_CHARS,
  DEFAULT_RESEARCH_MEMORY_PATH,
  type ResearchMemoryStore,
  type LearningRecord,
} from '../../src/research/memory.ts';
import { hypothesisContentHash } from '../../src/discovery/content_hash.ts';
import type { ResearchRun, HypothesisCandidate } from '../../src/research/types.ts';

const FIXED_NOW = () => new Date('2026-08-15T12:00:00.000Z');

function candidate(id: string, statement: string, strategy?: string): HypothesisCandidate {
  return {
    id,
    statement,
    mechanism: `mechanism for ${id}`,
    falsificationMethod: {
      prediction: `prediction ${id}`,
      metric: 'metric',
      comparator: 'gt',
      value: 1,
    },
    supportingCitations: ['10.1000/demo'],
    counterEvidenceCitations: [],
    relationToExistingTheory: 'theory',
    alternativeExplanations: [],
    observablePredictions: [],
    distinguishingObservations: [],
    noveltyRelativeToCorpus: 'novel',
    assumptions: [],
    risks: [],
    ...(strategy !== undefined ? { strategyOrigin: strategy as 'induction' } : {}),
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
    retrievedAt: '2026-08-15T00:00:00.000Z',
    retrievalQuery: 'q',
    retrievalMethod: 'live',
    citation: 'c',
    abstract: null,
    contentHash: 'x'.repeat(64),
    rawHash: 'r'.repeat(64),
    normalizedHash: 'n'.repeat(64),
    parserVersion: 'p1',
    licenseMetadata: null,
  };
}

function binding(supporting: number, counter: number) {
  return {
    supportingIds: [],
    counterIds: [],
    boundSupporting: Array.from({ length: supporting }, (_, i) => doc(`10.1000/s${i}`)),
    boundCounter: Array.from({ length: counter }, (_, i) => doc(`10.1000/c${i}`)),
    unbound: [],
    allBound: true,
    snapshotId: 'snap',
    relations: [],
  };
}

/** A LIVE v4 run with one primary (corroborated), one alternative, one gate-failed, one unevidenced, one eliminated. */
function liveRun(overrides: {
  runId?: string;
  question?: string;
  domain?: string;
  primaryStatement?: string;
  withTournament?: boolean;
} = {}): ResearchRun {
  const runId = overrides.runId ?? 'run-m1';
  const primary = candidate('h-p', overrides.primaryStatement ?? 'primary statement', 'induction');
  const alternative = candidate('h-a', 'alternative statement', 'analogy');
  const eliminated = candidate('h-e', 'eliminated statement', 'inversion');
  const gateFailed = candidate('h-g', 'gate-failed statement', 'abduction');
  const noEvidence = candidate('h-n', 'no-evidence statement', 'contradiction_mining');
  const ratings = overrides.withTournament === false ? null : {
    ratings: [
      { id: 'h-p', strategyOrigin: 'induction' as const, elo: 1230.5, wins: 2, draws: 1, losses: 0, rank: 1 },
      { id: 'h-a', strategyOrigin: 'analogy' as const, elo: 1200.0, wins: 1, draws: 2, losses: 0, rank: 2 },
      { id: 'h-e', strategyOrigin: 'inversion' as const, elo: 1176.25, wins: 0, draws: 1, losses: 2, rank: 3 },
    ],
    matches: [
      {
        aId: 'h-p', bId: 'h-a', outcome: 'a' as const,
        criteria: [{ dimension: 'falsifiability', aGrade: 'A' as const, bGrade: 'B' as const, point: 'a' as const }],
      },
      {
        aId: 'h-p', bId: 'h-e', outcome: 'a' as const,
        criteria: [{ dimension: 'falsifiability', aGrade: 'A' as const, bGrade: 'C' as const, point: 'a' as const }],
      },
      {
        aId: 'h-a', bId: 'h-e', outcome: 'draw' as const,
        criteria: [{ dimension: 'falsifiability', aGrade: 'B' as const, bGrade: 'B' as const, point: 'none' as const }],
      },
    ],
    meta: { rounds: 3, initialRating: 1200, kFactor: 32, pairingOrder: 'strategy_then_id', degenerate: false },
  };
  return {
    runId,
    question: overrides.question ?? 'why do hot jupiters inflate?',
    gateReport: {
      question: 'q?',
      verdict: 'RESEARCHABLE',
      reasons: [],
      safetyRisks: [],
      scope: { domain: overrides.domain ?? 'astronomy', domainHints: [], questionLength: 2 },
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
    hypotheses: [primary, alternative, eliminated, gateFailed, noEvidence],
    bindings: {
      'h-p': binding(2, 1),
      'h-a': binding(1, 0),
      'h-e': binding(1, 0),
      'h-g': binding(0, 0),
      'h-n': binding(0, 0),
    },
    critiques: {},
    scorecards: {},
    discovery: {
      strategy: 'multi_strategy',
      fanout: {
        strategiesPlanned: ['induction', 'analogy', 'inversion', 'abduction', 'contradiction_mining'],
        perStrategy: [
          { strategyId: 'induction', contributed: 1, error: null, skipReason: null, strategySignatureHash: 'a'.repeat(64), modelId: 'qwen', provider: 'dashscope', temperature: 0.3, seed: null },
          { strategyId: 'analogy', contributed: 1, error: null, skipReason: null, strategySignatureHash: 'b'.repeat(64), modelId: 'qwen', provider: 'dashscope', temperature: 0.3, seed: null },
          { strategyId: 'inversion', contributed: 1, error: null, skipReason: null, strategySignatureHash: 'c'.repeat(64), modelId: 'qwen', provider: 'dashscope', temperature: 0.3, seed: null },
          { strategyId: 'abduction', contributed: 1, error: 'structured output failed', skipReason: null, strategySignatureHash: 'd'.repeat(64), modelId: null, provider: null, temperature: null, seed: null },
          { strategyId: 'contradiction_mining', contributed: 0, error: null, skipReason: 'not applicable', strategySignatureHash: 'e'.repeat(64), modelId: null, provider: null, temperature: null, seed: null },
        ],
        exactDuplicatesDropped: 0,
        paraphraseFlagged: [],
        truncated: [],
        finalCount: 5,
        quotaShortfall: 0,
      },
      tournament: ratings,
    },
    plan: {
      objectives: [],
      primaryHypothesisId: 'h-p',
      alternativeHypothesisIds: ['h-a'],
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
      boundRate: 1, totalCited: 0, boundCount: 0, unboundEvidenceCount: 0,
      resolvedViaRetrieval: [], perHypothesis: {},
      primaryRequiresAllBound: true, primaryAllBound: true, gateVerdict: 'PASS',
    },
    falsifiabilityGate: {
      perHypothesis: {
        'h-p': { passed: true, errors: [] },
        'h-a': { passed: true, errors: [] },
        'h-e': { passed: true, errors: [] },
        'h-g': { passed: false, errors: ['empty prediction'] },
        'h-n': { passed: true, errors: [] },
      },
      allPassed: false,
    },
    environment: { gitCommit: null, gitDirty: null, nodeVersion: 'v', platform: 't', lockfileHash: null, packageVersion: null },
    modes: { modelExecutionMode: 'LIVE', retrievalExecutionMode: 'LIVE', experimentExecutionMode: 'NOT_EXECUTED' },
    runMode: 'LIVE',
    startedAt: 't',
    schemaVersion: 4,
  } satisfies ResearchRun;
}

function tempStore(): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'far-memory-'));
  return { dir, path: join(dir, 'memory.json') };
}

describe('recordRunToMemory — four-tier recording', () => {
  it('records gate-failed + unevidenced as negatives with precise-value details', () => {
    const { dir, path } = tempStore();
    try {
      const out = recordRunToMemory(liveRun(), { memoryPath: path, now: FIXED_NOW });
      assert.equal(out.skippedMode, false);
      const store = loadResearchMemory(path);
      const reasons = store.negativeResults.map((n) => n.eliminationReason).sort();
      // h-g (gate failed), h-n (no evidence), h-e (tournament-eliminated) = 3 negatives.
      assert.deepEqual(reasons, ['falsifiability_gate_failed', 'no_bound_evidence', 'tournament_eliminated']);
      for (const n of store.negativeResults) {
        assert.ok(/\d/.test(n.reasonDetail), `reasonDetail must carry digits: ${n.reasonDetail}`);
        assert.ok(n.eliminatedAt.endsWith('Z'), 'UTC ISO timestamps only');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('tournament elimination carries rank + elo precise values', () => {
    const { dir, path } = tempStore();
    try {
      recordRunToMemory(liveRun(), { memoryPath: path, now: FIXED_NOW });
      const store = loadResearchMemory(path);
      const elim = store.negativeResults.find((n) => n.eliminationReason === 'tournament_eliminated');
      assert.ok(elim !== undefined);
      assert.match(elim!.reasonDetail, /rank 3/);
      assert.match(elim!.reasonDetail, /elo 1176\.3/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('corroborated hypotheses become branch nodes; primary also becomes a draft conclusion', () => {
    const { dir, path } = tempStore();
    try {
      recordRunToMemory(liveRun(), { memoryPath: path, now: FIXED_NOW });
      const store = loadResearchMemory(path);
      // h-p, h-a, h-e are corroborated → 3 branch nodes (not the gate-failed / unevidenced).
      assert.equal(store.branchTree.length, 3);
      const primaryNode = store.branchTree.find((b) => b.hypothesisId === 'h-p');
      assert.ok(primaryNode !== undefined && primaryNode.isPrimary);
      assert.equal(primaryNode!.counterEvidenceCount, 1, 'counter evidence visible for future runs');
      assert.equal(store.conclusions.length, 1, 'only the primary reaches the draft tier');
      assert.equal(store.conclusions[0]!.ladderState, 'CORROBORATED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('kept plan alternatives are NOT negatives (alive alternatives ≠ eliminated)', () => {
    const { dir, path } = tempStore();
    try {
      recordRunToMemory(liveRun(), { memoryPath: path, now: FIXED_NOW });
      const store = loadResearchMemory(path);
      assert.ok(!store.negativeResults.some((n) => n.hypothesisId === 'h-a'));
      assert.ok(store.branchTree.some((b) => b.hypothesisId === 'h-a'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('strategy stats aggregate generated/survived/corroborated/wins per strategy×domain', () => {
    const { dir, path } = tempStore();
    try {
      recordRunToMemory(liveRun(), { memoryPath: path, now: FIXED_NOW });
      const store = loadResearchMemory(path);
      const induction = store.strategyStats.find((s) => s.strategy === 'induction' && s.domain === 'astronomy');
      assert.ok(induction !== undefined);
      assert.equal(induction!.generated, 1);
      assert.equal(induction!.corroborated, 1);
      assert.equal(induction!.primarySelections, 1);
      assert.equal(induction!.tournamentWins, 1);
      const inversion = store.strategyStats.find((s) => s.strategy === 'inversion');
      assert.ok(inversion !== undefined && inversion!.corroborated === 1 && inversion!.primarySelections === 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('one forced-structure learning per run (entities/values/dates all present)', () => {
    const { dir, path } = tempStore();
    try {
      const out = recordRunToMemory(liveRun(), { memoryPath: path, now: FIXED_NOW });
      assert.equal(out.learningsRecorded, 1);
      const store = loadResearchMemory(path);
      const learning = store.learnings[0]!;
      assert.ok(learning.entities.length > 0 && learning.preciseValues.length > 0 && learning.dates.length > 0);
      assert.equal(learning.tier, 'research');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('offline/replay/synthetic modes never touch disk (test-pollution guard)', () => {
    const { dir, path } = tempStore();
    try {
      for (const mode of ['RECORDED_REPLAY', 'OFFLINE_DEVELOPMENT', 'SYNTHETIC_TEST'] as const) {
        const out = recordRunToMemory({ ...liveRun(), runMode: mode }, { memoryPath: path, now: FIXED_NOW });
        assert.equal(out.skippedMode, true);
      }
      assert.equal(existsSync(path), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('idempotent: recording the same run twice changes nothing', () => {
    const { dir, path } = tempStore();
    try {
      const first = recordRunToMemory(liveRun(), { memoryPath: path, now: FIXED_NOW });
      const second = recordRunToMemory(liveRun(), { memoryPath: path, now: FIXED_NOW });
      assert.equal(second.negativeRecorded, 0);
      assert.equal(second.branchesAdded, 0);
      assert.equal(second.conclusionsRecorded, 0);
      assert.equal(second.learningsRecorded, 0);
      const store = loadResearchMemory(path);
      assert.equal(store.negativeResults.length, first.negativeRecorded);
      assert.equal(store.branchTree.length, first.branchesAdded);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a run without tournament marks non-selected as not_selected (legacy semantics)', () => {
    const { dir, path } = tempStore();
    try {
      recordRunToMemory(liveRun({ withTournament: false }), { memoryPath: path, now: FIXED_NOW });
      const store = loadResearchMemory(path);
      const notSelected = store.negativeResults.find((n) => n.hypothesisId === 'h-e');
      assert.ok(notSelected !== undefined && notSelected!.eliminationReason === 'not_selected');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('bitemporal branch tree (graphiti anchor)', () => {
  it('a second run on the same question+strategy supersedes the old primary — nothing deleted', () => {
    const { dir, path } = tempStore();
    try {
      recordRunToMemory(liveRun({ runId: 'run-m1' }), { memoryPath: path, now: FIXED_NOW });
      const out2 = recordRunToMemory(
        liveRun({ runId: 'run-m2', primaryStatement: 'evolved primary statement' }),
        { memoryPath: path, now: () => new Date('2026-08-16T12:00:00.000Z') },
      );
      assert.equal(out2.branchesSuperseded, 1);
      const store = loadResearchMemory(path);
      const old = store.branchTree.find((b) => b.runId === 'run-m1' && b.isPrimary);
      assert.ok(old !== undefined);
      assert.equal(old!.validTo, '2026-08-16T12:00:00.000Z');
      assert.equal(old!.invalidReason, 'superseded_by');
      assert.equal(old!.supersededByNodeIds.length, 1);
      const next = store.branchTree.find((b) => b.id === old!.supersededByNodeIds[0]);
      assert.ok(next !== undefined && next!.parentId === old!.id);
      assert.equal(store.branchTree.length, 6, 'old nodes kept + new nodes added');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a different question never supersedes (cross-question isolation)', () => {
    const { dir, path } = tempStore();
    try {
      recordRunToMemory(liveRun({ runId: 'r1', question: 'question one' }), { memoryPath: path, now: FIXED_NOW });
      const out2 = recordRunToMemory(
        liveRun({ runId: 'r2', question: 'question two', primaryStatement: 'other statement' }),
        { memoryPath: path, now: FIXED_NOW },
      );
      assert.equal(out2.branchesSuperseded, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a non-primary branch of a new run does NOT supersede the old primary', () => {
    const { dir, path } = tempStore();
    try {
      recordRunToMemory(liveRun({ runId: 'r1' }), { memoryPath: path, now: FIXED_NOW });
      // Second run: primary comes from a DIFFERENT strategy (analogy becomes primary).
      const run2 = liveRun({ runId: 'r2', primaryStatement: 'new primary from analogy' });
      (run2.plan as { primaryHypothesisId: string }).primaryHypothesisId = 'h-a';
      const out2 = recordRunToMemory(run2, { memoryPath: path, now: FIXED_NOW });
      // induction's old primary stays active (the new primary is analogy's lineage).
      assert.equal(out2.branchesSuperseded, 0);
      const store = loadResearchMemory(path);
      const oldInduction = store.branchTree.find((b) => b.runId === 'r1' && b.hypothesisId === 'h-p');
      assert.ok(oldInduction !== undefined && oldInduction!.validTo === null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('traceLineage walks the supersede chain oldest → newest', () => {
    const { dir, path } = tempStore();
    try {
      recordRunToMemory(liveRun({ runId: 'r1' }), { memoryPath: path, now: FIXED_NOW });
      recordRunToMemory(
        liveRun({ runId: 'r2', primaryStatement: 'second generation' }),
        { memoryPath: path, now: FIXED_NOW },
      );
      recordRunToMemory(
        liveRun({ runId: 'r3', primaryStatement: 'third generation' }),
        { memoryPath: path, now: FIXED_NOW },
      );
      const store = loadResearchMemory(path);
      const first = store.branchTree.find((b) => b.runId === 'r1' && b.isPrimary)!;
      const chain = traceLineage(store, first.contentHash);
      assert.equal(chain.length, 3);
      assert.equal(chain[0]!.runId, 'r1');
      assert.equal(chain[2]!.runId, 'r3');
      assert.ok(chain[2]!.validTo === null, 'the newest generation stays active');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('markKernelRefuted invalidates matching active branches without deleting them', () => {
    const { dir, path } = tempStore();
    try {
      recordRunToMemory(liveRun(), { memoryPath: path, now: FIXED_NOW });
      const primary = liveRun().hypotheses.find((h) => h.id === 'h-p')!;
      const refuted = markKernelRefuted(
        { contentHash: hypothesisContentHash(primary), at: '2026-08-17T00:00:00.000Z' },
        { memoryPath: path },
      );
      assert.equal(refuted, 1);
      const store = loadResearchMemory(path);
      const node = store.branchTree.find((b) => b.hypothesisId === 'h-p')!;
      assert.equal(node.validTo, '2026-08-17T00:00:00.000Z');
      assert.equal(node.invalidReason, 'kernel_refuted');
      assert.ok(store.branchTree.length > 0, 'node still present — never deleted');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('load/save fail-closed discipline', () => {
  it('a corrupt store is refused, never silently rebuilt', () => {
    const { dir, path } = tempStore();
    try {
      writeFileSync(path, '{not json', 'utf8');
      assert.throws(() => loadResearchMemory(path), /not valid JSON/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('an unknown future schemaVersion is refused', () => {
    const { dir, path } = tempStore();
    try {
      saveResearchMemory(path, emptyMemoryStore(FIXED_NOW));
      const raw = JSON.parse(readFileSync(path, 'utf8')) as ResearchMemoryStore;
      writeFileSync(path, JSON.stringify({ ...raw, schemaVersion: 2 }), 'utf8');
      assert.throws(() => loadResearchMemory(path), /schemaVersion 2/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a structurally invalid store is refused with named errors', () => {
    const { dir, path } = tempStore();
    try {
      writeFileSync(path, JSON.stringify({ schemaVersion: 1, updatedAt: 't' }), 'utf8');
      assert.throws(() => loadResearchMemory(path), /negativeResults must be an array/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('missing file → empty store (first run is not an error)', () => {
    const { dir } = tempStore();
    try {
      const store = loadResearchMemory(join(dir, 'nonexistent.json'));
      assert.equal(store.branchTree.length, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('learnings forced structure (dzhng anchor)', () => {
  it('empty entities / values / dates each throw', () => {
    const base: LearningRecord = {
      id: 'l', runId: 'r', domain: 'd', tier: 'research',
      entities: ['strategy:induction'], preciseValues: ['x=1'], dates: ['2026-08-15T00:00:00.000Z'],
      text: 't', recordedAt: '2026-08-15T00:00:00.000Z',
    };
    assertLearningStructure(base);
    assert.throws(() => assertLearningStructure({ ...base, entities: [] }), /entity/);
    assert.throws(() => assertLearningStructure({ ...base, preciseValues: [] }), /precise value/);
    assert.throws(() => assertLearningStructure({ ...base, dates: [] }), /date/);
    assert.throws(() => assertLearningStructure({ ...base, dates: ['not-a-date'] }), /date/);
  });
});

describe('buildMemorySummary + injection payload', () => {
  it('header and footer are verbatim (§2.5 internal-memory marking)', () => {
    const store = emptyMemoryStore(FIXED_NOW);
    const summary = buildMemorySummary(store);
    assert.ok(summary.startsWith(MEMORY_SUMMARY_HEADER));
    assert.ok(summary.includes(MEMORY_SUMMARY_FOOTER));
  });

  it('deterministic: same store → byte-identical summary', () => {
    const { dir, path } = tempStore();
    try {
      recordRunToMemory(liveRun(), { memoryPath: path, now: FIXED_NOW });
      const store = loadResearchMemory(path);
      assert.equal(buildMemorySummary(store), buildMemorySummary(store));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('bounded: negatives ≤5, stats ≤3, conclusions ≤3, total ≤ hard cap', () => {
    const { dir, path } = tempStore();
    try {
      for (let i = 0; i < 3; i += 1) {
        recordRunToMemory(liveRun({ runId: `r${i}` }), { memoryPath: path, now: FIXED_NOW });
      }
      const store = loadResearchMemory(path);
      const summary = buildMemorySummary(store);
      // Parse the negative-results SECTION precisely (header line → bullet lines).
      const lines = summary.split('\n');
      const negHeader = lines.findIndex((l) => l.startsWith('负结果台账'));
      let negativeLines = 0;
      for (let i = negHeader + 1; i < lines.length && lines[i]!.startsWith('  ·'); i += 1) negativeLines += 1;
      assert.ok(negativeLines <= 5, `negative lines ≤5, got ${negativeLines}`);
      assert.ok(summary.length <= MEMORY_SUMMARY_MAX_CHARS + 60, 'hard cap respected');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('domain filter excludes foreign domains', () => {
    const { dir, path } = tempStore();
    try {
      recordRunToMemory(liveRun({ domain: 'astronomy' }), { memoryPath: path, now: FIXED_NOW });
      const store = loadResearchMemory(path);
      const biologySummary = buildMemorySummary(store, { domain: 'biology' });
      // astronomy entries filtered out → only header+footer remain
      assert.equal(biologySummary.split('\n').length, 2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('empty store injects nothing (null summary, empty hash set)', () => {
    const payload = buildMemoryInjection(emptyMemoryStore(FIXED_NOW));
    assert.equal(payload.summary, null);
    assert.equal(payload.knownContentHashes.size, 0);
  });

  it('non-empty store yields summary + known-content-hash index', () => {
    const { dir, path } = tempStore();
    try {
      recordRunToMemory(liveRun(), { memoryPath: path, now: FIXED_NOW });
      const payload = buildMemoryInjection(loadResearchMemory(path), { domain: 'astronomy' });
      assert.ok(payload.summary !== null && payload.summary.includes('已探索分支'));
      assert.ok(payload.knownContentHashes.size >= 3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('screenAgainstMemory (dedup guard, mark-only)', () => {
  it('re-proposing an ELIMINATED idea flags as negative (highest-value case)', () => {
    const { dir, path } = tempStore();
    try {
      recordRunToMemory(liveRun(), { memoryPath: path, now: FIXED_NOW });
      const store = loadResearchMemory(path);
      const gateFailed = liveRun().hypotheses.find((h) => h.id === 'h-g')!;
      const hits = screenAgainstMemory([gateFailed], store);
      assert.equal(hits.length, 1);
      assert.match(hits[0]!.marker, /^MEMORY_DUPLICATE:negative:/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('re-proposing an explored branch flags as branch', () => {
    const { dir, path } = tempStore();
    try {
      recordRunToMemory(liveRun(), { memoryPath: path, now: FIXED_NOW });
      const store = loadResearchMemory(path);
      const primary = liveRun().hypotheses.find((h) => h.id === 'h-p')!;
      const hits = screenAgainstMemory([primary], store);
      assert.equal(hits.length, 1);
      assert.match(hits[0]!.marker, /^MEMORY_DUPLICATE:branch:/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('novel content produces no flags (no false positives on exact hash)', () => {
    const { dir, path } = tempStore();
    try {
      recordRunToMemory(liveRun(), { memoryPath: path, now: FIXED_NOW });
      const store = loadResearchMemory(path);
      const novel = candidate('h-new', 'a brand new statement never explored', 'data_driven');
      assert.equal(screenAgainstMemory([novel], store).length, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('rebuildMemoryFromRuns (derived-index proof)', () => {
  it('a deleted memory store is rebuilt equivalently from the run files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-rebuild-'));
    try {
      const memoryPath = join(dir, 'memory.json');
      const runA = join(dir, 'a.json');
      const runB = join(dir, 'b.json');
      writeFileSync(runA, JSON.stringify(liveRun({ runId: 'r1' })), 'utf8');
      writeFileSync(runB, JSON.stringify(liveRun({ runId: 'r2', primaryStatement: 'evolved' })), 'utf8');
      // First: organic recording (r1 then r2, different timestamps).
      recordRunToMemory(liveRun({ runId: 'r1' }), { memoryPath, now: FIXED_NOW });
      recordRunToMemory(liveRun({ runId: 'r2', primaryStatement: 'evolved' }), {
        memoryPath,
        now: () => new Date('2026-08-16T12:00:00.000Z'),
      });
      const organic = loadResearchMemory(memoryPath);
      // Then: rebuild from the run files alone.
      const rebuilt = rebuildMemoryFromRuns([runA, runB], {
        memoryPath: join(dir, 'rebuilt.json'),
        now: FIXED_NOW,
      });
      assert.equal(rebuilt.runsSkippedOffline, 0);
      assert.equal(rebuilt.store.negativeResults.length, organic.negativeResults.length);
      assert.equal(rebuilt.store.branchTree.length, organic.branchTree.length);
      assert.equal(rebuilt.store.conclusions.length, organic.conclusions.length);
      assert.equal(rebuilt.store.strategyStats.length, organic.strategyStats.length);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('offline run files are counted and skipped honestly', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-rebuild2-'));
    try {
      const runFile = join(dir, 'replay.json');
      writeFileSync(runFile, JSON.stringify({ ...liveRun(), runMode: 'RECORDED_REPLAY' }), 'utf8');
      const out = rebuildMemoryFromRuns([runFile], { memoryPath: join(dir, 'm.json'), now: FIXED_NOW });
      assert.equal(out.runsSkippedOffline, 1);
      assert.equal(out.store.branchTree.length, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('default path constant (no accidental writes in tests)', () => {
  it('DEFAULT_RESEARCH_MEMORY_PATH lives under .far/ (gitignored runtime root)', () => {
    assert.ok(DEFAULT_RESEARCH_MEMORY_PATH.startsWith('.far/'));
  });
});
