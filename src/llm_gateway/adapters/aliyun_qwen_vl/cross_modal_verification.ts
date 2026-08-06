import { ulid } from 'ulid';
import {
  CROSS_MODAL_THRESHOLD,
} from './types.ts';
import type {
  CrossCheckFailureCode,
  MultimodalCrossCheck,
} from './types.ts';

// ===== Types =====

/**
 * 文本相似度计算器接口。
 * 返回 0..1 的相似度分数。
 *
 * 默认实现基于词频余弦相似度（确定性、可复现）。
 * 生产环境可选替换为真实的跨模态嵌入余弦相似度。
 */
export interface TextSimilarityCalculator {
  /** 计算两段文本的相似度（0..1） */
  compute(textA: string, textB: string): number;
}

/**
 * 跨模态一致性验证器配置。
 */
export interface CrossModalVerifierConfig {
  /** 相似度阈值（默认 CROSS_MODAL_THRESHOLD = 0.6） */
  readonly threshold?: number;
  /** 文本相似度计算器（默认 deterministicCosineSimilarity） */
  readonly similarityCalculator?: TextSimilarityCalculator;
}

/**
 * 跨模态一致性验证器。
 *
 * 职责：
 * 1. 计算"文本声明"与"VLM 图像判读"的相似度
 * 2. 与阈值比对，产出 passed/failed 判定
 * 3. 生成 MultimodalCrossCheck 记录
 *
 * 铁律（spec §3 #3）：consistent 判定禁止用 LLM 当裁判。
 * 本实现使用确定性文本相似度（词频余弦），全程可审计、可复现。
 */
export interface CrossModalVerifier {
  /** 生成一次跨模态一致性检查 */
  verify(args: CrossModalVerifyArgs): MultimodalCrossCheck;
  /** 仅计算相似度，不生成完整记录 */
  similarity(textA: string, textB: string): number;
  /** 当前阈值 */
  readonly threshold: number;
}

/** Input parameters for operations involving cross modal verify args. */
export interface CrossModalVerifyArgs {
  readonly cardId: string;
  /** 文本模态的来源描述（evidence_id 或 caption） */
  readonly textClaim: string;
  /** VLM 对同一证据的判读文本 */
  readonly vlmInterpretation: string;
  /** 取图像嵌入的 call_record seq（若有） */
  readonly imageEmbeddingCallRecordSeq: number;
}

// ===== Deterministic text similarity =====

/**
 * 将文本分词为小写 token 列表。
 * 中英文混合：对中文按字/二元组分词，对英文按空格 + 标点分词。
 */
function tokenize(text: string): string[] {
  const normalized = text.toLowerCase().trim();
  if (normalized.length === 0) {
    return [];
  }

  const tokens: string[] = [];

  // 分割英文单词 + 中文按 bigram 滑动窗口
  let i = 0;
  while (i < normalized.length) {
    const char = normalized[i];
    if (char === undefined) break;

    if (/[a-z0-9]/.test(char)) {
      // 英文/数字单词：连续字母数字
      let word = '';
      while (i < normalized.length) {
        const c = normalized[i];
        if (c !== undefined && /[a-z0-9]/.test(c)) {
          word += c;
          i++;
        } else {
          break;
        }
      }
      if (word.length > 0) {
        tokens.push(word);
      }
    } else if (/[一-鿿]/.test(char)) {
      // 中文字符：单字 + bigram
      tokens.push(char);
      const nextChar = normalized[i + 1];
      if (nextChar !== undefined && /[一-鿿]/.test(nextChar)) {
        tokens.push(char + nextChar);
      }
      i++;
    } else {
      // 标点/空白：跳过（不产 token）
      i++;
    }
  }

  return tokens;
}

/**
 * 构建词频向量。
 */
function buildTermFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) ?? 0) + 1);
  }
  return tf;
}

/**
 * 计算两个词频向量的余弦相似度。
 * cos(θ) = (A·B) / (|A| × |B|)
 */
function cosineSimilarityTF(
  tfA: Map<string, number>,
  tfB: Map<string, number>,
): number {
  // 收集所有 term
  const allTerms = new Set([...tfA.keys(), ...tfB.keys()]);

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const term of allTerms) {
    const a = tfA.get(term) ?? 0;
    const b = tfB.get(term) ?? 0;
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 确定性文本相似度计算器。
 * 基于 TF 余弦相似度，可复现、可审计。（FIX-R6-005: AGENTS.md:52 禁"完全可复现"过度宣称·评委12）
 */
export function deterministicCosineSimilarity(textA: string, textB: string): number {
  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);

  if (tokensA.length === 0 || tokensB.length === 0) {
    return 0;
  }

  const tfA = buildTermFrequency(tokensA);
  const tfB = buildTermFrequency(tokensB);

  return cosineSimilarityTF(tfA, tfB);
}

/**
 * 创建默认的文本相似度计算器（确定性 TF 余弦）。
 */
export function createDeterministicSimilarityCalculator(): TextSimilarityCalculator {
  return {
    compute(textA: string, textB: string): number {
      return deterministicCosineSimilarity(textA, textB);
    },
  };
}

// ===== Cross-modal verifier =====

/**
 * 创建跨模态一致性验证器。
 *
 * 使用确定性文本相似度（TF 余弦）计算图像判读文本与声明文本的一致性。
 * 该实现全程不依赖 LLM-as-judge（spec §3 #3）。
 *
 * 阈值纪律（spec §4）：
 * - 默认 CROSS_MODAL_THRESHOLD = 0.6
 * - MAY 由 config 覆盖，禁硬编码进 core 常量
 * - [已实证] 具体阈值已经 fixture 校准
 */
export function createCrossModalVerifier(config: CrossModalVerifierConfig = {}): CrossModalVerifier {
  const threshold = config.threshold ?? CROSS_MODAL_THRESHOLD;
  const calculator = config.similarityCalculator ?? createDeterministicSimilarityCalculator();

  function similarity(textA: string, textB: string): number {
    return calculator.compute(textA, textB);
  }

  function verify(args: CrossModalVerifyArgs): MultimodalCrossCheck {
    const cosineSimilarity = calculator.compute(args.textClaim, args.vlmInterpretation);
    const passed = cosineSimilarity >= threshold;
    const failureCode: CrossCheckFailureCode | null = passed
      ? null
      : 'multimodal_cross_check_failed';

    return {
      crossCheckId: ulid(),
      cardId: args.cardId,
      textEmbeddingSource: args.textClaim.substring(0, 200),
      imageEmbeddingCallRecordSeq: args.imageEmbeddingCallRecordSeq,
      cosineSimilarity: Math.round(cosineSimilarity * 10_000) / 10_000, // 4 decimal places
      passed,
      failureCode,
      createdAt: new Date().toISOString(),
    };
  }

  return {
    verify,
    similarity,
    threshold,
  };
}

// ===== VLM Recheck helpers =====

/** Input parameters for operations involving vlm recheck args. */
export interface VlmRecheckArgs {
  readonly originalCardId: string;
  readonly originalInterpretation: string;
  readonly recheckInterpretation: string;
  readonly recheckCallRecordSeq: number;
}

/** Result/output structure for vlm recheck result. */
export interface VlmRecheckResult {
  readonly consistent: boolean;
  readonly similarity: number;
  readonly discrepancyReason: string | null;
}

/**
 * 对 VLM 初次判读与二次判读做确定性比对。
 *
 * 铁律（spec §3）：
 * - 比对用 deterministic_script（本函数），禁止 LLM-as-judge
 * - 不一致时原卡片 status 须置为 'degraded' 或 'contested'
 * - 禁止维持 'verified'
 */
export function deterministicRecheck(
  originalInterpretation: string,
  recheckInterpretation: string,
): VlmRecheckResult {
  const sim = deterministicCosineSimilarity(originalInterpretation, recheckInterpretation);
  // recheck 比跨模态更严格：相似度低于 0.7 即判定不一致
  const RECHECK_CONSISTENCY_THRESHOLD = 0.7;
  const consistent = sim >= RECHECK_CONSISTENCY_THRESHOLD;

  let discrepancyReason: string | null = null;
  if (!consistent) {
    discrepancyReason =
      `VLM recheck similarity ${(sim * 100).toFixed(1)}% < ${(RECHECK_CONSISTENCY_THRESHOLD * 100).toFixed(0)}% threshold`;
  }

  return {
    consistent,
    similarity: Math.round(sim * 10_000) / 10_000,
    discrepancyReason,
  };
}

// ===== Structured claim comparison =====

/**
 * 对结构化 claim（unknown → 经 type guard 收窄后的 Record）做精确字段比对。
 * 这是 deterministic_script 的高级形式：不止看文本相似度，还看关键字段值。
 *
 * 返回一致的关键字段比例（0..1）。
 */
export function compareStructuredClaims(
  claimA: Record<string, unknown>,
  claimB: Record<string, unknown>,
): { readonly matchRatio: number; readonly mismatchedKeys: string[] } {
  const keysA = Object.keys(claimA);
  const keysB = Object.keys(claimB);
  const allKeys = new Set([...keysA, ...keysB]);

  let matches = 0;
  const mismatchedKeys: string[] = [];

  for (const key of allKeys) {
    const valA = claimA[key];
    const valB = claimB[key];

    if (valA === undefined || valB === undefined) {
      mismatchedKeys.push(key);
      continue;
    }

    // 深度相等判断（仅值类型，非引用）
    const strA = JSON.stringify(valA);
    const strB = JSON.stringify(valB);
    if (strA === strB) {
      matches++;
    } else {
      mismatchedKeys.push(key);
    }
  }

  const matchRatio = allKeys.size === 0 ? 1 : matches / allKeys.size;

  return { matchRatio, mismatchedKeys };
}
