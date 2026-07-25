/**
 * proof_envelope/v2 —— ProofEnvelope V2 公共 API（完整证据嵌入 + 10 rules + 12 diff codes + 跨语言 proofHash）。
 *
 * 与 V1（src/proof_envelope/index.ts）的关系：V1 保留（self-check 简化版），V2 新增（完整证据嵌入 +
 * RULE-PE-010 independently_recomputable + Python 跨语言镜像 repro/far_chain_repro/proof_hash.py）。
 * V1/V2 独立 barrel，避免命名冲突（ProofEnvelope vs ProofEnvelopeV2）。
 */

// 类型（types.ts）
export type {
  AntiTheaterFinding,
  AntiTheaterReport,
  ClaimEnvelope,
  DatasetBindingV2,
  DiffReportCode,
  DiffReportEntry,
  ExperimentRunBinding,
  MeasurementResultV2,
  ProofCheckResultV2,
  ProofEnvelopeV2,
  ProofEnvelopeV2SchemaVersion,
  ProofValidatorRuleV2,
  SealProofEnvelopeV2Input,
  SignatureBlock,
  StatisticalResultV2,
  VerdictTraceEnvelope,
  WorkflowBindingV2,
} from './types.ts';
export {
  DIFF_REPORT_CODES,
  PROOF_ENVELOPE_V2_SCHEMA,
  PROOF_VALIDATOR_RULES_V2,
} from './types.ts';
export type { CheckOutcome } from './types.ts';

// proofHash（proof_hash.ts）
export {
  computeProofHashV2,
  normalizeClaim,
  normalizeWhitespace,
  verifyProofHashV2,
  verifyProofHashV2Boolean,
} from './proof_hash.ts';
export type { ProofHashVerificationResult } from './proof_hash.ts';

// validator（validator.ts）
export {
  hasAntiTheaterViolationV2,
  summarizeChecksV2,
  validateProofEnvelopeV2,
} from './validator.ts';

// diff（diff.ts）
export { compareEnvelopes, hasTamper } from './diff.ts';

// sealer（sealer.ts）
export { sealProofEnvelopeV2 } from './sealer.ts';
export type { SealProofEnvelopeV2Result } from './sealer.ts';
