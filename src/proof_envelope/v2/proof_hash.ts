/**
 * ProofEnvelope V2 proofHash —— canonical_json(所有 VC 字段 - proofHash) → sha256。
 *
 * 算法（§2.4·5 步）：
 *   1. 提取 VC 子集（白名单 13 字段·self-excluding·normalizeClaim）
 *   2. 断言 FEC 一致性：envelope.fecHash === computeFecHash(envelope.fecSnapshot)
 *      （computeFecHash 排除 freeze.fecHash·自引用规避·fec/compiler.ts）
 *   3. 断言无 NaN/Infinity（canonicalJson 内置 assertNoNonFiniteNumber）
 *   4. canonical 序列化（fast-json-stable-stringify·§1）
 *   5. sha256 → 64 hex 小写
 *
 * 跨语言 byte-equal（RULE-PE-010·APPENDIX_C §1.9）：
 *   TS fast-json-stable-stringify ↔ Python json.dumps(sort_keys=True, ensure_ascii=False, separators=(",",":"))
 *   在四字段白名单对象上已实证 byte-equal。Python 镜像见 repro/far_chain_repro/proof_hash.py。
 *
 * 关键裁决：metadata（kernelVersion/rulePriorityTableHash/proofHashInputs）在 verdictTrace 内，
 *   不单独列出（§2.4 伪代码 line 236-238 单独列是为防御性强调，但 verdictTrace 全文已含；
 *   单独列会 double-count→破坏 byte-equal）。Python 镜像对齐同一结构。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch。纯函数（不 mutate 输入）。
 */

import { createHash } from 'node:crypto';
import { canonicalJson } from '../../evidence_log/hasher.ts';
import { computeFecHash } from '../../fec/compiler.ts';
import type { ClaimEnvelope, ProofEnvelopeV2 } from './types.ts';

/**
 * normalizeWhitespace（§2.4 line 257·APPENDIX_C §1.4）：
 * 统一 \r\n→\n、\r→\n、折叠 [ \t]+→单空格、trim。
 * 同时做 Unicode NFC 归一化（F-4-007·防止 NFC/NFD 等价表示导致跨语言 hash 分裂）。
 * 与 Python normalize_whitespace byte-equal（Python 端 unicodedata.normalize('NFC', text)）。
 */
export function normalizeWhitespace(text: string): string {
  const normalized = text.normalize('NFC');
  return normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

/** normalizeClaim（§2.4）：claim.naturalLanguage 规范化（其余字段原样）。 */
export function normalizeClaim(claim: ClaimEnvelope): ClaimEnvelope {
  return { ...claim, naturalLanguage: normalizeWhitespace(claim.naturalLanguage) };
}

/**
 * computeProofHashV2 —— 计算 ProofEnvelopeV2 的 proofHash（self-excluding）。
 * 给定去掉 proofHash 的 envelope，返回 64 hex 小写 sha256。
 */
export function computeProofHashV2(envelope: Omit<ProofEnvelopeV2, 'proofHash'>): string {
  // 第 2 步：断言 FEC 一致性（fast-fail）
  const recomputedFecHash = computeFecHash(envelope.fecSnapshot);
  if (recomputedFecHash !== envelope.fecHash) {
    throw new Error(
      `computeProofHashV2: fecHash mismatch (envelope=${envelope.fecHash}, recomputed=${recomputedFecHash})`,
    );
  }

  // 第 1 步：提取 VC 子集（白名单·self-excluding·normalizeClaim）
  const proofInput = {
    schemaVersion: envelope.schemaVersion,
    claim: normalizeClaim(envelope.claim),
    fecHash: envelope.fecHash,
    fecSnapshot: envelope.fecSnapshot,
    protocolFreeze: envelope.protocolFreeze,
    datasetBindings: envelope.datasetBindings,
    workflowBindings: envelope.workflowBindings,
    experimentRuns: envelope.experimentRuns,
    measurementResults: envelope.measurementResults,
    statisticalResults: envelope.statisticalResults,
    verdictTrace: envelope.verdictTrace,
    antiTheaterReport: envelope.antiTheaterReport,
    ledgerRoot: envelope.ledgerRoot,
  };

  // 第 3-5 步：canonicalJson（内置 assertNoNonFiniteNumber）+ sha256
  const canonical = canonicalJson(proofInput, 'computeProofHashV2');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * verifyProofHashV2 —— 独立重算校验：给定完整 envelope，验证 proofHash 是否正确。
 * 用于 "verification not trust" + RULE-PE-010 independently_recomputable。
 *
 * 返回值语义：
 *   - 'valid'              : proofHash 重算一致（信封完整）
 *   - 'hash_mismatch'      : 重算成功但 proofHash 不一致（信封被篡改）
 *   - 'fec_inconsistent'   : fecHash 与 fecSnapshot 不一致（FEC 子信封篡改）
 *   - 'non_finite_number'  : 信封含 NaN/Infinity（非法数值·篡改或损坏）
 *   - 'malformed_envelope' : 信封结构损坏（缺字段/类型错·非篡改而是输入错误）
 *
 * 旧 boolean API 仍保留（verifyProofHashV2Boolean）用于只关心"是否通过"的调用方。
 * 新 API 让第三方独立复算时能区分"被篡改"和"输入格式错误"（F-4-005）。
 */
export type ProofHashVerificationResult =
  | 'valid'
  | 'hash_mismatch'
  | 'fec_inconsistent'
  | 'non_finite_number'
  | 'malformed_envelope';

/**
 * verify proof hash v2.
 */
export function verifyProofHashV2(envelope: ProofEnvelopeV2): ProofHashVerificationResult {
  const { proofHash, ...rest } = envelope;
  try {
    const recomputed = computeProofHashV2(rest);
    return recomputed === proofHash ? 'valid' : 'hash_mismatch';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('fecHash mismatch')) {
      return 'fec_inconsistent';
    }
    if (message.includes('NaN') || message.includes('Infinity') || message.includes('non-finite')) {
      return 'non_finite_number';
    }
    return 'malformed_envelope';
  }
}

/** 向后兼容的 boolean 封装（仅 'valid' 为 true）。 */
export function verifyProofHashV2Boolean(envelope: ProofEnvelopeV2): boolean {
  return verifyProofHashV2(envelope) === 'valid';
}
