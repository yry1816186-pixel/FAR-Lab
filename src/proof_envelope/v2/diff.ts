/**
 * ProofEnvelope V2 Verifier Diff —— 跨 envelope 字段比较，产出 §3.4 全 12 diff codes。
 *
 * 语义：compareEnvelopes(expected, actual) 逐字段比较，找出 actual 相对 expected 的篡改，
 *   每个不一致字段落到一个 DiffReportCode。GV-10 场景：expected=原始 envelope，actual=被篡改 envelope，
 *   diff report 非空 → verifier FAIL（tamperStatus='tampered'）。
 *
 * 13 codes（§3.4 表 12 行 + PROOF_HASH_MISMATCH 顶层）：
 *   PROOF_HASH_MISMATCH / CLAIM_HASH_MISMATCH / FEC_HASH_MISMATCH / PROTOCOL_FREEZE_MISMATCH /
 *   DATASET_HASH_MISMATCH / WORKFLOW_HASH_MISMATCH / RUN_HASH_MISMATCH / MEASUREMENT_HASH_MISMATCH /
 *   STATISTICAL_RESULT_MISMATCH / VERDICT_TRACE_MISMATCH / ANTI_THEATER_FAIL / LEDGER_ROOT_MISMATCH /
 *   UNSUPPORTED_SCHEMA_VERSION
 *
 * 比较策略：
 *   - 标量字段（schemaVersion/fecHash/ledgerRoot/proofHash）：直接 === 比较。
 *   - 复杂字段（claim/protocolFreeze/datasetBindings/.../verdictTrace/antiTheaterReport）：
 *     canonicalJson 比较（处理嵌套对象 + 数组顺序）。
 *   - claim 比较用 normalizeClaim（与 proofHash 一致·避免空白差异误报）。
 *
 * 零容忍合规：无 any / @ts-ignore / 空 catch。纯函数。
 */

import { canonicalJson } from '../../evidence_log/hasher.ts';
import { normalizeClaim } from './proof_hash.ts';
import type { DiffReportEntry, ProofEnvelopeV2 } from './types.ts';

/** 截断长字符串用于 diff detail（避免巨型 JSON 进 detail）。 */
function truncate(value: string, maxLen = 64): string {
  return value.length <= maxLen ? value : `${value.slice(0, maxLen)}…(len=${value.length})`;
}

/** canonical 比较两个任意值（嵌套对象/数组顺序无关·key 排序无关）。 */
function canonicalEqual(a: unknown, b: unknown): boolean {
  return canonicalJson(a, 'diff.canonicalEqual') === canonicalJson(b, 'diff.canonicalEqual');
}

/**
 * compareEnvelopes —— 比较 expected vs actual envelope，返回 diff entries（空=一致）。
 *
 * @param expected 原始（基准）envelope
 * @param actual 待验证（可能被篡改）envelope
 * @returns DiffReportEntry[]；空数组表示两 envelope verdict-critical 字段全一致。
 */
export function compareEnvelopes(expected: ProofEnvelopeV2, actual: ProofEnvelopeV2): DiffReportEntry[] {
  const entries: DiffReportEntry[] = [];

  // schemaVersion（§3.4 schema 层）
  if (expected.schemaVersion !== actual.schemaVersion) {
    entries.push({
      code: 'UNSUPPORTED_SCHEMA_VERSION',
      field: 'schemaVersion',
      expected: expected.schemaVersion,
      actual: actual.schemaVersion,
      detail: `schemaVersion mismatch: expected ${expected.schemaVersion}, got ${actual.schemaVersion}`,
    });
  }

  // claim（§3.4 claim 层·normalizeClaim 后 canonical 比较）
  if (!canonicalEqual(normalizeClaim(expected.claim), normalizeClaim(actual.claim))) {
    entries.push({
      code: 'CLAIM_HASH_MISMATCH',
      field: 'claim',
      expected: truncate(expected.claim.id),
      actual: truncate(actual.claim.id),
      detail: 'claim (normalized) differs between expected and actual',
    });
  }

  // fecHash（§3.4 FEC 层）
  if (expected.fecHash !== actual.fecHash) {
    entries.push({
      code: 'FEC_HASH_MISMATCH',
      field: 'fecHash',
      expected: truncate(expected.fecHash),
      actual: truncate(actual.fecHash),
      detail: 'fecHash differs (FEC snapshot tampered or replaced)',
    });
  }

  // protocolFreeze（§3.4 protocol 层）
  if (!canonicalEqual(expected.protocolFreeze, actual.protocolFreeze)) {
    entries.push({
      code: 'PROTOCOL_FREEZE_MISMATCH',
      field: 'protocolFreeze',
      expected: truncate(expected.protocolFreeze.frozenBy),
      actual: truncate(actual.protocolFreeze.frozenBy),
      detail: 'protocolFreeze (actor/timestamp/envPolicy/deviationPolicy) differs',
    });
  }

  // datasetBindings（§3.4 dataset 层）
  if (!canonicalEqual(expected.datasetBindings, actual.datasetBindings)) {
    entries.push({
      code: 'DATASET_HASH_MISMATCH',
      field: 'datasetBindings',
      expected: `count=${expected.datasetBindings.length}`,
      actual: `count=${actual.datasetBindings.length}`,
      detail: 'datasetBindings (contentHash/schemaHash/statsFingerprint/scopeCoverage) differ',
    });
  }

  // workflowBindings（§3.4 workflow 层）
  if (!canonicalEqual(expected.workflowBindings, actual.workflowBindings)) {
    entries.push({
      code: 'WORKFLOW_HASH_MISMATCH',
      field: 'workflowBindings',
      expected: `count=${expected.workflowBindings.length}`,
      actual: `count=${actual.workflowBindings.length}`,
      detail: 'workflowBindings (workflowHash/containerDigest/envHash/seedPolicy) differ',
    });
  }

  // experimentRuns（§3.4 run 层）
  if (!canonicalEqual(expected.experimentRuns, actual.experimentRuns)) {
    entries.push({
      code: 'RUN_HASH_MISMATCH',
      field: 'experimentRuns',
      expected: `count=${expected.experimentRuns.length}`,
      actual: `count=${actual.experimentRuns.length}`,
      detail: 'experimentRuns (inputHashes/outputHashes/logHashes/exitCode) differ',
    });
  }

  // measurementResults（§3.4 measurement 层）
  if (!canonicalEqual(expected.measurementResults, actual.measurementResults)) {
    entries.push({
      code: 'MEASUREMENT_HASH_MISMATCH',
      field: 'measurementResults',
      expected: `count=${expected.measurementResults.length}`,
      actual: `count=${actual.measurementResults.length}`,
      detail: 'measurementResults (metricValue/rawArtifactHashes/stdout/stderr) differ',
    });
  }

  // statisticalResults（§3.4 statistics 层）
  if (!canonicalEqual(expected.statisticalResults, actual.statisticalResults)) {
    entries.push({
      code: 'STATISTICAL_RESULT_MISMATCH',
      field: 'statisticalResults',
      expected: `count=${expected.statisticalResults.length}`,
      actual: `count=${actual.statisticalResults.length}`,
      detail: 'statisticalResults (effectSize/pValue/CI/power) differ',
    });
  }

  // verdictTrace（§3.4 verdict 层）
  if (!canonicalEqual(expected.verdictTrace, actual.verdictTrace)) {
    entries.push({
      code: 'VERDICT_TRACE_MISMATCH',
      field: 'verdictTrace',
      expected: truncate(expected.verdictTrace.verdict),
      actual: truncate(actual.verdictTrace.verdict),
      detail: 'verdictTrace (verdict/reasonCodes/ruleTrace/decisiveRuleId) differs',
    });
  }

  // antiTheaterReport（§3.4 anti-theater 层·D1 统一后字段 hasFail/failCount/warnCount/llmOverrideRejected）
  if (!canonicalEqual(expected.antiTheaterReport, actual.antiTheaterReport)) {
    entries.push({
      code: 'ANTI_THEATER_FAIL',
      field: 'antiTheaterReport',
      expected: truncate(`hasFail=${expected.antiTheaterReport.hasFail},failCount=${expected.antiTheaterReport.failCount}`),
      actual: truncate(`hasFail=${actual.antiTheaterReport.hasFail},failCount=${actual.antiTheaterReport.failCount}`),
      detail: 'antiTheaterReport (findings/hasFail/failCount/warnCount/llmOverrideRejected) differs',
    });
  }

  // ledgerRoot（§3.4 ledger 层）
  if (expected.ledgerRoot !== actual.ledgerRoot) {
    entries.push({
      code: 'LEDGER_ROOT_MISMATCH',
      field: 'ledgerRoot',
      expected: truncate(expected.ledgerRoot),
      actual: truncate(actual.ledgerRoot),
      detail: 'ledgerRoot differs (chain head / Merkle root tampered)',
    });
  }

  // proofHash（§8 顶层·GV-10）
  if (expected.proofHash !== actual.proofHash) {
    entries.push({
      code: 'PROOF_HASH_MISMATCH',
      field: 'proofHash',
      expected: truncate(expected.proofHash),
      actual: truncate(actual.proofHash),
      detail: 'proofHash differs (top-level envelope tampered)',
    });
  }

  return entries;
}

/**
 * hasTamper —— diff report 是否非空（verifier tamperStatus='tampered' 判定）。
 */
export function hasTamper(entries: readonly DiffReportEntry[]): boolean {
  return entries.length > 0;
}
