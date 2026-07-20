/**
 * lifecycle.ts — 撤回/纠正/supersession 生命周期状态机执行(IC-05 · PT-8)。
 *
 * 冻结 SSOT: docs/design/machine-readable/state-machines/retraction_lifecycle.yaml
 *   active → contested(contest:任意,附 CounterEvidence)
 *   contested → active(反驳被驳回) | corrected | retracted | superseded
 *   corrected / retracted / superseded = 终态(不可逆)
 *
 * 语义:
 *   - 墓碑化:迁移以派生记录表达,原记录永不删除;
 *   - 终态不可逆:非法迁移 fail-closed 抛错;
 *   - 审计:每事件 actor+reason+ts + 事件级 hash 链(canonical 输入
 *     targetKind/targetId/fromState/toState/actor/reason/prevHash);
 *   - 幂等:对当前已在目标终态的重复迁移返回 alreadyInState(不重复插入)。
 *
 * ADR-021:审计不落 falsification_audit_events(其 FK/CHECK 为 falsification 专用);
 * 审计等价性=本表 append-only+hash 链+触发器。
 *
 * 模型中立. 零容忍合规: 无 any / @ts-ignore / 空 catch / 双重断言。
 */

import type Database from 'better-sqlite3';
import { ulid } from 'ulid';
import { createHash } from 'node:crypto';
import stableStringify from 'fast-json-stable-stringify';

export const LIFECYCLE_STATES = ['active', 'contested', 'corrected', 'retracted', 'superseded'] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

export const TERMINAL_STATES: readonly LifecycleState[] = ['corrected', 'retracted', 'superseded'];

export const LIFECYCLE_TARGET_KINDS = ['claim', 'verdict_node', 'proof_envelope', 'evidence'] as const;
export type LifecycleTargetKind = (typeof LIFECYCLE_TARGET_KINDS)[number];

/** 冻结状态机迁移表(非法迁移=拒绝) */
const ALLOWED_TRANSITIONS: Readonly<Record<LifecycleState, readonly LifecycleState[]>> = {
  active: ['contested'],
  contested: ['active', 'corrected', 'retracted', 'superseded'],
  corrected: [],
  retracted: [],
  superseded: [],
};

export interface LifecycleEvent {
  readonly eventId: string;
  readonly targetKind: LifecycleTargetKind;
  readonly targetId: string;
  readonly fromState: LifecycleState;
  readonly toState: LifecycleState;
  readonly actor: string;
  readonly reason: string;
  readonly auditRef: string | null;
  readonly prevHash: string;
  readonly currentHash: string;
  readonly createdAt: string;
}

export interface LifecycleTransitionInput {
  readonly targetKind: LifecycleTargetKind;
  readonly targetId: string;
  readonly toState: LifecycleState;
  readonly actor: string;
  readonly reason: string;
  readonly auditRef?: string | null;
}

export interface LifecycleTransitionResult {
  readonly event: LifecycleEvent | null;
  /** true = 目标已在该终态,幂等命中(未重复插入) */
  readonly alreadyInState: boolean;
}

const GENESIS_HASH = '0'.repeat(64);

interface LifecycleEventRow {
  readonly event_id: string;
  readonly target_kind: string;
  readonly target_id: string;
  readonly from_state: string;
  readonly to_state: string;
  readonly actor: string;
  readonly reason: string;
  readonly audit_ref: string | null;
  readonly prev_hash: string;
  readonly current_hash: string;
  readonly created_at: string;
}

function rowToEvent(row: LifecycleEventRow): LifecycleEvent {
  return {
    eventId: row.event_id,
    targetKind: row.target_kind as LifecycleTargetKind,
    targetId: row.target_id,
    fromState: row.from_state as LifecycleState,
    toState: row.to_state as LifecycleState,
    actor: row.actor,
    reason: row.reason,
    auditRef: row.audit_ref,
    prevHash: row.prev_hash,
    currentHash: row.current_hash,
    createdAt: row.created_at,
  };
}

function computeEventHash(input: {
  readonly targetKind: LifecycleTargetKind;
  readonly targetId: string;
  readonly fromState: LifecycleState;
  readonly toState: LifecycleState;
  readonly actor: string;
  readonly reason: string;
  readonly prevHash: string;
}): string {
  const canonical = stableStringify(input);
  if (canonical === undefined) {
    throw new Error('lifecycle.computeEventHash: stable stringify returned undefined');
  }
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/** 查询目标当前状态(无事件=active)。 */
export function getLifecycleState(
  db: Database.Database,
  targetKind: LifecycleTargetKind,
  targetId: string,
): LifecycleState {
  const row = db
    .prepare(
      `SELECT to_state FROM lifecycle_events
       WHERE target_kind = ? AND target_id = ?
       ORDER BY rowid DESC LIMIT 1`,
    )
    .get(targetKind, targetId) as { to_state: string } | undefined;
  return row === undefined ? 'active' : (row.to_state as LifecycleState);
}

/** 查询目标全部迁移历史(升序)。 */
export function listLifecycleEvents(
  db: Database.Database,
  targetKind: LifecycleTargetKind,
  targetId: string,
): LifecycleEvent[] {
  const rows = db
    .prepare(
      `SELECT * FROM lifecycle_events
       WHERE target_kind = ? AND target_id = ?
       ORDER BY rowid ASC`,
    )
    .all(targetKind, targetId) as LifecycleEventRow[];
  return rows.map(rowToEvent);
}

/**
 * 执行生命周期迁移(状态机执行层)。
 * - 非法迁移(不在迁移表/终态出发)→ fail-closed 抛错;
 * - 重复迁移至当前终态 → 幂等返回 alreadyInState=true(不插入);
 * - 事件 hash 链接到目标最近事件(目标级链)。
 */
export function applyLifecycleTransition(
  db: Database.Database,
  input: LifecycleTransitionInput,
): LifecycleTransitionResult {
  if (input.actor.trim().length === 0) {
    throw new Error('lifecycle: actor must be non-empty(签核留痕)');
  }
  if (input.reason.trim().length === 0) {
    throw new Error('lifecycle: reason must be non-empty(墓碑化须理由)');
  }
  const fromState = getLifecycleState(db, input.targetKind, input.targetId);
  if (fromState === input.toState && TERMINAL_STATES.includes(input.toState)) {
    return { event: null, alreadyInState: true };
  }
  const allowed = ALLOWED_TRANSITIONS[fromState];
  if (!allowed.includes(input.toState)) {
    throw new Error(
      `lifecycle: illegal transition ${fromState} → ${input.toState} ` +
        `(allowed from ${fromState}: ${allowed.length > 0 ? allowed.join(', ') : '(terminal, none)'};` +
        ` SSOT=retraction_lifecycle.yaml,终态不可逆)`,
    );
  }

  const apply = db.transaction((): LifecycleTransitionResult => {
    const last = db
      .prepare(
        `SELECT current_hash FROM lifecycle_events
         WHERE target_kind = ? AND target_id = ?
         ORDER BY rowid DESC LIMIT 1`,
      )
      .get(input.targetKind, input.targetId) as { current_hash: string } | undefined;
    const prevHash = last?.current_hash ?? GENESIS_HASH;
    const eventCore = {
      targetKind: input.targetKind,
      targetId: input.targetId,
      fromState,
      toState: input.toState,
      actor: input.actor,
      reason: input.reason,
      prevHash,
    };
    const currentHash = computeEventHash(eventCore);
    const eventId = ulid();
    db.prepare(
      `INSERT INTO lifecycle_events (
        event_id, target_kind, target_id, from_state, to_state,
        actor, reason, audit_ref, prev_hash, current_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      eventId,
      input.targetKind,
      input.targetId,
      fromState,
      input.toState,
      input.actor,
      input.reason,
      input.auditRef ?? null,
      prevHash,
      currentHash,
    );
    const row = db
      .prepare(`SELECT * FROM lifecycle_events WHERE event_id = ?`)
      .get(eventId) as LifecycleEventRow;
    return { event: rowToEvent(row), alreadyInState: false };
  });
  return apply.immediate();
}

export interface LifecycleChainVerifyResult {
  readonly ok: boolean;
  readonly checkedCount: number;
  readonly brokenAtEventId: string | null;
}

/** 事件级 hash 链校验(文件级旁路篡改可检,与 call_records 链同构)。 */
export function verifyLifecycleChain(
  db: Database.Database,
  targetKind: LifecycleTargetKind,
  targetId: string,
): LifecycleChainVerifyResult {
  const events = listLifecycleEvents(db, targetKind, targetId);
  let expectedPrev = GENESIS_HASH;
  for (const event of events) {
    if (event.prevHash !== expectedPrev) {
      return { ok: false, checkedCount: 0, brokenAtEventId: event.eventId };
    }
    const recomputed = computeEventHash({
      targetKind: event.targetKind,
      targetId: event.targetId,
      fromState: event.fromState,
      toState: event.toState,
      actor: event.actor,
      reason: event.reason,
      prevHash: event.prevHash,
    });
    if (recomputed !== event.currentHash) {
      return { ok: false, checkedCount: 0, brokenAtEventId: event.eventId };
    }
    expectedPrev = event.currentHash;
  }
  return { ok: true, checkedCount: events.length, brokenAtEventId: null };
}
