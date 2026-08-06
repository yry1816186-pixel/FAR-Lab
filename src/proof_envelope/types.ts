/**
 * ProofEnvelope: sealed evidence package for auditable claim resolution.
 *
 * V1 scope 裁剪（诚实边界 · 21_IMPLEMENTATION_ROADMAP §0 V1 行 + 09 §10 + 33 CROSS-CUT-004）:
 *   09 §1 完整态字段 nodeId/objectHash/ledgerRoot/inclusionProof 依赖
 *   SciIRNode（08 · migration 0016 = W2）+ Merkle ledger（migration 0022 = V3）。
 *   V1 不含这两层，故用 falsificationSpec + sourceAnchor（gitCommitSha/rawResponseHash）
 *   锚定 claim 内容与证据来源，用 prevProofHash 做 envelope 间链（call_records head 桥接）。
 *   09 §1 ledgerRoot 注释自述「V3 Merkle root | call_records head hash(V1)」。
 *   字段名 conclusion 而非 09 §1 的 verdict：枚举值集（5 枚举）与 09 §6 完全一致，
 *   仅 TS 字段名用 conclusion（避免与 VerdictNode.verdict 命名混淆），属命名裁剪非语义偏离。
 *   V1 ProofEnvelope = self-check（Validator 自验 + proofHash TS 侧重算），
 *   「第三方独立跨语言重算」是 V2+ 路线图（33 CROSS-CUT-004 honesty_risk 已登记）。
 *
 * 模型中立: 不含任何 qwen/dashscope/bailian 字面量。
 * 零容忍合规: 无 any / @ts-ignore / 空 catch / 双重断言。
 */

import type { FalsificationSpec, Verdict } from '../falsifiability/types.ts';
import type { SourceAnchor } from '../evidence_log/types.ts';

/** 9 validator rules (09 §4) */
export const PROOF_VALIDATOR_RULES = [
  'RULE-PE-001',
  'RULE-PE-002',
  'RULE-PE-003',
  'RULE-PE-004',
  'RULE-PE-005',
  'RULE-PE-006',
  'RULE-PE-007',
  'RULE-PE-008',
  'RULE-PE-009',
] as const;

/** Type alias: proof validator rule. */
export type ProofValidatorRule = (typeof PROOF_VALIDATOR_RULES)[number];

/** Type alias: check outcome. */
export type CheckOutcome = 'PASS' | 'WARN' | 'FAIL' | 'SKIP';

/** Single validator check result */
export interface ProofCheckResult {
  readonly ruleId: ProofValidatorRule;
  readonly ruleName: string;
  readonly outcome: CheckOutcome;
  readonly detail: string;
}

/** Sealed ProofEnvelope (immutable after sealing) */
export interface ProofEnvelope {
  readonly envelopeId: string;
  readonly claimId: string;
  readonly verdictNodeId: string;
  readonly conclusion: Verdict;
  readonly proofHash: string;
  readonly prevProofHash: string;
  readonly checks: readonly ProofCheckResult[];
  readonly knownFailures: readonly string[];
  readonly falsificationSpec: FalsificationSpec;
  readonly sourceAnchor: SourceAnchor;
  readonly reproHash: string;
  /**
   * 规则集版本 URI(ADR-007 · IC-01 · migration 0019)。
   * 版本化落地前密封的 legacy 信封无此字段(exactOptionalPropertyTypes:读取侧缺省=undefined);
   * 缺省一律按 farlab.dev/ruleset/v1 派发。存在时纳入 proofHash canonical 输入;
   * 缺席时 canonical 输入与历史一致(旧证明复算不变)。
   */
  readonly rulesetUri?: string;
  readonly sealedBy: 'deterministic_sealer';
  readonly sealedAt: string;
  readonly createdAt: string;
}

/** Input for sealing a ProofEnvelope */
export interface SealProofEnvelopeInput {
  readonly claimId: string;
  readonly verdictNodeId: string;
  readonly conclusion: Verdict;
  readonly prevProofHash: string;
  readonly checks: readonly ProofCheckResult[];
  readonly knownFailures?: readonly string[];
  readonly falsificationSpec: FalsificationSpec;
  readonly sourceAnchor: SourceAnchor;
  readonly reproHash: string;
  /** 可选:显式指定规则集 URI(默认 CURRENT_RULESET_URI);非法/不支持主版本 seal 时 fail-closed。 */
  readonly rulesetUri?: string;
  readonly sealedAt: string;
}

/** Constant: GENESIS_PROOF_HASH. */
export const GENESIS_PROOF_HASH = '0'.repeat(64);
