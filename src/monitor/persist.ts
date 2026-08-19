// src/monitor/persist.ts
// Monitor JSONL 落盘（架构 §2「内存状态 + 定期落盘（JSON Lines 格式）」最后一环）。
//
// 设计：
//   · 订阅 Sampler，每 tick 追加一行 JSON（采样原样 + 告警评估结果）；
//   · 产物纪律：默认落 `.far/monitor/samples.jsonl`（repo_hygiene_gate E 规则兼容——
//     运行时产物永远不进 repo 根）；路径可注入（测试/自定义部署）；
//   · 轮转：超 maxBytes 时截断保留尾部（简单单文件轮转——整文件重写代价
//     在每 10MB 一次，远小于逐行追加收益；无外部依赖，不引 winston-daily-rotate-file，
//     与雷达维度 15「自研零依赖」裁决一致）；
//   · 守护纪律：一切 fs 异常吞噬计数——落盘故障绝不倒灌宿主 API（同 Sampler）。
//   · 环境开关：FAR_MONITOR_PERSIST=off 显式关闭（默认开——指令「定期落盘」是默认行为）。

import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { evaluateAlerts, DEFAULT_THRESHOLDS } from './alerts.ts';
import type { Sampler } from './sampler.ts';
import type { SystemSample } from './collect.ts';

export const DEFAULT_PERSIST_PATH = join('.far', 'monitor', 'samples.jsonl');
export const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10MB：720 条/小时 ≈ 0.3MB，约 33 小时历史

export interface PersisterOptions {
  readonly path?: string;
  readonly maxBytes?: number;
  /** 测试注入：换时间源/告警阈值（默认生产值）。 */
  readonly nowIso?: () => string;
}

export class JsonlPersister {
  private readonly path: string;
  private readonly maxBytes: number;
  private readonly nowIso: () => string;
  private failures = 0;
  private written = 0;
  private unsubscribe: (() => void) | null = null;

  constructor(opts: PersisterOptions = {}) {
    this.path = opts.path ?? DEFAULT_PERSIST_PATH;
    this.maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
    this.nowIso = opts.nowIso ?? (() => new Date().toISOString());
  }

  /** 挂到采样器（幂等——重复 attach 先退订旧的）。 */
  attach(sampler: Sampler): void {
    this.detach();
    mkdirSync(dirname(this.path), { recursive: true });
    this.unsubscribe = sampler.subscribe((sample) => {
      this.onSample(sample);
    });
  }

  detach(): void {
    if (this.unsubscribe !== null) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  get failureCount(): number {
    return this.failures;
  }

  get writtenCount(): number {
    return this.written;
  }

  get filePath(): string {
    return this.path;
  }

  private onSample(sample: SystemSample): void {
    try {
      const line = `${JSON.stringify({
        persistedAt: this.nowIso(),
        sample,
        alerts: evaluateAlerts(sample, DEFAULT_THRESHOLDS),
      })}\n`;
      appendFileSync(this.path, line, 'utf8');
      this.written += 1;
      this.rotateIfNeeded();
    } catch {
      this.failures += 1; // 吞噬：落盘故障不得拖垮监控守护
    }
  }

  /** 单文件轮转：超限时保留尾部一半（按行边界切，保 JSONL 完整）。 */
  private rotateIfNeeded(): void {
    try {
      const size = statSync(this.path).size;
      if (size <= this.maxBytes) return;
      const content = readFileSync(this.path, 'utf8');
      const lines = content.split('\n');
      const keep = lines.slice(Math.floor(lines.length / 2)).join('\n');
      const tmp = `${this.path}.tmp`;
      writeFileSync(tmp, keep, 'utf8');
      renameSync(tmp, this.path);
    } catch {
      this.failures += 1;
    }
  }
}
