import { createHash } from 'node:crypto';
import { ulid } from 'ulid';
import { canonicalJson } from '../../../evidence_log/hasher.ts';
import { appendRecord } from '../../../evidence_log/repository.ts';
import type {
  AppendRecordInput,
  AppendRecordOptions,
  ProviderNeutralCredential,
  CallAuditData,
  FinishReason,
  HashedRecord,
  PayloadKind,
  PurposeTag,
  SourceAnchor,
} from '../../../evidence_log/types.ts';
import type {
  LlmCallCredential,
  TokenUsage,
} from '../../types.ts';
import type {
  MediaKind,
  MultimodalContentInput,
  MultimodalEvidenceCard,
  MultimodalEvidenceStatus,
  MultimodalVlmResult,
} from './types.ts';

// ===== Content hash =====

/**
 * 计算媒体内容的独立 contentHash（sha256 of raw bytes）。
 * 不进 canonicalHash 链，独立锚定（spec §0 #4）。
 *
 * 用于 base64 输入：解码后 hash 原始字节。
 */
export function computeContentHash(base64: string): string {
  const buffer = Buffer.from(base64, 'base64');
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * 从 base64 数据计算字节大小。
 */
export function computeByteSize(base64: string): number {
  return Buffer.from(base64, 'base64').length;
}

// ===== Credential conversion =====

/**
 * 将 LlmCallCredential 映射为 ProviderNeutralCredential（用于 appendRecord 的 cred 字段）。
 * 桥接模型中立 credential 与证据日志所需的 ProviderNeutralCredential 格式。
 */
export function vlmCredentialToProviderNeutralCredential(
  credential: LlmCallCredential,
  reproHash: string,
  gitCommitSha: string,
): ProviderNeutralCredential {
  return {
    modelId: credential.modelId,
    dashscopeRequestId: credential.providerRequestId,
    reproHash,
    gitCommitSha,
    isoTimestamp: credential.isoTimestamp,
  };
}

// ===== Evidence card factory =====

/** Input parameters for operations involving create evidence card args. */
export interface CreateEvidenceCardArgs {
  readonly mediaKind: MediaKind;
  readonly imageBase64?: string;
  readonly imageRef?: string;
  readonly mimeType: string;
  readonly sourceAnchor: string;
  readonly caption: string;
  /** VLM 调用后在 call_records 中的 seq */
  readonly producedByCallRecordSeq: number;
  /** VLM 二次校验 artifact ID（若有） */
  readonly vlmRecheckArtifactId?: string;
  /** 跨模态余弦相似度（若有） */
  readonly crossCheckSimilarity?: number;
}

/**
 * 创建多模态证据卡片（TypeScript 内存对象）。
 *
 * 铁律（spec §1 反幻觉纪律）：
 * - caption 必须可证伪（禁"效果很好"等主观形容词）
 * - vlmRecheckArtifactId === null 时 status 不得为 'verified'
 * - byteSize 必须 > 0（反 theatre）
 */
export function createMultimodalEvidenceCard(
  args: CreateEvidenceCardArgs,
): MultimodalEvidenceCard {
  if (args.caption.length === 0) {
    throw new Error('createMultimodalEvidenceCard: caption must be non-empty');
  }

  const byteSize = args.imageBase64 !== undefined ? computeByteSize(args.imageBase64) : 0;

  if (args.imageBase64 !== undefined && byteSize === 0) {
    throw new Error('createMultimodalEvidenceCard: byteSize must be > 0 (anti-theatre)');
  }

  const contentHash = args.imageBase64 !== undefined
    ? computeContentHash(args.imageBase64)
    : 'no_image_base64_provided';

  const status: MultimodalEvidenceStatus = resolveInitialStatus(args);

  return {
    cardId: ulid(),
    mediaKind: args.mediaKind,
    mediaRef: args.imageRef ?? '',
    contentHash,
    mimeType: args.mimeType,
    byteSize,
    sourceAnchor: args.sourceAnchor,
    caption: args.caption,
    vlmRecheckArtifactId: args.vlmRecheckArtifactId ?? null,
    crossCheckSimilarity: args.crossCheckSimilarity ?? null,
    status,
    producedByCallRecordSeq: args.producedByCallRecordSeq,
    createdAt: new Date().toISOString(),
  };
}

/**
 * 根据是否做了 recheck 和 crossCheck 决定初始状态。
 */
function resolveInitialStatus(args: CreateEvidenceCardArgs): MultimodalEvidenceStatus {
  if (args.vlmRecheckArtifactId !== undefined && args.crossCheckSimilarity !== undefined) {
    if (args.crossCheckSimilarity >= 0.6) {
      return 'verified';
    }
    return 'degraded';
  }
  // 未做 recheck 或 crossCheck：untested
  return 'untested';
}

// ===== Record VLM call into evidence_log =====

/** Input parameters for operations involving record vlm call args. */
export interface RecordVlmCallArgs {
  /** VLM 调用结果 */
  readonly result: MultimodalVlmResult;
  /** VLM 调用时发送的输入 */
  readonly input: MultimodalContentInput;
  /** 证据日志元数据 */
  readonly stageId: string;
  readonly payloadKind: PayloadKind;
  readonly purposeTag: PurposeTag;
  readonly reproHash: string;
  readonly gitCommitSha: string;
  /** profile 选项 */
  readonly appendOptions: AppendRecordOptions;
}

/**
 * 将一次多模态 VLM 调用记录到 evidence_log 的 call_records 哈希链中。
 *
 * 复用现有 appendRecord 基础设施，与纯文本 LLM 调用共享同一条哈希链。
 * VLM 调用与文本调用的区别仅在于：
 * 1. requestPayload 包含 imageRef/imageBase64 信息（不进 canonicalHash 的媒体二进制）
 * 2. credential.capability = 'vision'
 * 3. purposeTag 可区分 VL 调用与纯文本调用
 *
 * 铁律（spec §0 #4）：媒体二进制不进 canonicalHash。
 * request/response payload 中仅记录元信息（mimeType、imageRef），不含 base64 本体。
 */
export function recordVlmCall(
  db: import('better-sqlite3').Database,
  args: RecordVlmCallArgs,
): HashedRecord {
  // 构建 request 记录（不含 base64 二进制，仅元信息）
  const requestRecord: Record<string, unknown> = {
    providerProfile: args.result.credential.providerProfile,
    capability: 'vision',
    imageRef: args.input.imageRef ?? null,
    imageMimeType: args.input.mimeType,
    promptPreview: args.input.prompt.substring(0, 500),
  };

  // 构建 response 记录
  const responseRecord: Record<string, unknown> = {
    interpretation: args.result.interpretation,
    finishReason: args.result.finishReason,
    credential: {
      providerProfile: args.result.credential.providerProfile,
      providerRequestId: args.result.credential.providerRequestId,
      modelId: args.result.credential.modelId,
      capability: args.result.credential.capability,
      isoTimestamp: args.result.credential.isoTimestamp,
      tokenUsage: args.result.credential.tokenUsage,
    },
  };

  const audit: CallAuditData = {
    requestPayload: canonicalJson(requestRecord, 'recordVlmCall.requestPayload'),
    responsePayload: canonicalJson(responseRecord, 'recordVlmCall.responsePayload'),
    finishReason: narrowFinishReason(args.result.finishReason),
    usageTokensTotal: args.result.credential.tokenUsage.totalTokens,
  };

  const cred: ProviderNeutralCredential = vlmCredentialToProviderNeutralCredential(
    args.result.credential,
    args.reproHash,
    args.gitCommitSha,
  );

  const appendInput: AppendRecordInput = {
    stageId: args.stageId,
    cred,
    payloadKind: args.payloadKind,
    purposeTag: args.purposeTag,
  };

  return appendRecord(db, appendInput, audit, args.appendOptions);
}

// ===== Source anchor factory =====

/**
 * 从 VLM 调用结果构建 SourceAnchor。
 */
export function buildVlmSourceAnchor(
  result: MultimodalVlmResult,
  gitCommitSha: string,
  codeFilePath?: string,
  codeLineNumber?: number,
): SourceAnchor {
  const rawResponseHash = createHash('sha256')
    .update(result.interpretation, 'utf8')
    .digest('hex');

  return {
    gitCommitSha,
    dashscopeRequestId: result.credential.providerRequestId,
    isoTimestamp: result.credential.isoTimestamp,
    rawResponseHash,
    ...(codeFilePath !== undefined
      ? {
          codeLocation: {
            filePath: codeFilePath,
            location: `VLM call for ${result.credential.modelId}`,
            ...(codeLineNumber !== undefined ? { lineNumber: codeLineNumber } : {}),
          },
        }
      : {}),
  };
}

// ===== Internal helpers =====

const VALID_FINISH_REASONS = new Set<string>([
  'stop',
  'length',
  'tool_calls',
  'function_call',
  'content_filter',
]);

function narrowFinishReason(raw: string): FinishReason {
  if (VALID_FINISH_REASONS.has(raw)) {
    return raw as FinishReason;
  }
  // 未知值降级为 'stop'（防御性兜底·生产不应出现）
  return 'stop';
}

// ===== Offline / test helpers =====

/**
 * 为离线测试创建一个模拟的 MultimodalVlmResult。
 * 仅用于测试 fixture，不进生产代码。
 */
export function createFixtureVlmResult(overrides: {
  readonly callRecordSeq?: number;
  readonly interpretation?: string;
  readonly structuredClaim?: unknown;
  readonly modelId?: string;
} = {}): MultimodalVlmResult {
  const tokenUsage: TokenUsage = {
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
  };

  return {
    callRecordSeq: overrides.callRecordSeq ?? 1,
    credential: {
      providerProfile: 'offline_replay',
      providerRequestId: 'fixture-req-001',
      modelId: overrides.modelId ?? 'qwen-vl-max',
      modelVersion: null,
      capability: 'vision',
      isoTimestamp: '2026-06-27T00:00:00.000Z',
      tokenUsage,
    },
    interpretation: overrides.interpretation ?? '图中显示一条上升的曲线，表明数值随时间增长。',
    structuredClaim: overrides.structuredClaim ?? {
      trend: '上升',
      maxValue: 100,
      minValue: 10,
    },
    finishReason: 'stop',
  };
}
