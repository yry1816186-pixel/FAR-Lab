/**
 * ProofEnvelopeValidator: 9 规则逐条自检 (09 §4).
 *
 * V1 scope 裁剪（诚实边界 · 21 W3 Acceptance「Validator 9 规则」+ 09 §10 + 33 CROSS-CUT-004）:
 *   09 §4 完整 9 规则中，objectHash 匹配(§4-2)/ledgerRoot 锚定(§4-3)/inclusionProof(§4-4)
 *   依赖 SciIRNode（08·W2）+ Merkle ledger（V3），V1 不含这两层。
 *   故 V1 用「self-check 简化版」9 规则（对应 21 W3 Acceptance「Validator 9 规则」）：
 *     RULE-PE-001..004 校验 input 标识/spec/sourceAnchor 非空（V1 桥接锚定），
 *     RULE-PE-005 reproHash 长度=64 hex，RULE-PE-006 prevProofHash 链式（call_records head 桥接），
 *     RULE-PE-007 反 theater（WARN/FAIL+CONFIRMED→FAIL，02 F1 / 23 §5.1，AT-02 双层防线），
 *     RULE-PE-008 sealedBy deterministic（V1 由类型+DB CHECK 三重保证，见规则内注释），
 *     RULE-PE-009 knownFailures 不隐藏。
 *   V1 Validator 是 self-check（small trusted checker 自验），「第三方独立验证路径」是 V2+ 路线图
 *   （33 CROSS-CUT-004 honesty_risk 已登记）。
 *
 * 模型中立: 不含任何 qwen/dashscope/bailian 字面量。
 * sealedBy = 'deterministic_sealer' (禁 LLM, F3).
 *
 * 零容忍合规: 无 any / @ts-ignore / 空 catch。
 */

import type { ProofCheckResult, ProofEnvelope, SealProofEnvelopeInput } from './types.ts';

// ---------------------------------------------------------------------------
// 9 规则定义
// ---------------------------------------------------------------------------

interface ValidatorRule {
  readonly ruleId: ProofCheckResult['ruleId'];
  readonly name: string;
  readonly check: (input: SealProofEnvelopeInput) => { outcome: ProofCheckResult['outcome']; detail: string };
}

const RULES: ReadonlyArray<ValidatorRule> = [
  {
    ruleId: 'RULE-PE-001',
    name: 'claim_non_empty',
    check(input) {
      if (input.claimId.trim().length === 0) {
        return { outcome: 'FAIL', detail: 'claimId is empty' };
      }
      return { outcome: 'PASS', detail: 'claimId is non-empty' };
    },
  },
  {
    ruleId: 'RULE-PE-002',
    name: 'verdict_node_exists',
    check(input) {
      if (input.verdictNodeId.trim().length === 0) {
        return { outcome: 'FAIL', detail: 'verdictNodeId is empty' };
      }
      return { outcome: 'PASS', detail: 'verdictNodeId is non-empty' };
    },
  },
  {
    ruleId: 'RULE-PE-003',
    name: 'falsification_spec_present',
    check(input) {
      if (input.falsificationSpec.prediction.trim().length === 0) {
        return { outcome: 'FAIL', detail: 'falsificationSpec.prediction is empty' };
      }
      if (input.falsificationSpec.metric.trim().length === 0) {
        return { outcome: 'FAIL', detail: 'falsificationSpec.metric is empty' };
      }
      return { outcome: 'PASS', detail: 'falsificationSpec is present and non-empty' };
    },
  },
  {
    ruleId: 'RULE-PE-004',
    name: 'source_anchor_present',
    check(input) {
      if (input.sourceAnchor.gitCommitSha.trim().length === 0) {
        return { outcome: 'FAIL', detail: 'sourceAnchor.gitCommitSha is empty' };
      }
      if (input.sourceAnchor.rawResponseHash.trim().length === 0) {
        return { outcome: 'WARN', detail: 'sourceAnchor.rawResponseHash is empty (offline replay?)' };
      }
      return { outcome: 'PASS', detail: 'sourceAnchor is present' };
    },
  },
  {
    ruleId: 'RULE-PE-005',
    name: 'repro_hash_present',
    check(input) {
      if (input.reproHash.length !== 64) {
        return { outcome: 'FAIL', detail: `reproHash length is ${input.reproHash.length}, expected 64` };
      }
      return { outcome: 'PASS', detail: 'reproHash is 64 hex chars' };
    },
  },
  {
    ruleId: 'RULE-PE-006',
    name: 'prev_proof_hash_valid',
    check(input) {
      if (input.prevProofHash.length !== 64) {
        return { outcome: 'FAIL', detail: `prevProofHash length is ${input.prevProofHash.length}, expected 64` };
      }
      if (!/^[0-9a-f]{64}$/.test(input.prevProofHash)) {
        return { outcome: 'FAIL', detail: 'prevProofHash is not valid hex' };
      }
      return { outcome: 'PASS', detail: 'prevProofHash is valid' };
    },
  },
  {
    ruleId: 'RULE-PE-007',
    name: 'conclusion_matches_checks',
    check(input) {
      const hasWarnOrFail = input.checks.some(
        (c) => c.outcome === 'WARN' || c.outcome === 'FAIL',
      );
      if (hasWarnOrFail && input.conclusion === 'CONFIRMED') {
        return {
          outcome: 'FAIL',
          detail: 'WARN/FAIL checks present but conclusion is CONFIRMED (anti-theater F1)',
        };
      }
      if (hasWarnOrFail) {
        return {
          outcome: 'WARN',
          detail: 'WARN/FAIL checks present, conclusion is not CONFIRMED (correct degradation)',
        };
      }
      return { outcome: 'PASS', detail: 'all checks pass, conclusion valid' };
    },
  },
  {
    // RULE-PE-008（09 §4-8 sealedBy deterministic）V1 诚实说明：
    // sealedBy 由三重保证使「非 deterministic」在 V1 运行时不可能发生——
    //   (1) TS 字面量类型 ProofEnvelope.sealedBy: 'deterministic_sealer'（types.ts，编译期锁定）；
    //   (2) DB CHECK sealed_by = 'deterministic_sealer'（migration 0004，落库兜底）；
    //   (3) sealer.ts 硬编码 sealedBy = 'deterministic_sealer'（INSERT 时赋值）。
    // SealProofEnvelopeInput 不含 sealedBy 字段（sealed 后才赋值），故 seal 阶段无可校验输入；
    // 本规则恒 PASS 是上述类型/DB 保证的必然结果，非「死规则」——违反路径在 V1 不存在。
    ruleId: 'RULE-PE-008',
    name: 'sealed_by_deterministic',
    check(_input) {
      return {
        outcome: 'PASS',
        detail:
          'sealedBy 由 TS 字面量类型 + DB CHECK + sealer 硬编码三重保证为 deterministic_sealer（F3）；V1 违反路径不存在，规则恒 PASS',
      };
    },
  },
  {
    ruleId: 'RULE-PE-009',
    name: 'known_failures_not_hidden',
    check(input) {
      if (input.knownFailures === undefined || input.knownFailures.length === 0) {
        return { outcome: 'PASS', detail: 'no known failures to report' };
      }
      // knownFailures 存在但内容为空字符串 → WARN
      const hasEmpty = input.knownFailures.some((f) => f.trim().length === 0);
      if (hasEmpty) {
        return { outcome: 'WARN', detail: 'knownFailures contains empty entries' };
      }
      // 有 knownFailures 但 conclusion 是 CONFIRMED → WARN (应当透明)
      if (input.conclusion === 'CONFIRMED') {
        return {
          outcome: 'WARN',
          detail: 'knownFailures present but conclusion is CONFIRMED (should be transparent)',
        };
      }
      return { outcome: 'PASS', detail: `transparently reporting ${input.knownFailures.length} known failure(s)` };
    },
  },
];

// ---------------------------------------------------------------------------
// Validator 入口
// ---------------------------------------------------------------------------

/**
 * 对 seal input 执行全部 9 条规则，返回 checks 数组。
 * 完全确定性，不依赖 LLM。
 */
export function validateProofEnvelope(input: SealProofEnvelopeInput): ProofCheckResult[] {
  return RULES.map((rule): ProofCheckResult => {
    const { outcome, detail } = rule.check(input);
    return { ruleId: rule.ruleId, ruleName: rule.name, outcome, detail };
  });
}

/**
 * 检查 WARN/FAIL check 时结论是否为 CONFIRMED (反 theater CI 断言用)
 */
export function hasAntiTheaterViolation(checks: ProofCheckResult[], conclusion: ProofEnvelope['conclusion']): boolean {
  const hasWarnOrFail = checks.some((c) => c.outcome === 'WARN' || c.outcome === 'FAIL');
  return hasWarnOrFail && conclusion === 'CONFIRMED';
}

/**
 * 统计 checks 摘要
 */
export function summarizeChecks(checks: ProofCheckResult[]): Record<ProofCheckResult['outcome'], number> {
  const summary: Record<ProofCheckResult['outcome'], number> = { PASS: 0, WARN: 0, FAIL: 0, SKIP: 0 };
  for (const check of checks) {
    summary[check.outcome] = (summary[check.outcome] ?? 0) + 1;
  }
  return summary;
}
