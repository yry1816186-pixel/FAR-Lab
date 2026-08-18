/**
 * evaluation/judge_reliability — SCI-JUDGE-001 LLM Judge 只能作为校准后的参考信号。
 *
 * 宪法条款的机器化：LLM judge 的一切输出默认是「未校准的标注」，只有通过
 * 9 项偏差检查（A/B 交换顺序一致性、verbosity 偏差、self-preference、
 * 生成/判同源偏差、anchoring、参考答案泄漏、语言偏差、人工一致性、
 * seed/order 重放稳定性）才升格为「校准后的参考信号」。未达标 → 降级为
 * UNCALIBRATED_ANNOTATION_ONLY，不得影响 deterministic verdict。
 *
 * 阈值声明（诚实边界）：DEFAULT_ENGINEERING_BUDGET_THRESHOLDS 是
 * ENGINEERING BUDGET（工程预算），不是 empirical claim——它们规定「多差
 * 才算未校准」的操作性标准，不声称对应任何人群的真实偏差分布。
 *
 * Cannot-prove：各项检查是启发式统计——通过 9 项检查证明的是「在所供给
 * 的评估样本上未见这九类偏差的统计证据」，不证明 judge 无偏（未采样到
 * 的偏差面、样本内巧妙伪装的偏差、以及样本本身的选择偏差都不在证明
 * 范围内）。judge 信号对 deterministic verdict 的零影响由
 * assertJudgeCannotTouchVerdict 的静态 import 扫描结构性保证（模块级），
 * 不排除运行时动态耦合（见 architecture/dependency_rules.ts 的同类边界）。
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { scanFileImports } from '../architecture/dependency_rules.ts';
import { TRUST_KERNEL_LAYERS } from '../architecture/dependency_rules.ts';
import { shingleJaccard } from './eval_family.ts';

// ---------------------------------------------------------------------------
// 观测数据结构（评估运行产物 → JudgeCard）
// ---------------------------------------------------------------------------

/** A/B 交换顺序对照轮：同一对答案在两种呈现顺序下各判一次。 */
export interface SwapRound { readonly pairId: string; readonly order: 'AB' | 'BA'; readonly preferred: 'A' | 'B' }
/** 长度-评分对：judge 给出的分数与答案长度（verbosity 偏差的输入）。 */
export interface VerbosityPair { readonly answerId: string; readonly lengthTokens: number; readonly score: number }
/** 自偏好轮：judge 面对包含自己生成答案的对局。 */
export interface SelfPrefRound { readonly roundId: string; readonly judgeOwnAnswer: boolean; readonly preferredOwn: boolean }
/** 生成/判同源对：answer 的生成器与 judge 是否同源。 */
export interface OriginPair { readonly answerId: string; readonly sameOrigin: boolean; readonly score: number }
/** 锚定轮：记录首个呈现位置与是否选首位。 */
export interface AnchorRound { readonly roundId: string; readonly firstPresented: 'A' | 'B'; readonly choseFirst: boolean }
/** 泄漏检查项：judge 输出文本与参考答案文本。 */
export interface LeakJudgment { readonly answerId: string; readonly judgeText: string; readonly referenceAnswer: string }
/** 语言-评分对。 */
export interface LanguagePair { readonly answerId: string; readonly language: string; readonly score: number }
/** 人机判定对（human label agreement 的输入）。 */
export interface HumanPair { readonly item: string; readonly judgeDecision: string; readonly humanDecision: string }
/** 一次重放运行：同配置不同 seed/呈现顺序下的完整决策序列。 */
export interface ReplayRun { readonly seed: number; readonly decisions: readonly string[] }

/** Judge 证据卡：9 项偏差检查的全部观测（由评估运行产物如实供给）。 */
export interface JudgeCard {
  readonly swapRounds: readonly SwapRound[];
  readonly verbosityPairs: readonly VerbosityPair[];
  readonly selfPrefRounds: readonly SelfPrefRound[];
  readonly originPairs: readonly OriginPair[];
  readonly anchorRounds: readonly AnchorRound[];
  readonly leakJudgments: readonly LeakJudgment[];
  readonly languagePairs: readonly LanguagePair[];
  readonly humanPairs: readonly HumanPair[];
  readonly replayRuns: readonly ReplayRun[];
}

export type BiasCheckId =
  | 'swap_consistency'
  | 'verbosity_correlation'
  | 'self_preference'
  | 'same_origin'
  | 'anchoring'
  | 'leakage'
  | 'language_bias'
  | 'human_agreement'
  | 'replay_stability';

export interface BiasCheckResult {
  readonly check: BiasCheckId;
  /** 主统计量（一致率/相关系数/均值差…）；null = 样本不足无法计算。 */
  readonly statistic: number | null;
  readonly flagged: boolean;
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// 阈值（ENGINEERING BUDGET —— 非 empirical claim，见模块头声明）
// ---------------------------------------------------------------------------

/**
 * 默认工程预算阈值。这些数值规定「多差才降级」的操作性标准，其来源是
 * 工程判断而非经验研究——修改它们是政策变更，不是校准更新。
 */
export const DEFAULT_ENGINEERING_BUDGET_THRESHOLDS: Readonly<Record<BiasCheckId, number>> = {
  swap_consistency: 0.9,        // 双序身份一致率下限
  verbosity_correlation: 0.3,   // |Pearson(长度, 评分)| 上限
  self_preference: 0.65,        // 自家答案偏好率上限（无偏期望 0.5）
  same_origin: 0.05,            // |同源均分 − 异源均分| 上限
  anchoring: 0.15,              // |首位选择率 − 0.5| 上限
  leakage: 0,                   // 泄漏命中数上限（任何命中即降级）
  language_bias: 0.05,          // |跨语言均分差| 上限
  human_agreement: 0.7,         // 人机一致率下限
  replay_stability: 0.95,       // 重放决策位一致率下限
};

/** 每项检查的最小样本量（不足 → fail-closed 降级，不冒充通过）。 */
export const MIN_SAMPLE_SIZES: Readonly<Record<BiasCheckId, number>> = {
  swap_consistency: 4,
  verbosity_correlation: 3,
  self_preference: 8,
  same_origin: 4,
  anchoring: 8,
  leakage: 1,
  language_bias: 4,
  human_agreement: 8,
  replay_stability: 2,
};

/** anchoring 阈值即「偏离 0.5 的容许边际」（单独导出便于审计引用）。 */
export const ANCHORING_MARGIN = DEFAULT_ENGINEERING_BUDGET_THRESHOLDS.anchoring;

// ---------------------------------------------------------------------------
// 统计工具（纯函数）
// ---------------------------------------------------------------------------

/** Pearson 相关系数；样本 <3 或零方差 → null。 */
export function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  const n = xs.length;
  if (n < 3 || ys.length !== n) return null;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  if (vx === 0 || vy === 0) return null;
  return cov / Math.sqrt(vx * vy);
}

function mean(xs: readonly number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function insufficient(check: BiasCheckId, got: number, needed: number): BiasCheckResult {
  return { check, statistic: null, flagged: true, reason: `insufficient sample: ${got} < ${needed} for ${check} — absence of evidence is not evidence of unbiasedness (fail-closed)` };
}

// ---------------------------------------------------------------------------
// 九项偏差检查（各有纯函数）
// ---------------------------------------------------------------------------

/**
 * 1. A/B 交换顺序一致性：同一 pairId 在 AB/BA 两序下偏好同一「身份」的
 * 比率。位置一致（换序选同一位置）→ 统计量跌向 0 → position bias 暴露。
 */
export function swapOrderConsistency(rounds: readonly SwapRound[]): BiasCheckResult {
  const byPair = new Map<string, { ab?: 'A' | 'B'; ba?: 'A' | 'B' }>();
  for (const r of rounds) {
    const entry = byPair.get(r.pairId) ?? {};
    if (r.order === 'AB') entry.ab = r.preferred; else entry.ba = r.preferred;
    byPair.set(r.pairId, entry);
  }
  const complete = [...byPair.values()].filter((e) => e.ab !== undefined && e.ba !== undefined);
  if (complete.length < MIN_SAMPLE_SIZES.swap_consistency) {
    return insufficient('swap_consistency', complete.length, MIN_SAMPLE_SIZES.swap_consistency);
  }
  const consistent = complete.filter((e) => e.ab === e.ba).length;
  const rate = consistent / complete.length;
  const flagged = rate < DEFAULT_ENGINEERING_BUDGET_THRESHOLDS.swap_consistency;
  return { check: 'swap_consistency', statistic: rate, flagged, reason: flagged ? `A/B swap consistency ${rate.toFixed(3)} below budget ${DEFAULT_ENGINEERING_BUDGET_THRESHOLDS.swap_consistency} — position bias suspected` : `A/B swap consistency ${rate.toFixed(3)} within budget` };
}

/** 2. Verbosity/style 偏差：长度与评分的 Pearson 相关（绝对值超限 → 偏长答案）。 */
export function verbosityBias(pairs: readonly VerbosityPair[]): BiasCheckResult {
  if (pairs.length < MIN_SAMPLE_SIZES.verbosity_correlation) {
    return insufficient('verbosity_correlation', pairs.length, MIN_SAMPLE_SIZES.verbosity_correlation);
  }
  const r = pearson(pairs.map((p) => p.lengthTokens), pairs.map((p) => p.score));
  if (r === null) {
    return insufficient('verbosity_correlation', pairs.length, MIN_SAMPLE_SIZES.verbosity_correlation);
  }
  const flagged = Math.abs(r) > DEFAULT_ENGINEERING_BUDGET_THRESHOLDS.verbosity_correlation;
  return { check: 'verbosity_correlation', statistic: r, flagged, reason: flagged ? `length-score correlation |${r.toFixed(3)}| exceeds budget ${DEFAULT_ENGINEERING_BUDGET_THRESHOLDS.verbosity_correlation} — verbosity bias suspected` : `length-score correlation ${r.toFixed(3)} within budget` };
}

/** 3. Self-preference：judge 面对自家答案时的偏好率（无偏期望 0.5）。 */
export function selfPreference(rounds: readonly SelfPrefRound[]): BiasCheckResult {
  const own = rounds.filter((r) => r.judgeOwnAnswer);
  if (own.length < MIN_SAMPLE_SIZES.self_preference) {
    return insufficient('self_preference', own.length, MIN_SAMPLE_SIZES.self_preference);
  }
  const rate = own.filter((r) => r.preferredOwn).length / own.length;
  const flagged = rate > DEFAULT_ENGINEERING_BUDGET_THRESHOLDS.self_preference;
  return { check: 'self_preference', statistic: rate, flagged, reason: flagged ? `own-answer preference ${rate.toFixed(3)} exceeds budget ${DEFAULT_ENGINEERING_BUDGET_THRESHOLDS.self_preference}` : `own-answer preference ${rate.toFixed(3)} within budget` };
}

/** 4. 生成/判同源偏差：同源均分 − 异源均分（|delta| 超限 → 同源提分）。 */
export function sameOriginBias(pairs: readonly OriginPair[]): BiasCheckResult {
  const same = pairs.filter((p) => p.sameOrigin).map((p) => p.score);
  const diff = pairs.filter((p) => !p.sameOrigin).map((p) => p.score);
  if (same.length < MIN_SAMPLE_SIZES.same_origin || diff.length < MIN_SAMPLE_SIZES.same_origin) {
    return insufficient('same_origin', Math.min(same.length, diff.length), MIN_SAMPLE_SIZES.same_origin);
  }
  const delta = mean(same) - mean(diff);
  const flagged = Math.abs(delta) > DEFAULT_ENGINEERING_BUDGET_THRESHOLDS.same_origin;
  return { check: 'same_origin', statistic: delta, flagged, reason: flagged ? `same-origin score lift ${delta.toFixed(3)} exceeds budget ${DEFAULT_ENGINEERING_BUDGET_THRESHOLDS.same_origin}` : `same-origin score lift ${delta.toFixed(3)} within budget` };
}

/** 5. Anchoring：首位选择率对 0.5 的偏离（超出边际 → 首提锚定）。 */
export function checkAnchoring(rounds: readonly AnchorRound[]): BiasCheckResult {
  if (rounds.length < MIN_SAMPLE_SIZES.anchoring) {
    return insufficient('anchoring', rounds.length, MIN_SAMPLE_SIZES.anchoring);
  }
  const rate = rounds.filter((r) => r.choseFirst).length / rounds.length;
  const deviation = Math.abs(rate - 0.5);
  const flagged = deviation > DEFAULT_ENGINEERING_BUDGET_THRESHOLDS.anchoring;
  return { check: 'anchoring', statistic: rate, flagged, reason: flagged ? `first-position rate ${rate.toFixed(3)} deviates from 0.5 by ${deviation.toFixed(3)} > margin ${ANCHORING_MARGIN}` : `first-position rate ${rate.toFixed(3)} within margin ${ANCHORING_MARGIN}` };
}

/**
 * 6. Reference-answer 泄漏：judge 输出与参考答案近重复（shingle Jaccard
 * ≥ 0.8，复用 eval_family 的近重复判定）→ 判的是记忆不是判断。
 */
export function referenceLeakage(judgments: readonly LeakJudgment[]): BiasCheckResult {
  if (judgments.length < MIN_SAMPLE_SIZES.leakage) {
    return insufficient('leakage', judgments.length, MIN_SAMPLE_SIZES.leakage);
  }
  const hits = judgments.filter((j) => shingleJaccard(j.judgeText, j.referenceAnswer) >= 0.8).length;
  const flagged = hits > DEFAULT_ENGINEERING_BUDGET_THRESHOLDS.leakage;
  return { check: 'leakage', statistic: hits, flagged, reason: flagged ? `${hits} judge output(s) near-duplicate the reference answer — reference leakage` : 'no near-duplicate of the reference answer in judge outputs' };
}

/** 7. 语言偏差：跨语言均分差（超过预算 → 判分随语言漂移）。 */
export function languageBias(pairs: readonly LanguagePair[]): BiasCheckResult {
  const byLang = new Map<string, number[]>();
  for (const p of pairs) {
    const list = byLang.get(p.language) ?? [];
    list.push(p.score);
    byLang.set(p.language, list);
  }
  const langs = [...byLang.keys()].sort();
  if (langs.length < 2 || langs.some((l) => (byLang.get(l) ?? []).length < MIN_SAMPLE_SIZES.language_bias)) {
    return insufficient('language_bias', langs.length, 2);
  }
  const means = langs.map((l) => mean(byLang.get(l) ?? []));
  const delta = Math.max(...means) - Math.min(...means);
  const flagged = delta > DEFAULT_ENGINEERING_BUDGET_THRESHOLDS.language_bias;
  return { check: 'language_bias', statistic: delta, flagged, reason: flagged ? `cross-language mean gap ${delta.toFixed(3)} exceeds budget ${DEFAULT_ENGINEERING_BUDGET_THRESHOLDS.language_bias}` : `cross-language mean gap ${delta.toFixed(3)} within budget` };
}

/** 8. Human label agreement：judge 判定与人工标注的一致率。 */
export function humanAgreement(pairs: readonly HumanPair[]): BiasCheckResult {
  if (pairs.length < MIN_SAMPLE_SIZES.human_agreement) {
    return insufficient('human_agreement', pairs.length, MIN_SAMPLE_SIZES.human_agreement);
  }
  const rate = pairs.filter((p) => p.judgeDecision === p.humanDecision).length / pairs.length;
  const flagged = rate < DEFAULT_ENGINEERING_BUDGET_THRESHOLDS.human_agreement;
  return { check: 'human_agreement', statistic: rate, flagged, reason: flagged ? `judge-human agreement ${rate.toFixed(3)} below budget ${DEFAULT_ENGINEERING_BUDGET_THRESHOLDS.human_agreement}` : `judge-human agreement ${rate.toFixed(3)} within budget` };
}

/**
 * 9. Seed/order 重放稳定性：跨重放运行的决策位一致率（不稳定 = 信号本身
 * 不可复现，任何校准结论都不可信）。
 */
export function seedOrderReplay(runs: readonly ReplayRun[]): BiasCheckResult {
  if (runs.length < MIN_SAMPLE_SIZES.replay_stability) {
    return insufficient('replay_stability', runs.length, MIN_SAMPLE_SIZES.replay_stability);
  }
  const len = runs[0]!.decisions.length;
  if (runs.some((r) => r.decisions.length !== len)) {
    return { check: 'replay_stability', statistic: null, flagged: true, reason: 'replay runs have different decision-sequence lengths — not comparable' };
  }
  const reference = runs[0]!.decisions;
  const positions = new Array<boolean>(len).fill(true);
  for (let i = 0; i < len; i += 1) {
    for (const run of runs) {
      if (run.decisions[i] !== reference[i]) positions[i] = false;
    }
  }
  const rate = positions.filter((p) => p).length / len;
  const flagged = rate < DEFAULT_ENGINEERING_BUDGET_THRESHOLDS.replay_stability;
  return { check: 'replay_stability', statistic: rate, flagged, reason: flagged ? `replay decision stability ${rate.toFixed(3)} below budget ${DEFAULT_ENGINEERING_BUDGET_THRESHOLDS.replay_stability} — judge signal not reproducible` : `replay decision stability ${rate.toFixed(3)} within budget` };
}

// ---------------------------------------------------------------------------
// 综合评估：达标 / 降级
// ---------------------------------------------------------------------------

export type JudgeReliabilityStatus = 'CALIBRATED_REFERENCE' | 'UNCALIBRATED_ANNOTATION_ONLY';

export interface JudgeReliabilityReport {
  readonly status: JudgeReliabilityStatus;
  readonly checks: readonly BiasCheckResult[];
  readonly failedChecks: readonly BiasCheckResult[];
}

/**
 * 评估 judge 可靠性：9 项全部在工程预算内 → CALIBRATED_REFERENCE；任一
 * 项 flagged（含样本不足）→ UNCALIBRATED_ANNOTATION_ONLY（降级）。
 * 阈值取 DEFAULT_ENGINEERING_BUDGET_THRESHOLDS（预算 SSOT——各单项纯
 * 函数引用同一常量，收紧/放宽是政策变更，须改常量并过全部测试）。
 */
export function assessJudgeReliability(card: JudgeCard): JudgeReliabilityReport {
  const checks: BiasCheckResult[] = [
    swapOrderConsistency(card.swapRounds),
    verbosityBias(card.verbosityPairs),
    selfPreference(card.selfPrefRounds),
    sameOriginBias(card.originPairs),
    checkAnchoring(card.anchorRounds),
    referenceLeakage(card.leakJudgments),
    languageBias(card.languagePairs),
    humanAgreement(card.humanPairs),
    seedOrderReplay(card.replayRuns),
  ];
  const failedChecks = checks.filter((c) => c.flagged);
  return {
    status: failedChecks.length === 0 ? 'CALIBRATED_REFERENCE' : 'UNCALIBRATED_ANNOTATION_ONLY',
    checks,
    failedChecks,
  };
}

// ---------------------------------------------------------------------------
// 降级语义：judge 信号永不触碰 deterministic verdict
// ---------------------------------------------------------------------------

export interface JudgeSignal { readonly score: number; readonly note: string }
export interface DegradedJudgeSignal {
  readonly usableAsReference: boolean;
  readonly role: 'calibrated_reference' | 'annotation_only';
  readonly note: string;
}

/**
 * 把 judge 原始信号包装成带层级的参考信号：
 *   CALIBRATED_REFERENCE → 校准参考（advisory——仍然不进 deterministic verdict）
 *   UNCALIBRATED_ANNOTATION_ONLY → 仅标注（不可作为任何参考）
 * 两种状态的 note 都显式声明不进裁决——judge 信号的消费面只有报告层。
 */
export function degradeJudgeSignal(status: JudgeReliabilityStatus, signal: JudgeSignal): DegradedJudgeSignal {
  if (status === 'CALIBRATED_REFERENCE') {
    return {
      usableAsReference: true,
      role: 'calibrated_reference',
      note: `calibrated reference signal: ${signal.note} — advisory only, never feeds the deterministic verdict`,
    };
  }
  return {
    usableAsReference: false,
    role: 'annotation_only',
    note: `annotation only: ${signal.note} — judge reliability below engineering budget, must not influence the deterministic verdict`,
  };
}

// ---------------------------------------------------------------------------
// 结构性断言：verdict kernel 不 import judge 模块（静态 import 扫描）
// ---------------------------------------------------------------------------

/** 裁决路径目录（信任内核层 + 统计裁决层；src/kernel 目录不存在于本仓）。 */
export const VERDICT_KERNEL_DIRS: readonly string[] = [...TRUST_KERNEL_LAYERS, 'src/statistics/'];

export interface JudgeIsolationReport {
  readonly ok: boolean;
  readonly scannedFiles: number;
  readonly violations: readonly string[];
}

/**
 * 静态断言：裁决内核模块（src/fec、src/statistics 及全部信任内核层）不
 * import 任何 judge 模块。复用 architecture/dependency_rules 的 import
 * 扫描器；违规返回 ok=false + 逐条违规（kernel 文件 → judge 路径）。
 * Cannot-prove：模块级静态耦合为零，不证明运行时无动态耦合（依赖注入/
 * 字符串拼接加载不在扫描范围）——同 dependency_rules 的边界声明。
 */
export function assertJudgeCannotTouchVerdict(repoRoot: URL | string): JudgeIsolationReport {
  const root = typeof repoRoot === 'string' ? repoRoot : fileURLToPath(repoRoot);
  const prefixLen = root.endsWith('/') || root.endsWith('\\') ? root.length : root.length + 1;
  const violations: string[] = [];
  let scannedFiles = 0;

  for (const dir of VERDICT_KERNEL_DIRS) {
    const absDir = join(root, ...dir.replace(/\/$/, '').split('/'));
    if (!existsSync(absDir)) continue;
    const files: string[] = [];
    collectTsFiles(absDir, files);
    for (const absFile of files) {
      scannedFiles += 1;
      const relFile = absFile.replaceAll('\\', '/').slice(prefixLen).replaceAll('\\', '/');
      const text = readFileSync(absFile, 'utf8');
      for (const edge of scanFileImports(relFile, text)) {
        if (edge.to.startsWith('node:') || edge.to.startsWith('pkg:')) continue;
        if (/judge/i.test(edge.to)) {
          violations.push(`${edge.from} imports ${edge.to} (${edge.kind}) — verdict kernel must not consume judge signals`);
        }
      }
    }
  }
  return { ok: violations.length === 0, scannedFiles, violations };
}

function collectTsFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectTsFiles(full, out);
    } else if (entry.endsWith('.ts')) {
      out.push(full);
    }
  }
}
