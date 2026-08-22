import type { Db } from './db.js';
import {
  ResearchRun, RunEvent, RunStatus, RunStageName, StageRecord, ResearchQuestion,
  CorpusSnapshot, SourceDocument, ScientificClaim, EvidenceRelation, HypothesisCandidate,
  HypothesisScorecard, HypothesisTournament, ResearchPlan, FeedbackSignal, Revision, VersionDiff,
  ProvenanceReceipt, ReproducibilityBundle, newId,
} from '../domain/index.js';
import { z } from 'zod';
import { STAGE_ORDER } from '../domain/run.js';

/** Domain object kinds stored in the generic objects table, with their canonical schemas (fail-closed reads). */
const KIND_SCHEMAS = {
  question: ResearchQuestion,
  corpus_snapshot: CorpusSnapshot,
  source_document: SourceDocument,
  claim: ScientificClaim,
  evidence_relation: EvidenceRelation,
  hypothesis: HypothesisCandidate,
  scorecard: HypothesisScorecard,
  tournament: HypothesisTournament,
  plan: ResearchPlan,
  feedback: FeedbackSignal,
  revision: Revision,
  version_diff: VersionDiff,
  receipt: ProvenanceReceipt,
  bundle: ReproducibilityBundle,
} as const;

export type ObjectKind = keyof typeof KIND_SCHEMAS & (string & {});
type AnySchema = (typeof KIND_SCHEMAS)[ObjectKind];
export type DomainObject<K extends ObjectKind> = z.infer<(typeof KIND_SCHEMAS)[K]>;

/**
 * Single authoritative persistence facade (D-004): SQLite owns mutable run/domain state;
 * events are append-only audit; objects are re-validated by their zod schema on read
 * (corrupt/mismatched rows fail closed instead of silently propagating).
 */
export class Store {
  constructor(private readonly db: Db) {}

  // ---- runs (transactional mutable authority) ----

  createRun(question: ResearchQuestion, now = new Date().toISOString()): ResearchRun {
    const run: ResearchRun = ResearchRun.parse({
      id: newId('run'), questionId: question.id, status: 'created', currentStage: 'scope',
      stages: STAGE_ALL.map((stage) => ({ stage, state: 'pending' })),
      createdAt: now, updatedAt: now, tags: [],
    });
    this.db.transaction(() => {
      this.putObject('question', question);
      this.db.prepare('INSERT INTO runs (id, question_id, status, current_stage, doc, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
        .run(run.id, run.questionId, run.status, run.currentStage, JSON.stringify(run), now, now);
      // Inside the transaction (Wave-G WP2): a run row without its run_created event
      // would be an unauditable run after a crash between the two writes.
      this.appendEvent(run.id, { type: 'run_created', status: 'created', detail: { questionId: question.id } }, now);
    });
    return run;
  }

  updateRun(run: ResearchRun): void {
    const now = new Date().toISOString();
    this.db.transaction(() => {
      const res = this.db.prepare('UPDATE runs SET status=?, current_stage=?, doc=?, updated_at=? WHERE id=?')
        .run(run.status, run.currentStage, JSON.stringify(run), now, run.id);
      if (Number(res.changes) !== 1) throw new Error(`run not found: ${run.id}`);
    });
  }

  getRun(runId: string): ResearchRun | null {
    const row = this.db.prepare('SELECT doc FROM runs WHERE id=?').get(runId);
    if (!row) return null;
    return ResearchRun.parse(JSON.parse(String(row.doc)));
  }

  listRuns(limit = 100): { id: string; status: string; currentStage: string; createdAt: string }[] {
    return this.db.prepare('SELECT id, status, current_stage, created_at FROM runs ORDER BY created_at DESC LIMIT ?')
      .all(limit)
      .map((r) => ({ id: String(r.id), status: String(r.status), currentStage: String(r.current_stage), createdAt: String(r.created_at) }));
  }

  // ---- append-only event audit ----

  appendEvent(runId: string, e: { type: RunEvent['type']; status?: RunStatus; stage?: RunStageName; detail?: Record<string, unknown>; receiptId?: string }, at = new Date().toISOString()): RunEvent {
    const payload = {
      runId, at, type: e.type, status: e.status, stage: e.stage,
      detail: e.detail ?? {}, receiptId: e.receiptId,
    };
    const res = this.db.prepare('INSERT INTO events (run_id, at, type, payload) VALUES (?,?,?,?)')
      .run(runId, at, e.type, JSON.stringify(payload));
    return RunEvent.parse({ ...payload, seq: Number(res.lastInsertRowid) });
  }

  listEvents(runId: string): RunEvent[] {
    return this.db.prepare('SELECT seq, payload FROM events WHERE run_id=? ORDER BY seq ASC').all(runId)
      .map((r) => {
        const p = JSON.parse(String(r.payload)) as Record<string, unknown>;
        return RunEvent.parse({ ...p, seq: Number(r.seq) });
      });
  }

  // ---- generic canonical object storage ----

  putObject<K extends ObjectKind>(kind: K, obj: DomainObject<K>): void {
    const schema = KIND_SCHEMAS[kind] as AnySchema;
    const parsed = schema.parse(obj) as { id?: string; revisionId?: string; runId?: string; createdAt?: string };
    // VersionDiff is the one kind keyed by revisionId instead of id; fail loud if neither exists.
    const id = parsed.id ?? parsed.revisionId;
    if (id === undefined) throw new Error(`object of kind ${kind} has neither id nor revisionId — cannot persist`);
    const runId = parsed.runId ?? '__none__';
    const createdAt = parsed.createdAt ?? new Date().toISOString();
    this.db.prepare('INSERT OR REPLACE INTO objects (kind, id, run_id, json, created_at) VALUES (?,?,?,?,?)')
      .run(kind, id, runId, JSON.stringify(parsed), createdAt);
  }

  getObject<K extends ObjectKind>(kind: K, id: string): DomainObject<K> | null {
    const row = this.db.prepare('SELECT json FROM objects WHERE kind=? AND id=?').get(kind, id);
    if (!row) return null;
    const schema = KIND_SCHEMAS[kind] as AnySchema;
    return schema.parse(JSON.parse(String(row.json))) as DomainObject<K>;
  }

  listObjects<K extends ObjectKind>(kind: K, runId: string): DomainObject<K>[] {
    return this.db.prepare('SELECT json FROM objects WHERE kind=? AND run_id=? ORDER BY created_at ASC').all(kind, runId)
      .map((r) => KIND_SCHEMAS[kind].parse(JSON.parse(String(r.json))) as DomainObject<K>);
  }

  // ---- W8 S2: idempotent intra-stage step checkpoints (dbos operation_outputs pattern) ----
  // `family` separates independent checkpoint families inside one stage (audit P0-1:
  // rank hosts scoring batches AND tournament pairs with different inputs fingerprints —
  // a per-stage fingerprint row made the families clear each other on every resume).

  getStepOutput<T>(runId: string, stage: RunStageName, family: string, stepKey: string): T | null {
    const row = this.db.prepare('SELECT json FROM step_outputs WHERE run_id=? AND stage=? AND family=? AND step_key=?')
      .get(runId, stage, family, stepKey);
    return row ? (JSON.parse(String(row.json)) as T) : null;
  }

  putStepOutput(runId: string, stage: RunStageName, family: string, stepKey: string, value: unknown, at = new Date().toISOString()): void {
    this.db.transaction(() => {
      this.db.prepare('INSERT OR REPLACE INTO step_outputs (run_id, stage, family, step_key, json, created_at) VALUES (?,?,?,?,?,?)')
        .run(runId, stage, family, stepKey, JSON.stringify(value), at);
      this.appendEvent(runId, { type: 'checkpoint_saved', stage, detail: { family, stepKey } }, at);
    });
  }

  countStepOutputs(runId: string, stage: RunStageName, family?: string): number {
    const n = family === undefined
      ? this.db.prepare('SELECT COUNT(*) AS n FROM step_outputs WHERE run_id=? AND stage=?').get(runId, stage)?.n
      : this.db.prepare('SELECT COUNT(*) AS n FROM step_outputs WHERE run_id=? AND stage=? AND family=?').get(runId, stage, family)?.n;
    return Number(n ?? 0);
  }

  /**
   * Stage-inputs fingerprint per family (W8 S2 hardening, audit P3 + P0-1): checkpoint
   * keys alone are not payload-bound — a code/prompt upgrade mid-run would otherwise
   * replay stale cached responses under rebuilt prompts (dbos application_version gate,
   * embedded form). A mismatch invalidates only that FAMILY's step outputs.
   */
  getStepFingerprint(runId: string, stage: RunStageName, family: string): string | null {
    const row = this.db.prepare('SELECT fingerprint FROM step_fingerprints WHERE run_id=? AND stage=? AND family=?')
      .get(runId, stage, family);
    return row ? String(row.fingerprint) : null;
  }

  putStepFingerprint(runId: string, stage: RunStageName, family: string, fingerprint: string): void {
    this.db.prepare('INSERT OR REPLACE INTO step_fingerprints (run_id, stage, family, fingerprint) VALUES (?,?,?,?)')
      .run(runId, stage, family, fingerprint);
  }

  clearStepOutputs(runId: string, stage: RunStageName, family: string): number {
    const res = this.db.prepare('DELETE FROM step_outputs WHERE run_id=? AND stage=? AND family=?').run(runId, stage, family);
    return Number(res.changes);
  }

  // ---- W8 S1: run leases (single-writer discipline across CLI/server processes) ----

  /** Current lease state of a run (row-level operational state, deliberately outside the run doc). */
  getRunLease(runId: string): { holder: string | null; expiresAt: string | null } {
    const row = this.db.prepare('SELECT lease_holder, lease_expires_at FROM runs WHERE id=?').get(runId);
    if (!row) return { holder: null, expiresAt: null };
    return {
      holder: row.lease_holder === null || row.lease_holder === undefined ? null : String(row.lease_holder),
      expiresAt: row.lease_expires_at === null || row.lease_expires_at === undefined ? null : String(row.lease_expires_at),
    };
  }

  /**
   * Conditionally claim execution ownership. Atomic under sqlite's single-writer
   * transactions: succeeds only when no live lease exists (expired leases are
   * reclaimable — the holder's process is presumed dead, temporal sticky-lease pattern).
   */
  acquireLease(runId: string, holder: string, expiresAt: string): boolean {
    const res = this.db.transaction(() => {
      const row = this.db.prepare('SELECT lease_holder, lease_expires_at FROM runs WHERE id=?').get(runId);
      if (!row) throw new Error(`run not found: ${runId}`);
      const now = new Date().toISOString();
      const live = row.lease_holder !== null && row.lease_holder !== undefined
        && String(row.lease_expires_at ?? '') > now;
      if (live && String(row.lease_holder) !== holder) return false;
      this.db.prepare('UPDATE runs SET lease_holder=?, lease_expires_at=? WHERE id=?')
        .run(holder, expiresAt, runId);
      return true;
    });
    return res;
  }

  /** Extend the lease; no-op when this holder does not own it (lost adoption race). */
  renewLease(runId: string, holder: string, expiresAt: string): void {
    this.db.prepare('UPDATE runs SET lease_expires_at=? WHERE id=? AND lease_holder=?')
      .run(expiresAt, runId, holder);
  }

  releaseLease(runId: string, holder: string): void {
    this.db.prepare('UPDATE runs SET lease_holder=NULL, lease_expires_at=NULL WHERE id=? AND lease_holder=?')
      .run(runId, holder);
  }

  /**
   * Runs stuck in status='running' whose lease expired — i.e. the frozen-run signature
   * (P1): a dead worker holds no live lease. Threshold is absolute (ISO) so callers
   * control the grace window.
   */
  listExpiredLeaseRuns(nowIso: string): { id: string; currentStage: string; leaseHolder: string | null }[] {
    return this.db.prepare(
      "SELECT id, current_stage, lease_holder FROM runs WHERE status='running' AND (lease_expires_at IS NULL OR lease_expires_at <= ?)",
    ).all(nowIso).map((r) => ({ id: String(r.id), currentStage: String(r.current_stage), leaseHolder: r.lease_holder === null ? null : String(r.lease_holder) }));
  }

  /**
   * Atomic cancellation flag write (W8 audit P2-4): a whole-doc read-modify-write races
   * the owning executor's transitions (lost update can resurrect done stages or erase
   * the flag). json_set touches only the flag inside one statement.
   */
  requestCancel(runId: string): boolean {
    const res = this.db.prepare("UPDATE runs SET doc = json_set(doc, '$.cancelRequested', json('true')), updated_at = updated_at WHERE id=? AND status IN ('created','queued','running','paused','partial')")
      .run(runId);
    return Number(res.changes) === 1;
  }
}

// Single source of truth is the domain's STAGE_ORDER (Wave-G WP2: three independent
// copies of the stage list — store, composition import map, domain — silently drift;
// consumers that need "all stages" must derive from here).
const STAGE_ALL: readonly RunStageName[] = STAGE_ORDER;
export { STAGE_ALL };
export type { StageRecord, ResearchRun };
