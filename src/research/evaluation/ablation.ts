/**
 * research/evaluation/ablation — 编排原语 with-vs-without 消融聚合（2.md §3.3 补遗 R4）。
 *
 * R4 三要素一站式：**边际价值**（每指标两臂均值差 + 双样本非配对 bootstrap 95% CI）、
 * **边际成本**（token 均值差 + CI）、**方差**（每臂 SD/CI 宽度 + 方差旗）。
 *
 * 证据分级纪律（承 frozen_multirun N≥5 与 R8 功效条款）：
 *   - REPORTED：两臂 OK run 数均 ≥5 且单一 runMode —— 统计信号（CI 不跨 0 才有方向）。
 *   - DIRECTIONAL_PILOT：任一臂 n<5（试点规模）—— 均值照登但整份报告降级标注
 *     「方向性信号非统计确认」，方向字段强制 null（不给试点配方向结论）。
 *   - INSUFFICIENT_N（指标级）：任一臂该指标非空观测 <2 —— 连方向性都不给。
 *   - MIXED_RUN_MODE：任一臂混入非同质 runMode —— 拒聚合（LIVE 不得与回放平均）。
 *
 * 快照同质性：两臂各自的 distinct rootHash + 是否共享同一冻结快照
 * （--reuse-snapshot 钉定下的预期 True；False 时报告如实标注——消融解释力
 * 因此混入检索漂移，读者自判）。
 *
 * 确定性：bootstrap 种子由 (baseSeed, questionId, primitive, metricName) 派生
 * （经 deriveBootstrapSeed 的 questionId 位携带 primitive 标识——第三方凭报告
 * 可独立复算每个 CI）。无时钟读取；generatedAt 可注入。
 *
 * Cannot-prove（不可隐藏）：本模块证明「同一冻结评估集上两配置臂的指标差异」，
 * 不证明因果归因于原语本身（混杂因素：模型版本漂移、prompt 版本、检索漂移）；
 * 也不预设指标方向的好坏语义——direction 只描述 CI 相对 0 的位置。
 */

import {
  DEFAULT_BASE_SEED,
  DEFAULT_BOOTSTRAP_ITERATIONS,
  FROZEN_MINIMUM_N,
  FROZEN_POWER_CAVEAT,
  deriveBootstrapSeed,
  type FrozenRunObservation,
} from './frozen_multirun.ts';

// ─── 输入 ────────────────────────────────────────────────────────────────────

/** 一个消融臂（同一问题的 OK/FAILED run 集合 + 臂定义）。 */
export interface AblationArmInput {
  /** 臂 id（'with' | 'without' 语义由 primitive 定义承载）。 */
  readonly armId: 'with' | 'without';
  /** 人类可读配置描述（进报告——读者必须知道两臂差在哪）。 */
  readonly config: string;
  readonly runs: readonly FrozenRunObservation[];
}

export interface AblationInput {
  /** 冻结评估集问题 id。 */
  readonly questionId: string;
  /** 被消融的编排原语（fanout / tournament / …）。 */
  readonly primitive: string;
  readonly withArm: AblationArmInput;
  readonly withoutArm: AblationArmInput;
  readonly seed?: number;
  readonly iterations?: number;
  readonly generatedAt?: string;
  /**
   * Environment provenance notes (day-r13): verbatim footer lines in the
   * rendered report — e.g. the concurrency of the launch (10-way concurrent
   * launch inflates wall-clock vs a quieter host, so cross-question wall-clock
   * comparability is confounded). Notes never feed any statistic.
   */
  readonly environmentNotes?: readonly string[];
}

// ─── 输出 ────────────────────────────────────────────────────────────────────

export interface AblationArmStats {
  readonly armId: 'with' | 'without';
  readonly config: string;
  readonly nOk: number;
  readonly failedRunCount: number;
  readonly distinctRunModes: readonly string[];
  readonly distinctSnapshotHashes: readonly string[];
  readonly tokensMean: number | null;
  readonly tokensSd: number | null;
}

export interface AblationDeltaCi {
  readonly lower: number;
  readonly upper: number;
  readonly method: 'percentile-bootstrap-two-sample-unpaired';
  readonly iterations: number;
  readonly seed: number;
  readonly unit: 'run';
}

/** 指标级两臂对照行。 */
export interface AblationMetricRow {
  readonly name: string;
  /** REPORTED（n≥5×2）/ INSUFFICIENT_N（任一臂非空观测<2）。 */
  readonly status: 'REPORTED' | 'INSUFFICIENT_N';
  readonly withMean: number | null;
  readonly withoutMean: number | null;
  readonly withSd: number | null;
  readonly withoutSd: number | null;
  /** mean(with) − mean(without)（REPORTED 才有；试点降级时也给出但见 evidenceGrade）。 */
  readonly deltaMean: number | null;
  readonly deltaCi95: AblationDeltaCi | null;
  /** 方向只在 REPORTED 且 CI 不跨 0 时非 null。 */
  readonly direction: 'FAVORS_WITH' | 'FAVORS_WITHOUT' | 'NO_SIGNAL' | null;
  /**
   * Single-arm descriptive view (day-r11 backlog #2): present when the metric
   * is structurally ABSENT in one arm (e.g. fan-out-only metrics on the legacy
   * arm) — the present arm's mean is shown for characterization with an
   * explicit not-comparable label. Never feeds direction/delta logic.
   */
  readonly descriptive?: {
    readonly armId: 'with' | 'without';
    readonly mean: number;
    readonly n: number;
  } | null;
}

export interface AblationReport {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly questionId: string;
  readonly primitive: string;
  readonly seed: number;
  readonly iterations: number;
  readonly minimumN: 5;
  /**
   * REPORTED = 两臂 n≥5、单一 runMode、共享冻结快照；
   * DIRECTIONAL_PILOT = 规模不足或快照未钉同——方向结论一律不给；
   * MIXED_RUN_MODE = 任一臂 runMode 混杂（拒聚合，指标行全 INSUFFICIENT_N）；
   * ARM_EMPTY = 某臂零 OK run。
   */
  readonly status: 'REPORTED' | 'DIRECTIONAL_PILOT' | 'MIXED_RUN_MODE' | 'ARM_EMPTY';
  readonly arms: readonly AblationArmStats[];
  /** 两臂是否检索同质（共享唯一 rootHash；null=有 FAILED 无账本不可判）。 */
  readonly sharedFrozenSnapshot: boolean | null;
  readonly marginalCost: {
    readonly deltaTokensMean: number | null;
    readonly deltaTokensCi95: AblationDeltaCi | null;
  };
  readonly perMetric: readonly AblationMetricRow[];
  readonly evidenceGrade: 'STATISTICAL_SIGNAL' | 'DIRECTIONAL_ONLY';
  readonly powerCaveat: string;
  /** Verbatim environment provenance notes (see AblationInput.environmentNotes). */
  readonly environmentNotes: readonly string[];
}

// ─── 内部 ────────────────────────────────────────────────────────────────────

function okRuns(arm: AblationArmInput): readonly FrozenRunObservation[] {
  return arm.runs.filter((r) => r.status === 'OK');
}

function sampleSd(values: readonly number[], mean: number): number {
  if (values.length <= 1) return 0;
  let acc = 0;
  for (const v of values) acc += (v - mean) * (v - mean);
  return Math.sqrt(acc / (values.length - 1));
}

/** 数值化：number 原样；boolean→1/0；null→剔除。 */
function numericValues(runs: readonly FrozenRunObservation[], metric: string): number[] {
  const out: number[] = [];
  for (const r of runs) {
    const m = r.metrics.find((x) => x.name === metric);
    if (m === undefined || m.value === null) continue;
    out.push(typeof m.value === 'boolean' ? (m.value ? 1 : 0) : m.value);
  }
  return out;
}

/**
 * 两样本非配对 bootstrap：每次迭代两臂独立重采样，delta = mean_a − mean_b 的
 * percentile 95% CI。种子派生走 deriveBootstrapSeed（questionId 位携带
 * primitive 命名空间，保证与 per-arm CI 种子不碰撞且第三方可复算）。
 *
 * 修正史（2026-08-16 day-r11 自查实锤）：初版种子推进漏了迭代号 it——所有
 * 重采样完全相同，CI 退化为单次抽样的点估计（N≥5 报告中 Δmean=0 而
 * CI=[-0.04,-0.04] 不含 0 的自相矛盾暴露了它）。现版每迭代两臂各取独立
 * 偏移（it*2 / it*2+1），且同迭代内索引步进混入 i 与样本长度的素数混合，
 * 保证重采样序列逐迭代变化、两臂不相关。确定性不变（种子+迭代即可复算）。
 */
function bootstrapDeltaCi(
  withValues: readonly number[],
  withoutValues: readonly number[],
  seed: number,
  iterations: number,
): { lower: number; upper: number } {
  const resample = (values: readonly number[], iterOffset: number): number => {
    let sum = 0;
    for (let i = 0; i < values.length; i += 1) {
      const idx = Math.floor(
        rand01(seed + iterOffset * 2654435761 + i * 40503 + values.length * 7919) * values.length,
      );
      sum += values[idx] ?? 0;
    }
    return sum / values.length;
  };
  const deltas: number[] = [];
  for (let it = 0; it < iterations; it += 1) {
    // 两臂同迭代取不同偏移（it*2 vs it*2+1）——同 n 时避免相关重采样
    // 低估差的方差。
    deltas.push(resample(withValues, it * 2) - resample(withoutValues, it * 2 + 1));
  }
  deltas.sort((a, b) => a - b);
  const lo = deltas[Math.floor(0.025 * deltas.length)]!;
  const hi = deltas[Math.ceil(0.975 * deltas.length) - 1]!;
  return { lower: lo, upper: hi };
}

/** 种子化的均匀 [0,1)（mulberry32 单步变体——确定性、可复算）。 */
function rand01(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function armStats(
  arm: AblationArmInput,
): { stats: AblationArmStats; ok: readonly FrozenRunObservation[]; modes: readonly string[] } {
  const ok = okRuns(arm);
  const modes = [...new Set(ok.map((r) => r.runMode))];
  const tokens = ok
    .map((r) => r.variability?.tokenUsage?.totalTokens)
    .filter((t): t is number => typeof t === 'number');
  const tokensMean = tokens.length > 0 ? tokens.reduce((s, v) => s + v, 0) / tokens.length : null;
  return {
    stats: {
      armId: arm.armId,
      config: arm.config,
      nOk: ok.length,
      failedRunCount: arm.runs.length - ok.length,
      distinctRunModes: modes,
      distinctSnapshotHashes: [
        ...new Set(ok.map((r) => r.variability?.retrievalRootHash).filter((h): h is string => typeof h === 'string')),
      ],
      tokensMean,
      tokensSd: tokensMean !== null ? sampleSd(tokens, tokensMean) : null,
    },
    ok,
    modes,
  };
}

// ─── 聚合 ────────────────────────────────────────────────────────────────────

/**
 * 构造一条指标对照行（纯函数）。directional=true（试点降级）时方向强制
 * null——试点不给方向结论；<2 非空观测连方向性均值都不给（§4.2）。
 */
function buildMetricRow(
  name: string,
  withValues: readonly number[],
  withoutValues: readonly number[],
  ctx: {
    readonly directional: boolean;
    readonly seed: number;
    readonly iterations: number;
    readonly nameSpace: string;
  },
): AblationMetricRow {
  if (withValues.length < 2 || withoutValues.length < 2) {
    // Single-arm descriptive view: the metric lives in exactly one arm
    // (structural absence in the other) — characterize it, never compare it.
    let descriptive: AblationMetricRow['descriptive'] = null;
    if (withValues.length >= 2 && withoutValues.length === 0) {
      descriptive = {
        armId: 'with',
        mean: withValues.reduce((a, v) => a + v, 0) / withValues.length,
        n: withValues.length,
      };
    } else if (withoutValues.length >= 2 && withValues.length === 0) {
      descriptive = {
        armId: 'without',
        mean: withoutValues.reduce((a, v) => a + v, 0) / withoutValues.length,
        n: withoutValues.length,
      };
    }
    return {
      name,
      status: 'INSUFFICIENT_N',
      withMean: null,
      withoutMean: null,
      withSd: null,
      withoutSd: null,
      deltaMean: null,
      deltaCi95: null,
      direction: null,
      descriptive,
    };
  }
  const withMean = withValues.reduce((s, v) => s + v, 0) / withValues.length;
  const withoutMean = withoutValues.reduce((s, v) => s + v, 0) / withoutValues.length;
  const metricSeed = deriveBootstrapSeed(ctx.seed, ctx.nameSpace, name);
  const ci = bootstrapDeltaCi(withValues, withoutValues, metricSeed, ctx.iterations);
  const direction: AblationMetricRow['direction'] = ctx.directional
    ? null
    : ci.lower > 0
      ? 'FAVORS_WITH'
      : ci.upper < 0
        ? 'FAVORS_WITHOUT'
        : 'NO_SIGNAL';
  return {
    name,
    status: ctx.directional ? 'INSUFFICIENT_N' : 'REPORTED',
    withMean,
    withoutMean,
    withSd: sampleSd(withValues, withMean),
    withoutSd: sampleSd(withoutValues, withoutMean),
    deltaMean: withMean - withoutMean,
    deltaCi95: {
      lower: ci.lower,
      upper: ci.upper,
      method: 'percentile-bootstrap-two-sample-unpaired',
      iterations: ctx.iterations,
      seed: metricSeed,
      unit: 'run',
    },
    direction,
    descriptive: null,
  };
}

/** 边际成本（token 两臂 bootstrap；<2×2 观测 → 全 null）。 */
function buildMarginalCost(
  withTokens: readonly number[],
  withoutTokens: readonly number[],
  ctx: { readonly seed: number; readonly iterations: number; readonly nameSpace: string },
): AblationReport['marginalCost'] {
  if (withTokens.length < 2 || withoutTokens.length < 2) {
    return { deltaTokensMean: null, deltaTokensCi95: null };
  }
  const costSeed = deriveBootstrapSeed(ctx.seed, ctx.nameSpace, '__tokens__');
  const ci = bootstrapDeltaCi(withTokens, withoutTokens, costSeed, ctx.iterations);
  return {
    deltaTokensMean:
      withTokens.reduce((s, v) => s + v, 0) / withTokens.length -
      withoutTokens.reduce((s, v) => s + v, 0) / withoutTokens.length,
    deltaTokensCi95: {
      lower: ci.lower,
      upper: ci.upper,
      method: 'percentile-bootstrap-two-sample-unpaired',
      iterations: ctx.iterations,
      seed: costSeed,
      unit: 'run',
    },
  };
}

/** 两臂快照同源性：共享唯一 rootHash=true；有臂零账本=null；漂移=false。 */
function computeSharedSnapshot(
  withHashes: readonly string[],
  withoutHashes: readonly string[],
): boolean | null {
  if (withHashes.length === 0 || withoutHashes.length === 0) return null;
  if (withHashes.length === 1 && withoutHashes.length === 1) return withHashes[0] === withoutHashes[0];
  return false;
}

/** 报告状态判定（优先级：空臂 > 混 runMode > N 与快照充分性）。 */
function resolveAblationStatus(v: {
  readonly armEmpty: boolean;
  readonly mixedMode: boolean;
  readonly nSufficient: boolean;
  readonly sharedFrozenSnapshot: boolean | null;
}): AblationReport['status'] {
  if (v.armEmpty) return 'ARM_EMPTY';
  if (v.mixedMode) return 'MIXED_RUN_MODE';
  return v.nSufficient && v.sharedFrozenSnapshot === true ? 'REPORTED' : 'DIRECTIONAL_PILOT';
}

/** 指标名并集（with 臂出现序优先，without 臂补充——确定性）。 */
function metricNameUnion(arms: readonly (readonly FrozenRunObservation[])[]): string[] {
  const names: string[] = [];
  for (const runs of arms) {
    for (const r of runs) {
      for (const m of r.metrics) {
        if (!names.includes(m.name)) names.push(m.name);
      }
    }
  }
  return names;
}

export function aggregateAblation(input: AblationInput): AblationReport {
  const seed = input.seed ?? DEFAULT_BASE_SEED;
  const iterations = input.iterations ?? DEFAULT_BOOTSTRAP_ITERATIONS;
  const withS = armStats(input.withArm);
  const withoutS = armStats(input.withoutArm);

  const mixedMode =
    withS.modes.length > 1 || withoutS.modes.length > 1 || (withS.modes.length === 1 && withoutS.modes.length === 1 && withS.modes[0] !== withoutS.modes[0]);
  const armEmpty = withS.stats.nOk === 0 || withoutS.stats.nOk === 0;

  const withHashes = withS.stats.distinctSnapshotHashes;
  const withoutHashes = withoutS.stats.distinctSnapshotHashes;
  const sharedFrozenSnapshot = computeSharedSnapshot(withHashes, withoutHashes);
  const names = metricNameUnion([withS.ok, withoutS.ok]);

  const nSufficient = withS.stats.nOk >= FROZEN_MINIMUM_N && withoutS.stats.nOk >= FROZEN_MINIMUM_N;
  const status = resolveAblationStatus({ armEmpty, mixedMode, nSufficient, sharedFrozenSnapshot });
  const directional = status !== 'REPORTED';

  const nameSpace = `${input.questionId}::${input.primitive}`;
  const perMetric: AblationMetricRow[] = names.map((name) =>
    buildMetricRow(name, numericValues(withS.ok, name), numericValues(withoutS.ok, name), {
      directional,
      seed,
      iterations,
      nameSpace,
    }),
  );

  // 边际成本：token 同样两臂 bootstrap（只要有 ≥2×2 观测）。
  const tokensOf = (runs: readonly FrozenRunObservation[]): readonly number[] =>
    runs
      .map((r) => r.variability?.tokenUsage?.totalTokens)
      .filter((t): t is number => typeof t === 'number');
  const marginalCost = buildMarginalCost(tokensOf(withS.ok), tokensOf(withoutS.ok), {
    seed,
    iterations,
    nameSpace,
  });

  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt ?? '1970-01-01T00:00:00.000Z',
    questionId: input.questionId,
    primitive: input.primitive,
    seed,
    iterations,
    minimumN: FROZEN_MINIMUM_N,
    status,
    arms: [withS.stats, withoutS.stats],
    sharedFrozenSnapshot,
    marginalCost,
    perMetric,
    evidenceGrade: status === 'REPORTED' ? 'STATISTICAL_SIGNAL' : 'DIRECTIONAL_ONLY',
    powerCaveat: FROZEN_POWER_CAVEAT,
    environmentNotes: input.environmentNotes ?? [],
  };
}

// ─── 渲染 ────────────────────────────────────────────────────────────────────

function fmt(x: number | null, digits = 4): string {
  return x === null ? '—' : x.toFixed(digits);
}

export function renderAblation(report: AblationReport): string {
  const lines: string[] = [];
  lines.push(`# Ablation: ${report.primitive} (with vs without) — ${report.questionId}`);
  lines.push('');
  lines.push(
    `status: **${report.status}** · evidence: **${report.evidenceGrade}** · seed=${report.seed} · iterations=${report.iterations} · minimumN=${report.minimumN}`,
  );
  lines.push(
    `retrieval homogeneity: ${
      report.sharedFrozenSnapshot === true
        ? 'SHARED FROZEN SNAPSHOT (corpus pinned — orchestration effect isolated)'
        : report.sharedFrozenSnapshot === false
          ? 'DIVERGED SNAPSHOT HASHES (retrieval drift is a confound in this comparison)'
          : 'UNKNOWN (failed runs carry no ledger)'
    }`,
  );
  if (report.status === 'DIRECTIONAL_PILOT') {
    lines.push('');
    lines.push(
      '> **DIRECTIONAL_PILOT** — at least one arm has n<5 or snapshots are not pinned shared. ' +
        'Means are shown for planning only; directions are suppressed (方向性信号非统计确认).',
    );
  }
  if (report.status === 'MIXED_RUN_MODE') {
    lines.push('');
    lines.push('> **MIXED_RUN_MODE** — an arm mixes run modes (LIVE must never be averaged with replay). Aggregation refused.');
  }
  lines.push('');
  for (const arm of report.arms) {
    lines.push(
      `arm ${arm.armId}: n_ok=${arm.nOk} failed=${arm.failedRunCount} · tokens mean=${fmt(arm.tokensMean, 0)} sd=${fmt(arm.tokensSd, 0)} · config="${arm.config}"`,
    );
    lines.push(`  runModes=[${arm.distinctRunModes.join(',')}] snapshotHashes=[${arm.distinctSnapshotHashes.map((h) => h.slice(0, 12)).join(',')}]`);
  }
  lines.push('');
  const cost = report.marginalCost;
  lines.push(
    `marginal cost (with − without): ${fmt(cost.deltaTokensMean, 0)} tokens` +
      (cost.deltaTokensCi95 !== null ? ` · CI95=[${cost.deltaTokensCi95.lower.toFixed(0)}, ${cost.deltaTokensCi95.upper.toFixed(0)}]` : ''),
  );
  lines.push('');
  lines.push('| metric | with mean±sd | without mean±sd | Δ mean | Δ CI95 | direction |');
  lines.push('|---|---|---|---|---|---|');
  for (const m of report.perMetric) {
    if (m.status !== 'REPORTED' && m.withMean === null) {
      const desc =
        m.descriptive != null
          ? `INSUFFICIENT_N (desc ${m.descriptive.armId}: mean=${fmt(m.descriptive.mean)} n=${m.descriptive.n} — structurally absent in the other arm, not comparable)`
          : 'INSUFFICIENT_N';
      lines.push(`| ${m.name} | — | — | — | — | ${desc} |`);
      continue;
    }
    lines.push(
      `| ${m.name} | ${fmt(m.withMean)}±${fmt(m.withSd)} | ${fmt(m.withoutMean)}±${fmt(m.withoutSd)} | ${fmt(m.deltaMean)} | ` +
        (m.deltaCi95 !== null ? `[${fmt(m.deltaCi95.lower, 3)}, ${fmt(m.deltaCi95.upper, 3)}]` : '—') +
        ` | ${m.direction ?? (report.status === 'REPORTED' ? 'NO_SIGNAL' : 'directional-only')} |`,
    );
  }
  lines.push('');
  lines.push(`power caveat: ${report.powerCaveat}`);
  if (report.environmentNotes.length > 0) {
    lines.push('');
    for (const note of report.environmentNotes) lines.push(`environment: ${note}`);
  }
  lines.push('cannot-prove: this comparison does not establish causal attribution to the primitive (model/prompt/retrieval drift remain confounds); directions describe CI position only.');
  return lines.join('\n');
}
