// src/monitor/sampler.ts
// Monitor 常驻采样器（v3.0 指令 Phase 3.3「每 5 秒采集一次」· 架构 §2 Monitor 内存环形缓冲）。
//
// 设计：
//   · 5s 节律（DEFAULT_INTERVAL_MS），环形缓冲默认 720 条 = 1 小时历史（内存 <1MB，远低于 50MB 红线）。
//   · 永不抛异常：采集失败计数并跳过该 tick——监控守护不得因自身故障拖垮宿主 API（fail-safe 守护纪律）。
//   · start 幂等（重复 start 不叠加定时器）；stop 幂等。
//   · CPU% 差分前值在采样器内部链式传递（每次 tick 的 next 成为下次的 prev）。
//   · 确定性护栏不变：采样只读 node:os，永不进裁决输入。

import { collectSample, readCpuTimes, type CpuTimes, type SystemSample } from './collect.ts';

export const DEFAULT_INTERVAL_MS = 5000;
export const DEFAULT_CAPACITY = 720;

export interface SamplerOptions {
  readonly intervalMs?: number;
  readonly capacity?: number;
  /** 测试注入：替换实时钟采集（判别测试用确定性样本）。 */
  readonly collectFn?: (prev: CpuTimes | null) => SystemSample;
}

export class Sampler {
  private readonly intervalMs: number;
  private readonly capacity: number;
  private readonly collectFn: (prev: CpuTimes | null) => SystemSample;
  private buffer: SystemSample[] = [];
  private prev: CpuTimes | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private failures = 0;
  private listeners = new Set<(sample: SystemSample) => void>();

  constructor(opts: SamplerOptions = {}) {
    this.intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.capacity = opts.capacity ?? DEFAULT_CAPACITY;
    this.collectFn = opts.collectFn ?? collectSample;
  }

  /** 订阅每次成功采样（SSE 推送等的唯一挂点）。返回退订函数。监听器异常被吞——不得拖垮采样节律。 */
  subscribe(listener: (sample: SystemSample) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** 启动常驻采样（幂等）。立即采第一 tick（首采样 CPU% 为 null——如实，不编造）。 */
  start(): void {
    if (this.timer !== null) return;
    this.tick();
    this.timer = setInterval(() => {
      this.tick();
    }, this.intervalMs);
    // 守护定时器不得阻止进程退出（CLI/测试进程不因此被挂住）。
    this.timer.unref?.();
  }

  /** 停止（幂等）。 */
  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  /** 采集失败累计数（可观测性：守护自身健康也要可见）。 */
  get failureCount(): number {
    return this.failures;
  }

  latest(): SystemSample | null {
    return this.buffer.length === 0 ? null : (this.buffer[this.buffer.length - 1] ?? null);
  }

  /** 最近 limit 条（时间升序）；limit <= 0 或缺省 → 全部。 */
  history(limit = 0): readonly SystemSample[] {
    if (limit <= 0 || limit >= this.buffer.length) return [...this.buffer];
    return this.buffer.slice(-limit);
  }

  private tick(): void {
    try {
      const sample = this.collectFn(this.prev);
      if (this.collectFn === collectSample) {
        // 仅真实采集链需要推进差分前值；注入假样本时 prev 无意义。
        this.prev = readCpuTimes();
      }
      this.buffer.push(sample);
      if (this.buffer.length > this.capacity) {
        this.buffer = this.buffer.slice(-this.capacity);
      }
      for (const listener of this.listeners) {
        try {
          listener(sample);
        } catch {
          // 监听器故障不得拖垮采样节律（守护纪律同 tick 异常吞噬）
        }
      }
    } catch {
      this.failures += 1; // 吞掉：守护永不倒灌故障到宿主
    }
  }
}
