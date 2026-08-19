// src/monitor/alerts.ts
// Monitor 告警判定（纯函数 · v3.0 指令 Phase 3.3「CPU > 80% 触发 Critical 语义色」）。
//
// 语义色映射（DESIGN_SYSTEM §1.1 锁定）：指令的 "Critical 琥珀" = 本仓 `warn` Token
// （指令色彩系统原文：Confirmed 绿 / Refuted 红 / Critical 琥珀 / Inconclusive 灰——
//  琥珀在本仓 SSOT 即 warn/inconclusive 同族 #96690d·ansi136，此处取 warn 功能位）。
//
// fail-closed：指标未知（null，如首次采样）→ 不产生告警，宁可沉默不误报。

import type { SystemSample } from './collect.ts';

/** 告警级别（v1 仅 warn；critical 留给未来多阈值）。 */
export type AlertLevel = 'warn';

export interface Alert {
  readonly metric: 'cpu' | 'memory';
  readonly level: AlertLevel;
  /** 触发值（百分比）。 */
  readonly value: number;
  /** 阈值（百分比）。 */
  readonly threshold: number;
  readonly message: string;
}

/** 默认阈值（指令 Phase 3.3：CPU > 80%）。内存默认 90%（指令未规定，保守值，可覆写）。 */
export const DEFAULT_THRESHOLDS = {
  cpuPercent: 80,
  memoryPercent: 90,
} as const;

export interface Thresholds {
  readonly cpuPercent: number;
  readonly memoryPercent: number;
}

/**
 * 评估一次采样 → 告警列表（纯函数；无告警返回空数组）。
 * 边界语义：**严格大于**阈值才触发（指令原文 "CPU > 80%"——80.0 本身不触发）。
 */
export function evaluateAlerts(
  sample: SystemSample,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): readonly Alert[] {
  const alerts: Alert[] = [];
  const cpu = sample.cpu.percentBusy;
  if (cpu !== null && cpu > thresholds.cpuPercent) {
    alerts.push({
      metric: 'cpu',
      level: 'warn',
      value: cpu,
      threshold: thresholds.cpuPercent,
      message: `CPU utilization ${cpu}% exceeds threshold ${thresholds.cpuPercent}%`,
    });
  }
  if (sample.memory.usedPercent > thresholds.memoryPercent) {
    alerts.push({
      metric: 'memory',
      level: 'warn',
      value: sample.memory.usedPercent,
      threshold: thresholds.memoryPercent,
      message: `memory usage ${sample.memory.usedPercent}% exceeds threshold ${thresholds.memoryPercent}%`,
    });
  }
  return alerts;
}
