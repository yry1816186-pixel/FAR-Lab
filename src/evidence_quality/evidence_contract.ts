/**
 * evidence_contract —— 宪法 EVID-RECORD-001 的 16 字段证据合同（zod SSOT + 确定性校验器）。
 *
 * 设计红线（§7 trust-kernel additive 纪律 + T-003 executionProvenance 先例）：
 *   - 合同是**描述层**：表达「这条证据与声明的支持关系」而不只存引用；缺字段用显式
 *     'unknown'/'unspecified' 标注，绝不编造（诚实优先于好看）。
 *   - 类型复用零重复：studyDesign 复用 evidence_quality/types.StudyDesign、
 *     riskOfBias 复用 RobAssessment/RobRisk、extractorIdentity.provenanceClass 复用
 *     evidence_log ProvenanceClass（llm_generated 不得自填系统字段的红线在此延续）。
 *   - 校验器纯函数、零 LLM、零 IO（F3）；claim mismatch 用确定性词法基线
 *     （EVID-ALIGN：embedding/LLM 只许增强不许替代）。
 *   - 本模块不能证明的：proposition 与 locator 的真实语义对应（需人工/外部核）；
 *     retraction status 的实时性（checkedAt 只声明检查时点）；license 字段的法律效力。
 *
 * 与 kernel 的关系：不进 R0-R9、不进 proofHash VC 白名单（与 evidence_quality 评分层同位）。
 * 消费点：FEC 可选 requireFullEvidenceContract: true → assertPrimaryEvidenceContractBound
 * fail-closed（镜像 T-003 evidence_provenance 模式·V1 默认关·V2 真实研究路径全开）。
 */

import { createHash } from 'node:crypto';

import { z } from 'zod';

import type { StudyDesign, RobAssessment, RobRisk } from './types.ts';

// ---------------------------------------------------------------------------
// 枚举（宪法字段 4/5/6/11/12/15）
// ---------------------------------------------------------------------------

/** 宪法字段 4：与声明的关系（QUALIFIES 是两侧现有类型都表达不了的第四值）。 */
export const RELATIONS_TO_CLAIM = ['SUPPORTS', 'CONTRADICTS', 'QUALIFIES', 'NEUTRAL'] as const;
export type RelationToClaim = (typeof RELATIONS_TO_CLAIM)[number];

/** 宪法字段 5：直接性。 */
export const DIRECTNESS_LEVELS = ['direct', 'indirect', 'background'] as const;
export type Directness = (typeof DIRECTNESS_LEVELS)[number];

/** 宪法字段 6：独立性（duplicate-source 检测的结构基础）。 */
export const INDEPENDENCE_LEVELS = ['independent', 'shared_source', 'derived'] as const;
export type Independence = (typeof INDEPENDENCE_LEVELS)[number];

/** 宪法字段 11：撤稿/更正状态（external retraction check 的落点字段）。 */
export const RETRACTION_STATUSES = ['none', 'retracted', 'corrected', 'unclear'] as const;
export type RetractionStatus = (typeof RETRACTION_STATUSES)[number];

/** 宪法字段 12：提取方法（与 ProvenanceClass 对齐但更细：同 provenance 红线）。 */
export const EXTRACTION_METHODS = [
  'structured_llm_extraction',
  'deterministic_parser',
  'human_extraction',
  'sandbox_execution',
] as const;
export type ExtractionMethod = (typeof EXTRACTION_METHODS)[number];

/** 宪法字段 15：许可证（公开复算边界）。 */
export const LICENSE_KINDS = [
  'cc_by',
  'cc_by_nc',
  'cc_zero',
  'mit',
  'apache_2',
  'proprietary',
  'public_domain',
  'unknown',
] as const;
export type LicenseKind = (typeof LICENSE_KINDS)[number];

// ---------------------------------------------------------------------------
// 16 字段合同 schema
// ---------------------------------------------------------------------------

export const SourceSnapshotRefSchema = z.object({
  /** 快照类别（内容寻址语料快照 / 数据集 / 沙箱运行 / 文献 API 记录）。 */
  kind: z.enum(['corpus_snapshot', 'dataset', 'sandbox_run', 'literature_api']),
  /** 内容寻址 ID（snapshot_store 的 rootHash / dataset DOI / runId / api record id）。 */
  id: z.string().min(1),
  /** 快照内容哈希（存在时参与 duplicate/content 校验）。 */
  snapshotHash: z.string().min(8).nullable(),
});
export type SourceSnapshotRef = z.infer<typeof SourceSnapshotRefSchema>;

export const EffectUncertaintySchema = z.object({
  /** 点估计（对应 falsifiability EvidenceRecord.metricValue）。 */
  estimate: z.number().nullable(),
  /** 不确定性表达（宪法字段 9 的 uncertainty 半边）。 */
  uncertainty: z
    .object({
      kind: z.enum(['ci_95', 'standard_error', 'iqr']),
      lower: z.number().nullable(),
      upper: z.number().nullable(),
    })
    .nullable(),
});
export type EffectUncertainty = z.infer<typeof EffectUncertaintySchema>;

export const ExtractorIdentitySchema = z.object({
  /** 与 evidence_log.ProvenanceClass 同枚举（红线：llm_generated 不得自填系统字段）。 */
  provenanceClass: z.enum(['system_derived', 'llm_generated', 'human']),
  /** 具体身份：model id（llm/system）或人工角色（human）。 */
  identity: z.string().min(1),
  /** llm_generated 时的系统侧重导 claim hash 绑定（可空=未绑定，strict 模式违规）。 */
  systemClaimHash: z.string().nullable(),
});
export type ExtractorIdentity = z.infer<typeof ExtractorIdentitySchema>;

export const EvidenceContractV1Schema = z.object({
  /** 宪法 16 字段（1..16 按序对应）。 */
  sourceSnapshotRef: SourceSnapshotRefSchema, // 1
  exactLocator: z.string().min(1), // 2（DOI/URL/行号/偏移）
  extractedProposition: z.string().min(1), // 3
  relationToClaim: z.enum(RELATIONS_TO_CLAIM), // 4
  directness: z.enum(DIRECTNESS_LEVELS), // 5
  independence: z.enum(INDEPENDENCE_LEVELS), // 6
  studyDesign: z.enum([
    'meta_analysis',
    'rct',
    'quasi_experimental',
    'observational',
    'cross_sectional',
    'case_report',
    'preprint',
    'expert_opinion',
    'unspecified',
  ]), // 7（字符串字面量展开=StudyDesign 的 zod 镜像·类型由断言绑定同源）
  populationContext: z.string().min(1), // 8（'unspecified' 显式标注也合法）
  effect: EffectUncertaintySchema, // 9
  riskOfBias: z.object({
    overall: z.enum(['low', 'unclear', 'high']),
    domains: z.array(
      z.object({ domain: z.string().min(1), risk: z.enum(['low', 'unclear', 'high']) }),
    ),
  }), // 10
  retraction: z.object({
    status: z.enum(RETRACTION_STATUSES),
    checkedAt: z.string().min(4).nullable(),
  }), // 11
  extractionMethod: z.enum(EXTRACTION_METHODS), // 12
  extractorIdentity: ExtractorIdentitySchema, // 13
  confidence: z.number().min(0).max(1), // 14
  licenseBoundary: z.object({
    license: z.enum(LICENSE_KINDS),
    usageBoundary: z.string().min(1), // 使用边界一句话（如 'attribution required, no redistribution'）
  }), // 15
  contentHash: z.string().regex(/^[0-9a-f]{64}$/, 'sha256 64-hex'), // 16
});
export type EvidenceContractV1 = z.infer<typeof EvidenceContractV1Schema>;

// 类型同源断言：zod 镜像与 evidence_quality/types.StudyDesign 保持一致（漂移即编译红） */
const _studyDesignSameSource: Record<StudyDesign, true> = {
  meta_analysis: true,
  rct: true,
  quasi_experimental: true,
  observational: true,
  cross_sectional: true,
  case_report: true,
  preprint: true,
  expert_opinion: true,
  unspecified: true,
};
void _studyDesignSameSource;
const _robSameSource: Record<RobRisk, 'low' | 'unclear' | 'high'> = {
  low: 'low',
  unclear: 'unclear',
  high: 'high',
};
void _robSameSource;

// ---------------------------------------------------------------------------
// 校验器（纯函数·确定性）
// ---------------------------------------------------------------------------

export interface ContractViolation {
  readonly rule:
    | 'CONTENT_HASH_MISMATCH'
    | 'EXTRACTOR_SELF_FILLED'
    | 'RETRACTED_BUT_SUPPORTS'
    | 'UNSPECIFIED_CRITICAL_FIELD';
  readonly detail: string;
}

/** 内容哈希 = sha256(extractedProposition + '\u0000' + exactLocator)——本地重算防字段被改。 */
export function computeContractContentHash(
  proposition: string,
  locator: string,
): string {
  return createHash('sha256').update(`${proposition}\u0000${locator}`).digest('hex');
}

/**
 * 合同完备性校验（strict=true 时用于 fail-closed 闸）。
 *
 * 规则：
 *   CONTENT_HASH_MISMATCH   contentHash 与重算不符（proposition/locator 被事后改动）
 *   EXTRACTOR_SELF_FILLED   llm_generated 但无 systemClaimHash（来源不可自填红线）
 *   RETRACTED_BUT_SUPPORTS  撤稿源仍声明 SUPPORTS（须改 CONTRADICTS/NEUTRAL 或给出更正说明）
 *   UNSPECIFIED_CRITICAL_FIELD strict 模式下 studyDesign/retraction.status/extractorIdentity
 *                           的 fail-conservative 占位值不得作为完整合同进入聚合
 */
export function validateEvidenceContract(
  contract: EvidenceContractV1,
  options: { readonly strict?: boolean | undefined } = {},
): ContractViolation[] {
  const violations: ContractViolation[] = [];
  const expected = computeContractContentHash(contract.extractedProposition, contract.exactLocator);
  if (contract.contentHash !== expected) {
    violations.push({
      rule: 'CONTENT_HASH_MISMATCH',
      detail: `contentHash ${contract.contentHash.slice(0, 12)}… ≠ recomputed ${expected.slice(0, 12)}… (proposition/locator mutated after signing)`,
    });
  }
  if (
    contract.extractorIdentity.provenanceClass === 'llm_generated' &&
    contract.extractorIdentity.systemClaimHash === null
  ) {
    violations.push({
      rule: 'EXTRACTOR_SELF_FILLED',
      detail: 'llm_generated extractor must carry systemClaimHash (source cannot self-fill provenance)',
    });
  }
  if (contract.retraction.status === 'retracted' && contract.relationToClaim === 'SUPPORTS') {
    violations.push({
      rule: 'RETRACTED_BUT_SUPPORTS',
      detail: 'retracted source must not stand as SUPPORTS — downgrade to CONTRADICTS/NEUTRAL or cite the correction',
    });
  }
  if (options.strict === true) {
    if (contract.studyDesign === 'unspecified') {
      violations.push({
        rule: 'UNSPECIFIED_CRITICAL_FIELD',
        detail: 'studyDesign unspecified is not a complete contract (strict mode)',
      });
    }
    if (contract.retraction.status === 'unclear') {
      violations.push({
        rule: 'UNSPECIFIED_CRITICAL_FIELD',
        detail: 'retraction.status unclear is not a complete contract (strict mode)',
      });
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// claim mismatch —— 确定性词法基线（EVID-ALIGN 纪律：LLM/embedding 只许增强）
// ---------------------------------------------------------------------------

export interface ClaimMismatchResult {
  /** true = 提取命题与声明词面重叠过低，疑似张冠李戴（不丢弃——显式标记）。 */
  readonly mismatch: boolean;
  /** 重叠度 [0,1]（共享实词 token 数 / 命名实词并集）。 */
  readonly overlap: number;
  readonly threshold: number;
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'in', 'on', 'for', 'and', 'or', 'to', 'with', 'by', 'at', 'is',
  'are', 'was', 'were', 'be', 'been', 'this', 'that', 'these', 'those', 'it', 'its',
  'as', 'from', 'than', 'then', 'we', 'they', 'their', 'our', 'can', 'may', 'will',
  '的', '了', '在', '是', '和', '与', '或', '对', '从', '被', '为', '有', '无', '该', '此',
]);

function contentTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );
}

/**
 * 词法重叠基线：提取命题与声明共享实词比例。低于阈值 → mismatch（显式标记，
 * 不得静默丢弃——宪法 EVID-ALIGN「不得静默丢弃不利或低对齐证据」）。
 */
export function detectClaimMismatch(
  contract: EvidenceContractV1,
  claimText: string,
  threshold = 0.15,
): ClaimMismatchResult {
  const claimTokens = contentTokens(claimText);
  const propTokens = contentTokens(contract.extractedProposition);
  if (claimTokens.size === 0 || propTokens.size === 0) {
    return { mismatch: true, overlap: 0, threshold };
  }
  const union = new Set([...claimTokens, ...propTokens]);
  let shared = 0;
  for (const t of claimTokens) if (propTokens.has(t)) shared += 1;
  const overlap = shared / union.size;
  return { mismatch: overlap < threshold, overlap, threshold };
}

// ---------------------------------------------------------------------------
// duplicate source —— 结构化重复检测
// ---------------------------------------------------------------------------

export interface DuplicateSourceGroup {
  readonly sourceKey: string;
  readonly indices: readonly number[];
}

/** 同 sourceSnapshotRef.id + exactLocator → 重复源组（独立性元数据可交叉印证）。 */
export function detectDuplicateSources(
  contracts: readonly EvidenceContractV1[],
): DuplicateSourceGroup[] {
  const byKey = new Map<string, number[]>();
  contracts.forEach((c, i) => {
    const key = `${c.sourceSnapshotRef.kind}\u0000${c.sourceSnapshotRef.id}\u0000${c.exactLocator}`;
    const list = byKey.get(key);
    if (list === undefined) byKey.set(key, [i]);
    else list.push(i);
  });
  return [...byKey.entries()]
    .filter(([, idx]) => idx.length > 1)
    .map(([sourceKey, indices]) => ({ sourceKey, indices }))
    .sort((a, b) => a.sourceKey.localeCompare(b.sourceKey));
}

// ---------------------------------------------------------------------------
// contradictory evidence —— 保留并结构化（EVID-CONTRADICTION 对齐）
// ---------------------------------------------------------------------------

export interface ContradictionCluster {
  readonly propositionA: string;
  readonly propositionB: string;
  readonly indexA: number;
  readonly indexB: number;
}

/**
 * 同一源上 SUPPORTS 与 CONTRADICTS 并存 → 结构化矛盾簇（保留双证·不裁决·不丢弃）。
 * 判定粒度：同 sourceSnapshotRef.id（同一数据源的自相矛盾）显式成簇；
 * 跨源矛盾由 kernel R5/R6 与报告层另行处理（本函数不越权）。
 */
export function structureContradictions(
  contracts: readonly EvidenceContractV1[],
): ContradictionCluster[] {
  const clusters: ContradictionCluster[] = [];
  const bySource = new Map<string, { supports: number[]; contradicts: number[] }>();
  contracts.forEach((c, i) => {
    if (c.relationToClaim !== 'SUPPORTS' && c.relationToClaim !== 'CONTRADICTS') return;
    const key = `${c.sourceSnapshotRef.kind}\u0000${c.sourceSnapshotRef.id}`;
    const entry = bySource.get(key) ?? { supports: [], contradicts: [] };
    if (c.relationToClaim === 'SUPPORTS') entry.supports.push(i);
    else entry.contradicts.push(i);
    bySource.set(key, entry);
  });
  for (const [, { supports, contradicts }] of bySource) {
    if (supports.length === 0 || contradicts.length === 0) continue;
    for (const a of supports) {
      for (const b of contradicts) {
        clusters.push({
          indexA: a,
          indexB: b,
          propositionA: contracts[a]!.extractedProposition,
          propositionB: contracts[b]!.extractedProposition,
        });
      }
    }
  }
  return clusters.sort((x, y) => x.indexA - y.indexA || x.indexB - y.indexB);
}

export type { StudyDesign, RobAssessment, RobRisk };
