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
  VerdictTracePersisted,
} from './types.ts';

/** Raw database row representation of a verdict node, before mapping to {@link VerdictNode}. */
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
  readonly verdict_trace_json: string;
  readonly verdict_trace_hash: string;
  readonly superseded_by: string | null;
  readonly prev_hash: string;
  readonly current_hash: string;
  readonly created_at: string;
  readonly updated_at: string;
}

interface VerdictHeadRow {
  readonly current_hash: string;
}

/**
 * Persists a verdict node to the database, computing its `currentHash` from all
 * verdict-critical fields and linking it to the parent via `prevHash`. This is
 * the sole entry point for writing verdicts — no other path may insert into
 * `verdict_nodes`.
 *
 * @param db - The database handle.
 * @param args - The verdict fields to persist.
 * @returns The persisted {@link VerdictNode}.
 */
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
    // P0-2-EXT：裁决内核 trace 4 字段落库（canonical 全文 + sha256 绑定）。hashCanonicalJson 内含
    // NaN/Infinity 断言（hasher.ts:41），trace 字段含非有限数会早失败（fail-closed）。
    const verdictTraceJson = canonicalJson(args.verdictTrace, 'recordVerdict.verdictTrace');
    const verdictTraceHash = hashCanonicalJson({ verdictTraceJson });
    const currentHash = hashCanonicalJson({
      verdictId,
      evidenceId: args.evidenceId,
      nodeKind: args.nodeKind,
      verdict: args.verdict,
      falsificationSpecJson,
      thresholdSpecJson,
      sourceAnchorJson,
      prevHash,
      verdictTraceHash,
    });
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO verdict_nodes (
        verdict_id, evidence_id, parent_verdict_id, node_kind, verdict,
        falsification_spec, threshold_spec, metric_value, conflicting_evidence_count,
        scope_slip_text, untested_reason, source_anchor, replay_prover,
        verdict_trace_json, verdict_trace_hash,
        prev_hash, current_hash, created_at, updated_at
      ) VALUES (
        @verdict_id, @evidence_id, @parent_verdict_id, @node_kind, @verdict,
        @falsification_spec, @threshold_spec, @metric_value, @conflicting_evidence_count,
        @scope_slip_text, @untested_reason, @source_anchor, @replay_prover,
        @verdict_trace_json, @verdict_trace_hash,
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
      verdict_trace_json: verdictTraceJson,
      verdict_trace_hash: verdictTraceHash,
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

  // IMMEDIATE 事务（CONCURRENCY-1 · APPENDENDIX_C §3.6）：BEGIN IMMEDIATE 获取 RESERVED 写锁，
  // 使 chainHead 读取 + INSERT 在跨进程并发下也原子（防两条记录接同一 prevHash 的 TOCTOU 分叉）。
  // 镜像 evidence_log/repository.ts:155 append.immediate() + lifecycle.ts:257 apply.immediate() 的既有修复；
  // recordVerdict 同属链写入路径，此前漏改（深度对抗轮发现）。
  return insert.immediate();
}

/**
 * Retrieves a verdict node by its ID.
 *
 * @param db - The database handle.
 * @param verdictId - The verdict node ID.
 * @returns The {@link VerdictNode}, or null if not found.
 */
export function getVerdict(db: Database.Database, verdictId: string): VerdictNode | null {
  const row = db
    .prepare(
      `SELECT verdict_id, evidence_id, parent_verdict_id, node_kind, verdict,
              falsification_spec, threshold_spec, metric_value, conflicting_evidence_count,
              scope_slip_text, untested_reason, source_anchor, replay_prover,
              verdict_trace_json, verdict_trace_hash, superseded_by,
              prev_hash, current_hash, created_at, updated_at
       FROM verdict_nodes
       WHERE verdict_id = ?`,
    )
    .get(verdictId) as VerdictNodeRow | undefined;

  return row === undefined ? null : rowToVerdictNode(row);
}

/** Arguments for superseding a verdict: the old verdict ID and the new verdict ID that replaces it. */
export interface SupersedeVerdictArgs {
  readonly oldVerdictId: string;
  readonly newVerdictArgs: RecordVerdictArgs;
}

/** Result of superseding a verdict: the old node (now marked superseded) and the new active node. */
export interface SupersedeVerdictResult {
  readonly oldVerdict: VerdictNode;
  readonly newVerdict: VerdictNode;
}

/**
 * FUSION-OS-12：重评 supersede —— 写新 verdict 行 + UPDATE 旧行 superseded_by 指针。
 *
 * superseded_by 是元数据，不进 old.current_hash 白名单 → old 链完整性不变（verifyVerdictNodes 重算仍匹配）。
 * 事务性：recordVerdict(new) + UPDATE(old.superseded_by) 原子提交；old 不存在 → 抛错（fail-closed）。
 */
export function supersedeVerdict(db: Database.Database, args: SupersedeVerdictArgs): SupersedeVerdictResult {
  const supersede = db.transaction((): SupersedeVerdictResult => {
    const existing = getVerdict(db, args.oldVerdictId);
    if (existing === null) {
      throw new Error(`supersedeVerdict: old verdict ${args.oldVerdictId} not found`);
    }
    const newVerdict = recordVerdict(db, args.newVerdictArgs);
    const result = db
      .prepare('UPDATE verdict_nodes SET superseded_by = ? WHERE verdict_id = ?')
      .run(newVerdict.verdictId, args.oldVerdictId);
    if (result.changes !== 1) {
      throw new Error(`supersedeVerdict: failed to set superseded_by on ${args.oldVerdictId}`);
    }
    const oldVerdict = getVerdict(db, args.oldVerdictId);
    if (oldVerdict === null) {
      throw new Error(`supersedeVerdict: old verdict ${args.oldVerdictId} disappeared after supersede`);
    }
    return { oldVerdict, newVerdict };
  });
  // IMMEDIATE 事务：同 recordVerdict，supersede 内含 recordVerdict 写链头 + UPDATE 旧行，须 RESERVED 锁原子化。
  return supersede.immediate();
}

/**
 * FUSION-OS-12：查当前活跃裁决（superseded_by IS NULL）。与 getVerdict（按 id 查含旧行·审计）互补。
 */
export function getActiveVerdicts(db: Database.Database): readonly VerdictNode[] {
  const rows = db
    .prepare(
      `SELECT verdict_id, evidence_id, parent_verdict_id, node_kind, verdict,
              falsification_spec, threshold_spec, metric_value, conflicting_evidence_count,
              scope_slip_text, untested_reason, source_anchor, replay_prover,
              verdict_trace_json, verdict_trace_hash, superseded_by,
              prev_hash, current_hash, created_at, updated_at
       FROM verdict_nodes
       WHERE superseded_by IS NULL
       ORDER BY created_at ASC, verdict_id ASC`,
    )
    .all() as VerdictNodeRow[];
  return rows.map(rowToVerdictNode);
}

/**
 * Maps a raw database row to a {@link VerdictNode}, reconstructing all
 * verdict-critical fields including the structured trace.
 *
 * @param row - The raw database row.
 * @returns The mapped `VerdictNode`.
 */
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
    verdictTrace: parseVerdictTrace(
      parseJsonObject(row.verdict_trace_json, `verdict ${row.verdict_id} verdict_trace_json`),
      row.verdict_id,
    ),
    verdictTraceHash: row.verdict_trace_hash,
    supersededBy: row.superseded_by,
    prevHash: row.prev_hash,
    currentHash: row.current_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getVerdictChainHead(db: Database.Database): VerdictHeadRow | undefined {
  return db
    .prepare(
      // 按 rowid DESC（插入序逆序）取链头，与 verifyVerdictNodes 的 ORDER BY rowid ASC（verifier.ts:64）对齐。
      // 旧实现 ORDER BY created_at DESC, verdict_id DESC 在同一毫秒快速调用下脆弱（ULID 字典序随机），
      // 可能返回非最新行 → 下次 INSERT 接错前驱 → verifyVerdictNodes 报链断（曾致 supersede.test.ts flaky，
      // verifier 侧已修复但写侧漏改·深度对抗轮发现）。rowid 严格单调递增 = 链写入序。
      `SELECT current_hash
       FROM verdict_nodes
       ORDER BY rowid DESC
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

const EVIDENCE_SUFFICIENCY_STATUSES = new Set(['sufficient', 'insufficient', 'unknown']);
const POWER_STATUSES = new Set(['adequate', 'underpowered', 'unknown']);

/**
 * 解析 verdict_trace_json → VerdictTracePersisted（P0-2-EXT）。fail-closed：形状不合法抛错。
 *
 * trace 是 verdict-critical 字段（04 §3.4），从 DB 读回时必须严格校验——否则篡改后的 trace
 * （如 reasonCodes 改成非数组）会被静默接受，破坏 current_hash 绑定的语义。
 */
function parseVerdictTrace(value: unknown, verdictId: string): VerdictTracePersisted {
  if (value === null || typeof value !== 'object') {
    throw new Error(`parseVerdictTrace: verdict_trace_json must be an object at verdict_id=${verdictId}`);
  }
  const v = value as Record<string, unknown>;
  const reasonCodes = parseStringArray(v.reasonCodes, 'reasonCodes', verdictId);
  const ruleTrace = parseRuleTrace(v.ruleTrace, verdictId);
  if (typeof v.decisiveRuleId !== 'string' || v.decisiveRuleId.length === 0) {
    throw new Error(`parseVerdictTrace: decisiveRuleId must be non-empty string at verdict_id=${verdictId}`);
  }
  const evidenceSufficiency = parseEvidenceSufficiency(v.evidenceSufficiency, verdictId);
  // B3：decisionTrace 可选·宽容透传（透明度元数据·非 verdict-critical·旧行无则 undefined·零回归）。
  // 与 4 个 critical 字段不同不深度校验——形状由 DecisionTrace 类型约束，读取方（API/report）自行消费。
  return {
    reasonCodes,
    ruleTrace,
    decisiveRuleId: v.decisiveRuleId,
    evidenceSufficiency,
    ...(v.decisionTrace !== undefined && v.decisionTrace !== null
      ? { decisionTrace: v.decisionTrace as NonNullable<VerdictTracePersisted['decisionTrace']> }
      : {}),
    // 阶段 7 P0-11：GRADE 质量元数据宽容透传（同 decisionTrace 模式·可选·旧行无则 undefined·零回归）。
    ...(typeof v.evidenceQualityTier === 'number'
      ? {
          evidenceQualityTier: v.evidenceQualityTier as NonNullable<
            VerdictTracePersisted['evidenceQualityTier']
          >,
        }
      : {}),
    ...(typeof v.evidenceQualityNote === 'string'
      ? { evidenceQualityNote: v.evidenceQualityNote as NonNullable<VerdictTracePersisted['evidenceQualityNote']> }
      : {}),
  };
}

function parseStringArray(raw: unknown, field: string, verdictId: string): readonly string[] {
  if (!Array.isArray(raw)) {
    throw new Error(`parseVerdictTrace: ${field} must be array at verdict_id=${verdictId}`);
  }
  return raw.map((item, index) => {
    if (typeof item !== 'string') {
      throw new Error(`parseVerdictTrace: ${field}[${index}] must be string at verdict_id=${verdictId}`);
    }
    return item;
  });
}

function parseRuleTrace(raw: unknown, verdictId: string): readonly VerdictTracePersisted['ruleTrace'][number][] {
  if (!Array.isArray(raw)) {
    throw new Error(`parseVerdictTrace: ruleTrace must be array at verdict_id=${verdictId}`);
  }
  return raw.map((item, index) => {
    if (item === null || typeof item !== 'object') {
      throw new Error(`parseVerdictTrace: ruleTrace[${index}] must be object at verdict_id=${verdictId}`);
    }
    const step = item as Record<string, unknown>;
    if (typeof step.ruleId !== 'string' || step.ruleId.length === 0) {
      throw new Error(`parseVerdictTrace: ruleTrace[${index}].ruleId must be non-empty string at verdict_id=${verdictId}`);
    }
    if (typeof step.triggered !== 'boolean') {
      throw new Error(`parseVerdictTrace: ruleTrace[${index}].triggered must be boolean at verdict_id=${verdictId}`);
    }
    if (step.details !== undefined && typeof step.details !== 'string') {
      throw new Error(`parseVerdictTrace: ruleTrace[${index}].details must be string if present at verdict_id=${verdictId}`);
    }
    return step.details === undefined
      ? { ruleId: step.ruleId, triggered: step.triggered }
      : { ruleId: step.ruleId, triggered: step.triggered, details: step.details };
  });
}

function parseEvidenceSufficiency(
  raw: unknown,
  verdictId: string,
): VerdictTracePersisted['evidenceSufficiency'] {
  if (raw === null || typeof raw !== 'object') {
    throw new Error(`parseVerdictTrace: evidenceSufficiency must be object at verdict_id=${verdictId}`);
  }
  const v = raw as Record<string, unknown>;
  if (typeof v.status !== 'string' || !EVIDENCE_SUFFICIENCY_STATUSES.has(v.status)) {
    throw new Error(`parseVerdictTrace: evidenceSufficiency.status invalid at verdict_id=${verdictId}`);
  }
  if (typeof v.powerStatus !== 'string' || !POWER_STATUSES.has(v.powerStatus)) {
    throw new Error(`parseVerdictTrace: evidenceSufficiency.powerStatus invalid at verdict_id=${verdictId}`);
  }
  return { status: v.status as VerdictTracePersisted['evidenceSufficiency']['status'], powerStatus: v.powerStatus as VerdictTracePersisted['evidenceSufficiency']['powerStatus'] };
}
