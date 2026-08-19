// src/monitor/run_command.ts
// far monitor —— 系统健康快照命令（v3.0 指令 Phase 3.3 · Monitor 入口 v1）。
//
// v1 范围：单发快照（双采样差分 CPU%，间隔 1s）+ 阈值告警。
//   常驻采集（5s 节律）/ JSONL 落盘 / Fastify 历史端点 / WS 推送 = 后续切片
//   （SYSTEM_ARCHITECTURE.md §2/§3.3 既定路径）。
// 输出契约（CLI_JSON_CONTRACT_CENSUS §4）：--json → stdout 单文档纯 JSON；
//   人读路径走 render.ts 语义色（warn=黄，ANSI 单一出口）。
// 确定性护栏：本命令只读 node:os，绝不触碰裁决路径。

import { ansiEnabled, colorizeToken } from '../cli/render.ts';
import { FUNCTIONAL_COLORS } from '../platform/design_tokens.ts';
import { collectSample, readCpuTimes, type SystemSample } from './collect.ts';
import { DEFAULT_THRESHOLDS, evaluateAlerts, type Alert, type Thresholds } from './alerts.ts';

/** 双采样间隔（CPU% 差分窗口）。1s：够短不拖慢 CLI，够长避开同 tick null。 */
const SAMPLE_INTERVAL_MS = 1000;

function renderHuman(sample: SystemSample, alerts: readonly Alert[], thresholds: Thresholds): string {
  const cpuText =
    sample.cpu.percentBusy === null ? 'unknown (first sample)' : `${sample.cpu.percentBusy}%`;
  const lines = [
    '',
    '  FAR-Lab · far monitor (system health snapshot)',
    '  ─────────────────────────────────────────────────',
    `  platform    : ${sample.platform} · ${sample.arch} · ${sample.cpu.cores} cores`,
    `  cpu         : ${cpuText} (threshold >${thresholds.cpuPercent}%)`,
    `  load avg    : ${sample.cpu.loadAvg.map((n) => n.toFixed(2)).join(' / ')}`,
    `  memory      : ${sample.memory.usedMiB} / ${sample.memory.totalMiB} MiB (${sample.memory.usedPercent}%)`,
    `  uptime      : ${sample.uptimeSec}s`,
    '  ─────────────────────────────────────────────────',
  ];
  if (alerts.length === 0) {
    lines.push(`  ${colorizeToken('✔', FUNCTIONAL_COLORS.ok, ansiEnabled())} no alerts (all metrics within thresholds)`);
  } else {
    for (const a of alerts) {
      lines.push(`  ${colorizeToken('!', FUNCTIONAL_COLORS.warn, ansiEnabled())} [${a.level.toUpperCase()}] ${a.message}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * far monitor 入口。
 * @param opts.json --json：stdout 纯 JSON（census §4-1）。
 * @returns exit code：0 无告警 / 2 有告警（WARN 语义，与 doctor WARN-only 同级）。
 */
export async function runMonitor(opts: { readonly json?: boolean } = {}): Promise<number> {
  const prev = readCpuTimes();
  await new Promise((r) => setTimeout(r, SAMPLE_INTERVAL_MS));
  const sample = collectSample(prev);
  const alerts = evaluateAlerts(sample, DEFAULT_THRESHOLDS);

  if (opts.json === true) {
    process.stdout.write(
      `${JSON.stringify({ tool: 'far monitor', sample, alerts, thresholds: DEFAULT_THRESHOLDS, result: alerts.length > 0 ? 'warn' : 'ok' }, null, 2)}\n`,
    );
  } else {
    process.stdout.write(renderHuman(sample, alerts, DEFAULT_THRESHOLDS));
  }
  return alerts.length > 0 ? 2 : 0;
}
