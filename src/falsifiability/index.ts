export {
  EmptyScopeSlipError,
  EmptyUntestedReasonError,
  FalsifiabilityError,
  FalsifiabilityGateError,
  UnknownVerdictError,
} from './errors.ts';
export {
  falsifiabilityGate,
} from './gate.ts';
export type {
  FalsifiabilityGateInput,
} from './gate.ts';
export {
  evaluateThreshold,
} from './threshold_semantics.ts';
export {
  A4_SCOPE_SLIP_TEXT,
  E2_UNTESTED_REASON,
  PLANB_RISK_KINDS,
  applyPlanBGate,
  planbRiskGate,
} from './planb_gate.ts';
export type {
  PlanBAppliedDecision,
  PlanBDegradationVerdict,
  PlanBRiskAssessment,
  PlanBRiskKind,
  PlanBRiskResult,
} from './planb_gate.ts';
export type {
  ThresholdEvaluation,
} from './threshold_semantics.ts';
export {
  decideVerdict,
  makeVerdict,
} from './verdict.ts';
export {
  bridgeLegacyEvidencesToStatistics,
  buildLegacyVerdictKernelInput,
  extractVerdictTrace,
  makeLegacyCompatFec,
  makeRealStatsFec,
  verdictResultFromKernelOutput,
} from './legacy_kernel_adapter.ts';
export type {
  LegacyVerdictKernelInputArgs,
  RealStatsFecInput,
} from './legacy_kernel_adapter.ts';
export {
  renderHonestVerdict,
} from './render.ts';
export type {
  HonestVerdictRender,
} from './render.ts';
export {
  getActiveVerdicts,
  getVerdict,
  recordVerdict,
  rowToVerdictNode,
  supersedeVerdict,
} from './repository.ts';
export type {
  VerdictNodeRow,
} from './repository.ts';
export {
  verifyVerdictNodes,
} from './verifier.ts';
export type {
  VerdictVerifyResult,
} from './verifier.ts';
export {
  VerifierStructuralGateError,
  assertSourceClean,
  assertVerifierModulesClean,
  scanDeterministicModules,
  scanSourceForForbiddenCalls,
} from './verifier_structural_gate.ts';
export type {
  ForbiddenCallHit,
  ForbiddenCallKind,
} from './verifier_structural_gate.ts';
export {
  bindProvenance,
  extractExternalFact,
} from './external_facts.ts';
export type {
  BindProvenanceSystemContext,
  BoundProvenance,
} from './external_facts.ts';
export type {
  EvidenceRecord,
  FalsificationSpec,
  RecordVerdictArgs,
  ReplayProver,
  SourceAnchor,
  ThresholdSemantics,
  ThresholdSpec,
  Verdict,
  VerdictDecision,
  VerdictNode,
  VerdictNodeKind,
  VerdictResult,
  VerdictTracePersisted,
} from './types.ts';
export {
  getContractsByClaim,
  registerContract,
} from './contracts.ts';
export type {
  ComparatorKind,
  FalsifiabilityContract,
  RegisterContractInput,
} from './contracts.ts';
export {
  AUDIT_RULES,
  AUDITOR_ENABLED,
  auditContract,
} from './auditor.ts';
export type {
  AuditEvent,
  AuditOutcome,
  AuditResult,
  AuditRuleId,
} from './auditor.ts';

// V2 — 确定性五值裁决内核（APPENDIX_B §1 R0-R9 + 03 §7）
export {
  EXECUTION_FINGERPRINT_MAGNITUDE_THRESHOLD,
  VERDICT_FLOAT_TOLERANCE,
  decideFiveValueVerdict,
  evaluateScope,
  evaluateStatistics,
  flagExecutionFingerprintMagnitudeMismatch,
  verdictGte,
  verdictLte,
} from './verdict_kernel_v2.ts';
export type {
  ExecutionFingerprint,
  KernelAntiTheaterFinding,
  KernelAntiTheaterFindingSeverity,
  AssumptionDiagnostic,
  ContradictionEvidence,
  IdentifierClaim,
  CoverageRelation,
  DatasetBindingSpec,
  EffectiveDirection,
  EvidenceSufficiencyReport,
  EvidenceSufficiencyStatus,
  PowerStatus,
  ProtocolDeviation,
  ScopeReport,
  StatisticalReport,
  StatisticalResult,
  TestStatus,
  VerdictKernelInput,
  VerdictKernelOutput,
  VerdictRuleTrace,
} from './verdict_kernel_v2.ts';
