export {
  canonicalJson,
  canonicalHash,
  canonicalHashVerified,
  hashCanonicalJson,
} from './hasher.ts';
export {
  GOLDEN_VECTORS,
  NUMERIC_GREEN_VECTORS,
  NUMERIC_KNOWN_DIVERGENCE,
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
} from './verifier.ts';
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
