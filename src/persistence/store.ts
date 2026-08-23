import type { Db } from './db.js';
import {
  ResearchRun, RunEvent, RunStatus, RunStageName, StageRecord, ResearchQuestion,
  CorpusSnapshot, SourceDocument, ScientificClaim, EvidenceRelation, HypothesisCandidate,
  HypothesisScorecard, HypothesisTournament, ResearchPlan, FeedbackSignal, Revision, VersionDiff,
  ProvenanceReceipt, ReproducibilityBundle, newId,
  ExperimentSpec, ExperimentRun, DatasetRecord, ResultSet, StatReport,
  ModelProviderConfig, AgentSession, AgentReport,
  EvidenceBody, AchAnalysis, LedgerEntry,
  MetaAnalysisSpec, EffectEstimateRecord,
  ConversationSchema,
  AutomationSchema,
  ToolIntegrationSchema,
  IterationRecord,
  ScreeningSession,
  ScreeningDecision,
} from '../domain/index.js';
import { z } from 'zod';
import { STAGE_ORDER } from '../domain/run.js';
import { LineageEdgeRecordSchema, LINEAGE_COUNTER_RELATIONS, eventTagsFor, type LineageEdgeKind, type LineageEdgeRecord } from '../domain/lineage.js';
import { MemoryItemSchema, MEMORY_LIFECYCLE, memoryActivation, type MemoryItem, type MemoryKind, type MemoryStatus, type MemoryTrustClass } from '../domain/memory.js';

export type { LineageEdgeKind, LineageEdgeRecord };

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
  experiment_spec: ExperimentSpec,
  experiment_run: ExperimentRun,
  dataset_record: DatasetRecord,
  result_set: ResultSet,
  stat_report: StatReport,
  model_config: ModelProviderConfig,
  agent_session: AgentSession,
  agent_report: AgentReport,
  evidence_body: EvidenceBody,
  ach_analysis: AchAnalysis,
  prediction: LedgerEntry,
  meta_spec: MetaAnalysisSpec,
  effect_estimate: EffectEstimateRecord,
  conversation: ConversationSchema,
  automation: AutomationSchema,
  tool_integration: ToolIntegrationSchema,
  iteration: IterationRecord,
  screening_session: ScreeningSession,
  screening_decision: ScreeningDecision,
} as const;

export type ObjectKind = keyof typeof KIND_SCHEMAS & (string & {});
type AnySchema = (typeof KIND_SCHEMAS)[ObjectKind];
export type DomainObject<K extends ObjectKind> = z.infer<(typeof KIND_SCHEMAS)[K]>;

/**
 * Single authoritative persistence facade (D-004): SQLite owns mutable run/domain state;
 * events are append-only audit; objects are re-validated by their zod schema on read
 * (corrupt/mismatched rows fail closed instead of silently propagating).
 */
export interface SearchHit {
  runId: string;
  id: string;
  text: string;
  /** FTS5 snippet with «hit» markers (present on the FTS path only). */
  snippet?: string;
  /** bm25 rank (lower = more relevant; present on the FTS path only). */
  rank?: number;
}

export class Store {
  private ftsReady = false;

  constructor(private readonly db: Db) {
    this.backfillLineage();
  }

  /**
   * FTS5 mirror for universal search (D-101): one contentless-ish table over
   * the three searchable kinds. Built lazily on first search; kept in sync by
   * re-indexing the touched kind (delete+reinsert is cheap at our scale —
   * hundreds of objects per kind — and avoids trigger drift across the
   * INSERT OR REPLACE write path). Runtimes without FTS5 degrade to LIKE
   * (searchText already handles that).
   */
  private ensureFts(): void {
    if (this.ftsReady) return;
    try {
      this.db.prepare(
        'CREATE VIRTUAL TABLE IF NOT EXISTS far_search USING fts5(kind UNINDEXED, obj_id UNINDEXED, body, tokenize = \'unicode61\')',
      ).run();
      this.reindexFts('question');
      this.reindexFts('hypothesis');
      this.reindexFts('claim');
      this.reindexFts('conversation');
      this.ftsReady = true;
    } catch {
      this.ftsReady = false; // stays on the LIKE path
    }
  }

  private reindexFts(kind: string): void {
    const rows = this.db.prepare('SELECT id, json FROM objects WHERE kind=?').all(kind);
    this.db.prepare('DELETE FROM far_search WHERE kind=?').run(kind);
    const insert = this.db.prepare('INSERT INTO far_search (kind, obj_id, body) VALUES (?,?,?)');
    const textOf = (json: string): string => {
      const parsed = JSON.parse(json) as { text?: unknown; statement?: unknown; title?: unknown };
      return String(parsed.text ?? parsed.statement ?? parsed.title ?? '');
    };
    for (const r of rows) {
      const body = textOf(String(r.json));
      if (body.length > 0) insert.run(kind, String(r.id), body);
    }
  }

  /** Object kinds whose text is mirrored into far_search — single source for mirror writes AND deletes.
   *  'conversation' mirrors its title so the palette (Ctrl+K) finds chats too —
   *  the unified-timeline rule: every record surface is reachable from search. */
  private static readonly FTS_MIRRORED_KINDS: ReadonlySet<string> = new Set(['question', 'hypothesis', 'claim', 'conversation']);

  /** Called after object writes to keep the FTS mirror fresh (best-effort). */
  private touchFts(kind: string): void {
    if (!Store.FTS_MIRRORED_KINDS.has(kind)) return;
    if (!this.ftsReady) return;
    try {
      this.reindexFts(kind);
    } catch {
      // Mirror drift only costs ranking freshness until the next full reindex.
    }
  }

  // ---- runs (transactional mutable authority) ----

  createRun(question: ResearchQuestion, opts: { providerConfigId?: string } = {}, now = new Date().toISOString()): ResearchRun {
    const run: ResearchRun = ResearchRun.parse({
      id: newId('run'), questionId: question.id, status: 'created', currentStage: 'scope',
      stages: STAGE_ALL.map((stage) => ({ stage, state: 'pending' })),
      createdAt: now, updatedAt: now, tags: [],
      ...(opts.providerConfigId !== undefined ? { providerConfigId: opts.providerConfigId } : {}),
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

  appendEvent(runId: string, e: { type: RunEvent['type']; status?: RunStatus; stage?: string; detail?: Record<string, unknown>; receiptId?: string }, at = new Date().toISOString()): RunEvent {
    const payload = {
      runId, at, type: e.type, status: e.status, stage: e.stage,
      detail: e.detail ?? {}, receiptId: e.receiptId,
    };
    // RU-2 G6: event + tags are one atomic write — a tagged spine half-filled
    // after a crash would silently under-report to events.query.
    const seq = this.db.transaction(() => {
      const res = this.db.prepare('INSERT INTO events (run_id, at, type, payload) VALUES (?,?,?,?)')
        .run(runId, at, e.type, JSON.stringify(payload));
      const seq = Number(res.lastInsertRowid);
      const insertTag = this.db.prepare('INSERT OR IGNORE INTO event_tags (tag, run_id, seq) VALUES (?,?,?)');
      for (const tag of eventTagsFor({ type: e.type, stage: e.stage })) insertTag.run(tag, runId, seq);
      return seq;
    });
    return RunEvent.parse({ ...payload, seq });
  }

  /**
   * Tag query plane (RU-2 G6): ANY-of tag match with optional run scoping and
   * keyset pagination. Cross-run ordering is (run_id, seq) — per-run seq is only
   * monotonic within its run. Limit clamps at 200 (model-facing budget guard).
   */
  queryEvents(opts: { tags: string[]; runId?: string; afterSeq?: number; limit?: number }): RunEvent[] {
    if (opts.tags.length === 0) throw new Error('queryEvents: at least one tag required');
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);
    const tags = opts.tags.map((t) => {
      if (!/^[a-z0-9_]+:[a-z0-9_-]+$/.test(t)) throw new Error(`queryEvents: malformed tag '${t}' (expected kind:*|stage:*)`);
      return t;
    });
    const placeholders = tags.map(() => '?').join(',');
    const where = [`tag IN (${placeholders})`];
    const params: unknown[] = [...tags];
    if (opts.runId !== undefined) { where.push('run_id=?'); params.push(opts.runId); }
    if (opts.afterSeq !== undefined) { where.push('seq>?'); params.push(opts.afterSeq); }
    const rows = this.db.prepare(
      `SELECT DISTINCT run_id, seq FROM event_tags WHERE ${where.join(' AND ')} ORDER BY run_id, seq LIMIT ${limit}`,
    ).all(...params);
    if (rows.length === 0) return [];
    // Fetch each matched event's payload, preserving (run_id, seq) order.
    const out: RunEvent[] = [];
    for (const r of rows) {
      const row = this.db.prepare('SELECT seq, payload FROM events WHERE run_id=? AND seq=?').get(String(r.run_id), Number(r.seq));
      if (!row) continue; // deleted-event hole: skip honestly
      const p = JSON.parse(String(row.payload)) as Record<string, unknown>;
      out.push(RunEvent.parse({ ...p, seq: Number(row.seq) }));
    }
    return out;
  }

  listEvents(runId: string): RunEvent[] {
    return this.db.prepare('SELECT seq, payload FROM events WHERE run_id=? ORDER BY seq ASC').all(runId)
      .map((r) => {
        const p = JSON.parse(String(r.payload)) as Record<string, unknown>;
        return RunEvent.parse({ ...p, seq: Number(r.seq) });
      });
  }

  /** Events with seq strictly greater than the cursor (B3 SSE incremental feed). */
  listEventsAfter(runId: string, afterSeq: number): RunEvent[] {
    return this.db.prepare('SELECT seq, payload FROM events WHERE run_id=? AND seq>? ORDER BY seq ASC').all(runId, afterSeq)
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
    this.touchFts(kind);
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

  /** Hard delete of one stored object; false when nothing matched (idempotent).
   *  FTS mirror rows for mirrored kinds are dropped with the object, or search
   *  would keep returning deleted questions/hypotheses/claims/conversations.
   *  Gated on ftsReady: the mirror table is created lazily by the first search,
   *  and the LIKE path reads objects directly — no mirror to clean when FTS
   *  never initialized. */
  deleteObject(kind: ObjectKind, id: string): boolean {
    const res = this.db.prepare('DELETE FROM objects WHERE kind=? AND id=?').run(kind, id);
    if (Number(res.changes) !== 1) return false;
    if (Store.FTS_MIRRORED_KINDS.has(kind) && this.ftsReady) {
      this.db.prepare('DELETE FROM far_search WHERE kind=? AND obj_id=?').run(kind, id);
    }
    return true;
  }

  /** Lifecycle surface for the researcher: hard-delete one run and every row it
   *  owns — domain objects (incl. their far_search mirror rows), the append-only
   *  event stream, and both checkpoint tables — in ONE transaction so a crash can
   *  never leave a half-deleted run. Workspace-scoped objects (run_id='__none__',
   *  e.g. conversations and their questions) are never touched. Returns null when
   *  the run does not exist; callers decide the HTTP semantics. */
  deleteRunCascade(runId: string): { events: number; objects: number; checkpoints: number; searchRows: number } | null {
    const run = this.getRun(runId);
    if (run === null) return null;
    this.ensureFts(); // mirror table is lazy; absent + !ftsReady -> no mirror rows exist
    const counts = { events: 0, objects: 0, checkpoints: 0, searchRows: 0 };
    this.db.transaction(() => {
      const mirrored = this.db.prepare(
        'SELECT id FROM objects WHERE run_id=? AND kind IN (\'question\',\'hypothesis\',\'claim\')',
      ).all(runId) as Array<{ id: string }>;
      if (this.ftsReady) {
        const dropSearch = this.db.prepare('DELETE FROM far_search WHERE kind=? AND obj_id=?');
        for (const r of mirrored) {
          counts.searchRows += Number(dropSearch.run('question', r.id).changes)
            + Number(dropSearch.run('hypothesis', r.id).changes)
            + Number(dropSearch.run('claim', r.id).changes);
        }
      }
      counts.objects = Number(this.db.prepare('DELETE FROM objects WHERE run_id=?').run(runId).changes);
      counts.events = Number(this.db.prepare('DELETE FROM events WHERE run_id=?').run(runId).changes);
      counts.checkpoints = Number(this.db.prepare('DELETE FROM step_outputs WHERE run_id=?').run(runId).changes)
        + Number(this.db.prepare('DELETE FROM step_fingerprints WHERE run_id=?').run(runId).changes);
      this.db.prepare('DELETE FROM runs WHERE id=?').run(runId);
    });
    return counts;
  }

  // ---- meta KV (workspace-level facts: active model config, ...) ----

  /** Every sha256:<64-hex> artifact reference persisted in objects/runs rows —
   *  the reference truth `far gc` sweeps against (content-addressed store). */
  referencedArtifactHashes(): Set<string> {
    const refs = new Set<string>();
    const re = /sha256:([0-9a-f]{64})/g;
    for (const sql of ['SELECT json AS doc FROM objects', 'SELECT doc FROM runs']) {
      for (const row of this.db.prepare(sql).all()) {
        const text = String(Object.values(row as Record<string, unknown>)[0]);
        for (const m of text.matchAll(re)) refs.add(m[1] as string);
      }
    }
    return refs;
  }

  getMeta(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM meta WHERE key=?').get(key);
    return row === undefined ? null : String(row.value);
  }

  setMeta(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?,?)').run(key, value);
  }

  deleteMeta(key: string): void {
    this.db.prepare('DELETE FROM meta WHERE key=?').run(key);
  }

  /**
   * Cross-run search over researcher-meaningful object text (B2 universal
   * search; FTS5 upgrade D-101): SQLite's built-in full-text engine gives
   * bm25 relevance ranking and snippet() highlighting with ZERO new
   * dependencies (ENABLE_FTS5 verified on the Node 24 runtime). unicode61
   * tokenizes CJK runs as sequences, so CJK queries match too; any tokenized
   * miss falls back to the original LIKE substring path (which also keeps
   * pre-FTS5 Node runtimes honest). Results carry { runId, id, text, snippet,
   * rank } — the API layer keeps its shape; snippets/rank ride along.
   */
  searchText(
    q: string,
    limits: { questions: number; hypotheses: number; claims: number; conversations?: number },
  ): {
    questions: SearchHit[]; hypotheses: SearchHit[]; claims: SearchHit[]; conversations?: SearchHit[];
  } {
    this.ensureFts();
    interface Row { run_id: string; id: string; json: string; snippet?: string; rank?: number }
    const fetch = (kind: 'question' | 'hypothesis' | 'claim' | 'conversation', limit: number): SearchHit[] => {
      if (limit <= 0) return [];
      const parse = (r: Row): SearchHit => {
        const parsed = KIND_SCHEMAS[kind].parse(JSON.parse(String(r.json))) as unknown as {
          id: string; runId?: string; text?: string; statement?: string; title?: string;
        };
        return {
          runId: String(r.run_id), id: String(r.id),
          text: String(parsed.text ?? parsed.statement ?? parsed.title ?? ''),
          ...(r.snippet !== undefined ? { snippet: String(r.snippet) } : {}),
          ...(r.rank !== undefined ? { rank: Number(r.rank) } : {}),
        };
      };
      // 1) FTS5 path: rank by bm25, snippet around the match column.
      // NOTE: snippet()'s column argument is an INTEGER INDEX (kind=0,
      // obj_id=1, body=2) — a column-name expression silently resolves to 0
      // and snippets the wrong column (live-isolated during D-101).
      const ftsQuery = `"${q.replace(/"/g, '""')}"`; // phrase — substring semantics preserved per token run
      try {
        const rows = this.db.prepare(
          `SELECT o.run_id AS run_id, o.id, o.json, snippet(far_search, 2, '«', '»', '…', 12) AS snippet, rank
             FROM far_search f JOIN objects o ON o.id = f.obj_id AND o.kind = f.kind
            WHERE far_search MATCH ? AND f.kind = ?
            ORDER BY rank LIMIT ?`,
        ).all(ftsQuery, kind, limit) as unknown as Row[];
        if (rows.length > 0) return rows.map(parse);
      } catch {
        // FTS5 unavailable (pre-Node-24 runtime) — fall through to LIKE below.
      }
      // 2) LIKE fallback (and FTS-miss safety net for odd tokenization).
      const esc = q.replace(/[\\%_]/g, (c) => `\\${c}`);
      const rows = this.db
        .prepare(
          "SELECT run_id, id, json FROM objects WHERE kind=? AND json LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT ?",
        )
        .all(kind, `%${esc}%`, limit) as unknown as Row[];
      return rows.map(parse);
    };
    // ResearchQuestion carries no runId in its payload, so its objects row is
    // stored under '__none__'; the question->run association lives in the run
    // doc (questionId). Resolve it so search results are navigable to a run.
    const questionOwner = new Map<string, string>();
    if (limits.questions > 0) {
      for (const row of this.db.prepare('SELECT id, doc FROM runs').all() as { id: string; doc: string }[]) {
        const run = JSON.parse(row.doc) as { questionId?: string };
        if (typeof run.questionId === 'string') questionOwner.set(run.questionId, row.id);
      }
    }
    const questions = fetch('question', limits.questions)
      .flatMap((hit) => {
        const owner = questionOwner.get(hit.id);
        return owner === undefined ? [] : [{ ...hit, runId: owner }];
      });
    return {
      questions,
      hypotheses: fetch('hypothesis', limits.hypotheses),
      claims: fetch('claim', limits.claims),
      ...(limits.conversations !== undefined ? { conversations: fetch('conversation', limits.conversations) } : {}),
    };
  }

  /**
   * D-085 P0-2: experiment state transitions write the object projection AND the audit
   * event in ONE transaction — a crash between the two must not be expressible.
   * Restricted to objects carrying a runId (all experiment kinds do).
   */
  putObjectEvented<K extends ObjectKind>(
    kind: K,
    obj: DomainObject<K>,
    event: { type: RunEvent['type']; detail?: Record<string, unknown> },
    at = new Date().toISOString(),
  ): void {
    const runId = (obj as { runId?: string }).runId;
    if (runId === undefined) throw new Error(`putObjectEvented: kind ${kind} has no runId`);
    this.db.transaction(() => {
      this.putObject(kind, obj);
      this.appendEvent(runId, event, at);
    });
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

  // ---- lineage edges (RU-2 G3: authoritative persisted lineage) ----

  recordLineageEdge(edge: { fromId: string; toId: string; kind: LineageEdgeKind; runId: string; at?: string }): void {
    LineageEdgeRecordSchema.parse({ fromId: edge.fromId, toId: edge.toId, kind: edge.kind, runId: edge.runId, at: edge.at ?? new Date().toISOString() });
    this.db.prepare('INSERT OR IGNORE INTO lineage_edges (from_id, to_id, kind, run_id, at) VALUES (?,?,?,?,?)')
      .run(edge.fromId, edge.toId, edge.kind, edge.runId, edge.at ?? new Date().toISOString());
  }

  listLineageEdges(filter: { toId?: string; fromId?: string; kind?: LineageEdgeKind; runId?: string } = {}): LineageEdgeRecord[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.toId !== undefined) { where.push('to_id=?'); params.push(filter.toId); }
    if (filter.fromId !== undefined) { where.push('from_id=?'); params.push(filter.fromId); }
    if (filter.kind !== undefined) { where.push('kind=?'); params.push(filter.kind); }
    if (filter.runId !== undefined) { where.push('run_id=?'); params.push(filter.runId); }
    const sql = `SELECT from_id, to_id, kind, run_id, at FROM lineage_edges${where.length > 0 ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY at`;
    return this.db.prepare(sql).all(...params).map((r) => ({
      fromId: String(r.from_id), toId: String(r.to_id), kind: String(r.kind) as LineageEdgeKind,
      runId: String(r.run_id), at: String(r.at),
    }));
  }

  /**
   * One-time deterministic backfill (idempotent, count-guarded): populate
   * lineage_edges from existing object payloads and event_tags from existing
   * events so pre-v5 history joins the queryable spine. Runs on first open of a
   * migrated db; later opens skip via the count checks.
   */
  private backfillLineage(): void {
    const tagCount = Number(this.db.prepare('SELECT COUNT(*) AS n FROM event_tags').get()?.n ?? 0);
    if (tagCount === 0) {
      const eventCount = Number(this.db.prepare('SELECT COUNT(*) AS n FROM events').get()?.n ?? 0);
      if (eventCount > 0) {
        this.db.transaction(() => {
          const insertTag = this.db.prepare('INSERT OR IGNORE INTO event_tags (tag, run_id, seq) VALUES (?,?,?)');
          for (const r of this.db.prepare('SELECT seq, run_id, payload FROM events').all()) {
            const p = JSON.parse(String(r.payload)) as { type?: string; stage?: string };
            if (p.type === undefined) continue;
            for (const tag of eventTagsFor({ type: p.type, stage: p.stage })) insertTag.run(tag, String(r.run_id), Number(r.seq));
          }
        });
      }
    }
    const edgeCount = Number(this.db.prepare('SELECT COUNT(*) AS n FROM lineage_edges').get()?.n ?? 0);
    if (edgeCount === 0) {
      this.db.transaction(() => {
        const edge = (fromId: string, toId: string, kind: LineageEdgeKind, runId: string, at: string): void => {
          this.db.prepare('INSERT OR IGNORE INTO lineage_edges (from_id, to_id, kind, run_id, at) VALUES (?,?,?,?,?)').run(fromId, toId, kind, runId, at);
        };
        // evidence relations -> hypothesis/claim (counter vs support)
        for (const r of this.db.prepare(`SELECT run_id, json FROM objects WHERE kind='evidence_relation'`).all()) {
          const rel = JSON.parse(String(r.json)) as { id?: string; relation?: string; targetHypothesisId?: string; targetClaimId?: string; createdAt?: string };
          const target = rel.targetHypothesisId ?? rel.targetClaimId;
          if (rel.id === undefined || target === undefined || rel.relation === undefined) continue;
          edge(rel.id, target, LINEAGE_COUNTER_RELATIONS.has(rel.relation) ? 'counter_evidence' : 'support_evidence', String(r.run_id), rel.createdAt ?? new Date().toISOString());
        }
        // revisions -> feedback + touched objects
        for (const r of this.db.prepare(`SELECT run_id, json FROM objects WHERE kind='revision'`).all()) {
          const rev = JSON.parse(String(r.json)) as { id?: string; triggerFeedbackId?: string; createdAt?: string; operations?: Array<{ objectId?: string }> };
          if (rev.id === undefined) continue;
          const at = rev.createdAt ?? new Date().toISOString();
          if (rev.triggerFeedbackId !== undefined) edge(rev.triggerFeedbackId, rev.id, 'caused_revision', String(r.run_id), at);
          for (const op of rev.operations ?? []) {
            if (op.objectId !== undefined) edge(rev.id, op.objectId, 'revises', String(r.run_id), at);
          }
        }
        // run revision chains (parentRunId in run docs; none written today, but
        // backfill honestly covers any that exist). Unparseable/corrupted docs are
        // SKIPPED here — derived-data reconstruction must not crash every open;
        // the authoritative read path (getRun) still fails closed on them.
        for (const r of this.db.prepare('SELECT id, doc FROM runs').all()) {
          let run: { parentRunId?: string; createdAt?: string };
          try {
            run = JSON.parse(String(r.doc)) as { parentRunId?: string; createdAt?: string };
          } catch {
            continue;
          }
          if (run.parentRunId !== undefined) edge(run.parentRunId, String(r.id), 'revised_into', String(r.id), run.createdAt ?? new Date().toISOString());
        }
      });
    }
  }

  // ---- research memory (RU-1: governed cross-run substrate in far.db) ----

  /**
   * Write gate (poisoning co-design, RU-1/RU-3): zod governance + SQL CHECKs +
   * provenance resolvability. own_verified REQUIRES an existing run AND a
   * receipt that actually exists in that run — unresolvable provenance fences
   * to own_unverified (honest, never fabricated authority).
   */
  putMemory(item: MemoryItem): void {
    const parsed = MemoryItemSchema.parse(item);
    let trustClass = parsed.trustClass;
    if (trustClass === 'own_verified') {
      const runExists = this.getRun(parsed.provenance.runId ?? '') !== null;
      const receiptExists =
        parsed.provenance.runId !== undefined && parsed.provenance.receiptId !== undefined &&
        this.listObjects('receipt', parsed.provenance.runId).some((r) => (r as { id?: string }).id === parsed.provenance.receiptId);
      if (!runExists || !receiptExists) trustClass = 'own_unverified';
    }
    this.db.transaction(() => {
      this.db.prepare(
        `INSERT OR REPLACE INTO memory_items
         (id, kind, entity_type, title, body, status, outcome, failure_reason, trust_class, taint,
          run_id, receipt_id, source_ref, created_at, last_accessed_at, access_count, supersedes_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        parsed.id, parsed.kind, parsed.entityType, parsed.title, parsed.body, parsed.status,
        parsed.outcome ?? null, parsed.failureReason ?? null, trustClass, parsed.taint,
        parsed.provenance.runId ?? null, parsed.provenance.receiptId ?? null, parsed.provenance.sourceRef ?? null,
        parsed.createdAt, parsed.lastAccessedAt, parsed.accessCount, parsed.supersedesId ?? null,
      );
      this.db.prepare('INSERT INTO memory_fts (id, body) VALUES (?,?)').run(parsed.id, `${parsed.title}\n${parsed.body}`);
    });
  }

  getMemory(id: string): MemoryItem | null {
    const r = this.db.prepare('SELECT * FROM memory_items WHERE id=?').get(id);
    if (!r) return null;
    return this.memoryFromRow(r);
  }

  listMemory(filter: { kind?: MemoryKind; status?: MemoryStatus; runId?: string; limit?: number } = {}): MemoryItem[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.kind !== undefined) { where.push('kind=?'); params.push(filter.kind); }
    if (filter.status !== undefined) { where.push('status=?'); params.push(filter.status); }
    if (filter.runId !== undefined) { where.push('run_id=?'); params.push(filter.runId); }
    const limit = Math.min(filter.limit ?? 100, 500);
    const rows = this.db.prepare(
      `SELECT * FROM memory_items${where.length > 0 ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT ${limit}`,
    ).all(...params);
    return rows.map((r) => this.memoryFromRow(r));
  }

  /**
   * Retrieval with deterministic ranking (ACT-R activation) + trust filtering.
   * FTS5 phrase match with LIKE fallback (same degrade contract as searchText).
   * Hits update last_accessed_at/access_count (activation input) best-effort.
   */
  searchMemory(opts: { query: string; kinds?: MemoryKind[]; trustClasses?: MemoryTrustClass[]; limit?: number; mode?: 'phrase' | 'or' }): MemoryItem[] {
    const limit = Math.min(opts.limit ?? 20, 100);
    const ids = new Set<string>();
    if (opts.mode === 'or') {
      // keyword OR semantics: sanitized bare tokens joined with OR (question-derived
      // keywords are unordered; a phrase match would demand adjacency they lack).
      const tokens = opts.query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
      if (tokens.length > 0) {
        const ftsOr = tokens.map((t) => `"${t}"`).join(' OR ');
        try {
          for (const r of this.db.prepare('SELECT id FROM memory_fts WHERE memory_fts MATCH ? LIMIT 200').all(ftsOr)) {
            ids.add(String(r.id));
          }
        } catch {
          // FTS5 unavailable — LIKE fallback below via the per-token miss path
        }
        if (ids.size === 0) {
          for (const t of tokens) {
            const like = `%${t.replace(/[%_]/g, '')}%`;
            for (const r of this.db.prepare('SELECT id FROM memory_items WHERE title LIKE ? OR body LIKE ? LIMIT 50').all(like, like)) {
              ids.add(String(r.id));
            }
          }
        }
      }
    } else {
      const ftsQuery = `"${opts.query.replace(/"/g, '""')}"`;
      try {
        for (const r of this.db.prepare('SELECT id FROM memory_fts WHERE memory_fts MATCH ? LIMIT 200').all(ftsQuery)) {
          ids.add(String(r.id));
        }
      } catch {
        // FTS5 unavailable — LIKE fallback keeps retrieval honest
      }
      if (ids.size === 0) {
        const like = `%${opts.query.replace(/[%_]/g, '')}%`;
        for (const r of this.db.prepare('SELECT id FROM memory_items WHERE title LIKE ? OR body LIKE ? LIMIT 200').all(like, like)) {
          ids.add(String(r.id));
        }
      }
    }
    if (ids.size === 0) return [];
    const where: string[] = [`id IN (${[...ids].map(() => '?').join(',')})`];
    const params: unknown[] = [...ids];
    if (opts.kinds !== undefined && opts.kinds.length > 0) { where.push(`kind IN (${opts.kinds.map(() => '?').join(',')})`); params.push(...opts.kinds); }
    if (opts.trustClasses !== undefined && opts.trustClasses.length > 0) { where.push(`trust_class IN (${opts.trustClasses.map(() => '?').join(',')})`); params.push(...opts.trustClasses); }
    const rows = this.db.prepare(`SELECT * FROM memory_items WHERE ${where.join(' AND ')} AND status = 'active'`).all(...params);
    const nowMs = Date.now();
    const ranked = rows
      .map((r) => this.memoryFromRow(r))
      .sort((a, b) => memoryActivation(b, nowMs) - memoryActivation(a, nowMs))
      .slice(0, limit);
    // best-effort access accounting (activation input, not authority)
    for (const m of ranked) {
      this.db.prepare('UPDATE memory_items SET last_accessed_at=?, access_count=access_count+1 WHERE id=?')
        .run(new Date().toISOString(), m.id);
    }
    return ranked;
  }

  /** Append-only supersession: new item replaces old; old is marked, never deleted. */
  supersedeMemory(oldId: string, replacement: MemoryItem): void {
    const old = this.getMemory(oldId);
    if (old === null) throw new Error(`supersedeMemory: no such memory item ${oldId}`);
    if (!MEMORY_LIFECYCLE[old.status].includes('superseded')) {
      throw new Error(`supersedeMemory: lifecycle forbids ${old.status} -> superseded`);
    }
    const marked = MemoryItemSchema.parse({ ...old, status: 'superseded' });
    const next = MemoryItemSchema.parse({ ...replacement, supersedesId: oldId });
    this.db.transaction(() => {
      this.putMemory(marked);
      this.putMemory(next);
      this.db.prepare('INSERT OR IGNORE INTO memory_edges (from_id, to_id, relation_type, at) VALUES (?,?,?,?)')
        .run(oldId, next.id, 'supersedes', next.createdAt);
    });
  }

  private memoryFromRow(r: Record<string, unknown>): MemoryItem {
    return MemoryItemSchema.parse({
      id: String(r.id), kind: String(r.kind), entityType: String(r.entity_type),
      title: String(r.title), body: String(r.body), status: String(r.status),
      ...(r.outcome !== null && r.outcome !== undefined ? { outcome: String(r.outcome) } : {}),
      ...(r.failure_reason !== null && r.failure_reason !== undefined ? { failureReason: String(r.failure_reason) } : {}),
      trustClass: String(r.trust_class), taint: String(r.taint),
      provenance: {
        ...(r.run_id !== null && r.run_id !== undefined ? { runId: String(r.run_id) } : {}),
        ...(r.receipt_id !== null && r.receipt_id !== undefined ? { receiptId: String(r.receipt_id) } : {}),
        ...(r.source_ref !== null && r.source_ref !== undefined ? { sourceRef: String(r.source_ref) } : {}),
      },
      createdAt: String(r.created_at), lastAccessedAt: String(r.last_accessed_at),
      accessCount: Number(r.access_count ?? 0),
      ...(r.supersedes_id !== null && r.supersedes_id !== undefined ? { supersedesId: String(r.supersedes_id) } : {}),
    });
  }
}

// Single source of truth is the domain's STAGE_ORDER (Wave-G WP2: three independent
// copies of the stage list — store, composition import map, domain — silently drift;
// consumers that need "all stages" must derive from here).
const STAGE_ALL: readonly RunStageName[] = STAGE_ORDER;
export { STAGE_ALL };
export type { StageRecord, ResearchRun };
