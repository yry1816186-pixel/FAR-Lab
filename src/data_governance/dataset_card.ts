// src/data_governance/dataset_card.ts
// 职责：DATA-CARD-001 —— Dataset Card 十五字段 SSOT + 可验证身份与漂移检查。
//
// 现状衔接：src/research/schemas.ts 的 Exoplanet/Landscape DatasetCard 已覆盖
// source/version/checksum/units/license/missingNotes/knownBias(部分) 等约 9 项——
// 本模块把宪法 15 项收拢为完整 schema，并提供 fromExoplanetCard 投影（既有卡 →
// 完整卡的字段映射 + **缺口字段显式补声明**，不静默默认）。
//
// Acceptance 面：dataset validation（validateDatasetCard 语义门）、unit/missing/schema
// drift（三个 drift 检查）、license checks（allowlist）。
//
// Cannot-prove：卡与清单证明「声明完整且可校验」；不证明声明内容为真（checksum 可复算
// 验真，license/consent 声明的真实性由操作者与来源方承担——卡上字段是承诺面不是保证面）。

import { z } from 'zod';

// ---------------------------------------------------------------------------
// 15 字段 Dataset Card
// ---------------------------------------------------------------------------

export const PRIVACY_CATEGORIES = ['public', 'code-public-data-public', 'sensitive', 'personal'] as const;
export type PrivacyCategory = (typeof PRIVACY_CATEGORIES)[number];

export const CHECKSUM_ALGORITHMS = ['sha256', 'sha512', 'md5'] as const;

export const DatasetCardSchema = z.object({
  datasetId: z.string().min(1),
  /** ① purpose：数据集为什么存在、用于什么研究目的。 */
  purpose: z.string().min(1),
  /** ② source/provenance：来源与采集方式。 */
  provenance: z.object({
    source: z.string().min(1),
    sourceUrl: z.string().min(1),
    persistentId: z.string().min(1), // DOI/URN 等可验证身份
    collectionMethod: z.string().min(1), // API 抓取/人工收集/第三方交付…
  }),
  /** ③ version。 */
  version: z.string().min(1),
  /** ④ checksum（算法 + 值——可复算验真）。 */
  checksum: z.object({
    algorithm: z.enum(CHECKSUM_ALGORITHMS),
    value: z.string().min(1),
  }),
  /** ⑤ schema（字段清单 + 形状描述）。 */
  schema: z.object({
    fields: z.array(z.string().min(1)).min(1),
    shape: z.string().min(1), // 行×列/结构的一句话描述
  }),
  /** ⑥ units（字段→单位映射；无单位字段可空对象）。 */
  units: z.record(z.string(), z.string()),
  /** ⑦ license（SPDX 或明确名称）。 */
  license: z.string().min(1),
  /** ⑧ consent/privacy classification。 */
  privacy: z.object({
    category: z.enum(PRIVACY_CATEGORIES),
    /** sensitive/personal 必填：同意/ lawful basis 声明（validateDatasetCard 强制）。 */
    consentBasis: z.string().nullable().default(null),
    notes: z.string().default(''),
  }),
  /** ⑨ known biases。 */
  knownBiases: z.array(z.string().min(1)),
  /** ⑩ missingness。 */
  missingness: z.object({
    notes: z.array(z.string().min(1)),
    /** 已知缺失列（drift 检查对拍实际）。 */
    knownMissingColumns: z.array(z.string().min(1)).default([]),
  }),
  /** ⑪ transformations（进入分析前的变换链）。 */
  transformations: z.array(z.string().min(1)),
  /** ⑫ split policy（train/dev/test 或等价切分规则；不切分显式声明）。 */
  splitPolicy: z.string().min(1),
  /** ⑬ leakage risks。 */
  leakageRisks: z.array(z.string().min(1)),
  /** ⑭ retention/deletion policy。 */
  retention: z.object({
    policy: z.string().min(1),
    deletionProcedure: z.string().min(1),
  }),
});

export type DatasetCard = z.infer<typeof DatasetCardSchema>;

export interface CardViolation {
  readonly code:
    | 'BAD_CHECKSUM_VALUE'
    | 'LICENSE_NOT_ALLOWED'
    | 'SENSITIVE_WITHOUT_CONSENT'
    | 'RETENTION_WITHOUT_DELETION'
    | 'LEAKAGE_RISK_WITHOUT_MITIGATION_NOTE';
  readonly message: string;
}

export interface CardValidationResult {
  readonly ok: boolean;
  readonly violations: readonly CardViolation[];
}

const CHECKSUM_VALUE_RE: Record<(typeof CHECKSUM_ALGORITHMS)[number], RegExp> = {
  sha256: /^[0-9a-f]{64}$/i,
  sha512: /^[0-9a-f]{128}$/i,
  md5: /^[0-9a-f]{32}$/i,
};

/** 语义门（schema 形状之上）：checksum 形状、license 允许、敏感类强制同意、保留强制删除程序。 */
export function validateDatasetCard(
  card: DatasetCard,
  allowedLicenses: readonly string[] = [],
): CardValidationResult {
  const violations: CardViolation[] = [];

  const re = CHECKSUM_VALUE_RE[card.checksum.algorithm];
  if (!re.test(card.checksum.value)) {
    violations.push({
      code: 'BAD_CHECKSUM_VALUE',
      message: `checksum value not ${card.checksum.algorithm}-shaped: '${card.checksum.value.slice(0, 16)}…'`,
    });
  }

  if (allowedLicenses.length > 0 && !allowedLicenses.includes(card.license)) {
    violations.push({
      code: 'LICENSE_NOT_ALLOWED',
      message: `license '${card.license}' not in allowlist [${allowedLicenses.slice(0, 5).join(', ')}…]`,
    });
  }

  if (
    (card.privacy.category === 'sensitive' || card.privacy.category === 'personal') &&
    (card.privacy.consentBasis ?? '').trim().length === 0
  ) {
    violations.push({
      code: 'SENSITIVE_WITHOUT_CONSENT',
      message: `privacy category '${card.privacy.category}' requires consentBasis ( lawful basis) — no silent sensitive data`,
    });
  }

  if (card.retention.deletionProcedure.trim().length === 0) {
    violations.push({
      code: 'RETENTION_WITHOUT_DELETION',
      message: 'retention policy without deletionProcedure is unenforceable',
    });
  }

  if (card.leakageRisks.length > 0 && card.leakageRisks.every((r) => !/mitigat|缓解|控制/.test(r))) {
    violations.push({
      code: 'LEAKAGE_RISK_WITHOUT_MITIGATION_NOTE',
      message: 'leakage risks declared without any mitigation note — risks must come with handling',
    });
  }

  return { ok: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// 既有卡投影（Exoplanet → 完整卡；缺口字段显式补声明）
// ---------------------------------------------------------------------------

/** 既有 ExoplanetDatasetCard 未覆盖的宪法字段——投影时必须显式提供，不静默默认。 */
export interface ExoplanetCardGaps {
  readonly purpose: string;
  readonly collectionMethod: string;
  readonly privacyCategory: PrivacyCategory;
  readonly consentBasis: string | null;
  readonly transformations: readonly string[];
  readonly splitPolicy: string;
  readonly leakageRisks: readonly string[];
  readonly retentionPolicy: string;
  readonly deletionProcedure: string;
  readonly knownBiases: readonly string[];
}

export function fromExoplanetCard(
  existing: {
    source: string;
    sourceUrl: string;
    version: string;
    persistentId: string;
    license: string;
    rawChecksum: string;
    fields: readonly string[];
    units: Record<string, string>;
    missingNotes: readonly string[];
    qualityNotes: readonly string[];
  },
  gaps: ExoplanetCardGaps,
): DatasetCard {
  return DatasetCardSchema.parse({
    datasetId: `exoplanet:${existing.persistentId}`,
    purpose: gaps.purpose,
    provenance: {
      source: existing.source,
      sourceUrl: existing.sourceUrl,
      persistentId: existing.persistentId,
      collectionMethod: gaps.collectionMethod,
    },
    version: existing.version,
    checksum: { algorithm: 'sha256', value: existing.rawChecksum },
    schema: { fields: [...existing.fields], shape: `${existing.fields.length} columns` },
    units: existing.units,
    license: existing.license,
    privacy: { category: gaps.privacyCategory, consentBasis: gaps.consentBasis, notes: '' },
    knownBiases: [...gaps.knownBiases, ...existing.qualityNotes],
    missingness: { notes: [...existing.missingNotes], knownMissingColumns: [] },
    transformations: [...gaps.transformations],
    splitPolicy: gaps.splitPolicy,
    leakageRisks: [...gaps.leakageRisks],
    retention: { policy: gaps.retentionPolicy, deletionProcedure: gaps.deletionProcedure },
  });
}

// ---------------------------------------------------------------------------
// 漂移检查（Acceptance: unit/missing/schema drift）
// ---------------------------------------------------------------------------

export interface DriftFinding {
  readonly kind: 'schema-drift' | 'unit-drift' | 'missingness-drift';
  readonly detail: string;
}

/** 声明 schema vs 实际字段（多出/缺失双向）。 */
export function schemaDrift(card: DatasetCard, actualFields: readonly string[]): readonly DriftFinding[] {
  const declared = new Set(card.schema.fields);
  const actual = new Set(actualFields);
  const findings: DriftFinding[] = [];
  for (const f of declared) {
    if (!actual.has(f)) findings.push({ kind: 'schema-drift', detail: `declared field '${f}' absent in actual dataset` });
  }
  for (const f of actual) {
    if (!declared.has(f)) findings.push({ kind: 'schema-drift', detail: `actual field '${f}' not declared on card` });
  }
  return findings;
}

/** 声明 units vs 实际（字段单位变更/未声明单位的新字段）。 */
export function unitDrift(card: DatasetCard, actualUnits: Readonly<Record<string, string>>): readonly DriftFinding[] {
  const findings: DriftFinding[] = [];
  for (const [field, declaredUnit] of Object.entries(card.units)) {
    const actual = actualUnits[field];
    if (actual !== undefined && actual !== declaredUnit) {
      findings.push({ kind: 'unit-drift', detail: `field '${field}' unit changed: '${declaredUnit}' → '${actual}'` });
    }
  }
  for (const field of Object.keys(actualUnits)) {
    if (!(field in card.units) && card.schema.fields.includes(field)) {
      findings.push({ kind: 'unit-drift', detail: `field '${field}' has unit '${actualUnits[field] ?? ''}' but card declares none` });
    }
  }
  return findings;
}

/** 已知缺失列 vs 实际含缺失列——新出现的缺失即漂移（诚实暴露，不是错误是发现）。 */
export function missingnessDrift(card: DatasetCard, actualMissingColumns: readonly string[]): readonly DriftFinding[] {
  const known = new Set(card.missingness.knownMissingColumns);
  return actualMissingColumns
    .filter((c) => !known.has(c))
    .map((c) => ({ kind: 'missingness-drift' as const, detail: `column '${c}' now has missing values but is not declared known-missing on card` }));
}
