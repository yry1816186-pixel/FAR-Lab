-- 0006_falsification_audit_events.sql
-- Falsification Sufficiency Auditor: meta-audit events table.
--
-- Authority: round5 §1.5 + round8 B3
-- Migration 0025 (per SSOT numbering) → 0006 (contiguous renumber)
--
-- 边界:
--   1. 4 rules: RULE-FS-001/001b/002/003
--   2. outcome 4 values: PASS/FAIL/WARN/SKIP (NO UNKNOWN)
--   3. check_kind = 'falsification_sufficiency'
--   4. sealed_by = 'deterministic_sealer'
--   5. Append-only: 禁 UPDATE/DELETE
--   6. RULE-FS-001b 正则可被单符号绕过 (V1 诚实边界, not full 元层语义)

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS falsification_audit_events (
  event_id     TEXT PRIMARY KEY,
  contract_id  TEXT NOT NULL REFERENCES falsifiability_contracts (contract_id) ON DELETE RESTRICT,
  claim_id     TEXT NOT NULL,
  rule_id      TEXT NOT NULL
    CHECK (rule_id IN (
      'RULE-FS-001', 'RULE-FS-001b', 'RULE-FS-002', 'RULE-FS-003'
    )),
  check_kind   TEXT NOT NULL CHECK (check_kind = 'falsification_sufficiency'),
  outcome      TEXT NOT NULL
    CHECK (outcome IN ('PASS', 'FAIL', 'WARN', 'SKIP')),
  detail       TEXT NOT NULL DEFAULT '',
  prev_hash    TEXT NOT NULL CHECK (length(prev_hash) = 64),
  current_hash TEXT NOT NULL CHECK (length(current_hash) = 64),
  sealed_at    TEXT NOT NULL,
  sealed_by    TEXT NOT NULL CHECK (sealed_by = 'deterministic_sealer'),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_falsification_audit_events_contract ON falsification_audit_events (contract_id);
CREATE INDEX IF NOT EXISTS idx_falsification_audit_events_rule     ON falsification_audit_events (rule_id);
CREATE INDEX IF NOT EXISTS idx_falsification_audit_events_outcome  ON falsification_audit_events (outcome);

-- Append-only triggers
CREATE TRIGGER IF NOT EXISTS trg_falsification_audit_events_no_update
BEFORE UPDATE ON falsification_audit_events
BEGIN
  SELECT RAISE(ABORT, 'falsification_audit_events is append-only: UPDATE forbidden');
END;

CREATE TRIGGER IF NOT EXISTS trg_falsification_audit_events_no_delete
BEFORE DELETE ON falsification_audit_events
BEGIN
  SELECT RAISE(ABORT, 'falsification_audit_events is append-only: DELETE forbidden');
END;

INSERT OR IGNORE INTO schema_meta (version, name) VALUES (6, '0006_falsification_audit_events');
