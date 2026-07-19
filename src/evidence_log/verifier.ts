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
