// src/retrieval/multilingual.ts
// 职责：RET-MULTILINGUAL-001 多语言检索的语言来源记录与覆盖边界（机器层）。
//
// 宪法条款：记录原语言、翻译查询、翻译模型/版本、语言覆盖和可能遗漏；
// 关键非英文证据需要保留原文定位与翻译对应关系；不得因英文数据库覆盖
// 更好而无说明忽略目标语言资料；Failure：报告明确限定语言范围。
//
// 机制：
//   LanguageProvenance        单次检索的语言来源记录（原语言/查询语言/
//                            翻译查询串/翻译模型与版本/回译核对）
//   validateProvenance        记录纪律：跨语言查询必须带翻译模型与版本
//                            （缺 → 违规——翻译链不可审计）
//   languageCoverageGate      覆盖门：计划语言集 vs 实际执行语言集——
//                            执行是计划的真子集 → SILENT_SCOPE_NARROWING
//                            违规（必须显式 limitation，不许静默缩域）
//   coverageLimitationText    从缺口生成显式 limitation 文本（报告消费）
//   EntityAlignment           跨语言实体对齐：音译/变音符号归一化后的
//                            确定性匹配（aligned + normal form）
//   backTranslationDrift      回译漂移：原文 vs 回译文 shingle 相似度低于
//                            阈值 → 漂移警告（翻译链质量面）
//   originalTextAnchor        关键非英文证据的原文锚：原文定位 + 译文
//                            对应（原文段落指纹 + 译文指纹 + 对齐声明）
//
// Cannot-prove：本机制证明「语言来源记录齐全性可校验、覆盖缩域被检出、
// 实体对齐按声明的归一化规则确定性执行」，不证明 (a) 翻译模型版本声明
// 的真实性；(b) 归一化规则捕获所有变体（未对齐 ≠ 不同实体——音译边界
// 情形只能人工复核）；(c) 检索适配器真的查询了声明的语言（执行层职责）。

import { shingleJaccard } from '../evaluation/eval_family.ts';
import { paragraphFingerprint, normalizeParagraphText } from '../evidence/paragraph_locator.ts';

// ---------------------------------------------------------------------------
// 语言来源记录
// ---------------------------------------------------------------------------

export interface LanguageProvenance {
  readonly documentId: string;
  /** 文献原语言（BCP-47 基础标签，如 'zh' / 'de' / 'en'）。 */
  readonly originalLanguage: string;
  /** 本次检索使用的查询语言。 */
  readonly queryLanguage: string;
  /** 翻译后的查询串（queryLanguage ≠ originalLanguage 时必填）。 */
  readonly translatedQuery: string | null;
  /** 翻译模型标识（跨语言查询必填）。 */
  readonly translationModel: string | null;
  /** 翻译模型版本（跨语言查询必填）。 */
  readonly translationModelVersion: string | null;
}

export type ProvenanceValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly problems: readonly string[] };

/** 记录纪律：跨语言查询必须带翻译查询串 + 模型 + 版本（翻译链可审计）。 */
export function validateProvenance(p: LanguageProvenance): ProvenanceValidation {
  const problems: string[] = [];
  if (p.originalLanguage.trim().length === 0) problems.push(`[${p.documentId}] originalLanguage empty`);
  if (p.queryLanguage.trim().length === 0) problems.push(`[${p.documentId}] queryLanguage empty`);
  if (p.queryLanguage !== p.originalLanguage) {
    if ((p.translatedQuery ?? '').trim().length === 0) problems.push(`[${p.documentId}] cross-language query without translatedQuery`);
    if ((p.translationModel ?? '').trim().length === 0) problems.push(`[${p.documentId}] cross-language query without translationModel — translation chain not auditable`);
    if ((p.translationModelVersion ?? '').trim().length === 0) problems.push(`[${p.documentId}] cross-language query without translationModelVersion`);
  }
  return { ok: problems.length === 0, problems };
}

// ---------------------------------------------------------------------------
// 覆盖门：不得静默缩小证据域
// ---------------------------------------------------------------------------

export interface LanguageCoverageReport {
  /** 计划覆盖的语言（全支持全列出）。 */
  readonly plannedLanguages: readonly string[];
  /** 实际查询过的语言。 */
  readonly executedLanguages: readonly string[];
  /** 计划内但未查询的语言（覆盖缺口——必须作为 limitation 报告）。 */
  readonly uncoveredLanguages: readonly string[];
  /** 未在计划内但出现结果的语言（超出声明域——也要显式，不算功劳）。 */
  readonly unexpectedLanguages: readonly string[];
  readonly limitationText: string | null;
  readonly silentNarrowing: boolean;
}

/**
 * 覆盖门：计划 vs 执行。uncovered 非空 → silentNarrowing=true（除非调用方
 * 已显式声明 limitation——机制层只标记，报告层必须消费 limitationText）。
 */
export function languageCoverageGate(input: {
  readonly plannedLanguages: readonly string[];
  readonly executedLanguages: readonly string[];
}): LanguageCoverageReport {
  const planned = [...new Set(input.plannedLanguages.map((l) => l.trim()).filter((l) => l.length > 0))].sort();
  const executed = [...new Set(input.executedLanguages.map((l) => l.trim()).filter((l) => l.length > 0))].sort();
  const executedSet = new Set(executed);
  const plannedSet = new Set(planned);
  const uncovered = planned.filter((l) => !executedSet.has(l));
  const unexpected = executed.filter((l) => !plannedSet.has(l));
  const silentNarrowing = uncovered.length > 0;
  const limitationText = silentNarrowing
    ? `LANGUAGE SCOPE LIMITATION: planned coverage [${planned.join(', ')}] but queries executed only in [${executed.join(', ')}] — findings in ${uncovered.join(', ')} are NOT covered by this evidence base; do not generalize beyond the executed languages`
    : null;
  return { plannedLanguages: planned, executedLanguages: executed, uncoveredLanguages: uncovered, unexpectedLanguages: unexpected, limitationText, silentNarrowing };
}

// ---------------------------------------------------------------------------
// 实体对齐（跨语言）
// ---------------------------------------------------------------------------

export interface EntityAlignmentPair {
  /** 原语言实体（如 '阿耳茨海默病'）。 */
  readonly sourceText: string;
  /** 目标语言实体（如 'Alzheimer’s disease' 或其回译）。 */
  readonly targetText: string;
}

export interface EntityAlignmentResult {
  readonly pairs: readonly { readonly sourceText: string; readonly targetText: string; readonly aligned: boolean; readonly sourceNormal: string; readonly targetNormal: string }[];
  readonly alignedCount: number;
  readonly misalignedCount: number;
}

/**
 * 归一化：小写 + NFD 去变音符号 + 去标点/空白。确定性——同实体的常见
 * 书写变体归一到同一形态；归一后仍不等 → 未对齐（宁缺毋错，交人工）。
 */
export function normalizeEntityName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 跨语言实体对齐：逐对归一化比较（确定性）。 */
export function alignEntities(pairs: readonly EntityAlignmentPair[]): EntityAlignmentResult {
  const out = pairs.map((p) => {
    const sourceNormal = normalizeEntityName(p.sourceText);
    const targetNormal = normalizeEntityName(p.targetText);
    return { sourceText: p.sourceText, targetText: p.targetText, aligned: sourceNormal === targetNormal && sourceNormal.length > 0, sourceNormal, targetNormal };
  });
  return {
    pairs: out,
    alignedCount: out.filter((o) => o.aligned).length,
    misalignedCount: out.filter((o) => !o.aligned).length,
  };
}

// ---------------------------------------------------------------------------
// 回译漂移
// ---------------------------------------------------------------------------

export const BACK_TRANSLATION_DRIFT_THRESHOLD = 0.6;

export interface BackTranslationCheck {
  readonly similarity: number;
  readonly drifted: boolean;
  readonly originalFingerprint: string;
  readonly backTranslatedFingerprint: string;
}

/** 回译漂移：原文与回译文的 shingle 相似度（低于阈值 → drifted 警告）。 */
export function backTranslationDrift(originalText: string, backTranslatedText: string): BackTranslationCheck {
  const a = normalizeParagraphText(originalText);
  const b = normalizeParagraphText(backTranslatedText);
  const similarity = shingleJaccard(a, b);
  return {
    similarity,
    drifted: similarity < BACK_TRANSLATION_DRIFT_THRESHOLD,
    originalFingerprint: paragraphFingerprint(a),
    backTranslatedFingerprint: paragraphFingerprint(b),
  };
}

// ---------------------------------------------------------------------------
// 原文锚：关键非英文证据的原文定位 + 翻译对应
// ---------------------------------------------------------------------------

export interface OriginalTextAnchor {
  readonly documentId: string;
  readonly paragraphIndex: number;
  readonly originalText: string;
  readonly translatedText: string;
  readonly originalFingerprint: string;
  readonly translatedFingerprint: string;
  readonly translationModel: string;
  readonly translationModelVersion: string;
}

/** 构造原文锚：原文/译文指纹 + 翻译链记录（关键非英文证据的最低记录面）。 */
export function buildOriginalTextAnchor(input: {
  readonly documentId: string;
  readonly paragraphIndex: number;
  readonly originalText: string;
  readonly translatedText: string;
  readonly translationModel: string;
  readonly translationModelVersion: string;
}): OriginalTextAnchor {
  if (input.translationModel.trim().length === 0 || input.translationModelVersion.trim().length === 0) {
    throw new Error('buildOriginalTextAnchor: translationModel and version are required — key non-English evidence must carry its translation chain');
  }
  return {
    documentId: input.documentId,
    paragraphIndex: input.paragraphIndex,
    originalText: input.originalText,
    translatedText: input.translatedText,
    originalFingerprint: paragraphFingerprint(normalizeParagraphText(input.originalText)),
    translatedFingerprint: paragraphFingerprint(normalizeParagraphText(input.translatedText)),
    translationModel: input.translationModel,
    translationModelVersion: input.translationModelVersion,
  };
}
