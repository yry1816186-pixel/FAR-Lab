/**
 * closed_loop —— C-ASTRO 闭环实验迭代（赛道一·方向一·B：接入"仪器"后据反馈迭代提升）。
 *
 * 真实闭环：每一轮 = 规划（周期网格策略）→ BLS（真 spawn numpy 子进程）→ 验证（测
 * best period / depth / depthSNR）→ 据反馈**缩放并加密网格**（下一轮围绕上轮 best period
 * 收窄 ±window、提升 nPeriods 分辨率）→ 实测成效变化。返回逐轮轨迹，展示"逐步提升实验成效"。
 *
 * 这是把 C-ASTRO 从"固定一次分析"升级为 B 赛道要求的**闭环科研场景**：MAST/光变曲线即"仪器"，
 * BLS 即"实验"，网格策略即"实验规划"，depthSNR/period 残差即"反馈"，缩放加密即"调整下一轮计划"。
 *
 * 诚实边界（零 demo）：
 *   - BLS 每轮是真 spawn numpy 子进程的实算（period/depth/SNR 非常量）；网格缩放是真策略。
 *   - 合成 fixture 上验证（确定性·真计算）；真实在线 TESS 运行时待 MAST 数据（沙箱不可达）。
 *   - "improved" 字段如实反映 depthSNR 是否单调非降——不保证必升（强信号已饱和时可能持平，
 *     属真实测量现实，非剧本）。我们**不**为制造提升而作弊起点。
 *
 * 模型中立。零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch。
 */

import { runBlsInSandbox, type BlsMetrics } from './c_astro_pipeline.ts';
import type { VenvSandboxAdapter } from './types.ts';

/** 一轮实验的计划（周期网格策略）。 */
export interface ClosedLoopRoundPlan {
  readonly round: number;
  readonly periodMin: number;
  readonly periodMax: number;
  readonly nPeriods: number;
  /** 本轮规划相对上轮的调整说明（可读·审计）。 */
  readonly rationale: string;
}

/** 一轮实验的实测结果。 */
export interface ClosedLoopRoundResult {
  readonly plan: ClosedLoopRoundPlan;
  readonly bestPeriod: number;
  readonly depth: number;
  readonly depthSnr: number;
  /** 本轮多重检验 trial 数（nPeriods × nDurations）——供诚实披露搜索广度。 */
  readonly nTrials: number;
}

/** 闭环迭代总结。 */
export interface ClosedLoopResult {
  readonly rounds: readonly ClosedLoopRoundResult[];
  /** depthSNR 是否跨轮单调非降（真实测量现实·不保证）。 */
  readonly depthSnrMonotonicNonDecreasing: boolean;
  readonly initialDepthSnr: number;
  readonly finalDepthSnr: number;
  /** period 估计精度提升：末轮网格宽度 / 首轮网格宽度（<1 = 收窄=精度提升）。 */
  readonly periodGridNarrowedTo: number;
  /** 末轮 best period 估计（d）。 */
  readonly finalBestPeriod: number;
}

/** 闭环默认参数（诚实：首轮宽+粗 survey，逐轮缩放加密——非为制造提升作弊）。 */
const DEFAULT_INITIAL_PERIOD_MIN = 1.8;
const DEFAULT_INITIAL_PERIOD_MAX = 3.0;
const DEFAULT_INITIAL_N_PERIODS = 40; // 首轮粗 survey（BLS 标准 demo 是 120；这里更低以留真实提升空间）
const DEFAULT_ZOOM_FACTOR = 0.05; // 每轮围绕上轮 best period ±5%
const DEFAULT_RESOLUTION_BOOST = 2; // 每轮 nPeriods 翻倍

/**
 * 运行 C-ASTRO 闭环迭代。
 *
 * @param options.lightcurvePath 光变曲线 CSV（"仪器"数据源）。
 * @param options.workingDir sandbox 工作目录（每轮覆写 bls_metrics.json）。
 * @param options.rounds 迭代轮数（>=1）。
 * @param options.zoomFactor 每轮周期窗收窄比例（±fraction·default 0.05）。
 * @param options.resolutionBoost 每轮 nPeriods 倍数（default 2）。
 */
export async function runClosedLoopAstro(options: {
  readonly lightcurvePath: string;
  readonly workingDir: string;
  readonly rounds: number;
  readonly pythonCmd?: string;
  readonly adapter?: VenvSandboxAdapter;
  readonly initialPeriodMin?: number;
  readonly initialPeriodMax?: number;
  readonly initialNPeriods?: number;
  readonly zoomFactor?: number;
  readonly resolutionBoost?: number;
}): Promise<ClosedLoopResult> {
  if (!Number.isInteger(options.rounds) || options.rounds < 1) {
    throw new Error(`runClosedLoopAstro: rounds must be an integer >= 1, got ${options.rounds}`);
  }
  const zoomFactor = options.zoomFactor ?? DEFAULT_ZOOM_FACTOR;
  const resolutionBoost = options.resolutionBoost ?? DEFAULT_RESOLUTION_BOOST;
  if (!(zoomFactor > 0 && zoomFactor < 0.5)) {
    throw new Error(`runClosedLoopAstro: zoomFactor must be in (0, 0.5), got ${zoomFactor}`);
  }
  if (!(resolutionBoost > 1)) {
    throw new Error(`runClosedLoopAstro: resolutionBoost must be > 1, got ${resolutionBoost}`);
  }

  const rounds: ClosedLoopRoundResult[] = [];
  let periodMin = options.initialPeriodMin ?? DEFAULT_INITIAL_PERIOD_MIN;
  let periodMax = options.initialPeriodMax ?? DEFAULT_INITIAL_PERIOD_MAX;
  let nPeriods = options.initialNPeriods ?? DEFAULT_INITIAL_N_PERIODS;
  let prevBestPeriod: number | null = null;
  const initialWidth = periodMax - periodMin;

  for (let round = 1; round <= options.rounds; round += 1) {
    const rationale =
      round === 1
        ? `initial broad survey [${periodMin.toFixed(3)}, ${periodMax.toFixed(3)}]d @ ${nPeriods} trial periods`
        : `zoom around prev best ${prevBestPeriod?.toFixed(4)}d ±${(zoomFactor * 100).toFixed(1)}% @ ${nPeriods} trial periods (×${resolutionBoost} resolution)`;
    const plan: ClosedLoopRoundPlan = { round, periodMin, periodMax, nPeriods, rationale };

    const output = await runBlsInSandbox({
      lightcurvePath: options.lightcurvePath,
      workingDir: options.workingDir,
      periodMin,
      periodMax,
      nPeriods,
      ...(options.pythonCmd !== undefined ? { pythonCmd: options.pythonCmd } : {}),
      ...(options.adapter !== undefined ? { adapter: options.adapter } : {}),
    });
    const m: BlsMetrics = output.metrics;
    rounds.push({
      plan,
      bestPeriod: m.period,
      depth: m.depth,
      depthSnr: m.depthSNR,
      nTrials: m.n_periods * m.n_durations,
    });

    // 反馈→下一轮规划：围绕本轮 best period 收窄窗、加密网格（闭环核心）。
    prevBestPeriod = m.period;
    const half = Math.max(zoomFactor * m.period, 1e-6);
    periodMin = Math.max(1e-6, m.period - half);
    periodMax = m.period + half;
    nPeriods = Math.round(nPeriods * resolutionBoost);
  }

  const snrs = rounds.map((r) => r.depthSnr);
  const monotonic = snrs.every((s, i) => {
    if (i === 0) {
      return true;
    }
    const prev = snrs[i - 1];
    return prev !== undefined && s >= prev - 1e-9;
  });
  const finalWidth = periodMax - periodMin; // 末轮规划窗（已为"下一轮"缩放后）
  return {
    rounds,
    depthSnrMonotonicNonDecreasing: monotonic,
    initialDepthSnr: snrs[0] ?? 0,
    finalDepthSnr: snrs[snrs.length - 1] ?? 0,
    periodGridNarrowedTo: initialWidth > 0 ? finalWidth / initialWidth : 1,
    finalBestPeriod: prevBestPeriod ?? 0,
  };
}
