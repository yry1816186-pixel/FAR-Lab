// src/monitor/collect.ts
// Monitor 采集器 v1（v3.0 指令 Phase 3.3 · 指令唯一净新增运行时）。
//
// 设计原则：
//   · 纯 node:os，零依赖零原生（雷达维度 8 选定路径；systeminformation 未过三关不引入）。
//   · 确定性护栏：采集结果只用于展示/告警，**永不进入 R0-R9 裁决输入**
//     （与 hardware/detect.ts 同一铁律；INVARIANTS.md 台账）。
//   · IO 壳 / 纯函数分离：collectSample 是唯一 IO 壳；computeCpuPercent 纯函数可判别测试。
//   · 跨平台：loadavg 在 Windows 恒 [0,0,0]（Node 语义）——如实上报，不编造；
//     CPU% 用 cpus() times 双采样差分（全平台一致），首次采样无前值 → null（fail-closed，不猜）。

import * as os from 'node:os';

/** 一次系统采样（监控快照）。 */
export interface SystemSample {
  /** ISO 时间戳（采集时刻；监控路径允许墙钟——确定性护栏只管裁决路径）。 */
  readonly timestamp: string;
  readonly platform: string;
  readonly arch: string;
  readonly cpu: {
    readonly cores: number;
    /** 双采样差分利用率 0-100；首次采样（无前值）为 null。 */
    readonly percentBusy: number | null;
    /** POSIX load average；Windows 上 Node 恒返 [0,0,0]（如实上报）。 */
    readonly loadAvg: readonly [number, number, number];
  };
  readonly memory: {
    readonly totalMiB: number;
    readonly usedMiB: number;
    readonly usedPercent: number;
  };
  readonly uptimeSec: number;
}

/** os.cpus() 聚合时间片（idle 与 total 的全核求和）。 */
export interface CpuTimes {
  readonly idle: number;
  readonly total: number;
}

/** 读取当前全核聚合时间片（IO 壳）。 */
export function readCpuTimes(): CpuTimes {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
  }
  return { idle, total };
}

/**
 * 双采样差分 → CPU 利用率 %（纯函数）。
 * prev === null（首次采样）→ null：fail-closed，宁可报"未知"不编造 0% 或 100%。
 * 防御钳制 [0,100]：时间片回绕/虚拟机计时不准等异常不得产出越界值。
 */
export function computeCpuPercent(prev: CpuTimes | null, next: CpuTimes): number | null {
  if (prev === null) return null;
  const idleDelta = next.idle - prev.idle;
  const totalDelta = next.total - prev.total;
  if (totalDelta <= 0) return null; // 计时未前进（同 tick 重采样）——未知而非 0%
  const busy = (1 - idleDelta / totalDelta) * 100;
  return Math.min(100, Math.max(0, Math.round(busy * 10) / 10));
}

/**
 * 采集一次系统快照（唯一 IO 壳）。
 * @param prevCpuTimes 上一次 readCpuTimes 的值；首次调用传 null（cpu.percentBusy 将为 null）。
 */
export function collectSample(prevCpuTimes: CpuTimes | null = null): SystemSample {
  const next = readCpuTimes();
  const totalBytes = os.totalmem();
  const usedBytes = totalBytes - os.freemem();
  const la = os.loadavg();
  return {
    timestamp: new Date().toISOString(),
    platform: os.platform(),
    arch: os.arch(),
    cpu: {
      cores: os.cpus().length,
      percentBusy: computeCpuPercent(prevCpuTimes, next),
      loadAvg: [la[0] ?? 0, la[1] ?? 0, la[2] ?? 0],
    },
    memory: {
      totalMiB: Math.round(totalBytes / (1024 * 1024)),
      usedMiB: Math.round(usedBytes / (1024 * 1024)),
      usedPercent: Math.round((usedBytes / totalBytes) * 1000) / 10,
    },
    uptimeSec: Math.round(os.uptime()),
  };
}
