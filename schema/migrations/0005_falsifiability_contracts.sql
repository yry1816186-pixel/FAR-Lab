-- 0005_falsifiability_contracts.sql
-- Falsifiability Contracts (FEC V1-must): pre-registration of falsifiable claims.
--
-- Authority: FINAL_PACKAGE/11_FALSIFICATION_ENGINE.md + 21 §1 W1 + 22 §2 T-W1-07
-- Migration 0018 (per SSOT numbering) → 0005 (contiguous renumber)
--
-- 边界:
--   1. preregistrationHash locks the contract before execution (F8 anti-p-hacking)
--   2. alpha=0.0125, seed=42 pre-registered and immutable
--   3. measurable_implication NOT NULL (FEC 三件套 F7)
--   4. compiled_by = 'deterministic_compiler' (禁 LLM, F3)
--   5. Append-only: 禁 UPDATE/DELETE

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS falsifiability_contracts (
  contract_id            TEXT PRIMARY KEY,
  claim_id               TEXT NOT NULL,
  preregistration_hash   TEXT NOT NULL CHECK (length(preregistration_hash) = 64),
  measurable_implication TEXT NOT NULL,
  metric                 TEXT NOT NULL,
  comparator             TEXT NOT NULL CHECK (comparator IN ('gt', 'lt', 'eq', 'range')),
  threshold_value        REAL NOT NULL,
  alpha                  REAL NOT NULL DEFAULT 0.0125
    CHECK (alpha > 0.0 AND alpha < 1.0),
  seed                   INTEGER NOT NULL DEFAULT 42,
  bonferroni_applied     INTEGER NOT NULL DEFAULT 1 CHECK (bonferroni_applied IN (0, 1)),
  population             TEXT NOT NULL DEFAULT 'unknown',
  effect_size_expected   REAL,
  power_analysis_n       INTEGER,
  compiled_by            TEXT NOT NULL CHECK (compiled_by = 'deterministic_compiler'),
  compiled_at            TEXT NOT NULL,
  locked                 INTEGER NOT NULL DEFAULT 1 CHECK (locked IN (0, 1)),
  created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_falsifiability_contracts_claim ON falsifiability_contracts (claim_id);
CREATE INDEX IF NOT EXISTS idx_falsifiability_contracts_hash   ON falsifiability_contracts (preregistration_hash);

-- Append-only triggers
CREATE TRIGGER IF NOT EXISTS trg_falsifiability_contracts_no_update
BEFORE UPDATE ON falsifiability_contracts
BEGIN
  SELECT RAISE(ABORT, 'falsifiability_contracts is append-only: UPDATE forbidden');
END;

CREATE TRIGGER IF NOT EXISTS trg_falsifiability_contracts_no_delete
BEFORE DELETE ON falsifiability_contracts
BEGIN
  SELECT RAISE(ABORT, 'falsifiability_contracts is append-only: DELETE forbidden');
END;

INSERT OR IGNORE INTO schema_meta (version, name) VALUES (5, '0005_falsifiability_contracts');
