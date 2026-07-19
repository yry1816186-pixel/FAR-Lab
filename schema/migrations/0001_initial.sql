PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_meta (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS call_records (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  stage_id TEXT NOT NULL,
  payload_kind TEXT NOT NULL
    CHECK (payload_kind IN (
      'hypothesis', 'experiment', 'observation', 'citation',
      'plan', 'feedback', 'understanding', 'integration', 'meta'
    )),
  purpose_tag TEXT NOT NULL
    CHECK (purpose_tag IN (
      'hypothesis', 'narrative', 'viz_select', 'code_gen', 'dialogue',
      'eval', 'scoring', 'gt_read',
      'baseline_exempt'
    )),
  model_id TEXT NOT NULL,
  dashscope_request_id TEXT,
  repro_hash TEXT NOT NULL,
  git_commit_sha TEXT NOT NULL,
  iso_timestamp TEXT NOT NULL,
  request_payload TEXT NOT NULL,
  response_payload TEXT NOT NULL,
  response_payload_hash TEXT,
  finish_reason TEXT NOT NULL
    CHECK (finish_reason IN (
      'stop', 'length', 'tool_calls', 'function_call', 'content_filter'
    )),
  usage_tokens_total INTEGER,
  prev_hash TEXT NOT NULL,
  current_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_call_records_stage ON call_records (stage_id);
CREATE INDEX IF NOT EXISTS idx_call_records_payload ON call_records (payload_kind);
CREATE INDEX IF NOT EXISTS idx_call_records_model ON call_records (model_id);
CREATE INDEX IF NOT EXISTS idx_call_records_req ON call_records (dashscope_request_id);
CREATE INDEX IF NOT EXISTS idx_call_records_purpose ON call_records (purpose_tag);

CREATE TRIGGER IF NOT EXISTS trg_call_records_no_update
BEFORE UPDATE ON call_records
BEGIN
  SELECT RAISE(ABORT, 'call_records is append-only: UPDATE forbidden');
END;

CREATE TRIGGER IF NOT EXISTS trg_call_records_no_delete
BEFORE DELETE ON call_records
BEGIN
  SELECT RAISE(ABORT, 'call_records is append-only: DELETE forbidden');
END;

CREATE TABLE IF NOT EXISTS evidence_log (
  evidence_id TEXT PRIMARY KEY,
  call_record_seq INTEGER NOT NULL REFERENCES call_records (seq) ON DELETE RESTRICT,
  stage_id TEXT NOT NULL,
  payload_kind TEXT NOT NULL
    CHECK (payload_kind IN (
      'hypothesis', 'experiment', 'observation', 'citation',
      'plan', 'feedback', 'understanding', 'integration', 'meta'
    )),
  evidence_payload TEXT NOT NULL,
  source_anchor TEXT NOT NULL,
  source_anchor_git TEXT NOT NULL,
  source_anchor_req TEXT,
  source_anchor_ts TEXT NOT NULL,
  source_anchor_path TEXT,
  source_anchor_lineno INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_evidence_log_call_seq ON evidence_log (call_record_seq);
CREATE INDEX IF NOT EXISTS idx_evidence_log_stage ON evidence_log (stage_id);
CREATE INDEX IF NOT EXISTS idx_evidence_log_payload ON evidence_log (payload_kind);
CREATE INDEX IF NOT EXISTS idx_evidence_log_git ON evidence_log (source_anchor_git);
CREATE INDEX IF NOT EXISTS idx_evidence_log_req ON evidence_log (source_anchor_req);

CREATE TRIGGER IF NOT EXISTS trg_evidence_log_no_update
BEFORE UPDATE ON evidence_log
BEGIN
  SELECT RAISE(ABORT, 'evidence_log is append-only: UPDATE forbidden');
END;

CREATE TRIGGER IF NOT EXISTS trg_evidence_log_no_delete
BEFORE DELETE ON evidence_log
BEGIN
  SELECT RAISE(ABORT, 'evidence_log is append-only: DELETE forbidden');
END;

CREATE TABLE IF NOT EXISTS verdict_nodes (
  verdict_id TEXT PRIMARY KEY,
  evidence_id TEXT NOT NULL REFERENCES evidence_log (evidence_id) ON DELETE RESTRICT,
  parent_verdict_id TEXT REFERENCES verdict_nodes (verdict_id) ON DELETE RESTRICT,
  node_kind TEXT NOT NULL
    CHECK (node_kind IN (
      'hypothesis', 'evidence', 'method', 'plan', 'feedback', 'root'
    )),
  verdict TEXT NOT NULL
    CHECK (verdict IN (
      'CONFIRMED', 'REFUTED', 'INCONCLUSIVE', 'DEGRADED_SCOPE', 'UNTESTED'
    )),
  falsification_spec TEXT NOT NULL,
  threshold_spec TEXT,
  metric_value REAL,
  conflicting_evidence_count INTEGER NOT NULL DEFAULT 0,
  scope_slip_text TEXT,
  untested_reason TEXT,
  source_anchor TEXT NOT NULL,
  replay_prover TEXT,
  prev_hash TEXT NOT NULL,
  current_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_verdict_nodes_evidence ON verdict_nodes (evidence_id);
CREATE INDEX IF NOT EXISTS idx_verdict_nodes_parent ON verdict_nodes (parent_verdict_id);
CREATE INDEX IF NOT EXISTS idx_verdict_nodes_kind ON verdict_nodes (node_kind);
CREATE INDEX IF NOT EXISTS idx_verdict_nodes_verdict ON verdict_nodes (verdict);

CREATE TRIGGER IF NOT EXISTS trg_verdict_nodes_immutable_fields
BEFORE UPDATE ON verdict_nodes
FOR EACH ROW
WHEN OLD.evidence_id IS NOT NEW.evidence_id
  OR OLD.parent_verdict_id IS NOT NEW.parent_verdict_id
  OR OLD.node_kind IS NOT NEW.node_kind
  OR OLD.falsification_spec IS NOT NEW.falsification_spec
  OR OLD.threshold_spec IS NOT NEW.threshold_spec
  OR OLD.conflicting_evidence_count IS NOT NEW.conflicting_evidence_count
  OR OLD.scope_slip_text IS NOT NEW.scope_slip_text
  OR OLD.untested_reason IS NOT NEW.untested_reason
  OR OLD.source_anchor IS NOT NEW.source_anchor
  OR OLD.replay_prover IS NOT NEW.replay_prover
  OR OLD.prev_hash IS NOT NEW.prev_hash
  OR OLD.current_hash IS NOT NEW.current_hash
  OR OLD.created_at IS NOT NEW.created_at
BEGIN
  SELECT RAISE(ABORT, 'verdict_nodes: only verdict/metric_value/updated_at are mutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_verdict_nodes_no_terminal_rollback
BEFORE UPDATE OF verdict ON verdict_nodes
FOR EACH ROW
WHEN OLD.verdict IN ('CONFIRMED', 'REFUTED') AND NEW.verdict <> OLD.verdict
BEGIN
  SELECT RAISE(ABORT, 'verdict_nodes: terminal verdict cannot be changed');
END;

CREATE TRIGGER IF NOT EXISTS trg_verdict_nodes_no_empty_scope_slip
BEFORE INSERT ON verdict_nodes
FOR EACH ROW
WHEN NEW.verdict = 'DEGRADED_SCOPE' AND (NEW.scope_slip_text IS NULL OR NEW.scope_slip_text = '')
BEGIN
  SELECT RAISE(ABORT, 'verdict_nodes: DEGRADED_SCOPE requires non-empty scope_slip_text');
END;

CREATE TRIGGER IF NOT EXISTS trg_verdict_nodes_no_empty_untested_reason
BEFORE INSERT ON verdict_nodes
FOR EACH ROW
WHEN NEW.verdict = 'UNTESTED' AND (NEW.untested_reason IS NULL OR NEW.untested_reason = '')
BEGIN
  SELECT RAISE(ABORT, 'verdict_nodes: UNTESTED requires non-empty untested_reason');
END;

-- Red Line #7：CONFIRMED 判决需证据 + checkpoint。
-- 对称 trg_verdict_nodes_no_empty_scope_slip / no_empty_untested_reason 的两层守卫范式。
-- CONFIRMED 时强制 evidence_id 在 evidence_log 存在且 evidence_payload 非空（防御纵深·
-- 即使绕过应用层 assertConfirmedEvidenceExists 直接 INSERT 也被 DB 层拦截）。
CREATE TRIGGER IF NOT EXISTS trg_verdict_nodes_confirmed_requires_evidence
BEFORE INSERT ON verdict_nodes
FOR EACH ROW
WHEN NEW.verdict = 'CONFIRMED' AND NOT EXISTS (
  SELECT 1 FROM evidence_log
  WHERE evidence_id = NEW.evidence_id AND evidence_payload IS NOT NULL AND evidence_payload <> ''
)
BEGIN
  SELECT RAISE(ABORT, 'verdict_nodes: CONFIRMED requires evidence_log record with non-empty payload (Red Line #7)');
END;

CREATE TABLE IF NOT EXISTS evidence_edges (
  edge_id TEXT PRIMARY KEY,
  from_node TEXT NOT NULL REFERENCES verdict_nodes (verdict_id) ON DELETE RESTRICT,
  to_node TEXT NOT NULL REFERENCES verdict_nodes (verdict_id) ON DELETE RESTRICT,
  edge_kind TEXT NOT NULL
    CHECK (edge_kind IN (
      'supports', 'refutes', 'derives_from', 'tests', 'iterates'
    )),
  weight REAL CHECK (weight IS NULL OR (weight >= 0.0 AND weight <= 1.0)),
  source_anchor TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  current_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  CHECK (from_node <> to_node)
);

CREATE INDEX IF NOT EXISTS idx_evidence_edges_from ON evidence_edges (from_node);
CREATE INDEX IF NOT EXISTS idx_evidence_edges_to ON evidence_edges (to_node);
CREATE INDEX IF NOT EXISTS idx_evidence_edges_kind ON evidence_edges (edge_kind);
CREATE UNIQUE INDEX IF NOT EXISTS uq_evidence_edges_from_to_kind
  ON evidence_edges (from_node, to_node, edge_kind);

CREATE TABLE IF NOT EXISTS repro_runs (
  repro_run_id TEXT PRIMARY KEY,
  verdict_id TEXT REFERENCES verdict_nodes (verdict_id) ON DELETE RESTRICT,
  call_record_seq INTEGER REFERENCES call_records (seq) ON DELETE RESTRICT,
  seven_factor_snapshot TEXT NOT NULL,
  repro_hash TEXT NOT NULL,
  pre_compute_hash TEXT,
  post_compute_hash TEXT,
  env_hash TEXT CHECK (env_hash IS NULL OR length(env_hash) = 64),
  replay_prover TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('success', 'hash_mismatch', 'env_drift', 'aborted')),
  error_detail TEXT,
  prev_hash TEXT NOT NULL,
  current_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_repro_runs_verdict ON repro_runs (verdict_id);
CREATE INDEX IF NOT EXISTS idx_repro_runs_call_seq ON repro_runs (call_record_seq);
CREATE INDEX IF NOT EXISTS idx_repro_runs_hash ON repro_runs (repro_hash);
CREATE INDEX IF NOT EXISTS idx_repro_runs_status ON repro_runs (status);

CREATE TRIGGER IF NOT EXISTS trg_repro_runs_no_update
BEFORE UPDATE ON repro_runs
BEGIN
  SELECT RAISE(ABORT, 'repro_runs is append-only: UPDATE forbidden');
END;

CREATE TRIGGER IF NOT EXISTS trg_repro_runs_no_delete
BEFORE DELETE ON repro_runs
BEGIN
  SELECT RAISE(ABORT, 'repro_runs is append-only: DELETE forbidden');
END;

INSERT OR IGNORE INTO schema_meta (version, name) VALUES (1, '0001_initial');
