/**
 * /metrics 端点测试（阶段 7 P2-A · D1-1 修复回归载体）。
 *
 * 覆盖：
 *   1. GET /metrics → 200 + text/plain + Prometheus 样本行（uptime/memory/evidence_log/call_record/verdict 五值）。
 *   2. 业务指标与 DB 实际行数一致（确定性）。
 *   3. DB 不可用时 → 500（可观测面诚实·不伪装）。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runMigrations } from '../../src/db/index.ts';
import { buildServer } from '../../src/api/server.ts';
import { appendEvidenceLog, appendRecord } from '../../src/evidence_log/index.ts';
import type {
  AppendRecordOptions,
  ProviderNeutralCredential,
  CallAuditData,
} from '../../src/evidence_log/index.ts';

const OFFLINE: AppendRecordOptions = { providerProfile: 'offline_replay' };

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

function seedOneCallRecord(db: Database.Database): void {
  const cred: ProviderNeutralCredential = {
    modelId: 'offline-replay-fixture',
    dashscopeRequestId: null,
    reproHash: 'a'.repeat(64),
    gitCommitSha: 'b'.repeat(40),
    isoTimestamp: '2026-06-30T00:00:00.000Z',
  };
  const audit: CallAuditData = {
    requestPayload: '{"q":1}',
    responsePayload: '{"a":1}',
    finishReason: 'stop',
    usageTokensTotal: 0,
  };
  appendRecord(
    db,
    { stageId: 'stage3_hypothesis', cred, payloadKind: 'hypothesis', purposeTag: 'hypothesis' },
    audit,
    OFFLINE,
  );
}

async function fetchMetrics(db: Database.Database): Promise<{ status: number; body: string }> {
  const app = await buildServer({ db, gitCommitSha: 'b'.repeat(40), jwtSecret: null });
  try {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    return { status: res.statusCode, body: res.body };
  } finally {
    await app.close();
  }
}

test('D1-1: GET /metrics returns Prometheus text with business gauges matching DB counts', async () => {
  const db = openDb();
  try {
    seedOneCallRecord(db);
    // 追加一条 evidence_log 行（appendEvidenceLog·与 appendRecord 是两条独立路径）。
    const seq = (
      db.prepare('SELECT seq FROM call_records ORDER BY seq DESC LIMIT 1').get() as { seq: number }
    ).seq;
    appendEvidenceLog(db, {
      callRecordSeq: seq,
      evidencePayload: { kind: 'meta', note: 'metrics-test' },
      sourceAnchor: {
        gitCommitSha: 'b'.repeat(40),
        dashscopeRequestId: null,
        isoTimestamp: '2026-06-30T00:00:00.000Z',
        rawResponseHash: 'c'.repeat(64),
      },
      derivable: 0,
    });

    const { status, body } = await fetchMetrics(db);
    assert.equal(status, 200, 'metrics must be reachable');
    assert.match(body, /^# HELP far_lab_evidence_log_total/m, 'HELP lines required');
    assert.match(body, /far_lab_evidence_log_total (\d+)/m, 'evidence gauge present');
    assert.match(body, /far_lab_call_record_total (\d+)/m, 'call_record gauge present');
    assert.match(body, /far_lab_verdict_total\{verdict="CONFIRMED"\} \d+/m, 'verdict gauges present');
    const evidenceMatch = /far_lab_evidence_log_total (\d+)/m.exec(body);
    assert.ok(evidenceMatch !== null);
    assert.equal(Number(evidenceMatch[1]), 1, 'evidence gauge must match DB count (1 appended row)');
    const callMatch = /far_lab_call_record_total (\d+)/m.exec(body);
    assert.ok(callMatch !== null);
    assert.equal(Number(callMatch[1]), 1, 'call_record gauge must match DB count (1 seeded row)');
    // 五值 verdict 缺省 0（无 verdict 节点）——诚实零值而非缺行。
    for (const v of ['CONFIRMED', 'REFUTED', 'INCONCLUSIVE', 'DEGRADED_SCOPE', 'UNTESTED']) {
      assert.match(
        body,
        new RegExp(`far_lab_verdict_total\\{verdict="${v}"\\} 0`),
        `zero-valued verdict gauge for ${v}`,
      );
    }
  } finally {
    db.close();
  }
});

test('D1-1: metrics query failure returns 500 (honest observability, no masking)', async () => {
  // 闭库后查询 → COUNT 抛错 → 500。
  const db = openDb();
  const app = await buildServer({ db, gitCommitSha: 'b'.repeat(40), jwtSecret: null });
  db.close();
  try {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    assert.equal(res.statusCode, 500, 'broken DB must surface as 500');
    assert.match(res.body, /metrics query failed/, 'error body must be readable');
  } finally {
    await app.close();
  }
});
