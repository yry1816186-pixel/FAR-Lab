/**
 * fec —— Falsification Evidence Contract 公共 API（V1 保留 + V2 新增）。
 *
 * V1（src/falsifiability/contracts.ts FalsifiabilityContract + orchestrator fecAppendClaim）：
 *   历史预登记契约路径，保留不删（功能保留 · 零容忍 #5）。
 *
 * V2（W2-A 强制路径 · 03 §1.2 FecContractV2）：
 *   - compileFec：deterministic compiler，产 FalsificationPlan（stat_lock + verdict_mapping + proof_checks）。
 *   - enforceFecMandatoryGate：fail-closed 门禁（缺 FEC / 编译失败 → UNTESTED；LLM_FROZEN → CI 阻断）。
 *   - computeFecHash：sha256(canonical JSON of VC fields)，verifier 互验。
 */

// V1（保留）
export { fecAppendClaim, computePreliminaryVerdict } from './orchestrator.ts';
export type { FecAppendClaimArgs, FecAppendClaimResult } from './orchestrator.ts';

// V2 — compiler（03 §2.2 deterministic compiler）
export {
  buildFalsificationPlan,
  compileFec,
  computeFecHash,
  involvesRandomness,
  isDescriptivePhrase,
  mapCompileErrorToSeverity,
} from './compiler.ts';

// V2 — mandate gate（03 §2.3 fail-closed）
export { assertFecGate, enforceFecMandatoryGate } from './fec_mandate.ts';

// V2 — repository（migration 0009 fec_contracts_v2 DB 层）
export { getFecV2ByClaim, getFecV2ByFecId, registerFecV2 } from './fec_repository.ts';

// V2 — 类型（fec_contract.ts）
export type {
  ActorRef,
  CompileError,
  CompileFecInput,
  CompileFecResult,
  CompileErrorCode,
  DatasetRequirement,
  DeviationPolicy,
  EvidenceRequirement,
  FalsificationPlan,
  FecCompileSeverity,
  FecContractV2,
  FecScopeBoundedDimension,
  MetricSpec,
  MultipleTestingPlan,
  PowerPlan,
  ProofCheckDescriptor,
  ProtocolFreeze,
  ScopeCoverage,
  ScopeSpec,
  SeedPolicy,
  StatPlanRequiredField,
  StatisticalPlan,
  ThresholdSpec,
  VerdictKind,
  VerdictMappingPath,
  WorkflowRequirement,
} from './fec_contract.ts';

export type { FecGateDecision } from './fec_mandate.ts';
export type { RegisterFecV2Input, StoredFecContractV2 } from './fec_repository.ts';
