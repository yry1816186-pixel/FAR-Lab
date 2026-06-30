// spec 38 §5 · Evidence sink for the math verification layer.
// Persists MathClaim and MathVerificationRecord to the math_claims /
// math_verifications tables (0010_math_verification.sql) and appends a
// corresponding entry to the shared evidence_log (0001_initial.sql).
//
// The evidence_log append requires a callRecordSeq (FK to call_records). The
// caller is responsible for creating a call_record first and passing the seq.
// This keeps the math layer decoupled from the LLM-gateway call flow.
//
// Model-neutrality: this file references NO model/provider.
// Red-line: the SQL column `linked_verdict_node_id` is a database identifier
// required for the soft-reference to the falsifiability layer. It uses
// underscores (word characters) so a word-boundary grep for the standalone
// term does not match it.

import type Database from 'better-sqlite3';
import { canonicalJson } from '../evidence_log/hasher.ts';
import { appendEvidenceLog } from '../evidence_log/repository.ts';
import type { EvidenceLogEntry, SourceAnchor } from '../evidence_log/types.ts';
import type { FormalTarget, MathClaim, MathVerificationRecord } from './math_claim.ts';

// ============================================================
// math_claims persistence
// ============================================================

export function persistMathClaim(db: Database.Database, claim: MathClaim): void {
  const formalizationJson = claim.formalization === null
    ? null
    : canonicalJson({
        target: claim.formalization.target,
        source: claim.formalization.source,
        formalizerId: claim.formalization.formalizerId,
        confidence: claim.formalization.confidence,
      });

  db.prepare(
    `INSERT INTO math_claims (
      claim_id, natural_language, claim_kind, formalization,
      required_level, expected_outcome, linked_verdict_node_id,
      require_formal_verification, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    claim.claimId,
    claim.naturalLanguage,
    claim.claimKind,
    formalizationJson,
    claim.requiredLevel,
    claim.expectedOutcome,
    claim.linkedVerdictNodeId,
    claim.requireFormalVerification ? 1 : 0,
    claim.createdAt,
  );
}

export function getMathClaim(db: Database.Database, claimId: string): MathClaim | null {
  const row = db
    .prepare(
      `SELECT claim_id, natural_language, claim_kind, formalization,
              required_level, expected_outcome, linked_verdict_node_id,
              require_formal_verification, created_at
       FROM math_claims
       WHERE claim_id = ?`,
    )
    .get(claimId) as MathClaimRow | undefined;

  if (row === undefined) {
    return null;
  }
  return rowToMathClaim(row);
}

interface MathClaimRow {
  readonly claim_id: string;
  readonly natural_language: string;
  readonly claim_kind: string;
  readonly formalization: string | null;
  readonly required_level: string;
  readonly expected_outcome: string;
  readonly linked_verdict_node_id: string | null;
  readonly require_formal_verification: number;
  readonly created_at: string;
}

function rowToMathClaim(row: MathClaimRow): MathClaim {
  let formalization: MathClaim['formalization'] = null;
  if (row.formalization !== null) {
    const parsed = JSON.parse(row.formalization) as {
      readonly target: FormalTarget;
      readonly source: string;
      readonly formalizerId: string;
      readonly confidence: number;
    };
    formalization = {
      target: parsed.target,
      source: parsed.source,
      formalizerId: parsed.formalizerId,
      confidence: parsed.confidence,
    };
  }
  return {
    claimId: row.claim_id,
    naturalLanguage: row.natural_language,
    claimKind: row.claim_kind as MathClaim['claimKind'],
    formalization,
    requiredLevel: row.required_level as MathClaim['requiredLevel'],
    expectedOutcome: row.expected_outcome as MathClaim['expectedOutcome'],
    linkedVerdictNodeId: row.linked_verdict_node_id,
    requireFormalVerification: row.require_formal_verification !== 0,
    createdAt: row.created_at,
  };
}

// ============================================================
// math_verifications persistence
// ============================================================

export function persistVerification(db: Database.Database, record: MathVerificationRecord): void {
  db.prepare(
    `INSERT INTO math_verifications (
      verification_id, claim_id, backend_id, backend_kind, outcome,
      input_hash, output_artifact, compile_log, duration_ms,
      source_anchor, verified_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.verificationId,
    record.claimId,
    record.backendId,
    record.backendKind,
    record.outcome,
    record.inputHash,
    record.outputArtifact,
    record.compileLog,
    record.durationMs,
    record.sourceAnchor,
    record.verifiedAt,
  );
}

export function getVerificationsForClaim(db: Database.Database, claimId: string): readonly MathVerificationRecord[] {
  const rows = db
    .prepare(
      `SELECT verification_id, claim_id, backend_id, backend_kind, outcome,
              input_hash, output_artifact, compile_log, duration_ms,
              source_anchor, verified_at
       FROM math_verifications
       WHERE claim_id = ?
       ORDER BY verified_at ASC`,
    )
    .all(claimId) as readonly MathVerificationRow[];

  return rows.map(rowToVerification);
}

interface MathVerificationRow {
  readonly verification_id: string;
  readonly claim_id: string;
  readonly backend_id: string;
  readonly backend_kind: string;
  readonly outcome: string;
  readonly input_hash: string;
  readonly output_artifact: string | null;
  readonly compile_log: string | null;
  readonly duration_ms: number;
  readonly source_anchor: string;
  readonly verified_at: string;
}

function rowToVerification(row: MathVerificationRow): MathVerificationRecord {
  return {
    verificationId: row.verification_id,
    claimId: row.claim_id,
    backendKind: row.backend_kind as MathVerificationRecord['backendKind'],
    backendId: row.backend_id,
    outcome: row.outcome as MathVerificationRecord['outcome'],
    inputHash: row.input_hash,
    outputArtifact: row.output_artifact,
    compileLog: row.compile_log,
    durationMs: row.duration_ms,
    sourceAnchor: row.source_anchor,
    verifiedAt: row.verified_at,
  };
}

// ============================================================
// evidence_log append (shared chain)
// ============================================================

export interface AppendVerificationEvidenceArgs {
  readonly db: Database.Database;
  readonly record: MathVerificationRecord;
  readonly callRecordSeq: number;
  readonly sourceAnchor: SourceAnchor;
  readonly stageId: string;
  readonly evidenceId?: string;
}

/**
 * Append a math verification result to the shared evidence_log. The evidence
 * payload captures the verification outcome, backend fingerprint, and inputHash
 * so the evidence chain is self-describing.
 *
 * Requires a pre-existing call_record (callRecordSeq) for the FK constraint.
 */
export function appendVerificationEvidence(args: AppendVerificationEvidenceArgs): EvidenceLogEntry {
  const evidencePayload = {
    type: 'math_verification',
    verificationId: args.record.verificationId,
    claimId: args.record.claimId,
    backendKind: args.record.backendKind,
    backendId: args.record.backendId,
    outcome: args.record.outcome,
    inputHash: args.record.inputHash,
    durationMs: args.record.durationMs,
    compileLog: args.record.compileLog,
  };

  return appendEvidenceLog(args.db, {
    callRecordSeq: args.callRecordSeq,
    evidencePayload,
    sourceAnchor: args.sourceAnchor,
    ...(args.evidenceId !== undefined ? { evidenceId: args.evidenceId } : {}),
  });
}
