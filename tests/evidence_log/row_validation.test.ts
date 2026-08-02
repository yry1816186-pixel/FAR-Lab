/**
 * row_validation.test.ts — evidence_log 行解析防御守卫(防御纵深·fail-closed on corrupt DB row)。
 *
 * rowToCallRecord / rowToEvidenceLogEntry 对 DB 行字段做 fail-closed 校验:
 *   - payload_kind / purpose_tag 非合法枚举 → 抛 invalid payload_kind/purpose_tag;
 *   - codeLocation 非法形状 → 抛 codeLocation invalid/filePath missing/location missing/lineNumber invalid。
 * 此前零测覆盖(应用层 CHECK 约束阻止非法值入库,但这些守卫防 DB 文件级篡改/直接 SQL 旁路)。
 * 本文件直接构造畸形行对象调用导出的纯函数验证守卫 fire。
 *
 * 零容忍合规：无 any / @ts-ignore / 空 catch / 桩。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rowToCallRecord,
  rowToEvidenceLogEntry,
} from '../../src/evidence_log/repository.ts';
import type { CallRecordHashRow, EvidenceLogRow } from '../../src/evidence_log/types.ts';

/** 构造合法 CallRecordHashRow(供 override 单字段触发校验)。 */
function validHashRow(overrides: Partial<CallRecordHashRow> = {}): CallRecordHashRow {
  return {
    seq: 1,
    stage_id: 'stage1',
    payload_kind: 'hypothesis',
    purpose_tag: 'hypothesis',
    model_id: 'offline-replay-fixture',
    dashscope_request_id: null,
    repro_hash: 'a'.repeat(64),
    git_commit_sha: 'b'.repeat(40),
    iso_timestamp: '2026-08-02T00:00:00.000Z',
    degraded_from: null,
    prev_hash: '0'.repeat(64),
    current_hash: 'c'.repeat(64),
    created_at: '2026-08-02T00:00:00.000Z',
    ...overrides,
  };
}

test('rowToCallRecord: payload_kind 非合法枚举 → invalid payload_kind(防 DB 文件级篡改)', () => {
  assert.throws(
    () => rowToCallRecord(validHashRow({ payload_kind: 'bogus_invalid_kind' })),
    /invalid payload_kind/,
    '非法 payload_kind 须 fail-closed 抛错',
  );
});

test('rowToCallRecord: purpose_tag 非合法枚举 → invalid purpose_tag', () => {
  assert.throws(
    () => rowToCallRecord(validHashRow({ purpose_tag: 'bogus_invalid_tag' })),
    /invalid purpose_tag/,
    '非法 purpose_tag 须 fail-closed 抛错',
  );
});

test('rowToCallRecord: 合法行正常解析(回归基线)', () => {
  const result = rowToCallRecord(validHashRow());
  assert.equal(result.payloadKind, 'hypothesis');
  assert.equal(result.purposeTag, 'hypothesis');
  assert.equal(result.stageId, 'stage1');
  assert.equal(result.seq, 1);
});

/** 构造合法 EvidenceLogRow(供 override codeLocation 触发校验)。
 *  source_anchor 是 JSON 字符串,parseCodeLocation 从其中 record.codeLocation 解析。 */
function validEvidenceRow(codeLocation: unknown): EvidenceLogRow {
  const sourceAnchor = JSON.stringify({
    gitCommitSha: 'b'.repeat(40),
    dashscopeRequestId: null,
    isoTimestamp: '2026-08-02T00:00:00.000Z',
    rawResponseHash: 'c'.repeat(64),
    codeLocation,
  });
  return {
    evidence_id: 'EV-TEST',
    call_record_seq: 1,
    stage_id: 'stage1',
    payload_kind: 'hypothesis',
    evidence_payload: '{}',
    source_anchor: sourceAnchor,
    source_anchor_git: 'b'.repeat(40),
    source_anchor_req: null,
    source_anchor_ts: '2026-08-02T00:00:00.000Z',
    source_anchor_path: null,
    source_anchor_lineno: null,
    derivable: 0,
    evidence_payload_hash: 'd'.repeat(64),
    provenance_class: 'model_asserted',
    system_claim_hash: null,
    created_at: '2026-08-02T00:00:00.000Z',
  };
}

test('rowToEvidenceLogEntry: codeLocation 非对象 → codeLocation invalid', () => {
  assert.throws(
    () => rowToEvidenceLogEntry(validEvidenceRow('not-an-object')),
    /codeLocation invalid/,
  );
});

test('rowToEvidenceLogEntry: codeLocation 缺 filePath → filePath missing', () => {
  assert.throws(
    () => rowToEvidenceLogEntry(validEvidenceRow({ location: 'fn' })),
    /filePath missing/,
  );
});

test('rowToEvidenceLogEntry: codeLocation 缺 location → location missing', () => {
  assert.throws(
    () => rowToEvidenceLogEntry(validEvidenceRow({ filePath: 'a.ts' })),
    /location missing/,
  );
});

test('rowToEvidenceLogEntry: codeLocation lineNumber 非有限数 → lineNumber invalid', () => {
  assert.throws(
    () => rowToEvidenceLogEntry(validEvidenceRow({ filePath: 'a.ts', location: 'fn', lineNumber: 'bad' })),
    /lineNumber invalid/,
  );
});
