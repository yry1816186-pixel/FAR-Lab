import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runMigrations } from '../../src/db/index.ts';
import { appendRecord } from '../../src/evidence_log/index.ts';
import { runVerdictStage } from '../../src/agent_loop/verdict_stage.ts';
import type { StageArtifact } from '../../src/agent_loop/types.ts';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  appendRecord(
    db,
    {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: 'a'.repeat(64),
        gitCommitSha: 'b'.repeat(40),
        isoTimestamp: '2026-06-30T00:00:00.000Z',
      },
      payloadKind: 'hypothesis',
      purposeTag: 'hypothesis',
    },
    {
      requestPayload: '{"q":1}',
      responsePayload: '{"a":1}',
      finishReason: 'stop',
      usageTokensTotal: 0,
    },
    { providerProfile: 'offline_replay' },
  );
  return db;
}

function artifacts(): readonly StageArtifact[] {
  return [
    {
      stageId: 'stage3_hypothesis',
      payloadKind: 'hypothesis',
      structured: {
        kind: 'hypothesis',
        claim: 'vote-only literature evidence supports this claim',
        falsificationMethod: {
          prediction: 'effect size exceeds threshold',
          metric: 'effect_size',
          comparator: 'gt',
          value: 0.8,
        },
        supportingCitations: [],
        scopeSlipText: 'test scope',
      },
      callResult: {
        credential: {
          providerProfile: 'offline_replay',
          providerRequestId: null,
          modelId: 'offline-replay-fixture',
          modelVersion: null,
          capability: 'structured',
          isoTimestamp: '2026-06-30T00:00:00.000Z',
          tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        },
        content: '',
        raw: null,
      },
      degraded: false,
      degradationReason: null,
    },
    {
      stageId: 'stage4_evidence',
      payloadKind: 'experiment',
      structured: {
        kind: 'evidence',
        evidenceRecords: [
          {
            evidenceId: 'ev-1',
            supportsOrRefutes: 'supports',
            entailmentScore: 0.99,
            source: { evidenceId: 'ev-1', source: 'other', doi: null, title: 'supporting paper' },
          },
        ],
        conflictingEvidenceCount: 0,
      },
      callResult: {
        credential: {
          providerProfile: 'offline_replay',
          providerRequestId: null,
          modelId: 'offline-replay-fixture',
          modelVersion: null,
          capability: 'structured',
          isoTimestamp: '2026-06-30T00:00:00.000Z',
          tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        },
        content: '',
        raw: null,
      },
      degraded: false,
      degradationReason: null,
    },
  ];
}

test('stage_emits_reasonCodes_ruleTrace', () => {
  const db = openDb();
  try {
    const verdictNode = runVerdictStage({
      db,
      artifacts: artifacts(),
      gitCommitSha: 'b'.repeat(40),
      runId: 'run-v2-wired',
    });

    assert.ok(verdictNode !== null);
    // 1 vote-supports → legacy 桥接（effectSize=1/adjustedP=0/integrityFlags 空）→ R7 CONFIRMED
    // （恢复 V1 契约·与 executeLoop hero demo 同源；vote-only 经 evidenceToStatisticalResult 桥接）。
    assert.equal(verdictNode.verdict, 'CONFIRMED');
  } finally {
    db.close();
  }
});
