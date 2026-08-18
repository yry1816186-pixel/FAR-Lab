// src/evidence/paragraph_locator.ts
// 职责：EVID-PARAGRAPH-001 许可全文的段落级可追溯证据链（机器层）。
//
// 宪法条款的链路：
//   source → section/paragraph/span → normalized text hash → EvidenceRecord
//   → Claim relation
// 定位方式需要对版式变化有合理鲁棒性，并保留原始 locator；无合法全文权限
// 时返回 NO_FULLTEXT_LICENSE，不得绕过许可缓存或再分发。
//
// 机制：
//   normalizeParagraphText    段落规范化（空白折叠/连字符断行接回/引号统
//                             一）——版式变化（PDF 重排/换行差异）下指纹
//                             稳定的第一道鲁棒性
//   paragraphFingerprint      规范化文本的 SHA256（内容锚——与 retrieval/
//                             hash.ts 的 rawSha256Hex 同 SSOT）
//   extractParagraphs/locateParagraph  全文切段 + 构造 locator（段落序号 +
//                             字符 span + 指纹；指纹为主锚、序号为次锚）
//   buildParagraphEvidence    建证据记录（许可门：no-license →
//                             NO_FULLTEXT_LICENSE fail-closed，只降级元数据）
//   verifyParagraphEvidence   记录完整性（文本重算指纹 vs locator 声明指纹
//                             ——段文本被改即检出）
//   relocateParagraph         版本变化重定位：规范化指纹一致 → SAME_HASH；
//                             指纹漂移但 shingle 相似 ≥ 阈值 → DRIFTED
//                             （报告新旧 hash 差异——内容漂移显式化）；
//                             低于阈值 → NOT_FOUND（不猜）
//
// Cannot-prove：本机制证明「段落指纹的计算/校验/漂移检出正确、无许可时
// fail-closed」，不证明 (a) 许可元数据本身的真实性（license 字段由许可
// 缓存/供给方负责——机制只消费判定）；(b) 漂移段落在语义上仍支持同一
// 结论（相似度阈值是 ENGINEERING BUDGET，DRIFTED 状态要求人工复核——
// 机制不自动放行）；(c) 全文抽取的正确性（PDF→文本的抽取错误会传播到
// 段落切分，属上游抽取器职责）。

import { rawSha256Hex } from '../retrieval/hash.ts';
import { shingleJaccard } from '../evaluation/eval_family.ts';

// ---------------------------------------------------------------------------
// 规范化 + 指纹
// ---------------------------------------------------------------------------

/**
 * 段落规范化：连续空白折叠为单空格、行尾连字符断行接回（PDF 重排常见）、
 * 弯直引号统一、首尾 trim。版式变化（换行/缩进/字距）不影响输出。
 */
export function normalizeParagraphText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/([A-Za-z])-\n([a-z])/g, '$1$2') // PDF 断字接回：'interpre-\ntation' → 'interpretation'
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 段落指纹：规范化文本的 SHA256（与 retrieval/hash 的内容哈希同 SSOT）。 */
export function paragraphFingerprint(normalizedText: string): string {
  return rawSha256Hex(normalizedText);
}

// ---------------------------------------------------------------------------
// 切段 + locator 构造
// ---------------------------------------------------------------------------

export interface ExtractedParagraph {
  readonly index: number;
  readonly raw: string;
  readonly normalized: string;
}

/** 全文切段：空行分隔（连续空行视为一个分隔）；段序号从 0 起（确定性）。 */
export function extractParagraphs(fulltext: string): readonly ExtractedParagraph[] {
  const blocks = fulltext.replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  return blocks
    .map((raw) => ({ raw, normalized: normalizeParagraphText(raw) }))
    .filter((b) => b.normalized.length > 0)
    .map((b, index) => ({ index, raw: b.raw, normalized: b.normalized }));
}

/** 段落定位符：指纹为主锚（内容身份），序号+span 为次锚（原始定位保留）。 */
export interface ParagraphLocator {
  readonly documentId: string;
  /** 章节提示（可选——版本变化时仅作辅助，不参与内容身份）。 */
  readonly section: string | null;
  readonly paragraphIndex: number;
  /** 原始全文中的字符 span（含原始版式——宪法：保留原始 locator）。 */
  readonly charStart: number;
  readonly charEnd: number;
  /** 规范化文本 SHA256（内容锚）。 */
  readonly normalizedTextHash: string;
}

/** 定位某段：在全文切段中按段序号取段并构造 locator。越界 → throw。 */
export function locateParagraph(fulltext: string, documentId: string, paragraphIndex: number, section: string | null = null): ParagraphLocator {
  const paragraphs = extractParagraphs(fulltext);
  const target = paragraphs.find((p) => p.index === paragraphIndex);
  if (target === undefined) {
    throw new Error(`locateParagraph: paragraph index ${paragraphIndex} out of range (document has ${paragraphs.length} paragraphs)`);
  }
  const charStart = fulltext.indexOf(target.raw.trim().slice(0, 40));
  return {
    documentId,
    section,
    paragraphIndex,
    charStart: charStart >= 0 ? charStart : 0,
    charEnd: (charStart >= 0 ? charStart : 0) + target.raw.length,
    normalizedTextHash: paragraphFingerprint(target.normalized),
  };
}

// ---------------------------------------------------------------------------
// 证据记录 + 许可门
// ---------------------------------------------------------------------------

export type FulltextLicenseState = 'licensed-fulltext' | 'no-license-metadata-only' | 'unknown';

export type ClaimRelation = 'supports' | 'refutes' | 'context';

export interface ParagraphEvidenceRecord {
  readonly locator: ParagraphLocator;
  /** 规范化段文本（证据内容）。 */
  readonly paragraphText: string;
  readonly license: FulltextLicenseState;
  readonly claimRelations: readonly { readonly claimId: string; readonly relation: ClaimRelation }[];
}

export type ParagraphEvidenceBuild =
  | { readonly ok: true; readonly record: ParagraphEvidenceRecord }
  | { readonly ok: false; readonly status: 'NO_FULLTEXT_LICENSE'; readonly reason: string };

/**
 * 建段落证据记录。许可门（宪法 Failure 条款）：license 非
 * 'licensed-fulltext' → NO_FULLTEXT_LICENSE（fail-closed——不允许绕过许可
 * 缓存铸造全文级证据，调用方只能降级为元数据级证据）。
 */
export function buildParagraphEvidence(input: {
  readonly fulltext: string;
  readonly documentId: string;
  readonly paragraphIndex: number;
  readonly section?: string | null;
  readonly license: FulltextLicenseState;
}): ParagraphEvidenceBuild {
  if (input.license !== 'licensed-fulltext') {
    return {
      ok: false,
      status: 'NO_FULLTEXT_LICENSE',
      reason: `document ${input.documentId} license state is "${input.license}" — paragraph-level evidence requires licensed fulltext; downgrade to metadata-level evidence (no bypass of the license cache, no redistribution)`,
    };
  }
  const locator = locateParagraph(input.fulltext, input.documentId, input.paragraphIndex, input.section ?? null);
  const paragraphs = extractParagraphs(input.fulltext);
  const target = paragraphs.find((p) => p.index === input.paragraphIndex);
  return {
    ok: true,
    record: {
      locator,
      paragraphText: target?.normalized ?? '',
      license: input.license,
      claimRelations: [],
    },
  };
}

/** 挂接 claim 关系（不可变——返回新记录）。 */
export function attachClaimRelation(record: ParagraphEvidenceRecord, claimId: string, relation: ClaimRelation): ParagraphEvidenceRecord {
  return { ...record, claimRelations: [...record.claimRelations, { claimId, relation }] };
}

export type ParagraphIntegrity =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

/** 记录完整性：段文本重算指纹必须等于 locator.normalizedTextHash（篡改检出）。 */
export function verifyParagraphEvidence(record: ParagraphEvidenceRecord): ParagraphIntegrity {
  const recomputed = paragraphFingerprint(record.paragraphText);
  if (recomputed !== record.locator.normalizedTextHash) {
    return {
      ok: false,
      reason: `paragraph hash mismatch: locator declares ${record.locator.normalizedTextHash.slice(0, 12)}… but text recomputes to ${recomputed.slice(0, 12)}… — paragraph text altered after locator was minted`,
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 版本变化重定位（版式鲁棒性的第二道：内容相似度回退）
// ---------------------------------------------------------------------------

export const RELOCATION_SIMILARITY_THRESHOLD = 0.7;

export type RelocationStatus = 'FOUND_SAME_HASH' | 'FOUND_DRIFTED' | 'NOT_FOUND';

export interface RelocationResult {
  readonly status: RelocationStatus;
  /** 新版全文中的 locator（NOT_FOUND 时 null）。 */
  readonly newLocator: ParagraphLocator | null;
  /** 最佳匹配相似度（shingle Jaccard over normalized text）。 */
  readonly bestSimilarity: number;
  /** 漂移详情：DRIFTED 时新旧指纹对照（内容变化显式化，要求人工复核）。 */
  readonly hashDrift: { readonly oldHash: string; readonly newHash: string } | null;
}

/**
 * 版本变化重定位：在新版全文中找同段。指纹一致（版式重排/换行变化被
 * 规范化吸收）→ FOUND_SAME_HASH；指纹漂移但相似度 ≥ 阈值 → FOUND_DRIFTED
 * （内容变了——报告 hash 差异，消费方必须复核而不自动放行）；低于阈值
 * → NOT_FOUND（宁缺毋错）。
 */
export function relocateParagraph(record: ParagraphEvidenceRecord, newFulltext: string): RelocationResult {
  const paragraphs = extractParagraphs(newFulltext);
  let bestSim = 0;
  let best: ExtractedParagraph | null = null;
  for (const p of paragraphs) {
    const sim = shingleJaccard(record.paragraphText, p.normalized);
    if (sim > bestSim) {
      bestSim = sim;
      best = p;
    }
  }
  if (best === null || bestSim < RELOCATION_SIMILARITY_THRESHOLD) {
    return { status: 'NOT_FOUND', newLocator: null, bestSimilarity: bestSim, hashDrift: null };
  }
  const newHash = paragraphFingerprint(best.normalized);
  const anchor = best.raw.trim().slice(0, 40);
  const foundAt = newFulltext.indexOf(anchor);
  const charStart = foundAt >= 0 ? foundAt : 0;
  const newLocator: ParagraphLocator = {
    documentId: record.locator.documentId,
    section: record.locator.section,
    paragraphIndex: best.index,
    charStart,
    charEnd: charStart + best.raw.length,
    normalizedTextHash: newHash,
  };
  if (newHash === record.locator.normalizedTextHash) {
    return { status: 'FOUND_SAME_HASH', newLocator, bestSimilarity: bestSim, hashDrift: null };
  }
  return {
    status: 'FOUND_DRIFTED',
    newLocator,
    bestSimilarity: bestSim,
    hashDrift: { oldHash: record.locator.normalizedTextHash, newHash },
  };
}
