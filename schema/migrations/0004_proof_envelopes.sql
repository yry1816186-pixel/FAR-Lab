-- 0004_proof_envelopes.sql
-- ProofEnvelope: sealed evidence packages with proofHash chain.
--
-- Authority: FINAL_PACKAGE/09_PROOF_CARRYING_RESEARCH_OBJECT.md §1-§4 +
--            round8 B1 (proofHash separators + ensure_ascii contract)
--
-- 边界:
--   1. 不修改 0001 五表。proof_envelopes 引用 verdict_nodes.verdict_id (FK)
--   2. conclusion CHECK 5 枚举与 TS VERDICTS 枚举严格一致
--   3. sealed_by = 'deterministic_sealer' (禁 LLM, F3)
--   4. proofHash 由 canonical_json (separators + ensure_ascii) + sha256 产生
--   5. checks JSON 数组含 9 条规则的判定结果
--   6. Append-only: 禁 UPDATE/DELETE

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS proof_envelopes (
  envelope_id        TEXT PRIMARY KEY,
  claim_id           TEXT NOT NULL,
  verdict_node_id    TEXT NOT NULL REFERENCES verdict_nodes (verdict_id) ON DELETE RESTRICT,
  conclusion         TEXT NOT NULL
    CHECK (conclusion IN (
      'CONFIRMED', 'REFUTED', 'INCONCLUSIVE', 'DEGRADED_SCOPE', 'UNTESTED'
    )),
  proof_hash         TEXT NOT NULL CHECK (length(proof_hash) = 64),
  prev_proof_hash    TEXT NOT NULL CHECK (length(prev_proof_hash) = 64),
  checks             TEXT NOT NULL,     -- JSON array of 9 rule check results
  known_failures     TEXT NOT NULL DEFAULT '[]',  -- JSON array, never hidden (F9)
  falsification_spec TEXT NOT NULL,
  source_anchor      TEXT NOT NULL,
  repro_hash         TEXT NOT NULL,
  sealed_by          TEXT NOT NULL CHECK (sealed_by = 'deterministic_sealer'),
  sealed_at          TEXT NOT NULL,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_proof_envelopes_claim        ON proof_envelopes (claim_id);
CREATE INDEX IF NOT EXISTS idx_proof_envelopes_verdict      ON proof_envelopes (verdict_node_id);
CREATE INDEX IF NOT EXISTS idx_proof_envelopes_conclusion   ON proof_envelopes (conclusion);
CREATE INDEX IF NOT EXISTS idx_proof_envelopes_proof_hash   ON proof_envelopes (proof_hash);

-- Append-only triggers
CREATE TRIGGER IF NOT EXISTS trg_proof_envelopes_no_update
BEFORE UPDATE ON proof_envelopes
BEGIN
  SELECT RAISE(ABORT, 'proof_envelopes is append-only: UPDATE forbidden');
END;

CREATE TRIGGER IF NOT EXISTS trg_proof_envelopes_no_delete
BEFORE DELETE ON proof_envelopes
BEGIN
  SELECT RAISE(ABORT, 'proof_envelopes is append-only: DELETE forbidden');
END;

-- Anti-theater trigger: WARN check → conclusion ≠ CONFIRMED
-- checks JSON 包含 WARN → 硬阻断 CONFIRMED 落库 (F1 机器化)
CREATE TRIGGER IF NOT EXISTS trg_proof_envelopes_anti_theater
BEFORE INSERT ON proof_envelopes
FOR EACH ROW
WHEN NEW.checks LIKE '%"WARN"%' AND NEW.conclusion = 'CONFIRMED'
BEGIN
  SELECT RAISE(ABORT, 'proof_envelopes: WARN check present, cannot seal CONFIRMED (anti-theater F1)');
END;

INSERT OR IGNORE INTO schema_meta (version, name) VALUES (4, '0004_proof_envelopes');
