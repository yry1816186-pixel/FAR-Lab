/**
 * anti_theater finding_factory —— detector 产出 DetectorFinding 的统一工厂。
 *
 * Authority: PROJECT_PLAN/APPENDIX_E_ANTI_THEATER.md §2（detect_* 返回 Finding）+ §3.1（severity 五值）。
 *
 * 职责：
 *   - 统一 detector 产出形状（stored: AntiTheaterFinding 存储型 + ext: 派生展示扩展）。
 *   - 自动派生 findingId（attackId + 可选后缀·多 finding 时区分）/ hasFail（outcome=FAIL）/ severity（D2 双轴）。
 *   - 校验 attackId ∈ ATTACK_ID_TO_KIND + blockSeal 与 outcome 一致性（不变量·零容忍 #4 不掩盖）。
 *
 * 模型中立。零容忍合规：无 any / @ts-ignore / 双重断言 / 桩。纯函数（不 mutate 输入）。
 */

import type { ProofCheckOutcome } from '../schema/enums.ts';
import type {
  AntiTheaterAttackKind,
  AntiTheaterFinding,
  AntiTheaterFindingExtension,
  AntiTheaterSeverity,
  DetectorFinding,
} from './types.ts';
import { ATTACK_ID_TO_KIND } from './types.ts';
import { AntiTheaterInvariantError } from './errors.ts';

/** makeFinding 输入（detector 视角·attackId + outcome + reasonCode 必填）。 */
export interface MakeFindingInput {
  /** APPENDIX_E §2 attackId（AT-* 前缀·如 'AT-POSTHOC-THRESHOLD'）。 */
  readonly attackId: string;
  /** 存储轴结果（PASS/FAIL/WARN/SKIP·D2）。 */
  readonly outcome: ProofCheckOutcome;
  /** 机器可读原因代码（进入 VerdictKernelOutput.reasonCodes）。 */
  readonly reasonCode: string;
  /** 指向的 evidence record（call_records.seq 或 evidence_log 记录 id）。 */
  readonly evidenceRef: string;
  /** 机器可读 + 人类可读说明。 */
  readonly message: string;
  /** 该 finding 影响的 proofHash 输入字段路径（APPENDIX_E §7.2）。 */
  readonly affectedProofHashInputs?: readonly string[];
  /** 修复建议（Honesty Wall 展示）。 */
  readonly remediation?: string;
  /** 多 finding 时 findingId 后缀（如 'CONTENT_HASH'·单 finding 省略）。 */
  readonly findingIdSuffix?: string;
  /**
   * outcome=FAIL 时是否升级 severity 为 BLOCK（拒绝 seal）。
   * BLOCK 类 attack：AT-FAKE-PASS / AT-JUDGE-OVERRIDE / AT-DATA-HASH-FAKE / AT-WORKFLOW-DIGEST / AT-DEP-FLOAT-DRIFT。
   */
  readonly blockSeal?: boolean;
}

/**
 * 构造 DetectorFinding（detector 统一产出工厂）。
 *
 * @throws {AntiTheaterInvariantError} attackId 未映射 / blockSeal=true 但 outcome≠FAIL（不变量违反）。
 */
export function makeFinding(input: MakeFindingInput): DetectorFinding {
  const attackKind: AntiTheaterAttackKind | undefined = ATTACK_ID_TO_KIND[input.attackId];
  if (attackKind === undefined) {
    throw new AntiTheaterInvariantError(
      `makeFinding: unknown attackId '${input.attackId}' (not in ATTACK_ID_TO_KIND)`,
    );
  }
  if (input.blockSeal === true && input.outcome !== 'FAIL') {
    throw new AntiTheaterInvariantError(
      `makeFinding: blockSeal=true requires outcome='FAIL' (got '${input.outcome}' for ${input.attackId})`,
    );
  }

  const findingId =
    input.findingIdSuffix !== undefined && input.findingIdSuffix.length > 0
      ? `${input.attackId}-${input.findingIdSuffix}`
      : input.attackId;
  const hasFail = input.outcome === 'FAIL';
  const severity: AntiTheaterSeverity =
    input.blockSeal === true ? 'BLOCK' : severityFromOutcome(input.outcome);

  const stored: AntiTheaterFinding = {
    findingId,
    attackKind,
    outcome: input.outcome,
    hasFail,
    evidenceRef: input.evidenceRef,
    message: input.message,
  };

  // optional 字段条件展开：undefined 时不包含键（与 Python canonical JSON 对齐·D9）。
  const ext: AntiTheaterFindingExtension = {
    findingId,
    attackId: input.attackId,
    severity,
    reasonCode: input.reasonCode,
    deterministic: true,
    ...(input.affectedProofHashInputs !== undefined
      ? { affectedProofHashInputs: input.affectedProofHashInputs }
      : {}),
    ...(input.remediation !== undefined ? { remediation: input.remediation } : {}),
  };

  return { stored, ext };
}

/** outcome → 派生展示轴 severity（D2·blockSeal 由调用方处理）。 */
function severityFromOutcome(outcome: ProofCheckOutcome): AntiTheaterSeverity {
  switch (outcome) {
    case 'FAIL':
      return 'FAIL';
    case 'WARN':
      return 'WARN';
    case 'PASS':
      return 'INFO';
    case 'SKIP':
      return 'INFO';
  }
}
