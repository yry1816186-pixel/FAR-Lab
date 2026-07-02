/**
 * ProofEnvelope V2 Sealer —— 封存 envelope（compute proofHash + validate 10 rules）。
 *
 * Authority: PROJECT_PLAN/04 §2.1（ProofEnvelopeV2 结构）+ §2.4（10 rules）+ §2.5（proofHash）。
 *
 * 流程：
 *   1. computeProofHashV2(input) → proofHash（§2.4 5 步：normalizeClaim + fecHash 互验 + canonical + sha256）
 *   2. 构造 sealed envelope {...input, proofHash}
 *   3. validateProofEnvelopeV2(envelope) → 10 rules checks（含 RULE-PE-010 独立可重算）
 *
 * caller 责任：seal 后若 checks 含 FAIL，应拒绝落库（append-only trigger + CI 门控）。
 * 本函数不抛 FAIL（返回 checks 供 caller 决策），但 computeProofHashV2 会抛 fecHash/NaN 断言错误。
 *
 * 零容忍合规：无 any / @ts-ignore / 空 catch / 桩。不 mutate input。
 */

import { computeProofHashV2 } from './proof_hash.ts';
import type { ProofCheckResultV2, ProofEnvelopeV2, SealProofEnvelopeV2Input } from './types.ts';
import { validateProofEnvelopeV2 } from './validator.ts';

/** seal 结果：sealed envelope + 10 rules checks。 */
export interface SealProofEnvelopeV2Result {
  readonly envelope: ProofEnvelopeV2;
  readonly checks: readonly ProofCheckResultV2[];
}

/**
 * sealProofEnvelopeV2 —— 封存 ProofEnvelope V2。
 *
 * @param input SealProofEnvelopeV2Input（omit proofHash）
 * @returns { envelope, checks }；envelope.proofHash 由本函数确定性计算。
 * @throws Error 当 fecHash 与 fecSnapshot 不一致，或 VC 字段含 NaN/Infinity（computeProofHashV2 断言）。
 */
export function sealProofEnvelopeV2(input: SealProofEnvelopeV2Input): SealProofEnvelopeV2Result {
  const proofHash = computeProofHashV2(input);
  const envelope: ProofEnvelopeV2 = { ...input, proofHash };
  const checks = validateProofEnvelopeV2(envelope);
  return { envelope, checks };
}
