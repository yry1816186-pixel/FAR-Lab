-- 0003_math_verification.sql
-- Math verification layer (spec 38 · Epic N)
-- Independent of 0001 five core tables: does not modify call_records / evidence_log /
-- verdict_nodes / evidence_edges / repro_runs. Two new append-only tables:
--   math_claims        — structured math claim objects (§1)
--   math_verifications — per-verification evidence rows (§2-§4.5)
--
-- Column naming authority (§7): expected_outcome / outcome (3-value
-- verified/refuted/unknown), deliberately distinct from verdict_nodes.verdict
-- (5-value CONFIRMED/REFUTED/INCONCLUSIVE/DEGRADED_SCOPE/UNTESTED).
--
-- achieved_level is NOT a physical column (§1.1 方案A): it is derived
-- from math_verifications via derivedAchievedLevel(). Keeping it out of
-- math_claims resolves the append-only UPDATE-trigger contradiction.
--
-- linked_verdict_node_id is a soft reference to verdict_nodes.verdict_id
-- (no FK added, so 0001 DDL stays untouched).

PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

-- ============================================================
-- Step 1: math_claims (structured math claim · §1 MathClaim)
-- ============================================================
CREATE TABLE IF NOT EXISTS math_claims (
  claim_id                     TEXT    PRIMARY KEY,
  natural_language             TEXT    NOT NULL,
  claim_kind                   TEXT    NOT NULL
    CHECK (claim_kind IN (
      'algebraic_identity', 'equation_solution', 'calculus', 'inequality',
      'dimensional_consistency', 'matrix_identity', 'statistic_identity', 'theorem',
      'numerical_reproduction', 'statistical_inference', 'optimization_convergence', 'validated_numerics'
    )),                                                       -- MathClaimKind 12 values (8 symbolic + 4 numerical · §1)
  formalization                TEXT,                          -- FormalExpression JSON (nullable)
  required_level               TEXT    NOT NULL
    CHECK (required_level IN ('L1_cas', 'L2_smt', 'L3_formal', 'L4_human')),
  expected_outcome             TEXT    NOT NULL
    CHECK (expected_outcome IN ('verified', 'refuted', 'unknown')),
  linked_verdict_node_id       TEXT,                          -- soft reference to verdict_nodes.verdict_id (no FK)
  require_formal_verification  INTEGER NOT NULL DEFAULT 0
    CHECK (require_formal_verification IN (0, 1)),
  created_at                   TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_math_claims_kind           ON math_claims (claim_kind);
CREATE INDEX IF NOT EXISTS idx_math_claims_required       ON math_claims (required_level);
CREATE INDEX IF NOT EXISTS idx_math_claims_linked_verdict ON math_claims (linked_verdict_node_id);

-- ============================================================
-- Step 2: math_verifications (per-verification evidence · §2-§4.5)
-- ============================================================
CREATE TABLE IF NOT EXISTS math_verifications (
  verification_id   TEXT    PRIMARY KEY,
  claim_id          TEXT    NOT NULL REFERENCES math_claims (claim_id) ON DELETE RESTRICT,
  backend_id        TEXT    NOT NULL,                          -- 'sympy@<v>' | 'z3@<v>' | 'lean4@<v>' | 'dafny@<v>' | 'numerical@<v>'
  backend_kind      TEXT    NOT NULL
    CHECK (backend_kind IN ('cas', 'smt', 'lean4', 'dafny', 'numerical')),
  outcome           TEXT    NOT NULL
    CHECK (outcome IN ('verified', 'refuted', 'unknown')),     -- 3 values (numerical backend forces 'unknown' + output_artifact bound)
  input_hash        TEXT    NOT NULL CHECK (length(input_hash) = 64), -- sha256Canonical(formalization) (03 §2.4 SSOT)
  output_artifact   TEXT,                                      -- proofArtifact / simplify result / z3 model / numerical bound
  compile_log       TEXT,                                      -- compiler output (Formal backends / APOLLO style)
  duration_ms       INTEGER NOT NULL CHECK (duration_ms >= 0),
  source_anchor     TEXT    NOT NULL,                          -- full verifier fingerprint
  verified_at       TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_math_verifications_claim   ON math_verifications (claim_id);
CREATE INDEX IF NOT EXISTS idx_math_verifications_backend ON math_verifications (backend_id);
CREATE INDEX IF NOT EXISTS idx_math_verifications_outcome ON math_verifications (outcome);
CREATE INDEX IF NOT EXISTS idx_math_verifications_kind    ON math_verifications (backend_kind);

-- ============================================================
-- Step 3: append-only triggers (same discipline as 0001 core tables · 00 §8 immutability)
-- ============================================================
CREATE TRIGGER IF NOT EXISTS trg_math_claims_no_update BEFORE UPDATE ON math_claims BEGIN
  SELECT RAISE(ABORT, 'math_claims is append-only: UPDATE forbidden (new verifications go via new math_verifications rows; achievedLevel is derived)');
END;
CREATE TRIGGER IF NOT EXISTS trg_math_claims_no_delete BEFORE DELETE ON math_claims BEGIN
  SELECT RAISE(ABORT, 'math_claims is append-only: DELETE forbidden');
END;
CREATE TRIGGER IF NOT EXISTS trg_math_verifications_no_update BEFORE UPDATE ON math_verifications BEGIN
  SELECT RAISE(ABORT, 'math_verifications is append-only: UPDATE forbidden');
END;
CREATE TRIGGER IF NOT EXISTS trg_math_verifications_no_delete BEFORE DELETE ON math_verifications BEGIN
  SELECT RAISE(ABORT, 'math_verifications is append-only: DELETE forbidden');
END;

-- ============================================================
-- Step 4: schema_meta record (real 0001 schema_meta shape: version, name)
-- ============================================================
INSERT OR IGNORE INTO schema_meta (version, name) VALUES (3, '0003_math_verification');

COMMIT;
PRAGMA foreign_key_check;
PRAGMA foreign_keys = ON;
