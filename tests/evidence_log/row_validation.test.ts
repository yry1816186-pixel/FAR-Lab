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

// ── 2026-08-20 批次 10：repository mutation 补杀（parseSourceAnchor/parseCodeLocation 守卫族）──

test('mutation 补杀: 合法 sourceAnchor 正例（杀全部 typeof !==→=== 变异·变异使正例抛错）', () => {
  const row = validEvidenceRow(undefined);
  (row as { provenance_class: string }).provenance_class = 'system_derived';
  const entry = rowToEvidenceLogEntry(row);
  assert.equal(entry.sourceAnchor.gitCommitSha, 'b'.repeat(40));
  assert.equal(entry.sourceAnchor.dashscopeRequestId, null);
  assert.equal(entry.sourceAnchor.isoTimestamp, '2026-08-02T00:00:00.000Z');
  assert.equal(entry.sourceAnchor.rawResponseHash, 'c'.repeat(64));
  assert.equal(entry.sourceAnchor.codeLocation, undefined);
});

test('mutation 补杀: sourceAnchor JSON 非对象（数组/null/字符串）→ not an object（or→and 组合变异会改抛错消息路径）', () => {
  for (const bad of ['[]', 'null', '"str"', '42']) {
    const row = validEvidenceRow(undefined);
    (row as { source_anchor: string }).source_anchor = bad;
    assert.throws(() => rowToEvidenceLogEntry(row), /not an object/,
      `source_anchor=${bad} 须抛 not an object（变异后落入字段缺失路径·消息不同）`);
  }
});

test('mutation 补杀: sourceAnchor 字段类型非法 → 各自专属错误（dashscopeRequestId/时间戳/哈希）', () => {
  const withField = (patch: Record<string, unknown>) => {
    const row = validEvidenceRow(undefined);
    const anchor = JSON.parse(row.source_anchor) as Record<string, unknown>;
    (row as { source_anchor: string }).source_anchor = JSON.stringify({ ...anchor, ...patch });
    return row;
  };
  assert.throws(() => rowToEvidenceLogEntry(withField({ dashscopeRequestId: 42 })), /dashscopeRequestId invalid/,
    '数字 requestId 须拒（=== null 位点变异会让 null 正例也拒·由正例用例杀）');
  assert.throws(() => rowToEvidenceLogEntry(withField({ isoTimestamp: 123 })), /isoTimestamp missing/);
  assert.throws(() => rowToEvidenceLogEntry(withField({ rawResponseHash: null })), /rawResponseHash missing/);
  assert.throws(() => rowToEvidenceLogEntry(withField({ gitCommitSha: ['x'] })), /gitCommitSha missing/);
});

test('mutation 补杀: codeLocation 合法正例 + 非法形状（and→or 变异会让正例误拒）', () => {
  // 正例：合法 codeLocation 解析通过（变异使合法对象被拒或 lineNumber 分支放行非法值）。
  const okRow = validEvidenceRow({ filePath: 'src/a.ts', location: 'b.c', lineNumber: 3 });
  (okRow as { provenance_class: string }).provenance_class = 'system_derived';
  const ok = rowToEvidenceLogEntry(okRow);
  assert.equal(ok.sourceAnchor.codeLocation?.lineNumber, 3);
  // 负例：非对象 codeLocation。
  assert.throws(() => rowToEvidenceLogEntry(validEvidenceRow('not-an-object')), /codeLocation invalid/);
  // 负例：lineNumber 非有限数。
  assert.throws(
    () => rowToEvidenceLogEntry(validEvidenceLocation({ filePath: 'a.ts', location: 'b', lineNumber: Number.NaN })),
    /lineNumber invalid/,
  );
});

/** 构造带合法 codeLocation 的行（覆盖 validEvidenceRow 的 codeLocation 参数形状）。 */
function validEvidenceLocation(codeLocation: unknown): EvidenceLogRow {
  return validEvidenceRow(codeLocation);
}
