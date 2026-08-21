import type { Db } from './db.js';
import {
  ResearchRun, RunEvent, RunStatus, RunStageName, StageRecord, ResearchQuestion,
  CorpusSnapshot, SourceDocument, ScientificClaim, EvidenceRelation, HypothesisCandidate,
  HypothesisScorecard, ResearchPlan, FeedbackSignal, Revision, VersionDiff,
  ProvenanceReceipt, ReproducibilityBundle, newId,
} from '../domain/index.js';
import { z } from 'zod';

/** Domain object kinds stored in the generic objects table, with their canonical schemas (fail-closed reads). */
const KIND_SCHEMAS = {
  question: ResearchQuestion,
  corpus_snapshot: CorpusSnapshot,
  source_document: SourceDocument,
  claim: ScientificClaim,
  evidence_relation: EvidenceRelation,
  hypothesis: HypothesisCandidate,
  scorecard: HypothesisScorecard,
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
    });
    this.appendEvent(run.id, { type: 'run_created', status: 'created', detail: { questionId: question.id } });
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

  integrity(): string {
    return this.db.integrityCheck();
  }
}

const STAGE_ALL: readonly RunStageName[] = [
  'scope', 'retrieve', 'verify_sources', 'build_evidence', 'generate_hypotheses',
  'critique_falsify', 'rank', 'plan', 'feedback', 'revise', 'export',
];
export { STAGE_ALL };
export type { StageRecord, ResearchRun };
