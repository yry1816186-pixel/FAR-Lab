/**
 * V1 .far-proof bundle verifier.
 *
 * Verifies the project-self-verifiable offline bundle format exported by
 * src/far_proof/exporter.ts: required files, redacted call_records hash chain,
 * and V1 ProofEnvelope proofHash recomputation.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalHash } from '../evidence_log/hasher.ts';
import { rowToCallRecord } from '../evidence_log/repository.ts';
import { GENESIS_PREV_HASH, type CallRecordHashRow } from '../evidence_log/types.ts';
import { computeProofHash } from '../proof_envelope/proof_hash.ts';
import { dispatchRulesetVerifier } from '../proof_envelope/ruleset_version.ts';
import type { CheckOutcome, ProofCheckResult, ProofEnvelope } from '../proof_envelope/types.ts';
import type { FalsificationSpec, Verdict } from '../falsifiability/types.ts';

export const FAR_PROOF_REQUIRED_FILES = [
  'ro-crate-metadata.json',
  'prov.ttl',
  'proof_envelopes.jsonl',
  'repro_runs.jsonl',
  'call_records.redacted.jsonl',
  'claim_graph.json',
  'otel-trace.jsonl',
  'data_manifest.json',
  'README_REPLAY.md',
  'code/MANIFEST.md',
] as const;

export type FarProofBundleVerifyMode = 'chain' | 'envelope' | 'full';

interface RawEnvelopeRow {
  readonly envelope_id: string;
  readonly claim_id: string;
  readonly verdict_node_id: string;
  readonly conclusion: string;
  readonly proof_hash: string;
  readonly prev_proof_hash: string;
  readonly checks: string;
  readonly known_failures: string;
  readonly falsification_spec: string;
  readonly source_anchor: string;
  readonly repro_hash: string;
  /** IC-01 · migration 0019:legacy 包无此列/为 NULL → 按 v1 默认派发 */
  readonly ruleset_uri?: string | null;
  readonly sealed_by: string;
  readonly sealed_at: string;
  readonly created_at: string;
}

interface RedactedCallRecordRow extends CallRecordHashRow {
  readonly finish_reason?: string | null;
  readonly usage_tokens_total?: number | null;
}

export interface ProofEnvelopeMismatch {
  readonly envelopeId: string;
  readonly expected: string;
  readonly actual: string;
}

export interface BundleChainResult {
  readonly ok: boolean;
  readonly verifiedCount: number;
  readonly brokenAtSeq: number | null;
  readonly expectedHash: string | null;
  readonly actualHash: string | null;
  readonly chainHead: string | null;
}

export interface BundleVerifyResult {
  readonly ok: boolean;
  readonly bundlePath: string;
  readonly mode: FarProofBundleVerifyMode;
  readonly requiredFilesPresent: boolean;
  readonly missingFiles: readonly string[];
  readonly proofEnvelopeRan: boolean;
  readonly proofEnvelopeOk: boolean;
  readonly proofEnvelopeCount: number;
  readonly proofEnvelopeMismatches: readonly ProofEnvelopeMismatch[];
  readonly chainRan: boolean;
  readonly chain: BundleChainResult;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export function verifyFarProofBundle(
  bundlePath: string,
  mode: FarProofBundleVerifyMode = 'full',
): BundleVerifyResult {
  const requiredFiles = requiredFilesForMode(mode);
  const missingFiles = requiredFiles.filter((file) => !existsSync(join(bundlePath, file)));
  const errors: string[] = missingFiles.map((file) => `MISSING_REQUIRED_FILE: ${file}`);
  const warnings: string[] = [];

  let proofEnvelopeCount = 0;
  let proofEnvelopeRan = false;
  let proofEnvelopeOk = false;
  let proofEnvelopeMismatches: readonly ProofEnvelopeMismatch[] = [];
  if (mode !== 'chain' && !missingFiles.includes('proof_envelopes.jsonl')) {
    proofEnvelopeRan = true;
    try {
      const proofResult = verifyProofEnvelopeJsonl(join(bundlePath, 'proof_envelopes.jsonl'));
      proofEnvelopeCount = proofResult.checked;
      proofEnvelopeMismatches = proofResult.mismatches;
      proofEnvelopeOk = proofEnvelopeMismatches.length === 0;
      for (const mismatch of proofEnvelopeMismatches) {
        errors.push(
          `PROOF_HASH_MISMATCH: ${mismatch.envelopeId} expected=${mismatch.expected.slice(0, 16)} actual=${mismatch.actual.slice(0, 16)}`,
        );
      }
    } catch (error) {
      errors.push(`PROOF_ENVELOPES_UNREADABLE: ${errorMessage(error)}`);
    }
  }

  let chain: BundleChainResult = emptyChainResult();
  let chainRan = false;
  if (mode !== 'envelope' && !missingFiles.includes('call_records.redacted.jsonl')) {
    chainRan = true;
    try {
      chain = verifyRedactedCallRecordsJsonl(join(bundlePath, 'call_records.redacted.jsonl'));
      if (!chain.ok) {
        errors.push(
          `LEDGER_ROOT_MISMATCH: call_records chain broken at seq=${chain.brokenAtSeq ?? '?'} expected=${chain.expectedHash?.slice(0, 16) ?? 'n/a'} actual=${chain.actualHash?.slice(0, 16) ?? 'n/a'}`,
        );
      }
      if (chain.verifiedCount === 0) {
        warnings.push('CHAIN_EMPTY: call_records.redacted.jsonl contains no records');
      }
    } catch (error) {
      errors.push(`CALL_RECORDS_UNREADABLE: ${errorMessage(error)}`);
    }
  }

  warnings.push(
    'Bundle format is V1 minimal self-verifiable export; it is not a third-party RO-Crate/PROV-O certification.',
  );

  return {
    ok: errors.length === 0,
    bundlePath,
    mode,
    requiredFilesPresent: missingFiles.length === 0,
    missingFiles,
    proofEnvelopeRan,
    proofEnvelopeOk,
    proofEnvelopeCount,
    proofEnvelopeMismatches,
    chainRan,
    chain,
    errors,
    warnings,
  };
}

function requiredFilesForMode(mode: FarProofBundleVerifyMode): readonly string[] {
  switch (mode) {
    case 'chain':
      return ['call_records.redacted.jsonl'];
    case 'envelope':
      return ['proof_envelopes.jsonl'];
    case 'full':
      return FAR_PROOF_REQUIRED_FILES;
  }
}

export function verifyProofEnvelopeJsonl(jsonlPath: string): {
  readonly checked: number;
  readonly mismatches: readonly ProofEnvelopeMismatch[];
} {
  const lines = readJsonlLines(jsonlPath);
  if (lines.length === 0) {
    throw new Error(`${jsonlPath} contains no envelope rows`);
  }

  const mismatches: ProofEnvelopeMismatch[] = [];
  for (const line of lines) {
    const row = JSON.parse(line) as RawEnvelopeRow;
    // IC-01 版本派发(ADR-007 H3):无 URI=legacy v1;未知/伪造主版本 fail-closed 抛错(不翻转裁决)。
    // unknown extra field 不进入 rowToEnvelope/proofHash 输入(MINOR 单调兼容,裁决不翻转)。
    dispatchRulesetVerifier(row.ruleset_uri ?? null);
    const envelope = rowToEnvelope(row);
    const { proofHash: _stored, ...fieldsForHash } = envelope;
    void _stored;
    const recomputed = computeProofHash(fieldsForHash);
    if (recomputed !== envelope.proofHash) {
      mismatches.push({
        envelopeId: envelope.envelopeId,
        expected: envelope.proofHash,
        actual: recomputed,
      });
    }
  }
  return { checked: lines.length, mismatches };
}

export function verifyRedactedCallRecordsJsonl(jsonlPath: string): BundleChainResult {
  const lines = readJsonlLines(jsonlPath);
  let expectedPrevHash = GENESIS_PREV_HASH;
  let verifiedCount = 0;
  let chainHead: string | null = null;

  for (const line of lines) {
    const row = JSON.parse(line) as RedactedCallRecordRow;
    if (row.prev_hash !== expectedPrevHash) {
      return {
        ok: false,
        verifiedCount,
        brokenAtSeq: row.seq,
        expectedHash: expectedPrevHash,
        actualHash: row.prev_hash,
        chainHead,
      };
    }

    const recomputedHash = canonicalHash(rowToCallRecord(row));
    if (recomputedHash !== row.current_hash) {
      return {
        ok: false,
        verifiedCount,
        brokenAtSeq: row.seq,
        expectedHash: recomputedHash,
        actualHash: row.current_hash,
        chainHead,
      };
    }

    expectedPrevHash = row.current_hash;
    chainHead = row.current_hash;
    verifiedCount += 1;
  }

  return {
    ok: true,
    verifiedCount,
    brokenAtSeq: null,
    expectedHash: null,
    actualHash: null,
    chainHead,
  };
}

function readJsonlLines(path: string): string[] {
  if (!existsSync(path)) {
    throw new Error(`${path} not found`);
  }
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseJsonArrayChecks(raw: string): ProofCheckResult[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('checks is not a JSON array');
  }
  return parsed.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`checks[${index}] is not an object`);
    }
    const record = entry as Record<string, unknown>;
    const ruleId = String(record.rule_id ?? record.ruleId ?? '');
    const ruleName = String(record.rule_name ?? record.ruleName ?? '');
    const outcome = String(record.outcome) as CheckOutcome;
    const detail = String(record.detail ?? '');
    return { ruleId, ruleName, outcome, detail } as ProofCheckResult;
  });
}

function rowToEnvelope(row: RawEnvelopeRow): ProofEnvelope {
  if (row.sealed_by !== 'deterministic_sealer') {
    throw new Error(`sealed_by must be deterministic_sealer (actual: ${row.sealed_by})`);
  }
  return {
    envelopeId: row.envelope_id,
    claimId: row.claim_id,
    verdictNodeId: row.verdict_node_id,
    conclusion: row.conclusion as Verdict,
    proofHash: row.proof_hash,
    prevProofHash: row.prev_proof_hash,
    checks: parseJsonArrayChecks(row.checks),
    knownFailures: JSON.parse(row.known_failures) as string[],
    falsificationSpec: JSON.parse(row.falsification_spec) as FalsificationSpec,
    sourceAnchor: JSON.parse(row.source_anchor),
    reproHash: row.repro_hash,
    // legacy 行 ruleset_uri 缺席/NULL → 字段缺席(exactOptionalPropertyTypes),按 v1 默认派发
    ...(row.ruleset_uri === null || row.ruleset_uri === undefined
      ? {}
      : { rulesetUri: row.ruleset_uri }),
    sealedBy: row.sealed_by,
    sealedAt: row.sealed_at,
    createdAt: row.created_at,
  };
}

function emptyChainResult(): BundleChainResult {
  return {
    ok: false,
    verifiedCount: 0,
    brokenAtSeq: null,
    expectedHash: null,
    actualHash: null,
    chainHead: null,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
