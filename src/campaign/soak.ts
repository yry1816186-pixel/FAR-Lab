/**
 * soak — CAMPAIGN-SOAK-001 长运行能力真实 soak 与恢复演练（dev profile）。
 *
 * 机制（全部走真实战役资产，不 mock 内核）：
 *   - DEV_SOAK_PROFILE：时长/负载/故障注入参数显式登记为 **engineering
 *     budget**（dev profile 分钟级——正式 release profile 的跨小时/跨日目标
 *     不在本 profile 声明范围内）；
 *   - runSoakDrill()：在真实目录上 saveCampaignStarted → 反复调用
 *     runCampaignLoop（真实调度循环/真实台账 IO/真实哈希链）：
 *     · 执行器故障注入：确定性种子 PRNG 决定哪些执行抛暂态错误
 *       （question_failed 落账——失败不隐藏）；
 *     · crash-resume 演练：按计划点制造「running 残留」台账态（等价于
 *       进程被 SIGKILL 后磁盘上留下的状态——该等价性由既有双进程
 *       SIGKILL 测试 checkpoint_recovery.test.ts ③ 钉住），重启 =
 *       再次 runCampaignLoop → 真实崩溃恢复协议（补记 crash-recovered +
 *       重试一次）；
 *     · memory trend：process.memoryUsage().heapUsed 定间隔真实采样；
 *   - 报告：时长/执行数/失败率/resume 次数/内存趋势/审计链完整性
 *     （verifyCampaignEventChain 全量重验）/人工干预登记（正常为零）。

 * Cannot-prove（本机制不能证明什么——宪法 red line）：
 *   - dev profile 是分钟级单进程演练——**不能据此声称已验证跨小时/跨日
 *     长期稳定性**（那是 release profile 的 soak 职责，需独立跑）；
 *   - crash 仿真制造的是 SIGKILL 的磁盘后效（running 残留），不是真实
 *     信号杀死——进程内资源（内存/句柄）未经历真实回收；
 *   - heap 采样带 V8 GC 噪声：growthPct 是趋势观测不是泄漏证明；
 *   - 执行器延迟是模拟负载（sleep），不是真实 LLM 调用的延迟分布。
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { appendEvent, loadCampaign, saveCampaignStarted } from './store.ts';
import { runCampaignLoop } from './scheduler.ts';
import { CRASH_RECOVERY_DETAIL } from './scheduler.ts';
import { verifyCampaignEventChain } from './event_log.ts';
import type { CampaignState } from './types.ts';

/** dev soak profile（engineering budget 显式登记）。 */
export interface SoakProfile {
  readonly profileName: string;
  /** 目标时长下界（ms）——低于此值 = 未达 soak 时长目标。 */
  readonly minDurationMs: number;
  /** 硬顶（ms）——超过即强制收尾（预算熔断面）。 */
  readonly hardCeilingMs: number;
  readonly questionCount: number;
  /** 单问题执行延迟（ms·模拟负载）。 */
  readonly executorDelayMs: number;
  /** 计划 crash-resume 演练次数。 */
  readonly plannedCrashes: number;
  /** 执行器暂态故障率（确定性种子驱动）。 */
  readonly executorFailureRate: number;
  readonly memorySamplingIntervalMs: number;
  readonly budgetTokens: number;
  /** PRNG 种子（确定性故障调度）。 */
  readonly seed: number;
}

export const DEV_SOAK_PROFILE: SoakProfile = {
  profileName: 'dev-minute',
  minDurationMs: 45_000,
  hardCeilingMs: 95_000,
  questionCount: 13,
  executorDelayMs: 3_500,
  plannedCrashes: 3,
  executorFailureRate: 0.25,
  memorySamplingIntervalMs: 500,
  budgetTokens: 10_000_000,
  seed: 0x534f_414b,
};

export interface MemorySample {
  readonly atMs: number;
  readonly heapUsedBytes: number;
}

export interface MemoryTrend {
  readonly samples: readonly MemorySample[];
  readonly minHeapBytes: number;
  readonly maxHeapBytes: number;
  /** (max-min)/min*100——GC 噪声下的趋势观测（非泄漏证明）。 */
  readonly growthPct: number;
}

export interface SoakReport {
  readonly profile: SoakProfile;
  readonly dir: string;
  readonly wallClockMs: number;
  readonly executorAttempts: number;
  readonly transientFailures: number;
  readonly failureRate: number;
  readonly crashResumes: number;
  readonly completed: number;
  readonly failedTerminal: number;
  readonly memory: MemoryTrend;
  /** 审计链全量重验结果。 */
  readonly chainValid: boolean;
  /** 人工干预登记（正常 soak 为空——有干预必须如实列出）。 */
  readonly manualInterventions: readonly string[];
  /** acceptance 面：时长达标 / resume 达标 / 链完整。 */
  readonly acceptance: { readonly durationMet: boolean; readonly resumeMet: boolean; readonly auditIntact: boolean };
  readonly allPassed: boolean;
  readonly finalState: CampaignState;
}

/** mulberry32——确定性 PRNG（同 seed 同序列）。 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface SoakOptions {
  /** 战役目录（缺省 tmp——测试/真实运行均可注入 .far/soak/<id>）。 */
  readonly dir?: string;
  readonly profile?: SoakProfile;
  readonly now?: () => Date;
}

/**
 * 执行一次 dev-profile soak drill（真实调度循环 + 故障注入 + crash-resume
 * 演练 + 内存采样）。返回完整报告——不隐藏失败（失败率如实上报，由
 * acceptance 面判定目标）。
 */
export async function runSoakDrill(options: SoakOptions = {}): Promise<SoakReport> {
  const profile = options.profile ?? DEV_SOAK_PROFILE;
  const now = options.now ?? (() => new Date());
  const dir = options.dir ?? mkdtempSync(join(tmpdir(), 'far-soak-'));

  const questions = Array.from({ length: profile.questionCount }, (_, i) => `soak-q-${i}`);
  saveCampaignStarted(dir, {
    topic: `soak-${profile.profileName}`,
    plannedQuestions: questions,
    budgetTokens: profile.budgetTokens,
  });

  const rng = mulberry32(profile.seed);
  const startedAt = Date.now();
  const samples: MemorySample[] = [];
  const sampler = setInterval(() => {
    samples.push({ atMs: Date.now() - startedAt, heapUsedBytes: process.memoryUsage().heapUsed });
  }, profile.memorySamplingIntervalMs);

  let executorAttempts = 0;
  let transientFailures = 0;
  let rateLimitStops = 0;
  let crashResumes = 0;
  let crashesDone = 0;
  /** 计划 crash 点（按执行尝试序号，完全确定）：给定种子下总尝试数恒为
   * questionCount + plannedCrashes（每个残差恰好重试一次），点取等分位且
   * 严格小于总尝试数——最后的问题永远留给恢复后执行。 */
  const totalAttempts = profile.questionCount + profile.plannedCrashes;
  const crashPoints = Array.from(
    { length: profile.plannedCrashes },
    (_, i) => Math.floor((totalAttempts * (i + 1)) / (profile.plannedCrashes + 1)),
  );
  const manualInterventions: string[] = [];

  try {
    for (let restart = 0; ; restart += 1) {
      const { state } = loadCampaign(dir); // fail-closed：坏链在此抛出
      const allTerminal = state.questions.every((q) => q.status === 'OK' || q.status === 'failed');
      const elapsed = Date.now() - startedAt;
      if (allTerminal) break;
      if (elapsed > profile.hardCeilingMs) {
        manualInterventions.push(`hard-ceiling budget breaker: stopped after ${elapsed}ms (ceiling ${profile.hardCeilingMs}ms)`);
        break;
      }

      // 计划 crash 演练（对既有调度语义的真实使用）：先让执行器抛 rate-limit
      // 错误 → runCampaignLoop 诚实停机（剩余 pending 留待重启）→ 驱动器制造
      // running 残留（SIGKILL 的磁盘后效）→ 下一次 runCampaignLoop 调用即
      // 「重启进程」，走真实崩溃恢复协议（补记 crash-recovered + 重试一次）。
      const rateStopsBefore = rateLimitStops;
      await runCampaignLoop({
        dir,
        now,
        runQuestion: async (question) => {
          executorAttempts += 1;
          await sleep(profile.executorDelayMs); // 模拟负载：真实异步等待
          if (crashesDone < crashPoints.length && executorAttempts === crashPoints[crashesDone]) {
            crashesDone += 1;
            rateLimitStops += 1;
            throw new Error(`429 rate limit exceeded — soak-injected load-shed stop ${crashesDone}`);
          }
          if (rng() < profile.executorFailureRate) {
            transientFailures += 1;
            throw new Error(`soak injected transient failure on "${question}" (deterministic seed)`);
          }
          const idx = questions.indexOf(question);
          return { runId: `soak-run-${idx}`, tokens: 100 + idx * 7, status: 'OK' as const };
        },
      });

      // 本轮发生限流停机 → 注入一次 crash 残留（模拟重启进程又被杀），
      // 下一轮 loop 走真实崩溃恢复协议补记 + 重试。
      if (rateLimitStops > rateStopsBefore) {
        const after = loadCampaign(dir);
        const pending = after.state.questions.find((q) => q.status === 'pending');
        if (pending !== undefined) {
          appendEvent(dir, { type: 'question_started', index: pending.index, question: pending.question }, now);
        }
      }
      crashResumes = loadCampaign(dir).events.filter(
        (e) => e.payload.type === 'question_failed' && e.payload.detail === CRASH_RECOVERY_DETAIL,
      ).length;
    }
  } finally {
    clearInterval(sampler);
  }

  const wallClockMs = Date.now() - startedAt;
  const { events, state } = loadCampaign(dir);
  const chain = verifyCampaignEventChain(events);
  const heaps = samples.map((s) => s.heapUsedBytes);
  const minHeap = heaps.length > 0 ? Math.min(...heaps) : 0;
  const maxHeap = heaps.length > 0 ? Math.max(...heaps) : 0;
  const memory: MemoryTrend = {
    samples,
    minHeapBytes: minHeap,
    maxHeapBytes: maxHeap,
    growthPct: minHeap > 0 ? ((maxHeap - minHeap) / minHeap) * 100 : 0,
  };
  const failureRate = executorAttempts > 0 ? transientFailures / executorAttempts : 0;
  const acceptance = {
    durationMet: wallClockMs >= profile.minDurationMs,
    resumeMet: crashResumes >= profile.plannedCrashes,
    auditIntact: chain.valid,
  };
  return {
    profile,
    dir,
    wallClockMs,
    executorAttempts,
    transientFailures,
    failureRate,
    crashResumes,
    completed: state.questions.filter((q) => q.status === 'OK').length,
    failedTerminal: state.questions.filter((q) => q.status === 'failed').length,
    memory,
    chainValid: chain.valid,
    manualInterventions,
    acceptance,
    allPassed: acceptance.durationMet && acceptance.resumeMet && acceptance.auditIntact,
    finalState: state,
  };
}
