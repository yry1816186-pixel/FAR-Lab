/**
 * evidence_contract_gate —— EVID-RECORD-001 的 fail-closed 合同闸（T-003 模式镜像）。
 *
 * 机制（V1 边界·诚实登记）：
 *   - falsifiability EvidenceRecord 新增 `evidenceContract?: EvidenceContractV1`（可选·向后兼容）；
 *   - FEC 可选 requireFullEvidenceContract: true 时，primary 证据缺失合同或合同违规 →
 *     本闸拒绝（ok=false + EVIDENCE_CONTRACT_INCOMPLETE reasonCode）→ kernel UNTESTED；
 *   - V1 默认 requireFullEvidenceContract: false（不破坏现有 demo seed / 3420 绿测试）；
 *     V2 计划：真实研究路径 FEC 全开，届时无完整合同的证据一律 fail-closed 不进聚合。
 *
 * 与 evidence_provenance（T-003）的关系：正交双闸——provenance 绑定「metricValue 是否真算出来」，
 * 合同闸绑定「证据与声明的支持关系是否完整表达」（16 字段宪法合同）。
 * 本闸不能证明的：合同字段内容的真实语义（同 evidence_contract 模块头声明）。
 */

import { isPrimaryEvidence } from './evidence_provenance.ts';
import type { EvidenceRecord } from './types.ts';
import {
  EvidenceContractV1Schema,
  validateEvidenceContract,
  type ContractViolation,
  type EvidenceContractV1,
} from '../evidence_quality/evidence_contract.ts';

export type { EvidenceContractV1 };

/** 标准 reasonCode（与 verdict kernel reasonCodes 同命名空间）。 */
export const EVIDENCE_CONTRACT_INCOMPLETE_REASON_CODE = 'EVIDENCE_CONTRACT_INCOMPLETE';

export interface ContractGateOptions {
  /** true → primary 证据必须有完整且零违规的 16 字段合同（fail-closed）。 */
  readonly requireFullEvidenceContract: boolean;
  /** strict 合同校验（unspecified/unclear 占位不算完整合同）。 */
  readonly strict?: boolean;
  /** FEC claimId（错误消息可读性）。 */
  readonly claimId?: string;
}

export interface ContractGateResult {
  /** true = 通过（无 primary 证据、或全部合同齐备且零违规、或未要求）。 */
  readonly ok: boolean;
  /** 缺合同/合同违规的 primary 证据索引。 */
  readonly failingEvidenceIndices: readonly number[];
  readonly reasonCode: string | null;
  readonly error: string | null;
  readonly violations: readonly ContractViolation[];
}

/**
 * fail-closed 合同闸：requireFullEvidenceContract=true 时逐条检查 primary 证据：
 *   1. evidenceContract 存在且过 zod schema（形状完整性）；
 *   2. validateEvidenceContract(strict) 零违规（内容完整性：hash 一致/来源不自填/撤稿语义）。
 */
export function assertPrimaryEvidenceContractBound(
  evidence: readonly EvidenceRecord[],
  options: ContractGateOptions,
): ContractGateResult {
  if (!options.requireFullEvidenceContract) {
    return { ok: true, failingEvidenceIndices: [], reasonCode: null, error: null, violations: [] };
  }
  const failing: number[] = [];
  const allViolations: ContractViolation[] = [];
  evidence.forEach((record, index) => {
    if (!isPrimaryEvidence(record)) return;
    if (record.evidenceContract === undefined) {
      failing.push(index);
      return;
    }
    const parsed = EvidenceContractV1Schema.safeParse(record.evidenceContract);
    if (!parsed.success) {
      failing.push(index);
      allViolations.push({
        rule: 'UNSPECIFIED_CRITICAL_FIELD',
        detail: `contract shape invalid at evidence[${index}]: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      });
      return;
    }
    const violations = validateEvidenceContract(parsed.data, { strict: options.strict });
    if (violations.length > 0) {
      failing.push(index);
      allViolations.push(...violations);
    }
  });

  if (failing.length > 0) {
    return {
      ok: false,
      failingEvidenceIndices: failing,
      reasonCode: EVIDENCE_CONTRACT_INCOMPLETE_REASON_CODE,
      error:
        `claim ${options.claimId ?? '(unnamed)'}: ${failing.length} primary evidence record(s) lack a complete ` +
        `16-field evidence contract (${EVIDENCE_CONTRACT_INCOMPLETE_REASON_CODE}) — fail-closed, no verdict`,
      violations: allViolations,
    };
  }
  return { ok: true, failingEvidenceIndices: [], reasonCode: null, error: null, violations: allViolations };
}
