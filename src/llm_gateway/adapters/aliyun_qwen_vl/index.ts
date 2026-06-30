// ===== Types（spec §1–§4） =====
export {
  QWEN_VL_DEFAULT_MODEL,
  QWEN_VL_MODELS,
  CROSS_MODAL_THRESHOLD,
  isQwenVlModel,
} from './types.ts';
export type {
  CrossCheckFailureCode,
  MediaKind,
  MultimodalContentInput,
  MultimodalCrossCheck,
  MultimodalEvidenceCard,
  MultimodalEvidenceStatus,
  MultimodalGate,
  MultimodalProvider,
  MultimodalRouteDecision,
  MultimodalVlmResult,
  QwenVlModelId,
  VlmRecheckArtifact,
} from './types.ts';

// ===== Qwen-VL client =====
export {
  createQwenVlClient,
  QwenVlImageMissingError,
  QwenVlNotAvailableError,
  QwenVlResponseMalformedError,
} from './qwen_vl_client.ts';
export type {
  QwenVlClient,
  QwenVlClientConfig,
} from './qwen_vl_client.ts';

// ===== Qwen-VL adapter =====
export {
  createQwenVlAdapter,
} from './qwen_vl_adapter.ts';
export type {
  QwenVlAdapterConfig,
} from './qwen_vl_adapter.ts';

// ===== Multimodal gate（audit [H] 死桩清理：删 routeText/routeVision/RouteTextArgs/
// RouteVisionArgs/VisionNotAvailableError/NoImageContentError·gate 仅保留 decide + isVisionAvailable） =====
export {
  createMultimodalGate,
  inputHasImage,
  promptLooksLikeItNeedsVision,
} from './multimodal_gate.ts';
export type {
  MultimodalGateConfig,
} from './multimodal_gate.ts';

// ===== Cross-modal verification =====
export {
  createCrossModalVerifier,
  createDeterministicSimilarityCalculator,
  deterministicCosineSimilarity,
  deterministicRecheck,
  compareStructuredClaims,
} from './cross_modal_verification.ts';
export type {
  CrossModalVerifier,
  CrossModalVerifierConfig,
  CrossModalVerifyArgs,
  TextSimilarityCalculator,
  VlmRecheckArgs,
  VlmRecheckResult,
} from './cross_modal_verification.ts';

// ===== Evidence integration =====
export {
  createMultimodalEvidenceCard,
  createFixtureVlmResult,
  computeContentHash,
  computeByteSize,
  recordVlmCall,
  buildVlmSourceAnchor,
  vlmCredentialToProviderNeutralCredential,
} from './evidence_integration.ts';
export type {
  CreateEvidenceCardArgs,
  RecordVlmCallArgs,
} from './evidence_integration.ts';
