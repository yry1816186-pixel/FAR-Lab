#!/usr/bin/env node
/**
 * metrics_alert.mjs — 可观测告警（阶段 7 1124 · P2-B 首步）。
 *
 * 目标：给"异常告警存在"一个真实实现。对本地 API /metrics 端点做阈值检查，
 * 超限即告警（exit 1 + 结构化输出）。阈值基于可观测面实际指标（诚实边界：
 * 离线本机服务——告警即阈值检查；生产部署需重定义数据源与告警通道）。
 *
 * 用法:
 *   node scripts/metrics_alert.mjs [--port N] [--timeout-ms N]
 *
 * 阈值（默认）:
 *   - degradation_total 增长率 > 50%（连续两次采样）→ 降级风暴告警
 *   - degraded_scope_verdict_total 占比 > 50%（degradation 相对 verdict）→ 裁决质量告警
 *   - /metrics 端点不可达（连接失败/超时/非 200）→ 可观测面本身故障告警
 *
 * 退出码: 0 = 全部阈值内；1 = 有告警（fail-open 检测，fail-closed 报告）
 *
 * 零容忍合规：无 any / @ts-ignore / 空 catch。
 */

const DEFAULT_PORT = 3737;
const DEFAULT_TIMEOUT_MS = 5000;
const DEGRADATION_SURGE_RATIO = 0.5;
const DEGRADED_SCOPE_RATIO = 0.5;

const portIdx = process.argv.indexOf('--port');
const timeoutIdx = process.argv.indexOf('--timeout-ms');
const port = portIdx >= 0 ? Number(process.argv[portIdx + 1]) : DEFAULT_PORT;
const timeoutMs = timeoutIdx >= 0 ? Number(process.argv[timeoutIdx + 1]) : DEFAULT_TIMEOUT_MS;

function parseMetrics(text) {
  const metrics = {};
  for (const line of text.split('\n')) {
    // Prometheus 文本格式：`name{labels} value`
    const match = /^([a-z_]+)(?:\{[^}]*\})?\s+([0-9.]+)$/.exec(line);
    if (match) {
      const [, name, value] = match;
      metrics[name] = Number(value);
    }
  }
  return metrics;
}

async function fetchMetrics() {
  const url = `http://127.0.0.1:${port}/metrics`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    return { ok: true, metrics: parseMetrics(await res.text()) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const alerts = [];
  const first = await fetchMetrics();
  if (!first.ok) {
    alerts.push({
      level: 'CRITICAL',
      rule: 'metrics_endpoint_unreachable',
      detail: `/metrics 不可达（port ${port}）: ${first.error} —— 可观测面本身故障`,
    });
    report(alerts);
    process.exitCode = 1;
    return;
  }
  const m1 = first.metrics;
  const verdictTotal = m1.far_lab_verdict_total ?? 0;
  const degradedScope = m1.far_lab_degraded_scope_verdict_total ?? 0;
  if (verdictTotal > 0 && degradedScope / verdictTotal > DEGRADED_SCOPE_RATIO) {
    alerts.push({
      level: 'WARNING',
      rule: 'degraded_scope_dominance',
      detail: `DEGRADED_SCOPE 占 verdict ${(degradedScope / verdictTotal * 100).toFixed(0)}% > ${DEGRADED_SCOPE_RATIO * 100}%`,
    });
  }
  // 降级风暴：等待 1s 二次采样比较增长率
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const second = await fetchMetrics();
  if (second.ok) {
    const m2 = second.metrics;
    const d1 = m1.far_lab_degradation_total ?? 0;
    const d2 = m2.far_lab_degradation_total ?? 0;
    if (d2 > 0 && d1 > 0 && (d2 - d1) / d1 > DEGRADATION_SURGE_RATIO) {
      alerts.push({
        level: 'WARNING',
        rule: 'degradation_surge',
        detail: `degradation_total ${d1} → ${d2}（增长率 > ${DEGRADATION_SURGE_RATIO * 100}%）`,
      });
    }
  }
  report(alerts);
  process.exitCode = alerts.length === 0 ? 0 : 1;
}

function report(alerts) {
  if (alerts.length === 0) {
    console.log('metrics_alert: ok — 阈值内（degraded_scope 占比 / degradation 增长率 / 端点可达）');
    return;
  }
  for (const alert of alerts) {
    console.log(`[metrics-alert] ${alert.level} ${alert.rule}: ${alert.detail}`);
  }
}

await main();
