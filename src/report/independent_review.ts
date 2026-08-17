// src/report/independent_review.ts
// 职责：CORE-TOOL-001 —— 报告工具事件与真实日志对拍 + 关键事实第二路径独立复核。
//
// 两条腿：
//   1. reconcileCallRecords：报告引用的调用记录 ↔ call_records 原始行对拍
//      （seq 集合一致 / stage+时间戳逐行一致 / measured=0 伪 token 必须走伪计量口径，
//       不得冒充真实调用计量——反剧场红线）。
//   2. independentFactReview：对报告的关键事实（裁决计数/源锚点数/伪 token 总量）用
//      与 generateReport 查询路径不同的独立 SQL 重算对拍（第二路径复核）。
//
// 本模块不能证明的：call_records 行本身的真实性（那是哈希链 verifyChain 的职责）；
// 此处证明「报告 faithfully 反映了库内记录」。

import type Database from 'better-sqlite3';
import type { ReportData } from './types.ts';

// ---------------------------------------------------------------------------
// 1. 工具事件对账
// ---------------------------------------------------------------------------

export interface CallRecordReconciliation {
  /** 报告侧可见的 seq 集合与库内不一致（报告引用了不存在的事件/漏报事件）。 */
  readonly seqMismatches: readonly string[];
  /** stage/时间戳/model 与库内不一致的 seq。 */
  readonly fieldMismatches: readonly string[];
  /** measured=0 但被计入真实计量口径的证据（伪 token 冒充真实调用）。 */
  readonly pseudoAsReal: readonly string[];
  readonly ok: boolean;
}

export interface RawCallRecordRow {
  readonly seq: number;
  readonly stage_id: string;
  readonly model_id: string;
  readonly created_at: string;
  readonly usage_tokens_total: number | null;
  /** 与报告同口径的 measured 提取（0/1/null）。 */
  readonly measured: number | null;
}

/**
 * 对拍：报告的 stage 摘要所依据的调用记录（reportRecords）vs 库内原始行。
 * reportRecords 来自 queryCallRecords（报告的真实数据源），库内行由调用方另行直查。
 */
export function reconcileCallRecords(
  reportRecords: readonly RawCallRecordRow[],
  dbRows: readonly RawCallRecordRow[],
  reportPseudoTokenTotal: number,
): CallRecordReconciliation {
  const seqMismatches: string[] = [];
  const fieldMismatches: string[] = [];
  const pseudoAsReal: string[] = [];

  const dbBySeq = new Map(dbRows.map((r) => [r.seq, r]));
  const reportSeqs = new Set(reportRecords.map((r) => r.seq));

  for (const r of reportRecords) {
    const dbRow = dbBySeq.get(r.seq);
    if (dbRow === undefined) {
      seqMismatches.push(`seq ${r.seq} present in report source but missing from call_records`);
      continue;
    }
    if (dbRow.stage_id !== r.stage_id || dbRow.created_at !== r.created_at || dbRow.model_id !== r.model_id) {
      fieldMismatches.push(`seq ${r.seq}: stage/model/created_at drift (report ${r.stage_id}/${r.model_id}/${r.created_at} vs db ${dbRow.stage_id}/${dbRow.model_id}/${dbRow.created_at})`);
    }
  }
  for (const row of dbRows) {
    if (!reportSeqs.has(row.seq)) {
      seqMismatches.push(`seq ${row.seq} in call_records but absent from report source`);
    }
  }

  // 伪 token 口径：库内 measured=0 的 usage 总和必须等于报告的伪计量口径
  // （generateReport 的 pseudoTokens 分道）。若报告把伪 token 计入真实口径，
  // 表现为 reportPseudoTokenTotal < 库内伪总量（少认）——两边都必须相等。
  const dbPseudoTotal = dbRows
    .filter((r) => r.measured === 0)
    .reduce((sum, r) => sum + (r.usage_tokens_total ?? 0), 0);
  if (dbPseudoTotal !== reportPseudoTokenTotal) {
    pseudoAsReal.push(
      `pseudo-token accounting drift: report lane ${reportPseudoTokenTotal} vs db measured=0 total ${dbPseudoTotal} (pseudo tokens must never enter the real-metering lane)`,
    );
  }

  return {
    seqMismatches,
    fieldMismatches,
    pseudoAsReal,
    ok: seqMismatches.length === 0 && fieldMismatches.length === 0 && pseudoAsReal.length === 0,
  };
}

// ---------------------------------------------------------------------------
// 2. 关键事实第二路径复核
// ---------------------------------------------------------------------------

export interface FactCheck {
  readonly fact: string;
  readonly reportValue: number;
  readonly independentValue: number;
  readonly ok: boolean;
}

export interface IndependentReviewResult {
  readonly checks: readonly FactCheck[];
  readonly ok: boolean;
}

/**
 * 独立第二路径：用与 generateReport 不同的 SQL 形态重算报告关键事实并逐一对拍。
 *   - verdictSummary 每档计数：报告侧 reduce vs 独立 GROUP BY；
 *   - sourceAnchorCount：报告侧计数 vs 独立 COUNT(*)；
 *   - 伪 token 总量：报告分道 vs 独立 SUM。
 * 差一项即 ok=false（fail-closed：报告与库的任何漂移都是不可信信号）。
 */
export function independentFactReview(
  db: Database.Database,
  report: ReportData,
  reportPseudoTokenTotal: number,
): IndependentReviewResult {
  const checks: FactCheck[] = [];

  const verdictRows = db
    .prepare('SELECT verdict, COUNT(*) AS c FROM verdict_nodes GROUP BY verdict')
    .all() as readonly { verdict: string; c: number }[];
  const independentVerdicts = new Map(verdictRows.map((r) => [r.verdict, r.c]));
  for (const [kind, reportCount] of Object.entries(report.verdictSummary)) {
    const independent = independentVerdicts.get(kind) ?? 0;
    checks.push({
      fact: `verdictSummary.${kind}`,
      reportValue: reportCount,
      independentValue: independent,
      ok: reportCount === independent,
    });
  }

  const anchorCount = (db.prepare('SELECT COUNT(*) AS c FROM evidence_log').get() as { c: number }).c;
  checks.push({
    fact: 'sourceAnchorCount',
    reportValue: report.sourceAnchorCount,
    independentValue: anchorCount,
    ok: report.sourceAnchorCount === anchorCount,
  });

  const pseudoRow = db
    .prepare(
      `SELECT COALESCE(SUM(usage_tokens_total), 0) AS t FROM call_records WHERE json_extract(response_payload, '$.credential.tokenUsage.measured') = false`,
    )
    .get() as { t: number };
  checks.push({
    fact: 'pseudoTokenTotal',
    reportValue: reportPseudoTokenTotal,
    independentValue: pseudoRow.t,
    ok: reportPseudoTokenTotal === pseudoRow.t,
  });

  return { checks, ok: checks.every((c) => c.ok) };
}


/**
 * CORE-TOOL-001 对账数据源：报告口径的调用记录行（measured 由 response_payload 提取，
 * 与 generator.extractMeasuredFlag 同规则）+ 伪 token 分道总量。
 */
export function reportCallRecordSource(
  db: Database.Database,
): { readonly rows: readonly RawCallRecordRow[]; readonly pseudoTokenTotal: number } {
  const rows = (
    db
      .prepare(
        `SELECT seq, stage_id, model_id, created_at, usage_tokens_total, response_payload FROM call_records ORDER BY seq ASC`,
      )
      .all() as readonly (Record<string, unknown>)[]
  ).map((row) => {
    let measured: number | null = null;
    try {
      const payload = JSON.parse(String(row.response_payload)) as { credential?: { tokenUsage?: { measured?: boolean } } };
      if (payload.credential?.tokenUsage?.measured === false) measured = 0;
      else if (payload.credential?.tokenUsage?.measured === true) measured = 1;
    } catch {
      measured = null;
    }
    return {
      seq: Number(row.seq),
      stage_id: String(row.stage_id),
      model_id: String(row.model_id),
      created_at: String(row.created_at),
      usage_tokens_total: row.usage_tokens_total === null ? null : Number(row.usage_tokens_total),
      measured,
    };
  });
  return {
    rows,
    pseudoTokenTotal: rows.filter((r) => r.measured === 0).reduce((sum, r) => sum + (r.usage_tokens_total ?? 0), 0),
  };
}
