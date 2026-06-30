/**
 * verdict 路由测试——GET /verdict/:id + /verdict/by_hypothesis/:hypoId + /verdict（24§5.3）。
 *
 * Authority: FAR_CHAIN_DEV_SPEC/24_API网关与接口规范_API_GATEWAY.md §5.3.
 *
 * 覆盖：
 *   - GET /verdict/:id 返回 404 当记录不存在
 *   - GET /verdict/:id 返回 200 + DTO 当记录存在（DTO 用 decision 字段·非 verdict·红线合规）
 *   - GET /verdict/by_hypothesis/:hypoId 返回 404 当无关联判定
 *   - GET /verdict/by_hypothesis/:hypoId 返回 200 当存在关联判定
 *   - GET /verdict list 返回分页 items
 *   - GET /verdict list 非法 limit 返回 400
 *
 * 红线合规：URL 路径段 /verdict/ 含 verdict 字面量（24§0 URL 豁免）·代码标识符用 HonestVerdict 别名。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { runMigrations } from '../../src/db/index.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { buildServer } from '../../src/api/server.ts';
import {
  appendEvidenceLog,
  appendRecord,
} from '../../src/evidence_log/index.ts';
import { recordVerdict } from '../../src/falsifiability/repository.ts';
import type {
  FalsificationSpec,
  SourceAnchor,
  ThresholdSpec,
} from '../../src/falsifiability/types.ts';

const SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'b'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'c'.repeat(64),
};

const FALSIFICATION_SPEC: FalsificationSpec = {
  prediction: 'accuracy should be at least 0.85',
  metric: 'accuracy',
  falsificationThreshold: 0.85,
  thresholdSemantics: 'gt',
};

const THRESHOLD_SPEC: ThresholdSpec = {
  semantics: 'gt',
  value: 0.85,
};

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

function seedEvidenceAndVerdict(
  db: Database.Database,
  evidenceId: string,
  decision: 'CONFIRMED' | 'REFUTED' | 'INCONCLUSIVE' | 'DEGRADED_SCOPE' | 'UNTESTED',
): string {
  const record = appendRecord(
    db,
    {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: 'a'.repeat(64),
        gitCommitSha: 'b'.repeat(40),
        isoTimestamp: '2026-06-27T00:00:00.000Z',
      },
      payloadKind: 'hypothesis',
      purposeTag: 'hypothesis',
    },
    {
      requestPayload: '{}',
      responsePayload: '{}',
      finishReason: 'stop',
      usageTokensTotal: 0,
    },
    { providerProfile: 'offline_replay' },
  );

  appendEvidenceLog(db, {
    evidenceId,
    callRecordSeq: record.seq,
    evidencePayload: { claim: 'test' },
    sourceAnchor: SOURCE_ANCHOR,
  });

  const node = recordVerdict(db, {
    evidenceId,
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    verdict: decision,
    falsificationSpec: FALSIFICATION_SPEC,
    thresholdSpec: THRESHOLD_SPEC,
    metricValue: 0.9,
    conflictingEvidenceCount: 0,
    scopeSlipText: decision === 'DEGRADED_SCOPE' ? 'scope narrowed to subset' : null,
    untestedReason: decision === 'UNTESTED' ? 'no evidence collected' : null,
    sourceAnchor: SOURCE_ANCHOR,
    replayProver: null,
  });

  return node.verdictId;
}

test('GET /api/v1/verdict/:id returns 404 when verdict not found', async () => {
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
      url: '/api/v1/verdict/nonexistent-verdict-id',
    });
    assert.equal(response.statusCode, 404);
    const body = response.json() as { error_code: string };
    assert.equal(body.error_code, 'NOT_FOUND');
  } finally {
    await app.close();
    db.close();
  }
});

test('GET /api/v1/verdict/:id returns 200 + DTO when verdict exists', async () => {
  const db = openDb();
  const verdictId = seedEvidenceAndVerdict(db, 'ev-verdict-001', 'CONFIRMED');
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/verdict/${verdictId}`,
    });
    assert.equal(response.statusCode, 200);
    const body = response.json() as {
      verdictId: string;
      evidenceId: string;
      decision: string;
      nodeKind: string;
      metricValue: number | null;
    };
    assert.equal(body.verdictId, verdictId);
    assert.equal(body.evidenceId, 'ev-verdict-001');
    assert.equal(body.decision, 'CONFIRMED');
    assert.equal(body.nodeKind, 'hypothesis');
    assert.equal(body.metricValue, 0.9);
  } finally {
    await app.close();
    db.close();
  }
});

test('GET /api/v1/verdict/:id DTO uses decision field (not verdict·red line compliant)', async () => {
  const db = openDb();
  const verdictId = seedEvidenceAndVerdict(db, 'ev-verdict-decision', 'REFUTED');
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/verdict/${verdictId}`,
    });
    assert.equal(response.statusCode, 200);
    const body = response.json() as Record<string, unknown>;
    assert.ok('decision' in body, 'DTO must use decision field (red line compliant)');
    assert.ok(!('verdict' in body), 'DTO must NOT use verdict field (red line)');
  } finally {
    await app.close();
    db.close();
  }
});

test('GET /api/v1/verdict/by_hypothesis/:hypoId returns 404 when no verdict linked', async () => {
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
      url: '/api/v1/verdict/by_hypothesis/no-such-evidence',
    });
    assert.equal(response.statusCode, 404);
    const body = response.json() as { error_code: string };
    assert.equal(body.error_code, 'NOT_FOUND');
  } finally {
    await app.close();
    db.close();
  }
});

test('GET /api/v1/verdict/by_hypothesis/:hypoId returns 200 when linked verdict exists', async () => {
  const db = openDb();
  seedEvidenceAndVerdict(db, 'ev-hypo-link', 'CONFIRMED');
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/verdict/by_hypothesis/ev-hypo-link',
    });
    assert.equal(response.statusCode, 200);
    const body = response.json() as { evidenceId: string; decision: string };
    assert.equal(body.evidenceId, 'ev-hypo-link');
    assert.equal(body.decision, 'CONFIRMED');
  } finally {
    await app.close();
    db.close();
  }
});

test('GET /api/v1/verdict list returns paginated items', async () => {
  const db = openDb();
  seedEvidenceAndVerdict(db, 'ev-list-1', 'CONFIRMED');
  seedEvidenceAndVerdict(db, 'ev-list-2', 'REFUTED');
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/verdict?limit=10&offset=0',
    });
    assert.equal(response.statusCode, 200);
    const body = response.json() as {
      items: ReadonlyArray<{ evidenceId: string }>;
      count: number;
      limit: number;
      offset: number;
    };
    assert.equal(body.count, 2);
    assert.equal(body.limit, 10);
    assert.equal(body.offset, 0);
    assert.ok(Array.isArray(body.items));
  } finally {
    await app.close();
    db.close();
  }
});

test('GET /api/v1/verdict list with non-numeric limit returns 400', async () => {
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
      url: '/api/v1/verdict?limit=abc',
    });
    assert.equal(response.statusCode, 400);
    const body = response.json() as { error_code: string };
    assert.equal(body.error_code, 'BAD_REQUEST');
  } finally {
    await app.close();
    db.close();
  }
});

test('GET /api/v1/verdict?verdict=CONFIRMED filters by verdict value', async () => {
  const db = openDb();
  seedEvidenceAndVerdict(db, 'ev-filter-confirmed', 'CONFIRMED');
  seedEvidenceAndVerdict(db, 'ev-filter-refuted', 'REFUTED');
  seedEvidenceAndVerdict(db, 'ev-filter-untested', 'UNTESTED');
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/verdict?verdict=CONFIRMED&limit=10&offset=0',
    });
    assert.equal(response.statusCode, 200);
    const body = response.json() as {
      items: ReadonlyArray<{ decision: string }>;
      count: number;
      verdict: string;
    };
    assert.equal(body.verdict, 'CONFIRMED');
    assert.equal(body.count, 1);
    for (const item of body.items) {
      assert.equal(item.decision, 'CONFIRMED');
    }
  } finally {
    await app.close();
    db.close();
  }
});

test('GET /api/v1/verdict?verdict=INVALID returns 400', async () => {
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
      url: '/api/v1/verdict?verdict=INVALID_VALUE',
    });
    assert.equal(response.statusCode, 400);
    const body = response.json() as { error_code: string };
    assert.equal(body.error_code, 'BAD_REQUEST');
  } finally {
    await app.close();
    db.close();
  }
});
