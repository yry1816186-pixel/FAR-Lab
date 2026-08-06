-- 0023_v2_receipts.sql
-- V2 Receipt domain tables: v2_receipts, v2_manifest_members,
-- v2_verification_results, v2_contract_bindings.
--
-- These tables support the V2 receipt lifecycle: claim evidence capture,
-- manifest artifact tracking, verification policy evaluation, and
-- contract binding persistence.

CREATE TABLE IF NOT EXISTS v2_receipts (
  id                 TEXT PRIMARY KEY,
  claim_id           TEXT,
  claim_text         TEXT,
  verdict            TEXT,
  proof_hash         TEXT,
  schema_version     TEXT,
  created_at         TEXT,
  receipt_standing   TEXT DEFAULT 'ACTIVE',
  preservation_status TEXT DEFAULT 'AVAILABLE'
);

CREATE TABLE IF NOT EXISTS v2_manifest_members (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id TEXT NOT NULL REFERENCES v2_receipts(id),
  kind       TEXT,
  digest     TEXT,
  size_bytes INTEGER,
  UNIQUE(receipt_id, kind)
);

CREATE TABLE IF NOT EXISTS v2_verification_results (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id   TEXT NOT NULL REFERENCES v2_receipts(id),
  policy_id    TEXT,
  evaluated_at TEXT,
  result_json  TEXT,
  all_pass     INTEGER
);

CREATE TABLE IF NOT EXISTS v2_contract_bindings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id      TEXT NOT NULL REFERENCES v2_receipts(id),
  binding_set_json TEXT,
  digest         TEXT,
  created_at     TEXT
);
