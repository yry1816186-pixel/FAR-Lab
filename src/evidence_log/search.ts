/**
 * evidence_log search —— FTS5 全文检索辅助层（FTS5 会话召回）。
 *
 * 动机：evidence_log 是 append-only 哈希链（可验证），但无可搜索索引。审计/竞品演示需要
 * "搜索所有 CONFIRMED 相关的引物酶活性声明"这类查询——FTS5 是 SQLite 内置，零额外依赖。
 *
 * 纪律（重要）：
 *   - FTS 索引是**检索辅助层**：不参与哈希链验证、不进 proofHash、不改变 appendEvidenceLog
 *     事务。索引可随时 `reindexEvidenceFts` 全量重建（幂等）。删除证据表不会影响验证完整性。
 *   - 确定性：FTS5 的 bm25() 排名在同一数据 + 同一 SQLite 版本下确定。
 *   - FTS5 是可选特性：老库没有 evidence_fts 表时，`ensureFtsIndex` 幂等创建后再 reindex 即可。
 */

import type Database from 'better-sqlite3';
import type { EvidenceLogEntry, EvidenceLogRow } from './types.ts';

/** FTS5 查询选项。 */
export interface EvidenceSearchOptions {
  /** 返回上限（默认 20·防失控全表）。 */
  readonly limit?: number;
  /** 按 stage_id 过滤（与 MATCH 结果 AND）。 */
  readonly stageId?: string;
  /** 按 payload_kind 过滤。 */
  readonly payloadKind?: string;
  /** 按 provenance_class 过滤。 */
  readonly provenanceClass?: string;
}

/** FTS5 命中结果（含 bm25 相关度·负数越小越相关）。 */
export interface EvidenceSearchResult {
  readonly entry: EvidenceLogEntry;
  /** FTS5 bm25 排名（负数越小越相关）。 */
  readonly score: number;
}

const DEFAULT_LIMIT = 20;

/**
 * 幂等创建 evidence_fts 虚拟表（FTS5·不依赖 external content 触发器——
 * 采用独立镜像表 + 显式 reindex，避免改动 appendEvidenceLog 的哈希链事务）。
 * evidence_id 等标识列标 UNINDEXED（不进全文索引·仅返回用）。
 */
export function ensureFtsIndex(db: Database.Database): void {
  db.exec(
    `CREATE VIRTUAL TABLE IF NOT EXISTS evidence_fts USING fts5(
      evidence_id UNINDEXED,
      stage_id UNINDEXED,
      payload_kind UNINDEXED,
      provenance_class UNINDEXED,
      evidence_payload,
      source_anchor
    )`,
  );
}

/**
 * 全量重建 FTS 索引（幂等·DELETE + INSERT SELECT 从 evidence_log 镜像）。
 * P2-A（B3-G2）规模边界声明：FTS5 虚拟表无唯一约束（INSERT OR IGNORE 无法增量去重），
 * 增量方案需 NOT IN 过滤（大表退化）或外部游标跟踪（复杂度上升）——当前证据量级（10⁴ 行，
 * 重建 <1s）下全量重建不构成悬崖，懒同步（searchEvidence 的 COUNT 比较）已将重建频率限制为
 * 「写入后首次搜索」。**当 evidence_log > 10⁵ 行时**须升级增量策略（评估 NOT IN 物化或
 * 独立 rowid 游标）——登记于 WINDOW-HANDOFF-W22（B3-G2 规模边界）。
 * @returns 本次索引的 evidence_log 行数
 */
export function reindexEvidenceFts(db: Database.Database): number {
  ensureFtsIndex(db);
  db.exec('DELETE FROM evidence_fts');
  const rows = db
    .prepare(
      `SELECT evidence_id, call_record_seq, stage_id, payload_kind, evidence_payload,
              source_anchor, source_anchor_git, source_anchor_req, source_anchor_ts,
              source_anchor_path, source_anchor_lineno, derivable, evidence_payload_hash,
              provenance_class, system_claim_hash, created_at
       FROM evidence_log
       ORDER BY created_at ASC`,
    )
    .all() as EvidenceLogRow[];
  const insert = db.prepare(
    `INSERT INTO evidence_fts (evidence_id, stage_id, payload_kind, provenance_class, evidence_payload, source_anchor)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const indexAll = db.transaction(() => {
    for (const row of rows) {
      insert.run(row.evidence_id, row.stage_id, row.payload_kind, row.provenance_class, row.evidence_payload, row.source_anchor);
    }
  });
  indexAll();
  return rows.length;
}

/**
 * 转义 FTS5 查询特殊字符（引号/括号/星号/AND OR NOT 等），使用户输入作为字面量短语搜索。
 * FTS5 短语语法：用双引号包裹并转义内部引号。
 */
export function escapeFtsQuery(query: string): string {
  // FTS5 特殊字符：双引号、括号、星号、脱字符、冒号。包裹为短语可避免语法错误与注入。
  return `"${query.replace(/"/g, '""')}"`;
}

/**
 * FTS5 全文检索 evidence_log。
 * @param query - 原始用户查询（内部自动转义为短语）
 * @returns 按 bm25 相关度升序的命中列表（负数越小越相关）
 * @throws query 为空串/纯空白时抛错（FTS5 对空 MATCH 报错）
 */
export function searchEvidence(
  db: Database.Database,
  query: string,
  options: EvidenceSearchOptions = {},
): EvidenceSearchResult[] {
  if (query.trim().length === 0) {
    throw new Error('evidence_log.searchEvidence: query must be non-empty');
  }
  ensureFtsIndex(db);
  // 审计 P0-1：懒同步——FTS 索引与 evidence_log 行数不等（新写入/删除后）→ 自动全量重建。
  // evidence_log 是 append-only 哈希链（无 UPDATE），COUNT 相等 = 镜像一致；不相等 = 陈旧。
  // 不阻塞哈希链事务（重建独立事务），写入频率低 → 每次 search 前 COUNT 比较（O(1)）成本可忽略。
  const logCount = (db.prepare('SELECT COUNT(*) AS c FROM evidence_log').get() as { c: number }).c;
  const ftsCount = (db.prepare('SELECT COUNT(*) AS c FROM evidence_fts').get() as { c: number }).c;
  if (logCount !== ftsCount) {
    reindexEvidenceFts(db);
  }
  const limit = options.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error('evidence_log.searchEvidence: limit must be an integer in [1, 200]');
  }

  const conditions: string[] = [];
  const params: unknown[] = [];
  const escaped = escapeFtsQuery(query.trim());

  if (options.stageId !== undefined) {
    conditions.push('stage_id = ?');
    params.push(options.stageId);
  }
  if (options.payloadKind !== undefined) {
    conditions.push('payload_kind = ?');
    params.push(options.payloadKind);
  }
  if (options.provenanceClass !== undefined) {
    conditions.push('provenance_class = ?');
    params.push(options.provenanceClass);
  }
  const whereClause = conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : '';

  const rows = db
    .prepare(
      `SELECT evidence_id, stage_id, payload_kind, provenance_class,
              evidence_payload, source_anchor, bm25(evidence_fts) AS score
       FROM evidence_fts
       WHERE evidence_fts MATCH ?${whereClause}
       ORDER BY score ASC
       LIMIT ?`,
    )
    .all(escaped, ...params, limit) as Array<{
    evidence_id: string;
    stage_id: string;
    payload_kind: string;
    provenance_class: string;
    evidence_payload: string;
    source_anchor: string;
    score: number;
  }>;

  return rows.map((row) => {
    const entry: EvidenceLogEntry = {
      evidenceId: row.evidence_id,
      callRecordSeq: -1, // FTS 镜像不含 call_record_seq（检索辅助层·非验证输入）
      stageId: row.stage_id,
      payloadKind: row.payload_kind as EvidenceLogEntry['payloadKind'],
      evidencePayload: row.evidence_payload,
      sourceAnchor: parseSearchSourceAnchor(row.source_anchor),
      createdAt: '',
      derivable: 0,
      evidencePayloadHash: null,
      provenanceClass: row.provenance_class as EvidenceLogEntry['provenanceClass'],
      systemClaimHash: null,
    };
    return { entry, score: row.score };
  });
}

function parseSearchSourceAnchor(text: string): EvidenceLogEntry['sourceAnchor'] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // 解析失败 → 直接回退（容错：审计查询不应因单条 anchor 格式异常而中断）
    return FALLBACK_ANCHOR;
  }
  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;
    if (
      typeof record.gitCommitSha === 'string' &&
      typeof record.isoTimestamp === 'string' &&
      typeof record.rawResponseHash === 'string' &&
      (record.dashscopeRequestId === null || typeof record.dashscopeRequestId === 'string')
    ) {
      return {
        gitCommitSha: record.gitCommitSha,
        dashscopeRequestId: record.dashscopeRequestId as string | null,
        isoTimestamp: record.isoTimestamp,
        rawResponseHash: record.rawResponseHash,
      };
    }
  }
  return FALLBACK_ANCHOR;
}

const FALLBACK_ANCHOR: EvidenceLogEntry['sourceAnchor'] = {
  gitCommitSha: '',
  dashscopeRequestId: null,
  isoTimestamp: '',
  rawResponseHash: '',
};
