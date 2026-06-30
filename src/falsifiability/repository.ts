import type Database from 'better-sqlite3';
import { ulid } from 'ulid';
import {
  VERDICTS,
  VERDICT_NODE_KINDS,
} from '../schema/enums.ts';
import {
  GENESIS_PREV_HASH,
} from '../evidence_log/types.ts';
import {
  canonicalJson,
  hashCanonicalJson,
} from '../evidence_log/hasher.ts';
import {
  ConfirmedEvidenceMissingError,
  EmptyScopeSlipError,
  EmptyUntestedReasonError,
  UnknownVerdictError,
} from './errors.ts';
import {
  parseFalsificationSpec,
  parseJsonObject,
  parseReplayProver,
  parseSourceAnchor,
  parseThresholdSpec,
} from './schemas.ts';
import type {
  RecordVerdictArgs,
  Verdict,
  VerdictNode,
  VerdictNodeKind,
} from './types.ts';

export interface VerdictNodeRow {
  readonly verdict_id: string;
  readonly evidence_id: string;
  readonly parent_verdict_id: string | null;
  readonly node_kind: string;
  readonly verdict: string;
  readonly falsification_spec: string;
  readonly threshold_spec: string | null;
  readonly metric_value: number | null;
  readonly conflicting_evidence_count: number;
  readonly scope_slip_text: string | null;
  readonly untested_reason: string | null;
  readonly source_anchor: string;
  readonly replay_prover: string | null;
  readonly prev_hash: string;
  readonly current_hash: string;
  readonly created_at: string;
  readonly updated_at: string;
}

interface VerdictHeadRow {
  readonly current_hash: string;
}

export function recordVerdict(db: Database.Database, args: RecordVerdictArgs): VerdictNode {
  const insert = db.transaction((): VerdictNode => {
    assertRecordVerdictArgs(args);
    if (args.verdict === 'CONFIRMED') {
      assertConfirmedEvidenceExists(db, args.evidenceId);
    }

    const verdictId = ulid();
    const prevHash = getVerdictChainHead(db)?.current_hash ?? GENESIS_PREV_HASH;
    const falsificationSpecJson = canonicalJson(args.falsificationSpec, 'recordVerdict.falsificationSpec');
    const thresholdSpecJson =
      args.thresholdSpec === null ? null : canonicalJson(args.thresholdSpec, 'recordVerdict.thresholdSpec');
    const sourceAnchorJson = canonicalJson(args.sourceAnchor, 'recordVerdict.sourceAnchor');
    const replayProverJson =
      args.replayProver === null ? null : canonicalJson(args.replayProver, 'recordVerdict.replayProver');
    const currentHash = hashCanonicalJson({
      verdictId,
      evidenceId: args.evidenceId,
      nodeKind: args.nodeKind,
      verdict: args.verdict,
      falsificationSpecJson,
      thresholdSpecJson,
      sourceAnchorJson,
      prevHash,
    });
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO verdict_nodes (
        verdict_id, evidence_id, parent_verdict_id, node_kind, verdict,
        falsification_spec, threshold_spec, metric_value, conflicting_evidence_count,
        scope_slip_text, untested_reason, source_anchor, replay_prover,
        prev_hash, current_hash, created_at, updated_at
      ) VALUES (
        @verdict_id, @evidence_id, @parent_verdict_id, @node_kind, @verdict,
        @falsification_spec, @threshold_spec, @metric_value, @conflicting_evidence_count,
        @scope_slip_text, @untested_reason, @source_anchor, @replay_prover,
        @prev_hash, @current_hash, @created_at, @updated_at
      )`,
    ).run({
      verdict_id: verdictId,
      evidence_id: args.evidenceId,
      parent_verdict_id: args.parentVerdictId,
      node_kind: args.nodeKind,
      verdict: args.verdict,
      falsification_spec: falsificationSpecJson,
      threshold_spec: thresholdSpecJson,
      metric_value: args.metricValue,
      conflicting_evidence_count: args.conflictingEvidenceCount,
      scope_slip_text: args.scopeSlipText,
      untested_reason: args.untestedReason,
      source_anchor: sourceAnchorJson,
      replay_prover: replayProverJson,
      prev_hash: prevHash,
      current_hash: currentHash,
      created_at: now,
      updated_at: now,
    });

    const verdict = getVerdict(db, verdictId);
    if (verdict === null) {
      throw new Error(`recordVerdict: inserted verdict ${verdictId} could not be read back`);
    }
    return verdict;
  });

  return insert();
}

export function getVerdict(db: Database.Database, verdictId: string): VerdictNode | null {
  const row = db
    .prepare(
      `SELECT verdict_id, evidence_id, parent_verdict_id, node_kind, verdict,
              falsification_spec, threshold_spec, metric_value, conflicting_evidence_count,
              scope_slip_text, untested_reason, source_anchor, replay_prover,
              prev_hash, current_hash, created_at, updated_at
       FROM verdict_nodes
       WHERE verdict_id = ?`,
    )
    .get(verdictId) as VerdictNodeRow | undefined;

  return row === undefined ? null : rowToVerdictNode(row);
}

export function rowToVerdictNode(row: VerdictNodeRow): VerdictNode {
  const verdict = parseVerdict(row.verdict, row.verdict_id);
  const nodeKind = parseVerdictNodeKind(row.node_kind, row.verdict_id);
  return {
    verdictId: row.verdict_id,
    evidenceId: row.evidence_id,
    parentVerdictId: row.parent_verdict_id,
    nodeKind,
    verdict,
    falsificationSpec: parseFalsificationSpec(
      parseJsonObject(row.falsification_spec, `verdict ${row.verdict_id} falsification_spec`),
    ),
    thresholdSpec:
      row.threshold_spec === null
        ? null
        : parseThresholdSpec(parseJsonObject(row.threshold_spec, `verdict ${row.verdict_id} threshold_spec`)),
    metricValue: row.metric_value,
    conflictingEvidenceCount: row.conflicting_evidence_count,
    scopeSlipText: row.scope_slip_text,
    untestedReason: row.untested_reason,
    sourceAnchor: parseSourceAnchor(parseJsonObject(row.source_anchor, `verdict ${row.verdict_id} source_anchor`)),
    replayProver:
      row.replay_prover === null
        ? null
        : parseReplayProver(parseJsonObject(row.replay_prover, `verdict ${row.verdict_id} replay_prover`)),
    prevHash: row.prev_hash,
    currentHash: row.current_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getVerdictChainHead(db: Database.Database): VerdictHeadRow | undefined {
  return db
    .prepare(
      `SELECT current_hash
       FROM verdict_nodes
       ORDER BY created_at DESC, verdict_id DESC
       LIMIT 1`,
    )
    .get() as VerdictHeadRow | undefined;
}

function assertRecordVerdictArgs(args: RecordVerdictArgs): void {
  if (args.evidenceId.trim().length === 0) {
    throw new Error('recordVerdict: evidenceId must be non-empty');
  }
  if (args.parentVerdictId !== null && args.parentVerdictId.trim().length === 0) {
    throw new Error('recordVerdict: parentVerdictId must be null or non-empty');
  }
  if (args.metricValue !== null && !Number.isFinite(args.metricValue)) {
    throw new Error('recordVerdict: metricValue must be finite or null');
  }
  if (!Number.isInteger(args.conflictingEvidenceCount) || args.conflictingEvidenceCount < 0) {
    throw new Error('recordVerdict: conflictingEvidenceCount must be a non-negative integer');
  }
  if (args.verdict === 'DEGRADED_SCOPE' && (args.scopeSlipText === null || args.scopeSlipText.trim().length === 0)) {
    throw new EmptyScopeSlipError('recordVerdict: DEGRADED_SCOPE requires non-empty scopeSlipText');
  }
  if (args.verdict === 'UNTESTED' && (args.untestedReason === null || args.untestedReason.trim().length === 0)) {
    throw new EmptyUntestedReasonError('recordVerdict: UNTESTED requires non-empty untestedReason');
  }
}

/**
 * CONFIRMED 证据存在性守卫（Red Line #7·持久化层防御纵深）。
 *
 * 对称 EmptyScopeSlipError（DEGRADED_SCOPE）/ EmptyUntestedReasonError（UNTESTED）的参数级守卫——
 * 但 CONFIRMED 的"证据"语义在 evidence 集合（上层 makeVerdict/decideVerdict），recordVerdict 单点
 * 只持有 evidenceId。此处查 evidence_log 验证 evidenceId 真实存在 + evidence_payload 非空，
 * 阻止绕过 makeVerdict 直接调 recordVerdict 写无证据 CONFIRMED（public-exported 函数防御纵深）。
 *
 * 注：evidence_id FK 已保证记录存在，本守卫提供「早失败 + 明确红线错误码」而非 FK 的通用约束错误。
 */
function assertConfirmedEvidenceExists(db: Database.Database, evidenceId: string): void {
  const row = db
    .prepare('SELECT evidence_payload FROM evidence_log WHERE evidence_id = ?')
    .get(evidenceId) as { evidence_payload?: string } | undefined;
  if (row === undefined) {
    throw new ConfirmedEvidenceMissingError(
      `recordVerdict: CONFIRMED requires existing evidence_log record for evidenceId=${evidenceId} (Red Line #7: evidence + checkpoint)`,
    );
  }
  const payload = row.evidence_payload;
  if (payload === undefined || payload.trim().length === 0) {
    throw new ConfirmedEvidenceMissingError(
      `recordVerdict: CONFIRMED requires non-empty evidence_payload for evidenceId=${evidenceId} (Red Line #7)`,
    );
  }
}

function parseVerdict(value: string, verdictId: string): Verdict {
  if ((VERDICTS as readonly string[]).includes(value)) {
    return value as Verdict;
  }
  throw new UnknownVerdictError(`rowToVerdictNode: invalid verdict "${value}" at verdict_id=${verdictId}`);
}

function parseVerdictNodeKind(value: string, verdictId: string): VerdictNodeKind {
  if ((VERDICT_NODE_KINDS as readonly string[]).includes(value)) {
    return value as VerdictNodeKind;
  }
  throw new UnknownVerdictError(`rowToVerdictNode: invalid node_kind "${value}" at verdict_id=${verdictId}`);
}
