-- 0009_fec_contracts_v2.sql
-- FEC V2 契约存储（完整冻结契约 · 03 §1.2 FecContractV2）。
--
-- Authority:（FecContract 16 字段 + JSON Schema）+ W2-A。
--
-- 与 V1 falsifiability_contracts（0005）共存：
--   - V1 是历史预登记（扁平字段：preregistrationHash/alpha/seed/bonferroni/population）。
--   - V2 是完整冻结契约（16 字段 + 子类型），整体 canonical JSON 存储。
--   - V1 不删除（功能保留 · 零容忍 #5）；V2 是 W2-A 新增强制路径（fec_mandate 强制缺 FEC → UNTESTED）。
--
-- 存储策略（冻结契约整体性）：
--   - contract_json：FecContractV2 的 canonical JSON（fast-json-stable-stringify key 排序）。
--   - fec_hash：computeFecHash(fec) = sha256(canonical JSON of [VC] fields)，verifier 重算互验。
--   - 子类型（scope/metric/threshold/statisticalPlan/freeze 等）嵌在 contract_json，不展开为列。
--
-- 边界：
--   1. compiled_by = 'deterministic_compiler'（F3 禁 LLM-as-judge）
--   2. fec_hash 长度 64（sha256 hex）
--   3. contract_version = 'FEC/2.0'（schema const）
--   4. Append-only：禁 UPDATE/DELETE（与 0005 一致 · F1/F3 物理防线）
--   5. 连续编号 0009 接续 0008（migrator assertContiguousVersions）

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS fec_contracts_v2 (
  fec_id            TEXT PRIMARY KEY,
  claim_id          TEXT NOT NULL,
  contract_version  TEXT NOT NULL DEFAULT 'FEC/2.0' CHECK (contract_version = 'FEC/2.0'),
  fec_hash          TEXT NOT NULL CHECK (length(fec_hash) = 64),
  contract_json     TEXT NOT NULL,
  compiled_by       TEXT NOT NULL CHECK (compiled_by = 'deterministic_compiler'),
  compiled_at       TEXT NOT NULL,
  locked            INTEGER NOT NULL DEFAULT 1 CHECK (locked IN (0, 1)),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_fec_contracts_v2_claim  ON fec_contracts_v2 (claim_id);
CREATE INDEX IF NOT EXISTS idx_fec_contracts_v2_hash   ON fec_contracts_v2 (fec_hash);

-- Append-only triggers（F1/F3 物理防线 · 防 SQL 直写绕过 compiler）
CREATE TRIGGER IF NOT EXISTS trg_fec_contracts_v2_no_update
BEFORE UPDATE ON fec_contracts_v2
BEGIN
  SELECT RAISE(ABORT, 'fec_contracts_v2 is append-only: UPDATE forbidden');
END;

CREATE TRIGGER IF NOT EXISTS trg_fec_contracts_v2_no_delete
BEFORE DELETE ON fec_contracts_v2
BEGIN
  SELECT RAISE(ABORT, 'fec_contracts_v2 is append-only: DELETE forbidden');
END;

INSERT OR IGNORE INTO schema_meta (version, name) VALUES (9, '0009_fec_contracts_v2');
