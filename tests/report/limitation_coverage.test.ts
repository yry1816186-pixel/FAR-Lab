// tests/report/limitation_coverage.test.ts
//
// CORE-LIMITS-001 验收：「每个重要结论必须说明不能证明什么。公开报告的 limitation
// coverage = 100%。」

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runMigrations } from '../../src/db/index.ts';
import { appendRecord, appendEvidenceLog } from '../../src/evidence_log/index.ts';
import { recordVerdict } from '../../src/falsifiability/index.ts';
import type { RecordVerdictArgs } from '../../src/falsifiability/index.ts';
import { FIXTURE_VERDICT_TRACE } from '../falsifiability/_verdict_trace_fixture.ts';
import {
  buildClaimLimitations,
  claimLimitationCoverage,
  generateReport,
} from '../../src/report/generator.ts';
import type { VerdictNode } from '../../src/falsifiability/types.ts';

function makeNode(overrides: Partial<VerdictNode> = {}): VerdictNode {
  return {
    verdictId: 'v-0000000000000000000000000001',
    evidenceId: 'ev-1',
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    verdict: 'CONFIRMED',
    falsificationSpec: {
      prediction: 'accuracy reaches 0.85',
      metric: 'accuracy',
      falsificationThreshold: 0.85,
      thresholdSemantics: 'gt',
    },
    thresholdSpec: { semantics: 'gt', value: 0.85 },
    metricValue: 0.91,
    conflictingEvidenceCount: 0,
    scopeSlipText: null,
    untestedReason: null,
    sourceAnchor: {
      gitCommitSha: 'a'.repeat(40),
      dashscopeRequestId: null,
      isoTimestamp: '2026-08-17T00:00:00Z',
      rawResponseHash: 'b'.repeat(64),
    },
    replayProver: null,
    verdictTrace: {} as VerdictNode['verdictTrace'],
    verdictTraceHash: 'c'.repeat(64),
    prevHash: 'd'.repeat(64),
    currentHash: 'e'.repeat(64),
    supersededBy: null,
    createdAt: '2026-08-17T00:00:00Z',
    updatedAt: '2026-08-17T00:00:00Z',
    ...overrides,
  } as VerdictNode;
}

test('LIMITS: 四种结论性裁决各得一条具体限制项；UNTESTED 豁免', () => {
  const nodes = [
    makeNode({ verdictId: 'v-c1', verdict: 'CONFIRMED' }),
    makeNode({ verdictId: 'v-r1', verdict: 'REFUTED' }),
    makeNode({ verdictId: 'v-i1', verdict: 'INCONCLUSIVE' }),
    makeNode({ verdictId: 'v-d1', verdict: 'DEGRADED_SCOPE', scopeSlipText: 'split-B only' }),
    makeNode({ verdictId: 'v-u1', verdict: 'UNTESTED', untestedReason: 'no fec' }),
  ];
  const items = buildClaimLimitations(nodes);
  assert.equal(items.length, 4); // UNTESTED 豁免
  const byClaim = new Map(items.map((i) => [i.claimId, i]));
  assert.match(byClaim.get('v-c1')!.cannotProve, /cannot prove external validity/);
  assert.match(byClaim.get('v-c1')!.cannotProve, /accuracy reaches 0.85/);
  assert.match(byClaim.get('v-r1')!.cannotProve, /cannot rule out/);
  assert.match(byClaim.get('v-i1')!.cannotProve, /cannot prove either direction/);
  assert.match(byClaim.get('v-d1')!.cannotProve, /original scope/);
  assert.match(byClaim.get('v-d1')!.reason, /split-B only/);
});

test('LIMITS 验收: claimLimitationCoverage = 100%（缺口可枚举——fail-closed 面）', () => {
  const nodes = [
    makeNode({ verdictId: 'v-a', verdict: 'CONFIRMED' }),
    makeNode({ verdictId: 'v-b', verdict: 'REFUTED' }),
  ];
  const full = claimLimitationCoverage(nodes, buildClaimLimitations(nodes));
  assert.equal(full.total, 2);
  assert.equal(full.covered, 2);
  assert.deepEqual(full.uncoveredClaimIds, []);

  const partial = claimLimitationCoverage(nodes, buildClaimLimitations([nodes[0]!]));
  assert.equal(partial.covered, 1);
  assert.deepEqual(partial.uncoveredClaimIds, ['v-b']);
});

// ---- 官方写入路径种子（appendRecord → appendEvidenceLog → recordVerdict） ----

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

function seedVerdictNode(db: Database.Database, verdictIdHint: string, verdict: string): void {
  const seq = appendRecord(
    db,
    {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-fixture',
        dashscopeRequestId: null,
        reproHash: 'a'.repeat(64),
        gitCommitSha: 'f'.repeat(40),
        isoTimestamp: '2026-08-17T00:00:00Z',
      },
      payloadKind: 'hypothesis',
      purposeTag: 'hypothesis',
    },
    {
      requestPayload: '{"p":"1"}',
      responsePayload: '{"r":"1"}',
      finishReason: 'stop',
      usageTokensTotal: 1,
    },
    { providerProfile: 'offline_replay' },
  ).seq;
  const evidenceId = appendEvidenceLog(db, {
    callRecordSeq: seq,
    evidencePayload: { seed: verdictIdHint },
    sourceAnchor: {
      gitCommitSha: 'f'.repeat(40),
      dashscopeRequestId: null,
      isoTimestamp: '2026-08-17T00:00:00Z',
      rawResponseHash: 'b'.repeat(64),
    },
    evidenceId: `ev-${verdictIdHint}`,
  }).evidenceId;
  recordVerdict(db, {
    evidenceId,
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    verdict: verdict as RecordVerdictArgs['verdict'],
    falsificationSpec: {
      prediction: 'accuracy reaches 0.85',
      metric: 'accuracy',
      falsificationThreshold: 0.85,
      thresholdSemantics: 'gt',
    },
    thresholdSpec: { semantics: 'gt', value: 0.85 },
    metricValue: 0.91,
    conflictingEvidenceCount: 0,
    scopeSlipText: verdict === 'DEGRADED_SCOPE' ? 'narrowed to split-B' : null,
    untestedReason: null,
    sourceAnchor: {
      gitCommitSha: 'f'.repeat(40),
      dashscopeRequestId: null,
      isoTimestamp: '2026-08-17T00:00:00Z',
      rawResponseHash: 'b'.repeat(64),
    },
    replayProver: null,
    verdictTrace: FIXTURE_VERDICT_TRACE,
  });
}

function queryNodes(db: Database.Database): Pick<VerdictNode, 'verdictId' | 'verdict'>[] {
  const rows = db.prepare('SELECT verdict_id, verdict FROM verdict_nodes').all() as readonly {
    verdict_id: string;
    verdict: string;
  }[];
  return rows.map((r) => ({ verdictId: r.verdict_id, verdict: r.verdict as VerdictNode['verdict'] }));
}

test('LIMITS: generateReport 的 Limitations 段携带结构化限制项且渲染逐结论清单（覆盖率 100%）', () => {
  const db = openDb();
  try {
    seedVerdictNode(db, 'seed1', 'CONFIRMED');
    seedVerdictNode(db, 'seed2', 'DEGRADED_SCOPE');
    const report = generateReport({ db, runId: 'run-limits' });
    const limitations = report.sections.find((s) => s.title === 'Limitations');
    assert.ok(limitations !== undefined);
    assert.ok((limitations.limitations ?? []).length >= 2, 'per-claim limitations attached');
    assert.match(limitations.body, /### Per-claim: what this conclusion cannot prove/);
    // 覆盖率 100%（验收口径：非 UNTESTED 节点全部被覆盖）
    const cov = claimLimitationCoverage(queryNodes(db), limitations.limitations ?? []);
    assert.equal(cov.total, 2);
    assert.equal(cov.covered / cov.total, 1);
  } finally {
    db.close();
  }
});
