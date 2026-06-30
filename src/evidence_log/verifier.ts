import type Database from 'better-sqlite3';
import { canonicalHash } from './hasher.ts';
import { rowToCallRecord } from './repository.ts';
import {
  GENESIS_PREV_HASH,
} from './types.ts';
import type {
  CallRecordHashRow,
  VerifyResult,
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
