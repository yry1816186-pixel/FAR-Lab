// tests/discovery/provenance.test.ts
// §2.4 补遗"provenance 最低字段"（b4 对齐项）的端到端契约：
//   - fan-out 捕获：strategySignatureHash（prompt 版本指纹）+ modelId/provider
//     （CallMeta 透传）+ temperature/seed（显式 null=未设置，qwen 默认 0.3 已文档化）
//   - ResearchRun.discovery.fanout.perStrategy 持久化这些字段（schema v4 加法）
//   - 注册表 provenance 按 strategyOrigin 关联填充；legacy/无 fanout run 不伪造
//   - 旧台账记录（无新字段）读取+验链照常（append-only 前向兼容）

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLlmGateway } from '../../src/llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';
import { runResearch } from '../../src/research/orchestrator.ts';
import { createReplayAdapter } from '../../src/retrieval/index.ts';
import { RESEARCH_DEMO_DOCS, RESEARCH_DEMO_FIXTURES } from '../../src/research/research_fixtures.ts';
import { STRATEGY_REGISTRY } from '../../src/discovery/strategies/index.ts';
import { rawSha256Hex } from '../../src/retrieval/hash.ts';
import {
  buildDiscoveryRegistryRecord,
  verifyRecordHash,
  verifyDiscoveryRegistryChain,
  registerRunDiscoveries,
  hypothesisContentHash,
  type DiscoveryRegistryRecord,
  type RegistryRecordInput,
} from '../../src/discovery/registry.ts';

const QUESTION = 'Why are hot Jupiter radii larger than structure models predict?';

describe('fan-out provenance capture (generation side)', () => {
  it('per-strategy receipts carry signature hash + model identity (offline replay)', async () => {
    const run = await runResearch({
      question: QUESTION,
      gateway: createLlmGateway([createOfflineReplayAdapter({ fixtures: RESEARCH_DEMO_FIXTURES })]),
      profile: 'offline_replay',
      grounding: { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) },
      targetHypothesisCount: 3,
      ...(process.env.FAR_TEST_STRATEGIES !== undefined
        ? { discoveryStrategies: JSON.parse(process.env.FAR_TEST_STRATEGIES) as ['induction'] }
        : {}),
    });
    const fanout = run.discovery?.fanout;
    assert.ok(fanout !== null && fanout !== undefined, 'multi-strategy default run has a fanout block');
    assert.ok(fanout.perStrategy.length >= 1);
    const induction = STRATEGY_REGISTRY.find((s) => s.id === 'induction')!;
    for (const entry of fanout.perStrategy) {
      assert.equal(typeof entry.strategySignatureHash, 'string');
      assert.match(entry.strategySignatureHash!, /^[0-9a-f]{64}$/);
      // The hash is the strategy's prompt signature — verifiable against the registry.
      const def = STRATEGY_REGISTRY.find((s) => s.id === entry.strategyId)!;
      assert.equal(entry.strategySignatureHash, rawSha256Hex(def.signature));
      // Only strategies that ACTUALLY RAN carry call identity (skips have none
      // to record — null by design, never fabricated).
      if (entry.error === null && entry.skipReason === null) {
        // Offline replay adapter identifies itself honestly.
        assert.equal(entry.modelId, 'offline-replay-fixture');
        assert.equal(typeof entry.provider, 'string');
        assert.equal(entry.temperature, null, 'not set → explicit null (never invented)');
        assert.equal(entry.seed, null);
      } else {
        assert.equal(entry.modelId, null);
        assert.equal(entry.provider, null);
      }
    }
    void induction;
  });
});

describe('registry provenance fill (run → ledger)', () => {
  // Reuse the typed run fixture pattern from registry.test.ts (minimal but
  // complete); here the run carries a discovery block with fanout provenance.
  function runWithFanoutProvenance() {
    const provenanceFanout = {
      strategy: 'multi_strategy' as const,
      fanout: {
        strategiesPlanned: ['induction' as const],
        perStrategy: [
          {
            strategyId: 'induction' as const,
            contributed: 1,
            error: null,
            skipReason: null,
            strategySignatureHash: rawSha256Hex(
              STRATEGY_REGISTRY.find((s) => s.id === 'induction')!.signature,
            ),
            modelId: 'qwen3-max',
            provider: 'competition_aliyun_qwen',
            temperature: null,
            seed: null,
          },
        ],
        exactDuplicatesDropped: 0,
        paraphraseFlagged: [],
        truncated: [],
        finalCount: 1,
        quotaShortfall: 0,
      },
      tournament: null,
    };
    const hypothesis = {
      id: 'h-prov',
      statement: 'provenance statement',
      mechanism: 'provenance mechanism',
      falsificationMethod: { prediction: 'p', metric: 'm', comparator: 'gt' as const, value: 1 },
      supportingCitations: ['10.1000/x'],
      counterEvidenceCitations: [],
      relationToExistingTheory: 't',
      alternativeExplanations: [],
      observablePredictions: [],
      distinguishingObservations: [],
      noveltyRelativeToCorpus: 'n',
      assumptions: [],
      risks: [],
      strategyOrigin: 'induction' as const,
    };
    const doc = {
      documentId: 'doc-x',
      sourceType: 'openalex' as const,
      sourceName: 'OpenAlex',
      persistentIdentifier: '10.1000/x',
      doi: '10.1000/x',
      canonicalUrl: 'https://doi.org/10.1000/x',
      title: 't',
      authors: [],
      publicationDate: '2024',
      retrievedAt: '2026-08-15T00:00:00.000Z',
      retrievalQuery: 'q',
      retrievalMethod: 'openalex-rest',
      rawHash: 'r'.repeat(64),
      normalizedHash: 'n'.repeat(64),
      parserVersion: 'p1',
      abstract: null,
      licenseMetadata: null,
    };
    return {
      runId: 'run-prov',
      question: 'q?',
      gateReport: {
        question: 'q?',
        verdict: 'RESEARCHABLE' as const,
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
        documents: [doc],
        sourceQueries: ['q'],
        createdAt: 't',
      },
      hypotheses: [hypothesis],
      bindings: {
        'h-prov': {
          supportingIds: ['10.1000/x'],
          counterIds: [],
          boundSupporting: [doc],
          boundCounter: [],
          unbound: [],
          allBound: true,
          snapshotId: 'snap',
          relations: [],
        },
      },
      critiques: {},
      scorecards: {},
      discovery: provenanceFanout,
      plan: {
        objectives: [],
        primaryHypothesisId: 'h-prov',
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
        gateVerdict: 'PASS' as const,
      },
      falsifiabilityGate: {
        perHypothesis: { 'h-prov': { passed: true, errors: [] } },
        allPassed: true,
      },
      environment: { gitCommit: null, gitDirty: null, nodeVersion: 'v', platform: 't', lockfileHash: null, packageVersion: null },
      modes: { modelExecutionMode: 'LIVE' as const, retrievalExecutionMode: 'LIVE' as const, experimentExecutionMode: 'NOT_EXECUTED' as const },
      runMode: 'LIVE' as const,
      startedAt: 't',
      schemaVersion: 4,
    };
  }

  it('the registry record carries the §2.4 minimum provenance fields', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-prov-'));
    const ledger = join(dir, 'registry.jsonl');
    try {
      const outcome = registerRunDiscoveries(runWithFanoutProvenance(), {
        ledgerPath: ledger,
        now: () => new Date('2026-08-15T00:00:00.000Z'),
      });
      assert.equal(outcome.appended.length, 1);
      const record = outcome.appended[0]!;
      const sig = STRATEGY_REGISTRY.find((s) => s.id === 'induction')!.signature;
      assert.equal(record.provenance.strategySignatureHash, rawSha256Hex(sig));
      assert.equal(record.provenance.modelId, 'qwen3-max');
      assert.equal(record.provenance.provider, 'competition_aliyun_qwen');
      assert.equal(record.provenance.temperature, null, 'explicit null = not set (honest)');
      assert.equal(record.provenance.seed, null);
      // The record is content-hashed WITH the provenance (tamper-evident).
      assert.ok(verifyRecordHash(record));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a run WITHOUT a fanout block (legacy) registers without fabricating provenance', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-prov-legacy-'));
    const ledger = join(dir, 'registry.jsonl');
    try {
      const run = runWithFanoutProvenance();
      const legacy = {
        ...run,
        hypotheses: [{ ...run.hypotheses[0]!, strategyOrigin: undefined }],
        discovery: { strategy: 'legacy' as const, fanout: null, tournament: null },
      };
      const outcome = registerRunDiscoveries(legacy, {
        ledgerPath: ledger,
        now: () => new Date('2026-08-15T00:00:00.000Z'),
      });
      assert.equal(outcome.appended.length, 1);
      const p = outcome.appended[0]!.provenance;
      assert.equal('strategySignatureHash' in p, false, 'absent = not recorded, never fabricated');
      assert.equal('modelId' in p, false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('append-only ledger backward compatibility (pre-b4 lines)', () => {
  it('records WITHOUT the new provenance fields still parse, verify, and chain', () => {
    // A pre-b4-shaped record: provenance lacks the five new fields entirely.
    const legacyInput: RegistryRecordInput = {
      kind: 'registration',
      sequence: 1,
      contentHash: hypothesisContentHash({
        id: 'x',
        statement: 's',
        mechanism: 'm',
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
      }),
      registeredAt: '2026-08-14T00:00:00.000Z',
      state: 'CORROBORATED',
      question: 'q?',
      runId: 'run-old',
      provenance: {
        corpusSnapshotId: 'snap',
        corpusRootHash: 'h'.repeat(64),
        modelProfile: 'live',
        supportingCitations: [],
        counterEvidenceCitations: [],
        receiptsDigest: 'd'.repeat(64),
      },
      evidence: { deterministicCheckRef: 'ref' },
      prevRecordHash: '',
    };
    const record: DiscoveryRegistryRecord = buildDiscoveryRegistryRecord(legacyInput);
    assert.ok(verifyRecordHash(record));
    assert.deepEqual(verifyDiscoveryRegistryChain([record]), {
      valid: true,
      firstBrokenIndex: null,
      reason: null,
    });
  });
});
