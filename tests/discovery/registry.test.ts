// tests/discovery/registry.test.ts
// 发现注册表（design-spec §2.4）的契约：
//   - 记录构建：纯函数、registeredAt 注入、内容哈希只覆盖科学内容（包装改动→同哈希）
//   - 哈希链：创世行 prev='' / 中段篡改 / 尾行篡改 / 乱序全部检出
//   - append 幂等：同 (contentHash,state) 跳过；同内容新状态追加（状态史保留）
//   - 拒绝向断链台账追加（fail-closed）；损坏行解析报行号
//   - run 集成：LIVE/MIXED 注册合格猜想；gate 未过/零绑定引用不注册并给原因；
//     离线模式永不写盘（防测试污染真实台账）
//   - 公证导出：断链拒绝导出；disclaimer（cannot-prove 声明）恒在场

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildDiscoveryRegistryRecord,
  hypothesisContentHash,
  verifyRecordHash,
  verifyDiscoveryRegistryChain,
  readDiscoveryRegistry,
  appendDiscoveryRecords,
  exportDiscoveryRegistry,
  registerRunDiscoveries,
  DEFAULT_DISCOVERY_REGISTRY_PATH,
  type DiscoveryRegistryRecord,
  type RegistryRecordInput,
} from '../../src/discovery/registry.ts';
import { transitionConjectureState } from '../../src/discovery/types.ts';
import type { ResearchRun, HypothesisCandidate } from '../../src/research/types.ts';
import type { RetrievedDocument } from '../../src/retrieval/types.ts';

const FIXED_NOW = () => new Date('2026-08-15T12:00:00.000Z');

/** Typed minimal candidate. */
function candidate(id: string, statement: string): HypothesisCandidate {
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
  };
}

function provenance() {
  return {
    corpusSnapshotId: 'snap-1',
    corpusRootHash: 'a'.repeat(64),
    modelProfile: 'live',
    supportingCitations: ['10.1000/demo'],
    counterEvidenceCitations: [],
    receiptsDigest: 'b'.repeat(64),
  };
}

function recordInput(overrides: Partial<RegistryRecordInput> = {}): RegistryRecordInput {
  return {
    kind: 'registration',
    sequence: 1,
    contentHash: 'c'.repeat(64),
    registeredAt: FIXED_NOW().toISOString(),
    state: 'CORROBORATED',
    question: 'q?',
    runId: 'run-1',
    provenance: provenance(),
    evidence: { deterministicCheckRef: 'run:run-1/falsifiability_gate+h1' },
    prevRecordHash: '',
    ...overrides,
  };
}

/** Build a chained record list (each input's prev from the previous output). */
function chainedRecords(count: number): DiscoveryRegistryRecord[] {
  const out: DiscoveryRegistryRecord[] = [];
  let prev = '';
  for (let i = 0; i < count; i += 1) {
    const record = buildDiscoveryRegistryRecord(
      recordInput({
        sequence: i + 1,
        contentHash: `${String(i).padStart(64, '0')}`,
        prevRecordHash: prev,
      }),
    );
    out.push(record);
    prev = record.recordHash;
  }
  return out;
}

describe('record building (pure)', () => {
  it('content hash covers the scientific content only — packaging edits keep the hash', () => {
    const base = candidate('h1', 's');
    const repackaged = { ...base, risks: ['totally new risk text'], assumptions: ['new'] };
    assert.equal(hypothesisContentHash(repackaged), hypothesisContentHash(base));
    const changed = candidate('h1', 'a different statement');
    assert.notEqual(hypothesisContentHash(changed), hypothesisContentHash(base));
  });

  it('recordHash covers every field; any edit breaks it', () => {
    const record = buildDiscoveryRegistryRecord(recordInput());
    assert.ok(verifyRecordHash(record));
    const tampered = { ...record, state: transitionConjectureState('CORROBORATED', 'KERNEL_ADJUDICATED') };
    assert.equal(verifyRecordHash(tampered), false, 'state edit without re-hash → detectable');
    const tampered2 = { ...record, registeredAt: '2027-01-01T00:00:00.000Z' };
    assert.equal(verifyRecordHash(tampered2), false, 'timestamp edit → detectable');
  });

  it('registryId embeds the sequence and content-hash prefix (human+machine readable)', () => {
    const record = buildDiscoveryRegistryRecord(recordInput({ sequence: 7 }));
    assert.match(record.registryId, /^dsc-000007-cccccccccccc$/);
  });

  it('state transitions reuse the shared ladder machine (fail-closed on illegal edges)', () => {
    assert.throws(
      () => buildDiscoveryRegistryRecord(recordInput({ state: 'NOVEL_VALIDATED' })),
      /humanReviewRef/,
    );
  });
});

describe('hash chain verification', () => {
  it('a well-formed chain verifies; genesis has empty prev', () => {
    const records = chainedRecords(3);
    assert.equal(records[0]!.prevRecordHash, '');
    const chain = verifyDiscoveryRegistryChain(records);
    assert.deepEqual(chain, { valid: true, firstBrokenIndex: null, reason: null });
  });

  it('editing a mid-chain record breaks the chain AT that record', () => {
    const records = chainedRecords(4);
    const tampered = [...records];
    tampered[1] = { ...tampered[1]!, question: 'tampered question' };
    const chain = verifyDiscoveryRegistryChain(tampered);
    assert.equal(chain.valid, false);
    assert.equal(chain.firstBrokenIndex, 1);
  });

  it('reordering records breaks the chain (prev links no longer line up)', () => {
    const records = chainedRecords(3);
    const reordered = [records[1]!, records[0]!, records[2]!];
    const chain = verifyDiscoveryRegistryChain(reordered);
    assert.equal(chain.valid, false);
    assert.equal(chain.firstBrokenIndex, 0);
  });

  it('truncation from the head keeps the remaining chain internally consistent', () => {
    const records = chainedRecords(4);
    // Tail truncation (dropping later records) is verifiable; head truncation
    // starts mid-chain and must FAIL (genesis discipline).
    const headTruncated = records.slice(1);
    const chain = verifyDiscoveryRegistryChain(headTruncated);
    assert.equal(chain.valid, false);
    assert.equal(chain.firstBrokenIndex, 0, 'a chain must start at genesis (empty prev)');
  });
});

describe('append (idempotent, atomic, fail-closed)', () => {
  it('appends, re-chains, and stays verifiable; duplicate (contentHash,state) is skipped', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-registry-'));
    const ledger = join(dir, 'registry.jsonl');
    try {
      const r1 = appendDiscoveryRecords(ledger, [
        buildDiscoveryRegistryRecord(recordInput({ contentHash: 'a'.repeat(64) })),
        buildDiscoveryRegistryRecord(recordInput({ contentHash: 'b'.repeat(64) })),
      ]);
      assert.equal(r1.appended.length, 2);
      assert.ok(r1.chain.valid);

      // Re-append the SAME records → idempotent skip, chain untouched.
      const r2 = appendDiscoveryRecords(ledger, [
        buildDiscoveryRegistryRecord(recordInput({ contentHash: 'a'.repeat(64) })),
      ]);
      assert.equal(r2.appended.length, 0);
      assert.equal(r2.skippedDuplicates, 1);

      // Same content, NEW state (a ladder promotion) → appended, history kept.
      const r3 = appendDiscoveryRecords(ledger, [
        buildDiscoveryRegistryRecord(
          recordInput({
            kind: 'state_transition',
            contentHash: 'a'.repeat(64),
            state: transitionConjectureState('CORROBORATED', 'KERNEL_ADJUDICATED'),
          }),
        ),
      ]);
      assert.equal(r3.appended.length, 1);
      const onDisk = readDiscoveryRegistry(ledger);
      assert.equal(onDisk.length, 3);
      assert.deepEqual(
        onDisk.map((r) => r.state),
        ['CORROBORATED', 'CORROBORATED', 'KERNEL_ADJUDICATED'],
      );
      assert.ok(verifyDiscoveryRegistryChain(onDisk).valid);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses to append onto a broken ledger (repair or archive first)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-registry-'));
    const ledger = join(dir, 'registry.jsonl');
    try {
      appendDiscoveryRecords(ledger, [buildDiscoveryRegistryRecord(recordInput())]);
      const lines = readFileSync(ledger, 'utf8').trim().split('\n');
      const tampered = JSON.parse(lines[0]!) as Record<string, unknown>;
      tampered['question'] = 'tampered';
      writeFileSync(ledger, `${JSON.stringify(tampered)}\n`);
      assert.throws(
        () => appendDiscoveryRecords(ledger, [buildDiscoveryRegistryRecord(recordInput({ contentHash: 'd'.repeat(64) }))]),
        /refusing to append to a broken discovery registry/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a corrupt line fails the read with the line number named', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-registry-'));
    const ledger = join(dir, 'registry.jsonl');
    try {
      writeFileSync(ledger, 'not-json\n');
      assert.throws(() => readDiscoveryRegistry(ledger), /line 1/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('sequential writers serialize through the lock — no lost appends', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-registry-'));
    const ledger = join(dir, 'registry.jsonl');
    try {
      appendDiscoveryRecords(ledger, [buildDiscoveryRegistryRecord(recordInput({ contentHash: '1'.repeat(64) }))]);
      appendDiscoveryRecords(ledger, [buildDiscoveryRegistryRecord(recordInput({ contentHash: '2'.repeat(64) }))]);
      const onDisk = readDiscoveryRegistry(ledger);
      assert.equal(onDisk.length, 2, 'both writers landed');
      assert.ok(verifyDiscoveryRegistryChain(onDisk).valid, 'chain intact after both');
      assert.equal(existsSync(`${ledger}.lock`), false, 'lock released');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── run integration (registerRunDiscoveries) ────────────────────────────────

function doc(doi: string): RetrievedDocument {
  return {
    documentId: `doc-${doi}`,
    sourceType: 'openalex',
    sourceName: 'OpenAlex',
    persistentIdentifier: doi,
    doi,
    canonicalUrl: `https://doi.org/${doi}`,
    title: `title ${doi}`,
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
}

function run(mode: ResearchRun['runMode']): ResearchRun {
  const qualified = candidate('h-ok', 'qualified statement');
  const gateFailed = candidate('h-gate', 'gate-failed statement');
  const noEvidence = candidate('h-noev', 'no-bound-citation statement');
  return {
    runId: 'run-int',
    question: 'q?',
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
    hypotheses: [qualified, gateFailed, noEvidence],
    bindings: {
      'h-ok': {
        supportingIds: ['10.1000/a'],
        counterIds: [],
        boundSupporting: [doc('10.1000/a')],
        boundCounter: [],
        unbound: [],
        allBound: true,
        snapshotId: 'snap',
        relations: [],
      },
      'h-gate': {
        supportingIds: [],
        counterIds: [],
        boundSupporting: [],
        boundCounter: [],
        unbound: [],
        allBound: true,
        snapshotId: 'snap',
        relations: [],
      },
      'h-noev': {
        supportingIds: [],
        counterIds: [],
        boundSupporting: [],
        boundCounter: [],
        unbound: [],
        allBound: true,
        snapshotId: 'snap',
        relations: [],
      },
    },
    critiques: {},
    scorecards: {},
    discovery: null,
    plan: {
      objectives: [],
      primaryHypothesisId: 'h-ok',
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
      perHypothesis: {
        'h-ok': { passed: true, errors: [] },
        'h-gate': { passed: false, errors: ['empty prediction'] },
        'h-noev': { passed: true, errors: [] },
      },
      allPassed: false,
    },
    environment: { gitCommit: null, gitDirty: null, nodeVersion: 'v', platform: 't', lockfileHash: null, packageVersion: null },
    modes: { modelExecutionMode: 'LIVE', retrievalExecutionMode: 'LIVE', experimentExecutionMode: 'NOT_EXECUTED' },
    runMode: mode,
    startedAt: 't',
    schemaVersion: 4,
  };
}

describe('registerRunDiscoveries (run-finalize integration)', () => {
  it('a LIVE run registers only CORROBORATED-qualified hypotheses; reasons recorded', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-registry-run-'));
    const ledger = join(dir, 'registry.jsonl');
    try {
      const outcome = registerRunDiscoveries(run('LIVE'), { ledgerPath: ledger, now: FIXED_NOW });
      assert.equal(outcome.skippedMode, false);
      assert.equal(outcome.appended.length, 1, 'only h-ok qualifies');
      assert.equal(outcome.appended[0]!.state, 'CORROBORATED');
      assert.equal(outcome.appended[0]!.registeredAt, FIXED_NOW().toISOString());
      assert.deepEqual(
        outcome.notRegistered.map((n) => [n.id, n.reason]),
        [
          ['h-gate', 'falsifiability gate failed'],
          ['h-noev', 'no bound citations (CORROBORATED requires evidence)'],
        ],
      );
      const onDisk = readDiscoveryRegistry(ledger);
      assert.equal(onDisk.length, 1);
      assert.ok(verifyDiscoveryRegistryChain(onDisk).valid);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('offline/synthetic/replay runs NEVER write the ledger (test-pollution guard)', () => {
    for (const mode of ['OFFLINE_DEVELOPMENT', 'SYNTHETIC_TEST', 'RECORDED_REPLAY'] as const) {
      const dir = mkdtempSync(join(tmpdir(), 'far-registry-off-'));
      const ledger = join(dir, 'registry.jsonl');
      try {
        const outcome = registerRunDiscoveries(run(mode), { ledgerPath: ledger, now: FIXED_NOW });
        assert.equal(outcome.skippedMode, true, `${mode} skipped`);
        assert.equal(existsSync(ledger), false, `${mode} wrote nothing`);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('a MIXED run (live retrieval, replayed model) still registers', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-registry-mix-'));
    const ledger = join(dir, 'registry.jsonl');
    try {
      const outcome = registerRunDiscoveries(run('MIXED'), { ledgerPath: ledger, now: FIXED_NOW });
      assert.equal(outcome.skippedMode, false);
      assert.equal(outcome.appended.length, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('notarization export', () => {
  it('exports with chain head + the cannot-prove disclaimer', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-registry-exp-'));
    const ledger = join(dir, 'registry.jsonl');
    try {
      appendDiscoveryRecords(ledger, [buildDiscoveryRegistryRecord(recordInput())]);
      const exported = exportDiscoveryRegistry(ledger, { now: FIXED_NOW });
      assert.equal(exported.recordCount, 1);
      assert.equal(exported.chainHead, readDiscoveryRegistry(ledger)[0]!.recordHash);
      assert.match(exported.disclaimer, /do NOT prove scientific truth or novelty/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses to export a broken ledger', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-registry-exp2-'));
    const ledger = join(dir, 'registry.jsonl');
    try {
      appendDiscoveryRecords(ledger, [buildDiscoveryRegistryRecord(recordInput())]);
      const lines = readFileSync(ledger, 'utf8').trim().split('\n');
      const tampered = JSON.parse(lines[0]!) as Record<string, unknown>;
      tampered['runId'] = 'someone-elses-run';
      writeFileSync(ledger, `${JSON.stringify(tampered)}\n`);
      assert.throws(() => exportDiscoveryRegistry(ledger), /refusing to export a broken/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('default ledger path', () => {
  it('points under .far/ (runtime artifact discipline, never repo root)', () => {
    assert.match(DEFAULT_DISCOVERY_REGISTRY_PATH, /^\.far\//);
  });
});
