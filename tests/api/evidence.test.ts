/**
 * evidence 路由测试——GET /evidence/:id + GET /evidence/chain/:headHash（24§5.3）。
 *
 * 历史溯源（已归档）: archived-spec网关与接口规范_API_GATEWAY.md §5.3.
 *
 * 覆盖：
 *   - GET /evidence/:id 返回 404 当记录不存在
 *   - GET /evidence/:id 返回 200 + DTO 当记录存在（DTO 字段 camelCase·24§0 casing）
 *   - GET /evidence/chain/:headHash 返回 400 当 hash 格式非法
 *   - GET /evidence/chain/:headHash 返回 200 + null callRecord 当 hash 不存在
 *   - GET /evidence/chain/:headHash 返回 200 + callRecord 当 hash 存在
 *   - EvidenceLogDto 字段命名遵守 camelCase 铁律
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { runMigrations } from '../../src/db/index.ts';
import { FIXTURE_VERDICT_TRACE } from '../falsifiability/_verdict_trace_fixture.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { buildServer } from '../../src/api/server.ts';
import {
  appendEvidenceLog,
  appendRecord,
  GENESIS_PREV_HASH,
} from '../../src/evidence_log/index.ts';
import type {
  AppendRecordOptions,
  ProviderNeutralCredential,
  CallAuditData,
  SourceAnchor,
} from '../../src/evidence_log/index.ts';
import { recordVerdict } from '../../src/falsifiability/repository.ts';
import type { FalsificationSpec, ThresholdSpec } from '../../src/falsifiability/types.ts';

const OFFLINE_OPTIONS: AppendRecordOptions = {
  providerProfile: 'offline_replay',
};

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

function credential(index: number): ProviderNeutralCredential {
  return {
    modelId: 'offline-replay-fixture',
    dashscopeRequestId: null,
    reproHash: `${index}`.repeat(64).slice(0, 64),
    gitCommitSha: 'b'.repeat(40),
    isoTimestamp: `2026-06-27T00:00:0${index}.000Z`,
  };
}

function audit(index: number): CallAuditData {
  return {
    requestPayload: `{"messages":[{"role":"user","content":"q${index}"}]}`,
    responsePayload: `{"choices":[{"message":{"content":"a${index}"}}]}`,
    finishReason: 'stop',
    usageTokensTotal: index,
  };
}

const SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'b'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'c'.repeat(64),
  codeLocation: {
    filePath: 'tests/api/evidence.test.ts',
    location: 'appendEvidenceLog',
    lineNumber: 1,
  },
};

test('GET /api/v1/evidence/:id returns 404 when evidence not found', async () => {
  const db = openDb();
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/evidence/nonexistent-evidence-id',
    });
    assert.equal(response.statusCode, 404);
    const body = response.json() as { error_code: string; source_anchor: unknown };
    assert.equal(body.error_code, 'NOT_FOUND');
    assert.ok(body.source_anchor !== undefined);
  } finally {
    await app.close();
    db.close();
  }
});

test('GET /api/v1/evidence/:id returns 200 + DTO when evidence exists', async () => {
  const db = openDb();
  const record = appendRecord(
    db,
    {
      stageId: 'stage3_hypothesis',
      cred: credential(1),
      payloadKind: 'hypothesis',
      purposeTag: 'hypothesis',
      prevHash: GENESIS_PREV_HASH,
    },
    audit(1),
    OFFLINE_OPTIONS,
  );
  appendEvidenceLog(db, {
    callRecordSeq: record.seq,
    evidenceId: 'ev-test-001',
    evidencePayload: { claim: 'testable claim' },
    sourceAnchor: SOURCE_ANCHOR,
  });

  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/evidence/ev-test-001',
    });
    assert.equal(response.statusCode, 200);
    const body = (response.json() as { readonly ok: boolean; readonly data: {
      evidenceId: string;
      callRecordSeq: number;
      stageId: string;
      payloadKind: string;
      evidencePayload: unknown;
      sourceAnchor: unknown;
      createdAt: string;
      verdictNode: unknown;
    } }).data;
    assert.equal(body.evidenceId, 'ev-test-001');
    assert.equal(body.callRecordSeq, record.seq);
    assert.equal(body.stageId, 'stage3_hypothesis');
    assert.equal(body.payloadKind, 'hypothesis');
    // verdictNode is null when no verdict exists for this evidence
    assert.equal(body.verdictNode, null);
  } finally {
    await app.close();
    db.close();
  }
});

test('GET /api/v1/evidence/:id includes verdictNode when verdict exists', async () => {
  const db = openDb();
  const record = appendRecord(
    db,
    {
      stageId: 'stage3_hypothesis',
      cred: credential(3),
      payloadKind: 'hypothesis',
      purposeTag: 'hypothesis',
      prevHash: GENESIS_PREV_HASH,
    },
    audit(3),
    OFFLINE_OPTIONS,
  );
  appendEvidenceLog(db, {
    callRecordSeq: record.seq,
    evidenceId: 'ev-with-verdict',
    evidencePayload: { claim: 'testable claim' },
    sourceAnchor: SOURCE_ANCHOR,
  });
  // Create a verdict node linked to this evidence
  const falsificationSpec: FalsificationSpec = {
    prediction: 'accuracy should be at least 0.85',
    metric: 'accuracy',
    falsificationThreshold: 0.85,
    thresholdSemantics: 'gt',
  };
  const thresholdSpec: ThresholdSpec = { semantics: 'gt', value: 0.85 };
  recordVerdict(db, {
    evidenceId: 'ev-with-verdict',
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    verdict: 'CONFIRMED',
    falsificationSpec,
    thresholdSpec,
    metricValue: 0.92,
    conflictingEvidenceCount: 0,
    scopeSlipText: null,
    untestedReason: null,
    sourceAnchor: SOURCE_ANCHOR,
    replayProver: null,
    verdictTrace: FIXTURE_VERDICT_TRACE,
  });

  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/evidence/ev-with-verdict',
    });
    assert.equal(response.statusCode, 200);
    const body = (response.json() as { readonly ok: boolean; readonly data: {
      evidenceId: string;
      verdictNode: { decision: string; evidenceId: string } | null;
    } }).data;
    assert.ok(body.verdictNode !== null, 'verdictNode must be present when verdict exists');
    assert.equal(body.verdictNode!.decision, 'CONFIRMED');
    assert.equal(body.verdictNode!.evidenceId, 'ev-with-verdict');
  } finally {
    await app.close();
    db.close();
  }
});

test('GET /api/v1/evidence/chain/:headHash returns 400 on invalid hash format', async () => {
  const db = openDb();
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/evidence/chain/too-short',
    });
    assert.equal(response.statusCode, 400);
    const body = response.json() as { error_code: string };
    assert.equal(body.error_code, 'BAD_REQUEST');
  } finally {
    await app.close();
    db.close();
  }
});

test('GET /api/v1/evidence/chain/:headHash returns 200 + null callRecord when hash not found', async () => {
  const db = openDb();
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/evidence/chain/${'0'.repeat(64)}`,
    });
    assert.equal(response.statusCode, 200);
    const body = (response.json() as { readonly ok: boolean; readonly data: {
      headHash: string;
      callRecord: unknown;
      graphSubtree: unknown;
    } }).data;
    assert.equal(body.headHash, '0'.repeat(64));
    assert.equal(body.callRecord, null);
  } finally {
    await app.close();
    db.close();
  }
});

test('GET /api/v1/evidence/chain/:headHash returns 200 + callRecord when hash exists', async () => {
  const db = openDb();
  const record = appendRecord(
    db,
    {
      stageId: 'stage3_hypothesis',
      cred: credential(1),
      payloadKind: 'hypothesis',
      purposeTag: 'hypothesis',
      prevHash: GENESIS_PREV_HASH,
    },
    audit(1),
    OFFLINE_OPTIONS,
  );

  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/evidence/chain/${record.currentHash}`,
    });
    assert.equal(response.statusCode, 200);
    const body = (response.json() as { readonly ok: boolean; readonly data: {
      headHash: string;
      callRecord: { seq: number; stageId: string; currentHash: string } | null;
      graphSubtree: unknown;
    } }).data;
    assert.equal(body.headHash, record.currentHash);
    assert.ok(body.callRecord !== null);
    assert.equal(body.callRecord!.seq, record.seq);
    assert.equal(body.callRecord!.stageId, 'stage3_hypothesis');
    assert.equal(body.callRecord!.currentHash, record.currentHash);
  } finally {
    await app.close();
    db.close();
  }
});

test('EvidenceLogDto uses camelCase field names (24§0 casing rule)', async () => {
  const db = openDb();
  const record = appendRecord(
    db,
    {
      stageId: 'stage3_hypothesis',
      cred: credential(2),
      payloadKind: 'hypothesis',
      purposeTag: 'hypothesis',
      prevHash: GENESIS_PREV_HASH,
    },
    audit(2),
    OFFLINE_OPTIONS,
  );
  appendEvidenceLog(db, {
    callRecordSeq: record.seq,
    evidenceId: 'ev-casing-check',
    evidencePayload: { claim: 'casing test' },
    sourceAnchor: SOURCE_ANCHOR,
  });

  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/evidence/ev-casing-check',
    });
    assert.equal(response.statusCode, 200);
    const body = (response.json() as { readonly ok: boolean; readonly data: Record<string, unknown> }).data;
    assert.ok('evidenceId' in body, 'expected camelCase evidenceId');
    assert.ok('callRecordSeq' in body, 'expected camelCase callRecordSeq');
    assert.ok('stageId' in body, 'expected camelCase stageId');
    assert.ok('payloadKind' in body, 'expected camelCase payloadKind');
    assert.ok('evidencePayload' in body, 'expected camelCase evidencePayload');
    assert.ok('sourceAnchor' in body, 'expected camelCase sourceAnchor');
    assert.ok('createdAt' in body, 'expected camelCase createdAt');
    assert.ok(!('evidence_id' in body), 'must not contain snake_case evidence_id');
    assert.ok(!('call_record_seq' in body), 'must not contain snake_case call_record_seq');
  } finally {
    await app.close();
    db.close();
  }
});
