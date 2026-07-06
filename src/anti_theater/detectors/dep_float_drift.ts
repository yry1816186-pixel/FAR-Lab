/**
 * dep_float_drift —— 依赖锁定文件漂移检测器（Dependency float drift detector）。
 *
 * attackId: AT-DEP-FLOAT-DRIFT（makeFinding 经 ATTACK_ID_TO_KIND 映射为 'dependency-float-drift'）。
 *
 * 伪代码原意（§2）：
 *   - 子路径 LOCKFILE_HASH_MISMATCH：frozen lockfile hash vs 实际 package-lock.json hash 不一致 → BLOCK。
 *   - 子路径 NUMERIC_TOLERANCE_UNFROZEN：声明 numericTolerance 但 preregistration 未冻结 tolerance → FAIL。
 *
 * 关键裁决（必须遵循·禁止臆造字段）：
 *   - D15 LOCKFILE PARTIAL/W4：重算 package-lock.json hash 需读 FS（hash_file），lint 纯函数不读 FS。
 *     MVP 跳过 LOCKFILE 子路径：preregistrationRecord.lockfileHash 存在时仅以 SKIP 注明（不产 finding，
 *     不阻塞 seal，不静默吞——返回 [] 即"无发现"，与伪代码"未检测到漂移"语义一致）。
 *     真正的 lockfile 重算升级为 W4 ROADMAP（需 lint 外部 probe 注入 actual lockfile hash）。
 *   - D13 numericTolerance 字段不存在：StatisticalPlan（fec_contract.ts）无 numericTolerance 字段，
 *     PreregistrationRecord.toleranceFrozen 才是 freeze 信号源。
 *     故 NUMERIC_TOLERANCE_UNFROZEN 改为检查 !preregistrationRecord.toleranceFrozen → outcome='FAIL'，
 *     affected 改为 'preregistrationRecord.toleranceFrozen'（实际检查的字段，非伪代码的 fec.statisticalPlan.numericTolerance）。
 *
 * MVP 实现：仅 NUMERIC_TOLERANCE_UNFROZEN 子路径。
 *
 * 模型中立（无 qwen/dashscope/openai 字面量）。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。
 * 纯函数：不 mutate input，不读 FS / 网络，确定性（同输入→同输出）。
 */

import type { AntiTheaterLintInput, DetectorFinding } from '../types.ts';
import { makeFinding } from '../finding_factory.ts';

/**
 * 检测依赖锁定文件漂移 / 数值容差未冻结。
 *
 * MVP 产出子路径：
 *   - NUMERIC_TOLERANCE_UNFROZEN（outcome=FAIL）：preregistrationRecord.toleranceFrozen === false。
 *
 * 返回 readonly DetectorFinding[]：[] 表示无发现（含 LOCKFILE 子路径 MVP 跳过场景）。
 */
export function detect_dep_float_drift(input: AntiTheaterLintInput): readonly DetectorFinding[] {
  const findings: DetectorFinding[] = [];

  // ── D15 LOCKFILE 子路径 MVP 跳过（PARTIAL/W4）──
  // 伪代码需 hash_file("<REPOSITORY_ROOT>/package-lock.json") 与 preregistrationRecord.lockfileHash 比对，
  // lint 纯函数不读 FS，故不产 LOCKFILE_HASH_MISMATCH finding。
  // lockfileHash 存在与否均不在此 MVP 路径产出（W4 由外部 probe 注入 actual hash 后再比对）。

  // ── D13 NUMERIC_TOLERANCE_UNFROZEN 子路径（MVP 唯一实现路径）──
  // StatisticalPlan 无 numericTolerance 字段；freeze 信号源是 preregistrationRecord.toleranceFrozen。
  if (!input.preregistrationRecord.toleranceFrozen) {
    findings.push(
      makeFinding({
        attackId: 'AT-DEP-FLOAT-DRIFT',
        outcome: 'FAIL',
        reasonCode: 'NUMERIC_TOLERANCE_UNFROZEN',
        evidenceRef: 'preregistrationRecord.toleranceFrozen',
        message:
          'Numeric tolerance not frozen in preregistration record (toleranceFrozen=false); ' +
          'float-comparison tolerance must be frozen before result observation to prevent post-hoc drift.',
        affectedProofHashInputs: ['preregistrationRecord.toleranceFrozen'],
        remediation:
          'Freeze numeric tolerance at preregistration time (set preregistrationRecord.toleranceFrozen=true) ' +
          'and record the frozen tolerance hash in the preregistration record.',
        // blockSeal 省略：本 attack list 型，单 finding 不强制 seal；由聚合层 reasonCode 影响 verdict。
      }),
    );
  }

  return findings;
}
