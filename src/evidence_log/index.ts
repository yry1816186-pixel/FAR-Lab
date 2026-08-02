export {
  canonicalJson,
  canonicalHash,
  canonicalHashVerified,
  hashCanonicalJson,
} from './hasher.ts';
export {
  GOLDEN_VECTORS,
  REPRO_CONTEXT_FIXTURE,
  REPRO_CONTEXT_FIXTURE_EXPECTED_HEX,
} from './golden_vectors.ts';
export {
  appendEvidenceLog,
  appendRecord,
  getEvidenceLogEntry,
  getCallRecordBySeq,
  getChainHead,
  rowToEvidenceLogEntry,
  rowToCallRecord,
} from './repository.ts';
export {
  appendLlmResponseRecord,
  callAndRecordLlm,
} from './llm_record.ts';
export type {
  AppendLlmResponseArgs,
  CallAndRecordLlmArgs,
  LlmRecordMetadata,
  RecordedLlmResponse,
} from './llm_record.ts';
export {
  verifyChainHead,
  verifyEvidencePayloadHashes,
  verifyCallRecordPayloadHashes,
  verifyCallRecordExportAnchor,
} from './verifier.ts';
export {
  LIFECYCLE_STATES,
  TERMINAL_STATES,
  LIFECYCLE_TARGET_KINDS,
  getLifecycleState,
  listLifecycleEvents,
  applyLifecycleTransition,
  verifyLifecycleChain,
} from './lifecycle.ts';
export type {
  LifecycleState,
  LifecycleTargetKind,
  LifecycleEvent,
  LifecycleTransitionInput,
  LifecycleTransitionResult,
  LifecycleChainVerifyResult,
} from './lifecycle.ts';
export {
  GENESIS_PREV_HASH,
} from './types.ts';
export type {
  AppendRecordInput,
  AppendRecordOptions,
  AppendEvidenceLogArgs,
  ProviderNeutralCredential,
  CallAuditData,
  CallRecordHashRow,
  CallRecordRow,
  CanonicalInput,
  ChainHead,
  CodeLocation,
  EvidenceLogEntry,
  EvidenceLogRow,
  HashedRecord,
  PayloadKind,
  ProvenanceClass,
  PurposeTag,
  ReplayProver,
  SourceAnchor,
  VerifyResult,
  VerifyEvidencePayloadResult,
  VerifyCallRecordPayloadResult,
  VerifiedCanonicalInput,
} from './types.ts';
