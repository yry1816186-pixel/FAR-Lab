/**
 * report 路由测试——双端点契约（24§5.3 / 17 Epic K-05a + K-05b）。
 *
 * 历史溯源（已归档）: FAR_CHAIN_DEV_SPEC/24_API网关与接口规范_API_GATEWAY.md §5.3 / 17 Epic K-05a/K-05b.
 *
 * 端点契约：
 *   - GET /report/:runId      → 200 text/html 审计报告（Epic K-05b·前端 iframe 渲染）
 *   - GET /report/:runId/paper → 200 application/json ResearchPaperOutput（Epic K-05a·竞赛 10 字段）
 *
 * 覆盖：
 *   - /report/:runId 返回 404 当无 evidence_log 记录
 *   - /report/:runId 返回 200 + text/html + DOCTYPE 文档当记录存在
 *   - /report/:runId HTML 含审计报告标记（runId / 裁决统计 / 哈希链段）
 *   - /report/:runId/paper 返回 ResearchPaperOutput 10 字段结构
 *   - /report/:runId/paper finalVerdict 为 UNTESTED 当无裁决节点（honest verdict 语义）
 *   - /report/:runId/paper paperTitle 从 problemStatement 派生（确定性·禁 LLM）
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
  GENESIS_PREV_HASH,
} from '../../src/evidence_log/index.ts';
import type {
  AppendRecordOptions,
  ProviderNeutralCredential,
  CallAuditData,
  SourceAnchor,
} from '../../src/evidence_log/index.ts';

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
};

/**
 * 创建一条 understanding 产物的 evidence_log 记录（供报告/paper 消费）。
 */
function seedUnderstandingEvidence(
  db: Database.Database,
  evidenceId: string,
  problemStatement: string,
): void {
  const record = appendRecord(
    db,
    {
      stageId: 'stage1_understanding',
      cred: credential(1),
      payloadKind: 'understanding',
      purposeTag: 'narrative',
      prevHash: GENESIS_PREV_HASH,
    },
    audit(1),
    OFFLINE_OPTIONS,
  );
  appendEvidenceLog(db, {
    callRecordSeq: record.seq,
    evidenceId,
    evidencePayload: {
      kind: 'understanding',
      problemStatement,
      scope: 'laboratory conditions',
      keyTerms: ['evaporation', 'temperature'],
      falsifiableAngle: 'temperature affects evaporation rate',
    },
    sourceAnchor: SOURCE_ANCHOR,
  });
}

test('GET /api/v1/report/:runId returns 404 when no evidence_log records exist', async () => {
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
      url: '/api/v1/report/empty-run',
    });
    assert.equal(response.statusCode, 404);
    const body = response.json() as { error_code: string };
    assert.equal(body.error_code, 'NOT_FOUND');
  } finally {
    await app.close();
    db.close();
  }
});

test('GET /api/v1/report/:runId returns 200 + text/html audit report when records exist', async () => {
  const db = openDb();
  seedUnderstandingEvidence(db, 'ev-report-001', 'How does temperature affect water evaporation rate?');

  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/report/run-001',
    });
    assert.equal(response.statusCode, 200);
    assert.match(response.headers['content-type'] ?? '', /text\/html/);
    // 自包含 HTML 文档（前端 sandboxed iframe srcdoc 渲染所需）
    assert.ok(response.body.startsWith('<!DOCTYPE html>'), 'HTML report must start with DOCTYPE');
  } finally {
    await app.close();
    db.close();
  }
});

test('GET /api/v1/report/:runId HTML body contains audit report markers', async () => {
  const db = openDb();
  seedUnderstandingEvidence(db, 'ev-report-html', 'What causes pulsar timing irregularities?');

  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/report/run-html',
    });
    assert.equal(response.statusCode, 200);
    const body = response.body;
    // 报告头 + runId 回显 + 裁决统计 + 哈希链段（renderHtml 产出的确定性标记）
    assert.ok(body.includes('FAR-Chain 研究报告'), 'must render report title');
    assert.ok(body.includes('run-html'), 'must echo runId');
    assert.ok(body.includes('裁决统计'), 'must render verdict summary section');
    assert.ok(body.includes('哈希链校验结果'), 'must render hash-chain section');
    assert.ok(body.includes('</html>'), 'must be a complete HTML document');
  } finally {
    await app.close();
    db.close();
  }
});

test('GET /api/v1/report/:runId/paper returns 200 + application/json ResearchPaperOutput', async () => {
  const db = openDb();
  seedUnderstandingEvidence(db, 'ev-report-002', 'What causes pulsar timing irregularities?');

  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/report/run-002/paper',
    });
    assert.equal(response.statusCode, 200);
    assert.match(response.headers['content-type'] ?? '', /application\/json/);
    const body = response.json() as Record<string, unknown>;

    // ResearchPaperOutput 10 fields
    assert.ok(typeof body.paperTitle === 'string', 'paperTitle must be string');
    assert.ok(typeof body.paperAbstract === 'string', 'paperAbstract must be string');
    assert.ok(typeof body.problemStatement === 'string', 'problemStatement must be string');
    assert.ok(typeof body.rationale === 'string', 'rationale must be string');
    assert.ok(typeof body.technicalDetails === 'string', 'technicalDetails must be string');
    assert.ok(typeof body.results === 'string', 'results must be string');
    assert.ok(typeof body.iterationCount === 'number', 'iterationCount must be number');
    assert.ok(typeof body.finalVerdict === 'string', 'finalVerdict must be string');
    // datasets
    const datasets = body.datasets as { source: unknown; target: unknown };
    assert.ok(Array.isArray(datasets.source), 'datasets.source must be array');
    assert.ok(Array.isArray(datasets.target), 'datasets.target must be array');
    // methods
    assert.ok(Array.isArray(body.methods), 'methods must be array');
    // experiments
    const experiments = body.experiments as {
      baselines: unknown;
      metrics: unknown;
      expectedOutcome: unknown;
    };
    assert.ok(Array.isArray(experiments.baselines), 'experiments.baselines must be array');
    assert.ok(Array.isArray(experiments.metrics), 'experiments.metrics must be array');
    assert.ok(typeof experiments.expectedOutcome === 'string', 'experiments.expectedOutcome must be string');
    // references
    assert.ok(Array.isArray(body.references), 'references must be array');
  } finally {
    await app.close();
    db.close();
  }
});

test('GET /api/v1/report/:runId/paper finalVerdict is UNTESTED when no verdict nodes exist', async () => {
  const db = openDb();
  seedUnderstandingEvidence(db, 'ev-report-003', 'Does dark matter affect galaxy rotation curves?');

  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/report/run-003/paper',
    });
    assert.equal(response.statusCode, 200);
    const body = response.json() as { finalVerdict: string };
    assert.equal(body.finalVerdict, 'UNTESTED');
  } finally {
    await app.close();
    db.close();
  }
});

test('GET /api/v1/report/:runId/paper paperTitle derived from problemStatement (deterministic, no LLM)', async () => {
  const db = openDb();
  const problemStatement = 'The rate of enzymatic catalysis depends on temperature and pH levels';
  seedUnderstandingEvidence(db, 'ev-report-004', problemStatement);

  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/report/run-004/paper',
    });
    assert.equal(response.statusCode, 200);
    const body = response.json() as { paperTitle: string };
    // Title derived deterministically from problemStatement (first 60 chars used in title)
    assert.ok(body.paperTitle.length > 0, 'paperTitle must not be empty');
    assert.ok(body.paperTitle.includes(problemStatement.slice(0, 60)), 'paperTitle must contain problemStatement prefix');
  } finally {
    await app.close();
    db.close();
  }
});
