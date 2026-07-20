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
