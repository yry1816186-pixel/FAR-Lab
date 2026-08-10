/**
 * report_coverage.test.ts — L2 coverage 补充（Z16 Core branch ≥75%）。
 *
 * report 路由（src/api/routes/report.ts）缺失分支（对照 coverage_gate
 * uncovered lines 116-117 120-121 133 157-158 161-162 190 230-231）：
 *   1. evidence_payload 损坏 JSON → parseStructuredPayload catch → null（116-117）
 *      → 全损坏时 /paper 404（230-231）；
 *   2. evidence_payload 合法 JSON 但 zod reparse 失败 → null（120-121）；
 *   3. 混合记录：损坏行被跳过、正常行保留 → /paper 200（157-158 null 分支 + 非 404）；
 *   4. verdict_nodes 有记录 → fetchLatestVerdict 走 getVerdict 路径（190）
 *      → finalVerdict 反映真实裁决。
 *
 * 注入手段说明：
 *   - 120-121：appendEvidenceLog 的 evidencePayload 类型为宽容的
 *     Record<string, unknown>（repository.ts:158），可经公开 API 写入
 *     「缺 zod 必填字段」的 payload——读回 reparse 失败，无需绕过任何约束。
 *   - 116-117：evidence_log 触发器仅禁 UPDATE/DELETE（0001:85-95），
 *     不拦 INSERT；直接 INSERT 非法 JSON 模拟「历史遗留损坏行」（与 resume
 *     测试篡改收据文件同性质：验证 fail-safe 处理）。
 *   - 133/161-162（parseKnownPayloadKind null）：payload_kind 列有
 *     CHECK 约束（0001:64-68 九值白名单）+ appendEvidenceLog 内部 parsePayloadKind
 *     校验（repository.ts:199）→ 该分支设计上不可达（防御性死代码），不硬凑。
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
import { FIXTURE_VERDICT_TRACE } from '../falsifiability/_verdict_trace_fixture.ts';
import type {
  AppendRecordOptions,
  ProviderNeutralCredential,
  CallAuditData,
  SourceAnchor,
} from '../../src/evidence_log/index.ts';
import type {
  FalsificationSpec,
  ThresholdSpec,
} from '../../src/falsifiability/types.ts';

const OFFLINE_OPTIONS: AppendRecordOptions = {
  providerProfile: 'offline_replay',
};

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

/** 创建一条合法 understanding 产物的 evidence_log 记录（供报告/paper 消费）。 */
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
      // prevHash 不显式传 → 自动接当前链头（多记录测试时链连续）
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

/**
 * 直接 INSERT 一条 evidence_log 损坏行（模拟历史遗留损坏数据：
 * evidence_payload 为非法 JSON——report 路由的健壮性正是为此设计）。
 * evidence_log 触发器禁 UPDATE/DELETE 但不禁 INSERT（append 语义）。
 */
function insertCorruptEvidenceRow(
  db: Database.Database,
  evidenceId: string,
): void {
  const record = appendRecord(
    db,
    {
      stageId: 'stage1_understanding',
      cred: credential(2),
      payloadKind: 'understanding',
      purposeTag: 'narrative',
    },
    audit(2),
    OFFLINE_OPTIONS,
  );
  db.prepare(
    `INSERT INTO evidence_log (
       evidence_id, call_record_seq, stage_id, payload_kind, evidence_payload,
       source_anchor, source_anchor_git, source_anchor_req, source_anchor_ts
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    evidenceId,
    record.seq,
    'stage1_understanding',
    'understanding',
    '{not valid json', // 非法 JSON 字节（绕过 canonical 序列化）
    JSON.stringify(SOURCE_ANCHOR),
    SOURCE_ANCHOR.gitCommitSha,
    null,
    SOURCE_ANCHOR.isoTimestamp,
  );
}

interface PaperResponseBody {
  readonly ok?: boolean;
  readonly error_code?: string;
  readonly data?: { readonly finalVerdict?: string };
}

async function getPaper(
  db: Database.Database,
  runId: string,
): Promise<{ statusCode: number; body: PaperResponseBody | null; rawBody: string }> {
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/report/${runId}/paper`,
    });
    return {
      statusCode: response.statusCode,
      body: response.body.length > 0 ? (response.json() as PaperResponseBody) : null,
      rawBody: response.body,
    };
  } finally {
    await app.close();
  }
}

test('/paper 404：evidence_payload 为损坏 JSON（parseStructuredPayload catch → null + 无合法 artifact → 404）', async () => {
  const db = openDb();
  try {
    insertCorruptEvidenceRow(db, 'ev-cov-badjson');

    const { statusCode, body, rawBody } = await getPaper(db, 'run-badjson');
    assert.equal(statusCode, 404, '损坏 payload 应整体丢弃并 404');
    assert.equal(body?.error_code, 'NOT_FOUND', '404 body 须为 NOT_FOUND 错误响应');
    assert.ok(rawBody.includes('NOT_FOUND'), '错误码须出现在响应体中');
  } finally {
    db.close();
  }
});

test('/paper 404：evidence_payload 合法 JSON 但 zod reparse 失败（缺必填字段 → null → 404）', async () => {
  const db = openDb();
  try {
    const record = appendRecord(
      db,
      {
        stageId: 'stage1_understanding',
        cred: credential(1),
        payloadKind: 'understanding',
        purposeTag: 'narrative',
      },
      audit(1),
      OFFLINE_OPTIONS,
    );
    // kind=understanding 但缺 problemStatement/scope 等必填字段 → UnderstandingSchema safeParse 失败
    appendEvidenceLog(db, {
      callRecordSeq: record.seq,
      evidenceId: 'ev-cov-badshape',
      evidencePayload: { kind: 'understanding' },
      sourceAnchor: SOURCE_ANCHOR,
    });

    const { statusCode } = await getPaper(db, 'run-badshape');
    assert.equal(statusCode, 404, 'reparse 失败 payload 应整体丢弃并 404');
  } finally {
    db.close();
  }
});

test('/paper 200：混合记录——损坏 JSON 行被跳过、正常行保留（157-158 null 分支 + 非 404 分支）', async () => {
  const db = openDb();
  try {
    seedUnderstandingEvidence(db, 'ev-cov-good', 'The rate of enzymatic catalysis depends on temperature and pH');
    insertCorruptEvidenceRow(db, 'ev-cov-bad');

    const { statusCode, body } = await getPaper(db, 'run-mixed-json');
    assert.equal(statusCode, 200, '存在合法行时损坏行须被跳过而非整体 404');
    assert.ok(body !== null && body.ok === true, '200 body 须 ok=true');
    assert.equal(typeof body.data?.finalVerdict, 'string', 'finalVerdict 须存在');
  } finally {
    db.close();
  }
});

test('/paper 200：混合记录——reparse 失败行被跳过、正常行保留（120-121 null 分支 + 非 404）', async () => {
  const db = openDb();
  try {
    seedUnderstandingEvidence(db, 'ev-cov-good2', 'How does pressure affect boiling point?');
    const record = appendRecord(
      db,
      {
        stageId: 'stage1_understanding',
        cred: credential(3),
        payloadKind: 'understanding',
        purposeTag: 'narrative',
      },
      audit(3),
      OFFLINE_OPTIONS,
    );
    appendEvidenceLog(db, {
      callRecordSeq: record.seq,
      evidenceId: 'ev-cov-badshape2',
      evidencePayload: { kind: 'understanding' },
      sourceAnchor: SOURCE_ANCHOR,
    });

    const { statusCode, body } = await getPaper(db, 'run-mixed-shape');
    assert.equal(statusCode, 200, '存在合法行时 reparse 失败行须被跳过');
    assert.ok(body !== null && body.ok === true, '200 body 须 ok=true');
  } finally {
    db.close();
  }
});

test('/paper 200 + 真实裁决：verdict_nodes 有记录 → fetchLatestVerdict 走 getVerdict 路径（190）', async () => {
  const db = openDb();
  try {
    const evidenceId = 'ev-cov-verdict';
    seedUnderstandingEvidence(db, evidenceId, 'Does temperature affect evaporation rate?');
    recordVerdict(db, {
      evidenceId,
      parentVerdictId: null,
      nodeKind: 'hypothesis',
      verdict: 'REFUTED',
      falsificationSpec: FALSIFICATION_SPEC,
      thresholdSpec: THRESHOLD_SPEC,
      metricValue: 0.9,
      conflictingEvidenceCount: 0,
      scopeSlipText: null,
      untestedReason: null,
      sourceAnchor: SOURCE_ANCHOR,
      replayProver: null,
      verdictTrace: FIXTURE_VERDICT_TRACE,
    });

    const { statusCode, body } = await getPaper(db, 'run-with-verdict');
    assert.equal(statusCode, 200);
    assert.ok(body !== null && body.ok === true, '200 body 须 ok=true');
    assert.equal(body.data?.finalVerdict, 'REFUTED', 'finalVerdict 须反映 verdict_nodes 中的真实裁决');
  } finally {
    db.close();
  }
});
