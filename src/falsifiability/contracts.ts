/**
 * Falsifiability Contracts: pre-registration of falsifiable claims (FEC V1-must).
 *
 * Migration: 0005_falsifiability_contracts (SSOT 0018 → renumbered 0005).
 *
 * 关键:
 *   - preregistrationHash 执行前锁定 (F8 反 p-hacking)
 *   - alpha=0.0125 / seed=42 / bonferroni 预登记
 *   - compiledBy = 'deterministic_compiler' (禁 LLM, F3)
 *   - measurable_implication NOT NULL (F7 FEC 三件套)
 *
 * 模型中立（本文件 contracts.ts）: 不含 qwen/dashscope/bailian 字面量.
 * 注意: 同模块 external_facts.ts 含 `competition_aliyun_qwen` profile 钩子（厂商约束分发，
 *       非 FEC 算法依赖）；Core 算法（preregistrationHash / canonicalJson）模型中立。
 * 零容忍合规.
 */

import { ulid } from 'ulid';
import { hashCanonicalJson } from '../evidence_log/hasher.ts';
import type Database from 'better-sqlite3';

export type ComparatorKind = 'gt' | 'lt' | 'eq' | 'range';

export interface FalsifiabilityContract {
  readonly contractId: string;
  readonly claimId: string;
  readonly preregistrationHash: string;
  readonly measurableImplication: string;
  readonly metric: string;
  readonly comparator: ComparatorKind;
  readonly thresholdValue: number;
  readonly alpha: number;
  readonly seed: number;
  readonly bonferroniApplied: boolean;
  readonly population: string;
  readonly effectSizeExpected: number | null;
  readonly powerAnalysisN: number | null;
  readonly compiledBy: 'deterministic_compiler';
  readonly compiledAt: string;
  readonly locked: boolean;
  readonly createdAt: string;
}

export interface RegisterContractInput {
  readonly claimId: string;
  readonly measurableImplication: string;
  readonly metric: string;
  readonly comparator: ComparatorKind;
  readonly thresholdValue: number;
  readonly alpha?: number;
  readonly seed?: number;
  readonly bonferroniApplied?: boolean;
  readonly population?: string;
  readonly effectSizeExpected?: number;
  readonly powerAnalysisN?: number;
  readonly compiledAt: string;
}

/**
 * 预注册一个可证伪契约。产 preregistrationHash (sha256 of canonical JSON of input).
 */
export function registerContract(
  db: Database.Database,
  input: RegisterContractInput,
): FalsifiabilityContract {
  if (input.measurableImplication.trim().length === 0) {
    throw new Error('registerContract: measurableImplication must be non-empty');
  }

  const contractId = ulid();
  const alpha = input.alpha ?? 0.0125;
  const seed = input.seed ?? 42;
  const bonferroniApplied = input.bonferroniApplied ?? true;
  const population = input.population ?? 'unknown';

  // 预注册哈希 = sha256(canonical JSON of 所有不可变输入)。
  // hashCanonicalJson：fast-json-stable-stringify 排序 key + 拒 NaN/Infinity + 拒 undefined，
  // 与 evidence_log canonicalHash 同一确定性契约——F8 反 p-hacking 锁须可由独立方重算验证。
  const preregistrationHash = hashCanonicalJson({
    contractId,
    claimId: input.claimId,
    measurableImplication: input.measurableImplication,
    metric: input.metric,
    comparator: input.comparator,
    thresholdValue: input.thresholdValue,
    alpha,
    seed,
    bonferroniApplied,
    population,
    compiledBy: 'deterministic_compiler',
    compiledAt: input.compiledAt,
  });

  db.prepare(
    `INSERT INTO falsifiability_contracts (
      contract_id, claim_id, preregistration_hash, measurable_implication,
      metric, comparator, threshold_value, alpha, seed,
      bonferroni_applied, population, effect_size_expected,
      power_analysis_n, compiled_by, compiled_at, locked
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
  ).run(
    contractId,
    input.claimId,
    preregistrationHash,
    input.measurableImplication,
    input.metric,
    input.comparator,
    input.thresholdValue,
    alpha,
    seed,
    bonferroniApplied ? 1 : 0,
    population,
    input.effectSizeExpected ?? null,
    input.powerAnalysisN ?? null,
    'deterministic_compiler',
    input.compiledAt,
  );

  return {
    contractId,
    claimId: input.claimId,
    preregistrationHash,
    measurableImplication: input.measurableImplication,
    metric: input.metric,
    comparator: input.comparator,
    thresholdValue: input.thresholdValue,
    alpha,
    seed,
    bonferroniApplied,
    population,
    effectSizeExpected: input.effectSizeExpected ?? null,
    powerAnalysisN: input.powerAnalysisN ?? null,
    compiledBy: 'deterministic_compiler',
    compiledAt: input.compiledAt,
    locked: true,
    createdAt: new Date().toISOString(),
  };
}

/**
 * 按 claimId 查找预注册契约
 */
export function getContractsByClaim(
  db: Database.Database,
  claimId: string,
): FalsifiabilityContract[] {
  const rows = db
    .prepare(
      `SELECT * FROM falsifiability_contracts
       WHERE claim_id = ?
       ORDER BY created_at ASC`,
    )
    .all(claimId) as Array<Record<string, unknown>>;

  return rows.map(rowToContract);
}

function rowToContract(row: Record<string, unknown>): FalsifiabilityContract {
  return {
    contractId: String(row.contract_id),
    claimId: String(row.claim_id),
    preregistrationHash: String(row.preregistration_hash),
    measurableImplication: String(row.measurable_implication),
    metric: String(row.metric),
    comparator: String(row.comparator) as ComparatorKind,
    thresholdValue: Number(row.threshold_value),
    alpha: Number(row.alpha),
    seed: Number(row.seed),
    bonferroniApplied: Number(row.bonferroni_applied) === 1,
    population: String(row.population),
    effectSizeExpected: row.effect_size_expected !== null ? Number(row.effect_size_expected) : null,
    powerAnalysisN: row.power_analysis_n !== null ? Number(row.power_analysis_n) : null,
    compiledBy: 'deterministic_compiler',
    compiledAt: String(row.compiled_at),
    locked: Number(row.locked) === 1,
    createdAt: String(row.created_at),
  };
}
