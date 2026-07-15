import type { ProviderProfile, LlmCallCredential } from '../../types.ts';

// ===== §1 MultimodalEvidenceCard =====

/**
 * 多模态证据的媒体类型。
 * 历史溯源：FAR_CHAIN_DEV_SPEC/28 §1（已归档·commit 66e2975）·运行时 SSOT 以本文件源码实测为准。
 */
export type MediaKind = 'image' | 'chart' | 'video_frame' | 'diagram' | 'table_render';

/**
 * 多模态证据校验状态。
 * - verified: 已通过 VLM recheck + 跨模态一致性 gate
 * - degraded: 二次校验不一致或一致性低于阈值，降级使用
 * - untested: 无 VLM 后端可用，未校验
 * - contested: 跨模态比对严重矛盾，禁止直接支撑 CONFIRMED
 */
export type MultimodalEvidenceStatus = 'verified' | 'degraded' | 'untested' | 'contested';

/**
 * 多模态证据卡片。承载图像/图表/视频帧等非文本证据。
 * 媒体二进制不进 canonicalHash（独立 contentHash 锚定）。
 */
export interface MultimodalEvidenceCard {
  readonly cardId: string;
  readonly mediaKind: MediaKind;
  readonly mediaRef: string;
  readonly contentHash: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly sourceAnchor: string;
  readonly caption: string;
  readonly vlmRecheckArtifactId: string | null;
  readonly crossCheckSimilarity: number | null;
  readonly status: MultimodalEvidenceStatus;
  readonly producedByCallRecordSeq: number | null;
  readonly createdAt: string;
}

// ===== §2 MultimodalProvider =====

/**
 * 多模态内容输入（喂给 VLM）。
 * imageRef 与 imageBase64 二选一：生产用 imageRef（落盘可审计），测试用 imageBase64。
 */
export interface MultimodalContentInput {
  readonly imageRef?: string;
  readonly imageBase64?: string;
  readonly mimeType: string;
  readonly prompt: string;
}

/**
 * VLM 调用结果（模型中立返回类型）。
 * structuredClaim 用 unknown + type guard 收窄（零容忍 #1）。
 */
export interface MultimodalVlmResult {
  readonly callRecordSeq: number;
  readonly credential: LlmCallCredential;
  readonly interpretation: string;
  readonly structuredClaim: unknown;
  readonly finishReason: string;
}

/**
 * 多模态 provider 抽象。
 * C10 纪律：实现 MAY 在 competition_aliyun_qwen profile 内调用 Qwen-VL，
 * 但 core 接口不出现 Qwen 型号。capability='vision' 是唯一能力锚点。
 */
export interface MultimodalProvider {
  readonly profile: ProviderProfile;
  /** 调用前守卫：该 profile 是否真的具备 vision 能力 */
  declaresVisionCapability(): boolean;
  /** 向 VLM 发送图像 + prompt，获取判读结果 */
  interpret(input: MultimodalContentInput): Promise<MultimodalVlmResult>;
}

// ===== §3 VlmRecheckArtifact =====

/**
 * 对同一张多模态证据的第二次独立 VLM 判读。
 * 与第一次判读比对：若核心结论不一致 → 触发 degraded。
 */
export interface VlmRecheckArtifact {
  readonly recheckId: string;
  readonly originalCardId: string;
  readonly recheckCallRecordSeq: number;
  readonly recheckInterpretation: string;
  readonly judgedBy: 'deterministic_script' | 'human_checkpoint';
  readonly consistent: boolean;
  readonly discrepancyReason: string | null;
  readonly createdAt: string;
}

// ===== §4 MultimodalCrossCheck =====

/**
 * 默认跨模态余弦相似度阈值。
 * 非赛题硬要求，MAY 由 config 覆盖。
 * [已实证] 具体阈值已经 fixture 校准。
 */
export const CROSS_MODAL_THRESHOLD = 0.6;

export type CrossCheckFailureCode = 'multimodal_cross_check_failed';

/**
 * 跨模态一致性检查结果。
 * 同一证据的"文本模态描述"与"图像模态判读"的一致性量化。
 */
export interface MultimodalCrossCheck {
  readonly crossCheckId: string;
  readonly cardId: string;
  readonly textEmbeddingSource: string;
  readonly imageEmbeddingCallRecordSeq: number;
  readonly cosineSimilarity: number;
  readonly passed: boolean;
  readonly failureCode: CrossCheckFailureCode | null;
  readonly createdAt: string;
}

// ===== Multimodal Gate types =====

/**
 * 多模态路由决策。
 * 根据输入是否包含图像，决定走 VL 还是纯文本路径。
 */
export type MultimodalRouteDecision =
  | { readonly kind: 'vision'; readonly reason: string }
  | { readonly kind: 'text_only'; readonly reason: string };

/**
 * 多模态路由门控接口。
 * 判断何时路由到 VL 模型（image evidence）、何时路由到纯文本模型。
 */
export interface MultimodalGate {
  /** 根据输入内容决定路由 */
  decide(input: MultimodalContentInput | { readonly prompt: string }): MultimodalRouteDecision;
  /** 该 gate 管理的 text provider profile */
  readonly textProfile: ProviderProfile;
  /** 该 gate 管理的 vision provider profile */
  readonly visionProfile: ProviderProfile;
  /** vision profile 是否可用 */
  isVisionAvailable(): boolean;
}

// ===== VL Adapter extras =====

/**
 * Qwen-VL 支持的具体模型标识。
 * 仅存在于 adapter 目录，不得泄露到 core。
 * [已实证] 已确认百炼控制台可用 VL 模型。
 */
export const QWEN_VL_MODELS = [
  'qwen-vl-max',
  'qwen-vl-plus',
] as const;

export type QwenVlModelId = (typeof QWEN_VL_MODELS)[number];

/**
 * Qwen-VL 默认模型。
 */
export const QWEN_VL_DEFAULT_MODEL: QwenVlModelId = 'qwen-vl-max';

/**
 * 判断给定 modelId 是否为 Qwen-VL 系列。
 * 仅用于 adapter 内部路由，不暴露到 core。
 */
export function isQwenVlModel(modelId: string): modelId is QwenVlModelId {
  return (QWEN_VL_MODELS as readonly string[]).includes(modelId);
}
