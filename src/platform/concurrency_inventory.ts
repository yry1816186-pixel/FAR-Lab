// src/platform/concurrency_inventory.ts
// 职责：ENG-CONCURRENCY-001 —— 并发控制面清单 + 统一 concurrency test report。
//
// 宪法 G3 节十覆盖项。存量盘点（2026-08-19）：多数已机制化于各层，但分散互不知情，
// 且无统一报告件（宪法 Evidence：concurrency test report）。本模块把十项收拢为
// 机读清单（成熟度如实分型——GUARD_INVENTORY 同模式）+ 报告生成器（映射真实测试
// 文件与真实 test 计数，静态数——报告不假装跑过，跑的证据在各测试文件自身）。
//
// Cannot-prove：清单证明「每项有归属与测试面定位」；「race-detection」项的覆盖
// 依赖单写者假设的检测面（链校验拒绝并发穿插写）——真正的多写者锁管理器不存在
// （设计选择：lease + 单写者，无 lock-ordering 死锁面），如实标注而非伪装。

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CONCURRENCY_ITEMS = [
  'bounded-parallelism',
  'backpressure',
  'lock-ordering',
  'lease-expiry',
  'cancellation-propagation',
  'idempotency-keys',
  'ordered-receipts',
  'retry-semantics',
  'crash-recovery',
  'race-detection',
] as const;
export type ConcurrencyItem = (typeof CONCURRENCY_ITEMS)[number];

export type ConcurrencyMaturity = 'implemented' | 'partial' | 'by-design-absent';

export interface ConcurrencyInventoryEntry {
  readonly item: ConcurrencyItem;
  readonly maturity: ConcurrencyMaturity;
  readonly authority: string;
  readonly testFace: readonly string[];
  readonly note: string;
}

/** 十项清单（测试文件路径为仓库相对，报告生成器会实存校验）。 */
export const CONCURRENCY_INVENTORY: readonly ConcurrencyInventoryEntry[] = [
  {
    item: 'bounded-parallelism', maturity: 'implemented',
    authority: 'src/llm_gateway/rate_limiter.ts（并发信号量）',
    testFace: ['tests/llm_gateway/rate_limiter.test.ts'],
    note: 'maxConcurrent 严格串行/上限 2/异常路径 finally 释放（T-020 四测）',
  },
  {
    item: 'backpressure', maturity: 'implemented',
    authority: 'src/llm_gateway/rate_limiter.ts（FIFO waiters + minIntervalMs 节流）',
    testFace: ['tests/llm_gateway/rate_limiter.test.ts'],
    note: '排队等待 + 最小间隔（积压暴露与三档动作在 guard_registry BacklogGauge）',
  },
  {
    item: 'lock-ordering', maturity: 'by-design-absent',
    authority: '设计选择：单写者 + lease（guard_registry LeaseRegistry），无多锁',
    testFace: ['tests/campaign/guard_registry.test.ts'],
    note: '无锁管理器即无锁序死锁面——排除法而非缺席；lease 拒绝/抢占/续租四态在测',
  },
  {
    item: 'lease-expiry', maturity: 'implemented',
    authority: 'src/campaign/guard_registry.ts LeaseRegistry',
    testFace: ['tests/campaign/guard_registry.test.ts'],
    note: '持有拒/到期抢占/owner 续租/过期重取 + 过期检出列名',
  },
  {
    item: 'cancellation-propagation', maturity: 'partial',
    authority: 'src/research/run_lifecycle.ts cancelRun+AbortController（run 层）',
    testFace: ['tests/research/run_lifecycle.test.ts'],
    note: 'run 层可取消已有；rate_limiter 等待队列无 AbortSignal 透传（排队中任务不可取消）——partial 如实标注，不伪装',
  },
  {
    item: 'idempotency-keys', maturity: 'implemented',
    authority: 'src/agent_loop/stage_receipt_store.ts（inputHash 幂等跳过）',
    testFace: ['tests/agent_loop/stage_registry.test.ts'],
    note: 'exactly-once 收据跳过 + at-least-once 不承诺跳过（语义显式）',
  },
  {
    item: 'ordered-receipts', maturity: 'implemented',
    authority: 'src/agent_loop/stage_receipt_store.ts（seq 连续+prevHash 链）',
    testFace: ['tests/agent_loop/stage_receipt_store_coverage.test.ts'],
    note: 'seq 断档/prevHash 断链 fail-closed',
  },
  {
    item: 'retry-semantics', maturity: 'implemented',
    authority: 'src/agent_loop/retry_policy.ts（429 退避）+ campaign/scheduler.ts（崩溃恰重试一次）',
    testFace: ['tests/campaign/scheduler.test.ts'],
    note: '限流退避/崩溃单次重试/重试余量耗尽退出',
  },
  {
    item: 'crash-recovery', maturity: 'implemented',
    authority: 'src/agent_loop/recovery_chaos（K1 真实 SIGKILL 续跑）+ campaign/scheduler 崩溃协议',
    testFace: ['tests/agent_loop/recovery_chaos.test.ts', 'tests/campaign/checkpoint_recovery.test.ts'],
    note: '真实进程级 SIGKILL→双进程恢复 + ENOSPC 两态 + 版本迁移',
  },
  {
    item: 'race-detection', maturity: 'implemented',
    authority: '哈希链校验（campaign event_log / stage receipts）——并发穿插写产生断链即检出',
    testFace: ['tests/campaign/core.test.ts', 'tests/platform/concurrency_consistency.test.ts'],
    note: '检测面=链完整性（穿插写必断链）；本批新增并发穿插直接实证（consistency 测试）',
  },
];

export interface ConcurrencyReportEntry {
  readonly item: ConcurrencyItem;
  readonly maturity: ConcurrencyMaturity;
  readonly testFiles: readonly { readonly path: string; readonly exists: boolean; readonly testCount: number }[];
}

export interface ConcurrencyTestReport {
  readonly entries: readonly ConcurrencyReportEntry[];
  readonly totalTestCount: number;
  readonly allTestFacesExist: boolean;
  readonly partialItems: readonly ConcurrencyItem[];
}

/** 数一个测试文件里的 test( 声明数（静态真实计数——报告不假装执行，执行证据在 CI）。 */
function countTests(repoRoot: string, relPath: string): { exists: boolean; testCount: number } {
  const abs = join(repoRoot, relPath);
  if (!existsSync(abs)) return { exists: false, testCount: 0 };
  const text = readFileSync(abs, 'utf8');
  const matches = text.match(/(^|\s)(test|it)\s*\(/g);
  return { exists: true, testCount: matches === null ? 0 : matches.length };
}

/** 生成统一 concurrency test report（Evidence 面）。 */
export function buildConcurrencyReport(repoRoot: string): ConcurrencyTestReport {
  const entries = CONCURRENCY_INVENTORY.map((e) => ({
    item: e.item,
    maturity: e.maturity,
    testFiles: e.testFace.map((p) => ({ path: p, ...countTests(repoRoot, p) })),
  }));
  const totalTestCount = entries.reduce(
    (sum, e) => sum + e.testFiles.reduce((s, f) => s + (f.exists ? f.testCount : 0), 0),
    0,
  );
  return {
    entries,
    totalTestCount,
    allTestFacesExist: entries.every((e) => e.testFiles.every((f) => f.exists)),
    partialItems: entries.filter((e) => e.maturity === 'partial').map((e) => e.item),
  };
}

export function concurrencyInventoryCompleteness(): { ok: boolean; missing: ConcurrencyItem[] } {
  const listed = new Set(CONCURRENCY_INVENTORY.map((e) => e.item));
  const missing = CONCURRENCY_ITEMS.filter((i) => !listed.has(i));
  return { ok: missing.length === 0, missing };
}
