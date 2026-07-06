/**
 * verdict_lookup —— 判定节点查询辅助层。
 *
 * 设计理由：
 *   - falsifiability 模块导出 getVerdict(db, verdictId)，但无 by_evidence_id 查询。
 *   - API 层需要「按 evidenceId 查判定节点」能力（hypothesize 路由用）。
 *   - 本文件只读查询 verdict_nodes 表 + 复用 falsifiability.getVerdict 解析行。
 *
 * 模型中立（24§0.1 红线）：无 Qwen / 百炼 / DashScope 字面量。
 * 红线合规：本文件路径含 verdict 字样是文件名（非代码标识符）·URL 路径段同理豁免。
 *
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

import type { Database } from 'better-sqlite3';

import { getVerdict } from '../../falsifiability/repository.ts';
import type { HonestVerdictNode } from '../type_aliases.ts';

/**
 * 按 evidenceId 查询最早的判定节点。
 *
 * @param db 数据库实例
 * @param evidenceId 证据 ID
 * @returns 判定节点（无关联记录时返回 null）
 */
export function fetchHonestVerdictByEvidenceId(
  db: Database,
  evidenceId: string,
): HonestVerdictNode | null {
  const row = db
    .prepare('SELECT verdict_id FROM verdict_nodes WHERE evidence_id = ? ORDER BY created_at ASC LIMIT 1')
    .get(evidenceId) as { verdict_id?: string } | undefined;
  if (row === undefined || row.verdict_id === undefined) {
    return null;
  }
  return getVerdict(db, row.verdict_id);
}

/**
 * 按 verdictId 查询判定节点。
 */
export function fetchHonestVerdictById(
  db: Database,
  verdictId: string,
): HonestVerdictNode | null {
  return getVerdict(db, verdictId);
}

/**
 * 列出全部判定节点（分页·可选 verdict 值过滤）。
 *
 * @param db 数据库实例
 * @param limit 上限（默认 100）
 * @param offset 偏移（默认 0）
 * @param verdictFilter 可选判定值过滤（CONFIRMED/REFUTED/INCONCLUSIVE/DEGRADED_SCOPE/UNTESTED）
 * @returns 判定节点列表
 */
export function listHonestVerdicts(
  db: Database,
  limit = 100,
  offset = 0,
  verdictFilter?: string,
): readonly HonestVerdictNode[] {
  let query: string;
  let params: (number | string)[];
  if (verdictFilter !== undefined) {
    query = 'SELECT verdict_id FROM verdict_nodes WHERE verdict = ? ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params = [verdictFilter, limit, offset];
  } else {
    query = 'SELECT verdict_id FROM verdict_nodes ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params = [limit, offset];
  }
  const rows = db
    .prepare(query)
    .all(...params) as ReadonlyArray<{ verdict_id: string }>;
  return rows
    .map((row) => getVerdict(db, row.verdict_id))
    .filter((v): v is HonestVerdictNode => v !== null);
}

/**
 * 按假设 evidenceId 列表查询关联判定节点（GET /verdict/by_hypothesis 用）。
 *
 * 假设 evidenceId 来自 stage3_hypothesis call_record → evidence_log 链。
 * 本函数接受任意 evidenceId 列表，返回所有关联的判定节点。
 */
export function fetchHonestVerdictsByHypothesisEvidence(
  db: Database,
  hypoEvidenceIds: readonly string[],
): readonly HonestVerdictNode[] {
  if (hypoEvidenceIds.length === 0) {
    return [];
  }
  const placeholders = hypoEvidenceIds.map(() => '?').join(', ');
  const rows = db
    .prepare(`SELECT DISTINCT evidence_id FROM verdict_nodes WHERE evidence_id IN (${placeholders})`)
    .all(...hypoEvidenceIds) as ReadonlyArray<{ evidence_id: string }>;
  return rows
    .map((row) => fetchHonestVerdictByEvidenceId(db, row.evidence_id))
    .filter((v): v is HonestVerdictNode => v !== null);
}
