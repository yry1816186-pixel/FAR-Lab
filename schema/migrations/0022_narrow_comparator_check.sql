-- 0022_narrow_comparator_check.sql
-- DEBT-12：收窄 falsifiability_contracts.comparator 的 CHECK 约束，移除死值 'eq'。
--
-- 背景：comparator 的 DB CHECK（0005:22）允许 4 值 ('gt','lt','eq','range')，而运行时类型
-- (falsifiability/types.ts ThresholdSemantics) 与 FEC 契约层 (fec_contract.ts FecThresholdSpec)
-- 均为 3 值。'eq'（精确等值）无可证伪语义（Popper）——science_check_to_fec.ts 对 '==' fail-closed
-- 拒绝。保留 DB 'eq' 造成「同一业务概念 4 处定义 3/4/5 值」的双轨失真（DEBT-12）。
--
-- 安全性（grep 证明）：
--   1. src/+tests/ 零处构造 comparator:'eq'（仅 contracts.ts:22 类型声明）。
--   2. 现有 DB 行无 comparator='eq'（应用层从不产出·TS 类型已收窄禁止）。
--   3. 因此 INSERT INTO ... SELECT 全行通过更窄的 3 值 CHECK，零数据丢失。
--
-- 机制：SQLite 无 ALTER CONSTRAINT，按官方 12 步表重建（https://sqlite.org/lang_altertable.html#otheralter）：
--   foreign_keys=OFF → 事务内建新表(窄 CHECK)→ 拷贝 → DROP 旧表(连带删其 2 索引+2 trigger)→
--   RENAME 新表为旧名 → 重建 2 索引 + 2 append-only trigger → foreign_key_check → foreign_keys=ON。
-- 0006.falsification_audit_events.contract_id REFERENCES 本表(contract_id) ON DELETE RESTRICT：
--   重建期间 foreign_keys=OFF 避免被引用表 DROP 失败；RENAME 后同名，FK 按名重连。
--
-- 边界：
--   1. PRAGMA foreign_keys 须在事务外设置（事务内为 no-op）——本迁移首尾各一句，不在 BEGIN/COMMIT 内。
--   2. 本迁移不进 cross_lang canonical_hash 白名单（不改 hash 列·零回归 14 GV）。
--   3. 与 0013/0018 同为 DB 层物理守卫加固（defense-in-depth），与应用层正交。
--
-- Authority: DEBT-12 (DESIGN_DEBT.yaml) 可证伪红线 + F8 anti-p-hacking。

-- 步骤 1：关闭外键（须在事务外）
PRAGMA foreign_keys = OFF;

-- 步骤 2-8：事务内重建
BEGIN;

-- 步骤 3：建新表（comparator CHECK 收窄为 3 值；其余列/约束与 0005 逐字一致）
CREATE TABLE falsifiability_contracts__0022 (
  contract_id            TEXT PRIMARY KEY,
  claim_id               TEXT NOT NULL,
  preregistration_hash   TEXT NOT NULL CHECK (length(preregistration_hash) = 64),
  measurable_implication TEXT NOT NULL,
  metric                 TEXT NOT NULL,
  comparator             TEXT NOT NULL CHECK (comparator IN ('gt', 'lt', 'range')),
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

-- 步骤 4：拷贝全量数据（显式列清单，避免列序漂移；零 'eq' 行故窄 CHECK 全通过）
INSERT INTO falsifiability_contracts__0022 (
  contract_id, claim_id, preregistration_hash, measurable_implication, metric,
  comparator, threshold_value, alpha, seed, bonferroni_applied,
  population, effect_size_expected, power_analysis_n,
  compiled_by, compiled_at, locked, created_at
)
SELECT
  contract_id, claim_id, preregistration_hash, measurable_implication, metric,
  comparator, threshold_value, alpha, seed, bonferroni_applied,
  population, effect_size_expected, power_analysis_n,
  compiled_by, compiled_at, locked, created_at
FROM falsifiability_contracts;

-- 步骤 5：DROP 旧表（连带删除其 idx_*_claim/idx_*_hash 索引与 trg_*_no_update/no_delete trigger）
DROP TABLE falsifiability_contracts;

-- 步骤 6：RENAME 新表为旧名（FK 按 名重连：0006.falsification_audit_events.contract_id → 本表）
ALTER TABLE falsifiability_contracts__0022 RENAME TO falsifiability_contracts;

-- 步骤 7：重建 2 索引（与 0005:37-38 逐字一致）
CREATE INDEX IF NOT EXISTS idx_falsifiability_contracts_claim ON falsifiability_contracts (claim_id);
CREATE INDEX IF NOT EXISTS idx_falsifiability_contracts_hash   ON falsifiability_contracts (preregistration_hash);

-- 步骤 8：重建 2 append-only trigger（与 0005:41-51 逐字一致）
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

-- 步骤 9：外键完整性自检（若有违例返回行；零 'eq' 数据保证无违例）
PRAGMA foreign_key_check;

COMMIT;

-- 步骤 10：恢复外键（须在事务外）
PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO schema_meta (version, name) VALUES (22, '0022_narrow_comparator_check');
