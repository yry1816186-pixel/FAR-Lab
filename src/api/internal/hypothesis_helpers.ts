/**
 * hypothesis_helpers —— hypothesize 路由辅助函数。
 *
 * 设计理由：
 *   - extractHypothesisEvidenceId + buildSubtreeFromEvidence 是 hypothesize 路由的
 *     内部辅助函数，抽出独立文件便于测试与维护。
 *
 * 模型中立（24§0.1 红线）：无 Qwen / 百炼 / DashScope 字面量。
 *
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

import type { Database } from 'better-sqlite3';

import type { LoopState } from '../../agent_loop/types.ts';
import { getSubtree } from './graph_subtree.ts';
import type { GraphSubtree } from '../types.ts';

/**
 * 从 DB 查询 stage3_hypothesis 关联的 evidenceId。
 *
 * runAgentLoop 落 call_records（stage_id='stage3_hypothesis'）→ 若有 evidence_log 关联，
 * 取最新一条 evidence_id（多轮迭代取最新假设）。
 *
 * 注意：当前 runStage 只调 appendLlmResponseRecord（落 call_records），不调 appendEvidenceLog。
 * 故无 evidence_log 行时返回 null（graphSubtree 为空·honestVerdict 为 null）。
 */
export function extractHypothesisEvidenceId(db: Database, loopState: LoopState): string | null {
  void loopState;
  const row = db
    .prepare(
      `SELECT e.evidence_id AS evidence_id
       FROM evidence_log e
       JOIN call_records c ON e.call_record_seq = c.seq
       WHERE c.stage_id = 'stage3_hypothesis'
       ORDER BY c.seq DESC
       LIMIT 1`,
    )
    .get() as { evidence_id?: string } | undefined;
  if (row === undefined || row.evidence_id === undefined) {
    return null;
  }
  return row.evidence_id;
}

/**
 * 从 evidenceId 出发构建图子树。
 *
 * evidenceId → verdict_nodes（按 evidence_id 查）→ getSubtree(rootVerdictId)。
 */
export function buildSubtreeFromEvidence(db: Database, evidenceId: string): GraphSubtree {
  const row = db
    .prepare('SELECT verdict_id FROM verdict_nodes WHERE evidence_id = ? AND superseded_by IS NULL ORDER BY created_at DESC, verdict_id DESC LIMIT 1')
    .get(evidenceId) as { verdict_id?: string } | undefined;
  if (row === undefined || row.verdict_id === undefined) {
    return { rootId: evidenceId, nodes: [], edges: [] };
  }
  return getSubtree(db, row.verdict_id);
}
