/**
 * verdict_nodes 链验证器（P0-2-EXT）—— 重算每条 verdict_node 的 current_hash + 校验 prev_hash 链式链接。
 *
 * 与 evidence_log/verifier.ts verifyChainHead 互补：后者验 call_records 链（LLM-call audit），
 * 本函数验 verdict_nodes 链（裁决落库链）。两者独立——`far verify --mode chain` 当前只跑 call_records；
 * verdict_nodes 验证由本函数提供（测试 + 未来 CLI mode 接线用）。
 *
 * 重算白名单（须与 repository.ts recordVerdict 的 hashCanonicalJson 输入逐字一致·R6 双口径禁令的同款约束）：
 *   { verdictId, evidenceId, nodeKind, verdict, falsificationSpecJson, thresholdSpecJson,
 *     sourceAnchorJson, prevHash, verdictTraceHash }
 * verdictTraceHash 是 P0-2-EXT 新增项——篡改 verdict_trace_json → verdict_trace_hash 变 → current_hash 变 → 此处捕获。
 *
 */

import type Database from 'better-sqlite3';
import { hashCanonicalJson } from '../evidence_log/hasher.ts';
import { GENESIS_PREV_HASH } from '../evidence_log/types.ts';

export interface VerdictVerifyResult {
  readonly ok: boolean;
  /** 链断/失配的 verdict_id（ok=true 时为 null）。 */
  readonly brokenAtVerdictId: string | null;
  readonly expectedHash: string | null;
  readonly actualHash: string | null;
  readonly verifiedCount: number;
}

interface VerdictHashRow {
  readonly verdict_id: string;
  readonly evidence_id: string;
  readonly node_kind: string;
  readonly verdict: string;
  readonly falsification_spec: string;
  readonly threshold_spec: string | null;
  readonly source_anchor: string;
  readonly verdict_trace_hash: string;
  readonly prev_hash: string;
  readonly current_hash: string;
}

function recomputeVerdictHash(row: VerdictHashRow): string {
  return hashCanonicalJson({
    verdictId: row.verdict_id,
    evidenceId: row.evidence_id,
    nodeKind: row.node_kind,
    verdict: row.verdict,
    falsificationSpecJson: row.falsification_spec,
    thresholdSpecJson: row.threshold_spec,
    sourceAnchorJson: row.source_anchor,
    prevHash: row.prev_hash,
    verdictTraceHash: row.verdict_trace_hash,
  });
}

export function verifyVerdictNodes(db: Database.Database): VerdictVerifyResult {
  const rows = db
    .prepare(
      `SELECT verdict_id, evidence_id, node_kind, verdict, falsification_spec,
              threshold_spec, source_anchor, verdict_trace_hash, prev_hash, current_hash
       FROM verdict_nodes
       ORDER BY created_at ASC, verdict_id ASC`,
    )
    .all() as VerdictHashRow[];

  let expectedPrevHash = GENESIS_PREV_HASH;
  let verifiedCount = 0;

  for (const row of rows) {
    if (row.prev_hash !== expectedPrevHash) {
      return {
        ok: false,
        brokenAtVerdictId: row.verdict_id,
        expectedHash: expectedPrevHash,
        actualHash: row.prev_hash,
        verifiedCount,
      };
    }

    const recomputed = recomputeVerdictHash(row);
    if (recomputed !== row.current_hash) {
      return {
        ok: false,
        brokenAtVerdictId: row.verdict_id,
        expectedHash: recomputed,
        actualHash: row.current_hash,
        verifiedCount,
      };
    }

    expectedPrevHash = row.current_hash;
    verifiedCount += 1;
  }

  return {
    ok: true,
    brokenAtVerdictId: null,
    expectedHash: null,
    actualHash: null,
    verifiedCount,
  };
}
