import type Database from 'better-sqlite3';
import { canonicalHash, hashCanonicalJson } from './hasher.ts';
import { rowToCallRecord } from './repository.ts';
import {
  GENESIS_PREV_HASH,
} from './types.ts';
import type {
  CallRecordHashRow,
  VerifyResult,
  VerifyEvidencePayloadResult,
  VerifyCallRecordPayloadResult,
} from './types.ts';

export function verifyChainHead(db: Database.Database): VerifyResult {
  const rows = db
    .prepare(
      `SELECT seq, stage_id, payload_kind, purpose_tag, model_id,
              dashscope_request_id, repro_hash, git_commit_sha, iso_timestamp,
              prev_hash, current_hash, created_at
       FROM call_records
       ORDER BY seq ASC`,
    )
    .all() as CallRecordHashRow[];

  let expectedPrevHash = GENESIS_PREV_HASH;
  let verifiedCount = 0;

  for (const row of rows) {
    if (row.prev_hash !== expectedPrevHash) {
      return {
        ok: false,
        brokenAtSeq: row.seq,
        expectedHash: expectedPrevHash,
        actualHash: row.prev_hash,
        verifiedCount,
      };
    }

    const canonicalInput = rowToCallRecord(row);
    const recomputedHash = canonicalHash(canonicalInput);
    if (recomputedHash !== row.current_hash) {
      return {
        ok: false,
        brokenAtSeq: row.seq,
        expectedHash: recomputedHash,
        actualHash: row.current_hash,
        verifiedCount,
      };
    }

    expectedPrevHash = row.current_hash;
    verifiedCount += 1;
  }

  return {
    ok: true,
    brokenAtSeq: null,
    expectedHash: null,
    actualHash: null,
    verifiedCount,
  };
}

interface DerivableEvidenceRow {
  readonly evidence_id: string;
  readonly evidence_payload: string;
  readonly evidence_payload_hash: string | null;
}

/**
 * FUSION-OS-10：重算 derivable=1 evidence 行的 evidence_payload_hash，比对落库 hash。
 *
 * 反剧场：append-only trigger（0001）禁 SQL UPDATE/DELETE，但 DB 文件级编辑 / future migration 误删 trigger /
 * PRAGMA 绕过可改 evidence_payload 字节而不触 trigger。本函数内容寻址重算 sha256(evidence_payload) 比对
 * evidence_payload_hash（appendEvidenceLog 写入时落），失配 → tampered。canonicalJson 幂等，故
 * hashCanonicalJson(JSON.parse(stored)) === 原 hashCanonicalJson(payload)。
 *
 * 失配 / hash 缺失（derivable=1 但 hash NULL·数据完整不变量违反）/ JSON 解析失败（篡改致非法 JSON）→ tampered。
 */
export function verifyEvidencePayloadHashes(db: Database.Database): VerifyEvidencePayloadResult {
  const rows = db
    .prepare(
      `SELECT evidence_id, evidence_payload, evidence_payload_hash
       FROM evidence_log
       WHERE derivable = 1
       ORDER BY evidence_id ASC`,
    )
    .all() as DerivableEvidenceRow[];

  const tamperedEvidenceIds: string[] = [];
  let verifiedCount = 0;

  for (const row of rows) {
    if (row.evidence_payload_hash === null) {
      // derivable=1 须有 hash（appendEvidenceLog 不变量）·NULL = 行被绕过 hash 写入路径篡改。
      tamperedEvidenceIds.push(row.evidence_id);
      continue;
    }
    let recomputed: string;
    try {
      const parsed = JSON.parse(row.evidence_payload) as Record<string, unknown>;
      recomputed = hashCanonicalJson(parsed);
    } catch {
      // evidence_payload 字节被篡改致非法 JSON → 内容寻址失配 → tampered（不静默吞解析错）。
      tamperedEvidenceIds.push(row.evidence_id);
      continue;
    }
    if (recomputed !== row.evidence_payload_hash) {
      tamperedEvidenceIds.push(row.evidence_id);
      continue;
    }
    verifiedCount += 1;
  }

  return {
    ok: tamperedEvidenceIds.length === 0,
    verifiedCount,
    tamperedEvidenceIds,
  };
}

interface CallRecordPayloadRow {
  readonly seq: number;
  readonly request_payload: string;
  readonly request_payload_hash: string | null;
  readonly response_payload: string;
  readonly response_payload_hash: string | null;
}

/**
 * IC-07(F-01 修复 · RT-04):call_records payload 内容寻址重算。
 *
 * 反剧场:verifyChainHead 的 canonical 输入只含元数据列,payload 字节不在链上;
 * append-only trigger 只防行级 UPDATE/DELETE,DROP TRIGGER(DDL)与 DB 文件级编辑可改
 * request_payload/response_payload 而不触 trigger。本函数重算 hashCanonicalJson(JSON.parse(payload))
 * 比对写入时落的 request_payload_hash/response_payload_hash,失配 → tampered 并定位 seq。
 *
 * 语义(canonicalJson 幂等):hashCanonicalJson(JSON.parse(stored)) === 写入时 hashCanonicalJson(record)。
 * 老行 hash NULL(0020 前写入)→ legacy-not-covered 计数,不计 tampered(如实标注,不谎报覆盖)。
 * payload 字节被改致非法 JSON → tampered(不静默吞解析错)。
 */
export function verifyCallRecordPayloadHashes(db: Database.Database): VerifyCallRecordPayloadResult {
  const rows = db
    .prepare(
      `SELECT seq, request_payload, request_payload_hash, response_payload, response_payload_hash
       FROM call_records
       ORDER BY seq ASC`,
    )
    .all() as CallRecordPayloadRow[];

  const tamperedSeqs: number[] = [];
  let verifiedCount = 0;
  let legacyCount = 0;

  for (const row of rows) {
    if (row.request_payload_hash === null || row.response_payload_hash === null) {
      legacyCount += 1;
      continue;
    }
    let requestOk: boolean;
    let responseOk: boolean;
    try {
      requestOk = hashCanonicalJson(JSON.parse(row.request_payload)) === row.request_payload_hash;
    } catch {
      requestOk = false; // 非法 JSON = payload 字节被篡改 → tampered
    }
    try {
      responseOk = hashCanonicalJson(JSON.parse(row.response_payload)) === row.response_payload_hash;
    } catch {
      responseOk = false;
    }
    if (!requestOk || !responseOk) {
      tamperedSeqs.push(row.seq);
      continue;
    }
    verifiedCount += 1;
  }

  return {
    ok: tamperedSeqs.length === 0,
    verifiedCount,
    legacyCount,
    tamperedSeqs,
  };
}

interface ExportAnchorRow {
  readonly seq: number;
  readonly request_payload_hash: string | null;
  readonly response_payload_hash: string | null;
}

/**
 * DEF-18(F-V04-01 ②)：DB ↔ 既有 .far-proof 导出锚比对。
 *
 * 一致伪造(攻击者按公开算法重算 payload 后同步重算 hash 列)对 IC-07 库内自验不可检——
 * hash 列刻意不进 canonical 链输入(keyless hash 固有边界)。唯一残存锚点 = 篡改**前**的导出：
 * call_records.redacted.jsonl 含 payload hash 列(篡改前导出即内容锚)。本函数把导出中每行的
 * request_payload_hash/response_payload_hash 与 DB 落库值逐 seq 比对：
 *
 *   - 失配 → 库内 payload 被一致重算伪造(篡改后 DB 的 hash ≠ 篡改前导出的 hash)→ tampered 并定位 seq；
 *   - 导出缺行(seq 多于 DB) → 导出锚行集合漂移 → tampered；
 *   - 导出行多余(DB 删尾行/锚超前) → 导出锚完整性变化 → tampered；
 *   - 老行(0020 前,hash NULL)两侧一致 → legacy-not-covered 计数。
 *
 * 注意:本比对证明「导出锚与当前 DB 的 payload 哈希一致」,即一致伪造若发生在导出**之后**则被检出;
 * 若攻击者同时重写导出锚(物理替换磁盘文件)则超出 keyless 边界(须外部冷存储,登记 DEF-18 诚实边界)。
 */
export function verifyCallRecordExportAnchor(
  db: Database.Database,
  exportedRows: readonly { readonly seq: number; readonly request_payload_hash: string | null; readonly response_payload_hash: string | null }[],
): {
  readonly ok: boolean;
  readonly verifiedCount: number;
  readonly legacyCount: number;
  readonly tamperedSeqs: readonly number[];
  readonly anchorDrift: readonly string[];
} {
  const dbRows = db
    .prepare(
      `SELECT seq, request_payload_hash, response_payload_hash
       FROM call_records
       ORDER BY seq ASC`,
    )
    .all() as ExportAnchorRow[];

  const tamperedSeqs: number[] = [];
  const anchorDrift: string[] = [];
  let legacyCount = 0;
  let comparedCount = 0;

  const dbBySeq = new Map(dbRows.map((row) => [row.seq, row]));
  const exportBySeq = new Map(exportedRows.map((row) => [row.seq, row]));

  // 导出行多于 DB：锚超前（DB 尾行被回滚/导出来自更晚状态）→ 完整性漂移。
  for (const row of exportedRows) {
    if (!dbBySeq.has(row.seq)) {
      anchorDrift.push(`export seq=${row.seq} not present in DB`);
    }
  }
  // DB 行多于导出：导出锚滞后（导出后新增调用）→ 完整性漂移。
  for (const row of dbRows) {
    if (!exportBySeq.has(row.seq)) {
      anchorDrift.push(`DB seq=${row.seq} not present in export`);
    }
  }

  for (const row of dbRows) {
    const exported = exportBySeq.get(row.seq);
    if (exported === undefined) {
      continue; // 漂移已在上方登记
    }
    if (row.request_payload_hash === null && row.response_payload_hash === null) {
      legacyCount += 1;
      continue;
    }
    const anchorRequest = exported.request_payload_hash ?? '';
    const anchorResponse = exported.response_payload_hash ?? '';
    // 空 hash 列(导出投影未纳 hash·旧锚)视为无锚可比(诚实降级,不误报)。
    if (anchorRequest === '' && anchorResponse === '') {
      continue;
    }
    comparedCount += 1;
    if (row.request_payload_hash !== anchorRequest || row.response_payload_hash !== anchorResponse) {
      tamperedSeqs.push(row.seq);
    }
  }

  return {
    ok: tamperedSeqs.length === 0 && anchorDrift.length === 0,
    verifiedCount: comparedCount,
    legacyCount,
    tamperedSeqs,
    anchorDrift,
  };
}
