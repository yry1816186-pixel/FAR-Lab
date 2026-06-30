import type Database from 'better-sqlite3';
import { ulid } from 'ulid';
import {
  PAYLOAD_KINDS,
  PURPOSE_TAGS,
} from '../schema/enums.ts';
import {
  canonicalHash,
  canonicalJson,
} from './hasher.ts';
import {
  GENESIS_PREV_HASH,
} from './types.ts';
import type {
  AppendRecordInput,
  AppendRecordOptions,
  AppendEvidenceLogArgs,
  ProviderNeutralCredential,
  CallAuditData,
  CallRecordHashRow,
  CallRecordRow,
  CanonicalInput,
  ChainHead,
  EvidenceLogEntry,
  EvidenceLogRow,
  HashedRecord,
  PayloadKind,
  PurposeTag,
  SourceAnchor,
} from './types.ts';

interface ChainHeadRow {
  readonly seq: number;
  readonly current_hash: string;
}

interface InsertResult {
  readonly lastInsertRowid: number | bigint;
}

export function rowToCallRecord(row: CallRecordHashRow): CanonicalInput {
  const payloadKind = parsePayloadKind(row.payload_kind, row.seq);
  const purposeTag = parsePurposeTag(row.purpose_tag, row.seq);
  const cred: ProviderNeutralCredential = {
    modelId: row.model_id,
    dashscopeRequestId: row.dashscope_request_id,
    reproHash: row.repro_hash,
    gitCommitSha: row.git_commit_sha,
    isoTimestamp: row.iso_timestamp,
  };

  return {
    stageId: row.stage_id,
    cred,
    payloadKind,
    purposeTag,
    prevHash: row.prev_hash,
    seq: row.seq,
    currentHash: row.current_hash,
  };
}

export function getChainHead(db: Database.Database): ChainHead | undefined {
  const row = db
    .prepare(
      `SELECT seq, current_hash
       FROM call_records
       ORDER BY seq DESC
       LIMIT 1`,
    )
    .get() as ChainHeadRow | undefined;

  if (row === undefined) {
    return undefined;
  }

  return {
    seq: row.seq,
    currentHash: row.current_hash,
  };
}

export function appendRecord(
  db: Database.Database,
  input: AppendRecordInput,
  audit: CallAuditData,
  options: AppendRecordOptions,
): HashedRecord {
  const append = db.transaction((): HashedRecord => {
    assertAuditData(audit);
    assertCompetitionProfile(input, options);

    const head = getChainHead(db);
    const derivedPrevHash = head?.currentHash ?? GENESIS_PREV_HASH;
    const prevHash = input.prevHash ?? derivedPrevHash;
    if (prevHash !== derivedPrevHash) {
      throw new Error(
        `evidence_log.appendRecord: prevHash mismatch, expected chain head ${derivedPrevHash} but received ${prevHash}`,
      );
    }

    const canonicalInput: CanonicalInput = {
      stageId: input.stageId,
      cred: input.cred,
      payloadKind: input.payloadKind,
      purposeTag: input.purposeTag,
      prevHash,
    };
    const currentHash = canonicalHash(canonicalInput);

    const info = db
      .prepare(
        `INSERT INTO call_records (
          stage_id, payload_kind, purpose_tag, model_id, dashscope_request_id,
          repro_hash, git_commit_sha, iso_timestamp, request_payload,
          response_payload, response_payload_hash, degraded_from, finish_reason,
          usage_tokens_total, prev_hash, current_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.stageId,
        input.payloadKind,
        input.purposeTag,
        input.cred.modelId,
        input.cred.dashscopeRequestId,
        input.cred.reproHash,
        input.cred.gitCommitSha,
        input.cred.isoTimestamp,
        audit.requestPayload,
        audit.responsePayload,
        audit.responsePayloadHash ?? null,
        audit.degradedFrom ?? null,
        audit.finishReason,
        audit.usageTokensTotal,
        prevHash,
        currentHash,
      ) as InsertResult;

    const seq = Number(info.lastInsertRowid);
    const row = getCallRecordBySeq(db, seq);
    return {
      seq,
      currentHash,
      prevHash,
      row,
    };
  });

  return append();
}

export function getCallRecordBySeq(db: Database.Database, seq: number): CallRecordRow {
  const row = db
    .prepare(
      `SELECT seq, stage_id, payload_kind, purpose_tag, model_id,
              dashscope_request_id, repro_hash, git_commit_sha, iso_timestamp,
              request_payload, response_payload, response_payload_hash, degraded_from,
              finish_reason, usage_tokens_total, prev_hash, current_hash,
              created_at
       FROM call_records
       WHERE seq = ?`,
    )
    .get(seq) as CallRecordRow | undefined;

  if (row === undefined) {
    throw new Error(`evidence_log.getCallRecordBySeq: seq ${seq} was not found after insert`);
  }

  return row;
}

export function appendEvidenceLog(
  db: Database.Database,
  args: AppendEvidenceLogArgs,
): EvidenceLogEntry {
  const append = db.transaction((): EvidenceLogEntry => {
    const callRecord = getCallRecordBySeq(db, args.callRecordSeq);
    const payloadKind = parsePayloadKind(callRecord.payload_kind, callRecord.seq);
    const evidenceId = args.evidenceId ?? ulid();
    const evidencePayload = canonicalJson(args.evidencePayload, 'appendEvidenceLog.evidencePayload');
    const sourceAnchor = canonicalJson(args.sourceAnchor, 'appendEvidenceLog.sourceAnchor');
    const sourceAnchorPath = args.sourceAnchor.codeLocation?.filePath ?? null;
    const sourceAnchorLine = args.sourceAnchor.codeLocation?.lineNumber ?? null;

    db.prepare(
      `INSERT INTO evidence_log (
        evidence_id, call_record_seq, stage_id, payload_kind, evidence_payload,
        source_anchor, source_anchor_git, source_anchor_req, source_anchor_ts,
        source_anchor_path, source_anchor_lineno
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      evidenceId,
      args.callRecordSeq,
      callRecord.stage_id,
      payloadKind,
      evidencePayload,
      sourceAnchor,
      args.sourceAnchor.gitCommitSha,
      args.sourceAnchor.dashscopeRequestId,
      args.sourceAnchor.isoTimestamp,
      sourceAnchorPath,
      sourceAnchorLine,
    );

    return getEvidenceLogEntry(db, evidenceId);
  });

  return append();
}

export function getEvidenceLogEntry(db: Database.Database, evidenceId: string): EvidenceLogEntry {
  const row = db
    .prepare(
      `SELECT evidence_id, call_record_seq, stage_id, payload_kind, evidence_payload,
              source_anchor, source_anchor_git, source_anchor_req, source_anchor_ts,
              source_anchor_path, source_anchor_lineno, created_at
       FROM evidence_log
       WHERE evidence_id = ?`,
    )
    .get(evidenceId) as EvidenceLogRow | undefined;

  if (row === undefined) {
    throw new Error(`evidence_log.getEvidenceLogEntry: evidence_id ${evidenceId} was not found`);
  }

  return rowToEvidenceLogEntry(row);
}

export function rowToEvidenceLogEntry(row: EvidenceLogRow): EvidenceLogEntry {
  return {
    evidenceId: row.evidence_id,
    callRecordSeq: row.call_record_seq,
    stageId: row.stage_id,
    payloadKind: parsePayloadKind(row.payload_kind, row.call_record_seq),
    evidencePayload: row.evidence_payload,
    sourceAnchor: parseSourceAnchorJson(row.source_anchor, row.evidence_id),
    createdAt: row.created_at,
  };
}

function assertAuditData(audit: CallAuditData): void {
  if (audit.requestPayload.length === 0) {
    throw new Error('evidence_log.appendRecord: requestPayload must be non-empty');
  }
  if (audit.responsePayload.length === 0) {
    throw new Error('evidence_log.appendRecord: responsePayload must be non-empty');
  }
  if (audit.finishReason.length === 0) {
    throw new Error('evidence_log.appendRecord: finishReason must be non-empty');
  }
  if (
    audit.usageTokensTotal !== null &&
    (!Number.isInteger(audit.usageTokensTotal) || audit.usageTokensTotal < 0)
  ) {
    throw new Error('evidence_log.appendRecord: usageTokensTotal must be a non-negative integer or null');
  }
}

function assertCompetitionProfile(input: AppendRecordInput, options: AppendRecordOptions): void {
  if (options.providerProfile !== 'competition_aliyun_qwen') {
    return;
  }
  if (options.competitionModelSnapshot === undefined || options.competitionModelSnapshot.length === 0) {
    throw new Error(
      'evidence_log.appendRecord: competition_aliyun_qwen requires an explicit competitionModelSnapshot',
    );
  }
  if (input.cred.modelId !== options.competitionModelSnapshot) {
    throw new Error(
      `evidence_log.appendRecord: competition model mismatch, expected ${options.competitionModelSnapshot} but received ${input.cred.modelId}`,
    );
  }
}

function parsePayloadKind(value: string, seq: number): PayloadKind {
  if ((PAYLOAD_KINDS as readonly string[]).includes(value)) {
    return value as PayloadKind;
  }
  throw new Error(`evidence_log.rowToCallRecord: invalid payload_kind "${value}" at seq=${seq}`);
}

function parsePurposeTag(value: string, seq: number): PurposeTag {
  if ((PURPOSE_TAGS as readonly string[]).includes(value)) {
    return value as PurposeTag;
  }
  throw new Error(`evidence_log.rowToCallRecord: invalid purpose_tag "${value}" at seq=${seq}`);
}

function parseSourceAnchorJson(text: string, evidenceId: string): SourceAnchor {
  const parsed = JSON.parse(text) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`evidence_log.rowToEvidenceLogEntry: source_anchor is not an object for ${evidenceId}`);
  }
  const record = parsed as Record<string, unknown>;
  const gitCommitSha = record.gitCommitSha;
  const dashscopeRequestId = record.dashscopeRequestId;
  const isoTimestamp = record.isoTimestamp;
  const rawResponseHash = record.rawResponseHash;
  const codeLocation = parseCodeLocation(record.codeLocation, evidenceId);
  if (typeof gitCommitSha !== 'string') {
    throw new Error(`evidence_log.rowToEvidenceLogEntry: gitCommitSha missing for ${evidenceId}`);
  }
  if (!(dashscopeRequestId === null || typeof dashscopeRequestId === 'string')) {
    throw new Error(`evidence_log.rowToEvidenceLogEntry: dashscopeRequestId invalid for ${evidenceId}`);
  }
  if (typeof isoTimestamp !== 'string') {
    throw new Error(`evidence_log.rowToEvidenceLogEntry: isoTimestamp missing for ${evidenceId}`);
  }
  if (typeof rawResponseHash !== 'string') {
    throw new Error(`evidence_log.rowToEvidenceLogEntry: rawResponseHash missing for ${evidenceId}`);
  }

  return {
    gitCommitSha,
    dashscopeRequestId,
    isoTimestamp,
    rawResponseHash,
    ...(codeLocation === undefined ? {} : { codeLocation }),
  };
}

function parseCodeLocation(value: unknown, evidenceId: string): SourceAnchor['codeLocation'] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`evidence_log.rowToEvidenceLogEntry: codeLocation invalid for ${evidenceId}`);
  }
  const record = value as Record<string, unknown>;
  const filePath = record.filePath;
  const location = record.location;
  const lineNumber = record.lineNumber;
  if (typeof filePath !== 'string') {
    throw new Error(`evidence_log.rowToEvidenceLogEntry: codeLocation.filePath missing for ${evidenceId}`);
  }
  if (typeof location !== 'string') {
    throw new Error(`evidence_log.rowToEvidenceLogEntry: codeLocation.location missing for ${evidenceId}`);
  }
  if (!(lineNumber === undefined || (typeof lineNumber === 'number' && Number.isFinite(lineNumber)))) {
    throw new Error(`evidence_log.rowToEvidenceLogEntry: codeLocation.lineNumber invalid for ${evidenceId}`);
  }
  return {
    filePath,
    location,
    ...(lineNumber === undefined ? {} : { lineNumber }),
  };
}
