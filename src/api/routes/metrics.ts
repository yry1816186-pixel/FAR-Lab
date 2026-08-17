/**
 * metrics 路由——Prometheus 文本格式指标端点。
 *
 * 背景（findings D1-1）：观测面被「事件源 → 指标 → 告警」链路的第一环封死——无
 * /metrics 端点。本路由以零新依赖（手写 Prometheus 文本格式）暴露：
 *   - 进程指标：uptime_seconds / process_resident_memory_bytes / process_heap_used_bytes
 *   - 业务指标（确定性 DB 查询·不触发 LLM）：evidence_log_total / call_record_total /
 *     verdict_total{verdict="..."} / evidence_fts_total
 *
 * 路由（无鉴权·探针豁免·与 /health 同层裸根）：GET /metrics
 * 文本格式：`name{label="v"} value`（Prometheus exposition format·每行一个样本）。
 * 诚实地量：指标是进程内可重算值（非外部监控系统数据）——部署后可被 Prometheus 抓取
 * 或由运维脚本解析；无时间序列存储（V2 项）。
 *
 * 模型中立（24§0.1 红线）：无 Qwen / 百炼 / DashScope 字面量。
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

import type { FastifyInstance } from 'fastify';
import type { Database } from 'better-sqlite3';

/** Prometheus 指标端点配置。 */
export interface MetricsRouteConfig {
  readonly db: Database;
  /** 进程启动时间戳（注入便于测试；缺省取模块加载时）。 */
  readonly processStartMs?: number;
}

const PROMETHEUS_TEXT_RESPONSE = {
  type: 'string',
  description: 'Prometheus text exposition format 0.0.4',
} as const;

const METRICS_RESPONSE_SCHEMAS = {
  200: {
    description: 'Current process and FAR-Lab database gauges',
    content: {
      'text/plain': { schema: PROMETHEUS_TEXT_RESPONSE },
    },
  },
  500: {
    description: 'Metrics collection failed; plain-text diagnostic without fabricated samples',
    content: {
      'text/plain': { schema: { type: 'string' } },
    },
  },
} as const;

/** Prometheus 文本格式单样本行。 */
function sample(name: string, value: number, label?: { name: string; value: string }): string {
  const labels = label === undefined ? '' : `{${label.name}="${label.value}"}`;
  return `${name}${labels} ${value}`;
}

/** DB 业务指标（确定性 COUNT 查询·不触发 LLM·无网络）。 */
function collectDbMetrics(config: MetricsRouteConfig): {
  evidenceLogTotal: number;
  callRecordTotal: number;
  ftsTotal: number;
  verdictByKind: Record<string, number>;
  degradationTotal: number;
  degradedScopeVerdictTotal: number;
} {
  const db = config.db;
  const evidenceLogTotal = (db.prepare('SELECT COUNT(*) AS c FROM evidence_log').get() as {
    c: number;
  }).c;
  const callRecordTotal = (db.prepare('SELECT COUNT(*) AS c FROM call_records').get() as {
    c: number;
  }).c;
  // P2-A（D2-5）：降级事件 metrics 上报——LLM fallback 链降级（degraded_from 审计列）
  // + verdict 层 DEGRADED_SCOPE 降级——退化过程可见（findings D2-5：降级无 metrics 通道）。
  const degradationTotal = (
    db
      .prepare('SELECT COUNT(*) AS c FROM call_records WHERE degraded_from IS NOT NULL')
      .get() as { c: number }
  ).c;
  const degradedScopeVerdictTotal = (
    db
      .prepare(
        "SELECT COUNT(*) AS c FROM verdict_nodes WHERE verdict = 'DEGRADED_SCOPE'",
      )
      .get() as { c: number }
  ).c;
  // FTS 表是可选特性（未启用/未创建时缺表）——sqlite_master 存在性检查后 COUNT（无副作用）。
  const ftsTableExists =
    db
      .prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'evidence_fts'")
      .get() !== undefined;
  const ftsTotal = ftsTableExists
    ? (db.prepare('SELECT COUNT(*) AS c FROM evidence_fts').get() as { c: number }).c
    : 0;
  const verdictByKind = Object.fromEntries(
    (
      db
        .prepare('SELECT verdict, COUNT(*) AS c FROM verdict_nodes GROUP BY verdict')
        .all() as { verdict: string; c: number }[]
    ).map((row) => [row.verdict, row.c]),
  );
  return {
    evidenceLogTotal,
    callRecordTotal,
    ftsTotal,
    verdictByKind,
    degradationTotal,
    degradedScopeVerdictTotal,
  };
}

/**
 * 注册指标路由（GET /metrics）。
 *
 * @param app - Fastify 实例
 * @param config - db + 可选启动时间
 */
export async function registerMetricsRoutes(
  app: FastifyInstance,
  config: MetricsRouteConfig,
): Promise<void> {
  app.get('/metrics', { schema: { response: METRICS_RESPONSE_SCHEMAS } }, async (_request, reply) => {
    // 指标查询失败不伪装——返回 500 + 可读错误（可观测面本身必须诚实）。
    let metrics: ReturnType<typeof collectDbMetrics>;
    try {
      metrics = collectDbMetrics(config);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      void reply.code(500).send(`metrics query failed: ${detail}\n`);
      return;
    }
    const { evidenceLogTotal, callRecordTotal, ftsTotal, verdictByKind, degradationTotal, degradedScopeVerdictTotal } = metrics;

    const startMs = config.processStartMs ?? processStartMs;
    const uptimeSec = Math.max(0, (Date.now() - startMs) / 1000);
    const mem = process.memoryUsage();

    const lines: string[] = [
      '# HELP far_lab_uptime_seconds Process uptime in seconds.',
      '# TYPE far_lab_uptime_seconds gauge',
      sample('far_lab_uptime_seconds', uptimeSec),
      '# HELP process_resident_memory_bytes Resident memory in bytes.',
      '# TYPE process_resident_memory_bytes gauge',
      sample('process_resident_memory_bytes', mem.rss),
      '# HELP process_heap_used_bytes Heap used in bytes.',
      '# TYPE process_heap_used_bytes gauge',
      sample('process_heap_used_bytes', mem.heapUsed),
      '# HELP far_lab_evidence_log_total Rows in the append-only evidence hash chain.',
      '# TYPE far_lab_evidence_log_total gauge',
      sample('far_lab_evidence_log_total', evidenceLogTotal),
      '# HELP far_lab_call_record_total Rows in call_records.',
      '# TYPE far_lab_call_record_total gauge',
      sample('far_lab_call_record_total', callRecordTotal),
      '# HELP far_lab_evidence_fts_total Rows in the FTS5 mirror index.',
      '# TYPE far_lab_evidence_fts_total gauge',
      sample('far_lab_evidence_fts_total', ftsTotal),
      '# HELP far_lab_verdict_total Verdict nodes by five-value kind.',
      '# TYPE far_lab_verdict_total gauge',
      ...['CONFIRMED', 'REFUTED', 'INCONCLUSIVE', 'DEGRADED_SCOPE', 'UNTESTED'].map((v) =>
        sample('far_lab_verdict_total', verdictByKind[v] ?? 0, { name: 'verdict', value: v }),
      ),
      '# HELP far_lab_degradation_total LLM fallback chain degradations (call_records.degraded_from).',
      '# TYPE far_lab_degradation_total counter',
      sample('far_lab_degradation_total', degradationTotal),
      '# HELP far_lab_degraded_scope_verdict_total Verdict nodes degraded to DEGRADED_SCOPE.',
      '# TYPE far_lab_degraded_scope_verdict_total counter',
      sample('far_lab_degraded_scope_verdict_total', degradedScopeVerdictTotal),
    ];
    void reply.header('content-type', 'text/plain; version=0.0.4; charset=utf-8');
    return `${lines.join('\n')}\n`;
  });
}

/** 模块加载时间（进程启动近似）。 */
const processStartMs = Date.now();
