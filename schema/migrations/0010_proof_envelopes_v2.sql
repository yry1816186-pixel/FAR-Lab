-- 0010_proof_envelopes_v2.sql
-- ProofEnvelope V2: 完整证据嵌入的封存信封（与 V1 proof_envelopes 共存）。
--
-- Authority: PROJECT_PLAN/04 §2.1（V2 目标态）+ APPENDIX_C §2（proofHash 白名单）+
--            task #9（RULE-PE-010 Ask 层已确认·状态 DESIGN_LOCKED → IMPLEMENTED_VERIFIED）。
--
-- 边界:
--   1. 不修改 0001-0009。proof_envelopes_v2 与 V1 proof_envelopes（0004）共存（V1 保留·功能保留）。
--   2. schema_version 固定 'far.proof_envelope.v2'（TS ProofEnvelopeV2SchemaVersion + DB CHECK）。
--   3. proof_hash = sha256(canonical_json(VC fields - proofHash))（self-excluding），长度=64 hex。
--   4. fec_hash = computeFecHash(fecSnapshot)（排除 freeze.fecHash），与 envelope.fecHash 互验。
--   5. ledger_root 长度=64（call_records head hash 或 Merkle root）。
--   6. envelope_json TEXT 存完整 V2 envelope canonical JSON（16 字段）。
--   7. sealed_by = 'deterministic_sealer'（禁 LLM, F3）。
--   8. Append-only: 禁 UPDATE/DELETE（与 0004 V1 一致·T11 append-only 铁律）。
--   9. Anti-theater trigger: envelope_json 含 overallStatus WARN/FAIL → conclusion ≠ CONFIRMED（F1 机器化）。

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS proof_envelopes_v2 (
  envelope_id     TEXT PRIMARY KEY,
  claim_id        TEXT NOT NULL,
  schema_version  TEXT NOT NULL CHECK (schema_version = 'far.proof_envelope.v2'),
  conclusion      TEXT NOT NULL
    CHECK (conclusion IN (
      'CONFIRMED', 'REFUTED', 'INCONCLUSIVE', 'DEGRADED_SCOPE', 'UNTESTED'
    )),
  fec_hash        TEXT NOT NULL CHECK (length(fec_hash) = 64),
  proof_hash      TEXT NOT NULL CHECK (length(proof_hash) = 64),
  ledger_root     TEXT NOT NULL CHECK (length(ledger_root) = 64),
  envelope_json   TEXT NOT NULL,     -- 完整 V2 envelope canonical JSON (16 fields)
  sealed_by       TEXT NOT NULL CHECK (sealed_by = 'deterministic_sealer'),
  sealed_at       TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_proof_envelopes_v2_claim      ON proof_envelopes_v2 (claim_id);
CREATE INDEX IF NOT EXISTS idx_proof_envelopes_v2_conclusion ON proof_envelopes_v2 (conclusion);
CREATE INDEX IF NOT EXISTS idx_proof_envelopes_v2_fec        ON proof_envelopes_v2 (fec_hash);
CREATE INDEX IF NOT EXISTS idx_proof_envelopes_v2_proof      ON proof_envelopes_v2 (proof_hash);

-- Append-only triggers (T11)
CREATE TRIGGER IF NOT EXISTS trg_proof_envelopes_v2_no_update
BEFORE UPDATE ON proof_envelopes_v2
BEGIN
  SELECT RAISE(ABORT, 'proof_envelopes_v2 is append-only: UPDATE forbidden');
END;

CREATE TRIGGER IF NOT EXISTS trg_proof_envelopes_v2_no_delete
BEFORE DELETE ON proof_envelopes_v2
BEGIN
  SELECT RAISE(ABORT, 'proof_envelopes_v2 is append-only: DELETE forbidden');
END;

-- Anti-theater trigger (F1 机器化): envelope_json antiTheaterReport.overallStatus WARN/FAIL
-- → conclusion 不得 CONFIRMED。canonical JSON 形式: "overallStatus":"WARN" 或 "overallStatus":"FAIL"。
CREATE TRIGGER IF NOT EXISTS trg_proof_envelopes_v2_anti_theater
BEFORE INSERT ON proof_envelopes_v2
FOR EACH ROW
WHEN (NEW.envelope_json LIKE '%"overallStatus":"WARN"%' OR NEW.envelope_json LIKE '%"overallStatus":"FAIL"%')
     AND NEW.conclusion = 'CONFIRMED'
BEGIN
  SELECT RAISE(ABORT, 'proof_envelopes_v2: antiTheater WARN/FAIL present, cannot seal CONFIRMED (anti-theater F1)');
END;

INSERT OR IGNORE INTO schema_meta (version, name) VALUES (10, '0010_proof_envelopes_v2');
