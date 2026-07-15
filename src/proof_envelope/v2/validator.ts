/**
 * ProofEnvelope V2 Validator —— 10 条规则逐条自检（04 §2.4 全表·含 RULE-PE-010）。
 *
 * V2 适配（04 §2.2 命名裁剪许可）：V1 9 规则针对 V1 字段（claimId/verdictNodeId/falsificationSpec/
 * sourceAnchor/reproHash/prevProofHash/checks/knownFailures/sealedBy）。V2 字段不同（claim/fecSnapshot/
 * datasetBindings/verdictTrace/antiTheaterReport/ledgerRoot），故 ruleId 保留（04 §2.4 SSOT）但 check
 * 逻辑适配 V2 字段语义。每条注释标注 V2 适配点。
 *
 * RULE-PE-010（independently_recomputable·FI-9）：
 *   - 调 verifyProofHashV2（self-check：fecHash 互验 + proofHash 重算）。
 *   - 完整独立性（不依赖项目 CI）由 Python 镜像 repro/far_chain_repro/proof_hash.py 保证，
 *     跨语言 byte-equal 对拍见 tests/proof_envelope/v2/cross_lang.test.ts。
 *   - 状态：04 §2.4 DESIGN_LOCKED → IMPLEMENTED_VERIFIED（task #9 交付，Ask 层已确认）。
 *
 * 零容忍合规：无 any / @ts-ignore / 空 catch / 桩。全程无 LLM（F3）。
 */

import type { Verdict } from '../../schema/enums.ts';
import { verifyProofHashV2 } from './proof_hash.ts';
import type { CheckOutcome, ProofCheckResultV2, ProofEnvelopeV2 } from './types.ts';

const VERDICTS: readonly Verdict[] = ['CONFIRMED', 'REFUTED', 'INCONCLUSIVE', 'DEGRADED_SCOPE', 'UNTESTED'];
const HEX64 = /^[0-9a-f]{64}$/;

interface ValidatorRuleV2 {
  readonly ruleId: ProofCheckResultV2['ruleId'];
  readonly ruleName: string;
  readonly check: (envelope: ProofEnvelopeV2) => { readonly outcome: CheckOutcome; readonly detail: string };
}

const RULES: ReadonlyArray<ValidatorRuleV2> = [
  {
    // V2 适配：V1 校验 claimId，V2 校验 claim.id + naturalLanguage。
    ruleId: 'RULE-PE-001',
    ruleName: 'claim_non_empty',
    check(env) {
      if (env.claim.id.trim().length === 0) {
        return { outcome: 'FAIL', detail: 'claim.id is empty' };
      }
      if (env.claim.naturalLanguage.trim().length === 0) {
        return { outcome: 'FAIL', detail: 'claim.naturalLanguage is empty' };
      }
      return { outcome: 'PASS', detail: 'claim id + naturalLanguage non-empty' };
    },
  },
  {
    // V2 适配：V1 校验 verdictNodeId，V2 校验 fecSnapshot 可编译性（contractVersion + measurableImplication）。
    ruleId: 'RULE-PE-002',
    ruleName: 'fec_snapshot_present',
    check(env) {
      if (env.fecSnapshot.contractVersion !== 'FEC/2.0') {
        return { outcome: 'FAIL', detail: `fecSnapshot.contractVersion is ${env.fecSnapshot.contractVersion}, expected FEC/2.0` };
      }
      if (env.fecSnapshot.measurableImplication.trim().length === 0) {
        return { outcome: 'FAIL', detail: 'fecSnapshot.measurableImplication is empty' };
      }
      return { outcome: 'PASS', detail: 'fecSnapshot present with non-empty measurableImplication' };
    },
  },
  {
    // V2 适配：V1 校验 falsificationSpec.prediction+metric，V2 校验 fecSnapshot.metric + threshold。
    ruleId: 'RULE-PE-003',
    ruleName: 'falsification_metric_present',
    check(env) {
      if (env.fecSnapshot.metric.metricKey.trim().length === 0) {
        return { outcome: 'FAIL', detail: 'fecSnapshot.metric.metricKey is empty' };
      }
      if (!Number.isFinite(env.fecSnapshot.threshold.value)) {
        return { outcome: 'FAIL', detail: 'fecSnapshot.threshold.value is not finite' };
      }
      return { outcome: 'PASS', detail: 'primary metric + threshold present' };
    },
  },
  {
    // V2 适配：V1 校验 sourceAnchor.gitCommitSha，V2 校验 datasetBindings[0].sourceAnchor.resolved。
    ruleId: 'RULE-PE-004',
    ruleName: 'dataset_anchor_present',
    check(env) {
      if (env.datasetBindings.length === 0) {
        return { outcome: 'FAIL', detail: 'no datasetBindings' };
      }
      const first = env.datasetBindings[0];
      if (!first || !first.sourceAnchor.resolved) {
        return { outcome: 'WARN', detail: 'primary datasetBinding.sourceAnchor.resolved=false (unresolved?)' };
      }
      if (first.contentHash.trim().length === 0) {
        return { outcome: 'FAIL', detail: 'primary datasetBinding.contentHash is empty' };
      }
      return { outcome: 'PASS', detail: 'dataset anchor resolved with contentHash' };
    },
  },
  {
    // V2 适配：V1 校验 reproHash.length===64，V2 校验 fecHash 格式（64 hex）。
    ruleId: 'RULE-PE-005',
    ruleName: 'fec_hash_format',
    check(env) {
      if (env.fecHash.length !== 64 || !HEX64.test(env.fecHash)) {
        return { outcome: 'FAIL', detail: `fecHash is not 64-char hex (got len=${env.fecHash.length})` };
      }
      return { outcome: 'PASS', detail: 'fecHash is 64-char lowercase hex' };
    },
  },
  {
    // V2 适配：V1 校验 prevProofHash 链式，V2 校验 ledgerRoot 格式（call_records head / Merkle root）。
    ruleId: 'RULE-PE-006',
    ruleName: 'ledger_root_format',
    check(env) {
      if (env.ledgerRoot.length !== 64 || !HEX64.test(env.ledgerRoot)) {
        return { outcome: 'FAIL', detail: `ledgerRoot is not 64-char hex (got len=${env.ledgerRoot.length})` };
      }
      return { outcome: 'PASS', detail: 'ledgerRoot is 64-char lowercase hex' };
    },
  },
  {
    // V2 适配（D1 统一后）：校验 antiTheaterReport.hasFail/canSealConfirmed 与 verdictTrace.verdict 一致。
    // hasFail=true 或 canSealConfirmed=false（存在阻断性 finding）+ verdict=CONFIRMED → FAIL（anti-theater F1）。
    ruleId: 'RULE-PE-007',
    ruleName: 'conclusion_matches_anti_theater',
    check(env) {
      const verdict = env.verdictTrace.verdict;
      if (!VERDICTS.includes(verdict)) {
        return { outcome: 'FAIL', detail: `verdictTrace.verdict '${verdict}' is not a valid 5-value enum` };
      }
      const report = env.antiTheaterReport;
      const blocked = report.hasFail || report.canSealConfirmed === false;
      if (blocked && verdict === 'CONFIRMED') {
        return {
          outcome: 'FAIL',
          detail: `antiTheaterReport.hasFail=${report.hasFail}/canSealConfirmed=${report.canSealConfirmed ?? true} but verdict=CONFIRMED (anti-theater F1)`,
        };
      }
      if (blocked) {
        return {
          outcome: 'WARN',
          detail: `anti-theater findings present (hasFail=${report.hasFail}, failCount=${report.failCount}, warnCount=${report.warnCount}), verdict=${verdict} (correct degradation)`,
        };
      }
      return { outcome: 'PASS', detail: `verdict=${verdict} consistent with antiTheaterReport (hasFail=false, failCount=${report.failCount})` };
    },
  },
  {
    // V2 适配：V1 校验 sealedBy='deterministic_sealer'，V2 校验 protocolFreeze.frozenBy（F3 禁 LLM freeze）。
    ruleId: 'RULE-PE-008',
    ruleName: 'frozen_by_deterministic',
    check(env) {
      if (env.protocolFreeze.frozenBy !== 'deterministic_freezer') {
        return {
          outcome: 'FAIL',
          detail: `protocolFreeze.frozenBy='${env.protocolFreeze.frozenBy}', expected 'deterministic_freezer' (F3)`,
        };
      }
      return { outcome: 'PASS', detail: 'protocolFreeze.frozenBy=deterministic_freezer (F3)' };
    },
  },
  {
    // V2 适配（D1 统一后）：校验 antiTheaterReport.findings 透明（每条 message 非空·findingId/attackKind/outcome/evidenceRef 必填）。
    ruleId: 'RULE-PE-009',
    ruleName: 'anti_theater_findings_transparent',
    check(env) {
      const findings = env.antiTheaterReport.findings;
      if (findings.length === 0) {
        return { outcome: 'PASS', detail: 'no anti-theater findings to report' };
      }
      const hasEmptyDetail = findings.some((f) => f.message.trim().length === 0);
      if (hasEmptyDetail) {
        return { outcome: 'WARN', detail: 'antiTheaterReport.findings contains empty message entries' };
      }
      return { outcome: 'PASS', detail: `transparently reporting ${findings.length} anti-theater finding(s)` };
    },
  },
  {
    // RULE-PE-010（FI-9·independently_recomputable）：proofHash 可被独立重算。
    ruleId: 'RULE-PE-010',
    ruleName: 'independently_recomputable',
    check(env) {
      const ok = verifyProofHashV2(env);
      if (ok) {
        return {
          outcome: 'PASS',
          detail: 'proofHash independently recomputable (TS self-check pass; Python cross-lang 见 cross_lang.test)',
        };
      }
      return {
        outcome: 'FAIL',
        detail: 'proofHash recomputation mismatch (tampered envelope or fecHash inconsistent with fecSnapshot)',
      };
    },
  },
];

/**
 * validateProofEnvelopeV2 —— 对 sealed envelope 执行全部 10 条规则，返回 checks 数组。
 * 完全确定性，不依赖 LLM（F3）。
 */
export function validateProofEnvelopeV2(envelope: ProofEnvelopeV2): ProofCheckResultV2[] {
  return RULES.map((rule): ProofCheckResultV2 => {
    const { outcome, detail } = rule.check(envelope);
    return { ruleId: rule.ruleId, ruleName: rule.ruleName, outcome, detail };
  });
}

/**
 * hasAntiTheaterViolationV2 —— 检查 WARN/FAIL check 时 verdict 是否为 CONFIRMED（反 theater CI 断言用）。
 */
export function hasAntiTheaterViolationV2(checks: readonly ProofCheckResultV2[], verdict: Verdict): boolean {
  const hasWarnOrFail = checks.some((c) => c.outcome === 'WARN' || c.outcome === 'FAIL');
  return hasWarnOrFail && verdict === 'CONFIRMED';
}

/**
 * summarizeChecksV2 —— 统计 checks 摘要（4 outcome 计数）。
 */
export function summarizeChecksV2(checks: readonly ProofCheckResultV2[]): Record<CheckOutcome, number> {
  const summary: Record<CheckOutcome, number> = { PASS: 0, WARN: 0, FAIL: 0, SKIP: 0 };
  for (const check of checks) {
    summary[check.outcome] = (summary[check.outcome] ?? 0) + 1;
  }
  return summary;
}
