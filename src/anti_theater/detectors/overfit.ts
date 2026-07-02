/**
 * overfit detector —— 基准过拟合攻击检测（AT-OVERFIT）。
 *
 * Authority: PROJECT_PLAN/APPENDIX_E_ANTI_THEATER.md §2（detect_overfit 伪代码）+
 *            06_ROADMAP_AND_DOD.md §5.3（W3 DOD：确定性 / 误报率=0 / 不用 LLM-as-judge）+
 *            09 §9（完整 hidden/private split 机制·W4 ROADMAP）。
 *
 * 攻击语义：仅声明 'public' split 的评估（无 'hidden' split holdout）时，指标可能在 public
 *           benchmark 上过拟合（select-for / tune-on public），缺乏独立 holdout 即视为 benchmark
 *           overfit 风险面。本检测以 WARN（非阻断）方式标记，提示补全独立 holdout 评估。
 *
 * 适配裁决（与伪代码对齐·outcome 调整为 WARN）：
 *   - splits_run = set(executionTrace.measurements.filter(m => m.splitName !== undefined).map(m => m.splitName.toLowerCase()))
 *   - 'hidden' ∉ splits_run 且 'public' ∈ splits_run → outcome='WARN' / reasonCode='PUBLIC_ONLY_OVERFIT'
 *   - outcome='WARN'（非 FAIL）·blockSeal=false（不阻断 seal，仅 Honesty Wall 展示）
 *
 * ROADMAP（完整 hidden/private split 机制·W4·§9）：当前仅静态 public-only 检测（确定性·零误报）。
 *   - 完整 hidden split 机制（holdout 注册 + 独立容器摘要 + holdout-only rerun 比对）为 W4 增量。
 *   - 当前检测无法区分 'public' split 是否事后被当作 holdout 使用（仅做静态字段判定）。
 *
 * 模型中立（无 qwen/dashscope/openai 字面量·F3/C1）。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。纯函数·确定性·不 mutate input·不读 FS/网络。
 */

import type { AntiTheaterLintInput, DetectorFinding } from '../types.ts';
import { makeFinding } from '../finding_factory.ts';

/**
 * 检测基准过拟合攻击（AT-OVERFIT）。
 *
 * 触发条件（确定性·严格）：
 *   - 收集所有 measurements.splitName（非空）的小写集合 splits_run
 *   - 'hidden' ∉ splits_run 且 'public' ∈ splits_run → 单条 WARN finding（PUBLIC_ONLY_OVERFIT）
 *   - 其他情形（无 split / 含 hidden / 仅非 public split）→ 无发现
 *
 * 误报率=0 保证：触发条件全部基于 MeasurementTrace.splitName 字段的精确字面量集合判定
 *               （'hidden' 不在 ∧ 'public' 在），无启发式 / 无近似 / 无概率判定。
 *
 * @param input anti-theater lint 输入（消费 executionTrace.measurements.splitName）
 * @returns 单条 DetectorFinding（命中）或空数组（未命中）
 */
export function detect_overfit(input: AntiTheaterLintInput): readonly DetectorFinding[] {
  // splits_run：所有非空 splitName 的小写集合（对齐伪代码 set comprehension）。
  const splitsRun = new Set<string>();
  for (const measurement of input.executionTrace.measurements) {
    const splitName = measurement.splitName;
    if (splitName !== undefined && splitName.length > 0) {
      splitsRun.add(splitName.toLowerCase());
    }
  }

  // 'hidden' 不在且 'public' 在 → public-only 评估（缺独立 holdout · overfit 风险面）。
  if (!splitsRun.has('hidden') && splitsRun.has('public')) {
    const finding: DetectorFinding = makeFinding({
      attackId: 'AT-OVERFIT',
      outcome: 'WARN',
      reasonCode: 'PUBLIC_ONLY_OVERFIT',
      evidenceRef: input.fec.fecId,
      message:
        "Execution trace declares only a 'public' split with no 'hidden' holdout " +
        '(benchmark overfit risk: metrics may be select-for / tuned-on the public split; ' +
        'require an independent hidden/private holdout for honest evaluation).',
      affectedProofHashInputs: ['executionTrace.measurements'],
      remediation:
        "Add at least one measurement with splitName='hidden' (or a pre-registered private holdout) " +
        'so that public-split metrics can be cross-checked against an unseen split.',
    });
    return [finding];
  }

  return [];
}
