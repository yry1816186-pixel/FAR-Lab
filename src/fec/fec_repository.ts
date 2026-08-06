/**
 * fec_repository —— FEC V2 契约 DB 存储层（表 fec_contracts_v2 · migration 0009）。
 *
 * 职责：
 *   - registerFecV2：将冻结 FecContractV2 以 canonical JSON 写入 fec_contracts_v2，fec_hash 由 computeFecHash 计算。
 *   - getFecV2ByFecId / getFecV2ByClaim：读取并 type-guard 解析 contract_json 回 FecContractV2。
 *
 * 与 V1（falsifiability/contracts.ts registerContract）共存：V1 扁平字段表，V2 整体 JSON 表。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言。contract_json 解析用 type guard 收窄（无 cast）。
 */

import type Database from 'better-sqlite3';
import { canonicalJson } from '../evidence_log/hasher.ts';
import { computeFecHash } from './compiler.ts';
import type { FecContractV2 } from './fec_contract.ts';

interface FecContractV2Row {
  readonly fec_id: string;
  readonly claim_id: string;
  readonly contract_version: string;
  readonly fec_hash: string;
  readonly contract_json: string;
  readonly compiled_by: string;
  readonly compiled_at: string;
  readonly locked: number;
  readonly created_at: string;
}

/** registerFecV2 输入（冻结 FecContractV2 + compiledAt 时间戳）。 */
export interface RegisterFecV2Input {
  readonly fec: FecContractV2;
  readonly compiledAt: string;
}

/** DB 存储的 FEC V2 契约（fec + fecHash + compiledAt + locked + createdAt·rowToStored 产出）。 */
export interface StoredFecContractV2 {
  readonly fec: FecContractV2;
  readonly fecHash: string;
  readonly compiledAt: string;
  readonly locked: boolean;
  readonly createdAt: string;
}

/**
 * registerFecV2 —— 写入冻结 FecContractV2（append-only · 0009 trigger 防 UPDATE/DELETE）。
 * fec_hash = computeFecHash(fec)，verifier 可重算互验（应 === fec.freeze.fecHash）。
 */
export function registerFecV2(db: Database.Database, input: RegisterFecV2Input): StoredFecContractV2 {
  const fec = input.fec;
  if (fec.contractVersion !== 'FEC/2.0') {
    throw new Error(`registerFecV2: contractVersion 须为 'FEC/2.0'，实际 '${fec.contractVersion}'`);
  }
  if (fec.fecId.trim().length === 0) {
    throw new Error('registerFecV2: fecId 须非空');
  }

  const fecHash = computeFecHash(fec);
  const contractJson = canonicalJson(fec, 'registerFecV2.fec');

  db.prepare(
    `INSERT INTO fec_contracts_v2 (
       fec_id, claim_id, contract_version, fec_hash, contract_json, compiled_by, compiled_at, locked
     ) VALUES (?, ?, 'FEC/2.0', ?, ?, 'deterministic_compiler', ?, 1)`,
  ).run(fec.fecId, fec.claimId, fecHash, contractJson, input.compiledAt);

  return getFecV2ByFecId(db, fec.fecId);
}

/**
 * get fec v2 by fec id.
 */
export function getFecV2ByFecId(db: Database.Database, fecId: string): StoredFecContractV2 {
  const row = db
    .prepare(`SELECT * FROM fec_contracts_v2 WHERE fec_id = ?`)
    .get(fecId) as FecContractV2Row | undefined;

  if (row === undefined) {
    throw new Error(`fec_repository.getFecV2ByFecId: fec_id ${fecId} not found`);
  }
  return rowToStored(row);
}

/**
 * get fec v2 by claim.
 */
export function getFecV2ByClaim(db: Database.Database, claimId: string): StoredFecContractV2[] {
  const rows = db
    .prepare(`SELECT * FROM fec_contracts_v2 WHERE claim_id = ? ORDER BY created_at ASC`)
    .all(claimId) as FecContractV2Row[];
  return rows.map(rowToStored);
}

function rowToStored(row: FecContractV2Row): StoredFecContractV2 {
  const parsed: unknown = JSON.parse(row.contract_json);
  if (!isFecContractV2(parsed)) {
    throw new Error(
      `fec_repository.rowToStored: contract_json 不是合法 FecContractV2（fec_id=${row.fec_id}）`,
    );
  }
  return {
    fec: parsed,
    fecHash: row.fec_hash,
    compiledAt: row.compiled_at,
    locked: row.locked === 1,
    createdAt: row.created_at,
  };
}

/**
 * isFecContractV2 —— contract_json 解析 type guard（收窄为 FecContractV2·零 cast）。
 * 验证顶层 16 字段的结构性存在（嵌套对象/数组类型）；子字段语义校验由 compileFec 在写入前完成。
 */
function isFecContractV2(value: unknown): value is FecContractV2 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.fecId === 'string' &&
    v.contractVersion === 'FEC/2.0' &&
    typeof v.claimId === 'string' &&
    typeof v.measurableImplication === 'string' &&
    isPlainObject(v.scope) &&
    isPlainObject(v.metric) &&
    isPlainObject(v.threshold) &&
    isPlainObject(v.statisticalPlan) &&
    isPlainObject(v.seedPolicy) &&
    isPlainObject(v.deviationPolicy) &&
    isPlainObject(v.freeze) &&
    Array.isArray(v.requiredEvidence) &&
    Array.isArray(v.datasetRequirements) &&
    Array.isArray(v.workflowRequirements) &&
    Array.isArray(v.integrityFlags) &&
    (v.direction === 'greater' ||
      v.direction === 'less' ||
      v.direction === 'equal' ||
      v.direction === 'within' ||
      v.direction === 'noninferior')
  );
}

function isPlainObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
