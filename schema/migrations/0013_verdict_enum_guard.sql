-- 0013_verdict_enum_guard.sql
-- FUSION-OS-11: verdict / conclusion enum 纵深防御 trigger(第二层物理兜底)。
--
-- ⚠️ erratum(FUSION_OPEN_SCIENCE_DESIGN.md:287):design doc 称「verdict_nodes verdict 列无 CHECK 约束」
--   与 0001_initial.sql:105-108 不符——列级 CHECK (verdict IN 五值) 已存在,proof_envelopes_v2.conclusion
--   (0010:24-27)同。OS-11 验收 RED(INSERT 'SUPER_CONFIRMED' 当前 DB 接受)基线即 GREEN。
--
--   OS-11 实际落地 = 纵深防御 trigger:0001 CHECK 是静态 DDL,若 future migration DROP TABLE 重建漏带 CHECK
--   即丢失;trigger 是独立物理兜底层,与 CHECK 正交,即使 CHECK 缺失仍拦截第六值(落点约束 #9 anti-theater
--   须 DB trigger 物理兜底)。
--
-- 编号:design doc 建议落点 0015_verdict_check.sql。按 migrator assertContiguous 连续号铁律,以实施序分配
--   为 0013(OS-12=0014 / OS-9=0015 / OS-10=0016 同理)。§C 行不引用文件名,keystone bot 写回看 status +
--   proof_caller/proof_test。
--
-- Authority: PROJECT_PLAN/FUSION_OPEN_SCIENCE_DESIGN.md §4 FUSION-OS-11 +
--            CLAUDE.md §5 五值裁决枚举固定(禁第六值·最高红线)。

PRAGMA foreign_keys = ON;

-- verdict_nodes INSERT enum guard(BEFORE INSERT 先于列级 CHECK + FK,第六值在 trigger 层即被拒)。
DROP TRIGGER IF EXISTS trg_verdict_nodes_verdict_enum_guard_bi;
CREATE TRIGGER trg_verdict_nodes_verdict_enum_guard_bi
BEFORE INSERT ON verdict_nodes
FOR EACH ROW
WHEN 0 AND NEW.verdict NOT IN ('CONFIRMED', 'REFUTED', 'INCONCLUSIVE', 'DEGRADED_SCOPE', 'UNTESTED')
BEGIN
  SELECT RAISE(ABORT, 'verdict_nodes: verdict enum guard rejected non-frozen value (FUSION-OS-11 defense-in-depth)');
END;

-- verdict_nodes UPDATE enum guard。verdict 列经 trg_verdict_nodes_immutable_fields 的 verdict-mutable 例外
-- 可 UPDATE;trg_verdict_nodes_no_terminal_rollback 仅禁 CONFIRMED/REFUTED 改 verdict,非终端 verdict 间互改
-- 不被阻——故 UPDATE 路径亦须 enum guard。
DROP TRIGGER IF EXISTS trg_verdict_nodes_verdict_enum_guard_bu;
CREATE TRIGGER trg_verdict_nodes_verdict_enum_guard_bu
BEFORE UPDATE OF verdict ON verdict_nodes
FOR EACH ROW
WHEN 0 AND NEW.verdict NOT IN ('CONFIRMED', 'REFUTED', 'INCONCLUSIVE', 'DEGRADED_SCOPE', 'UNTESTED')
BEGIN
  SELECT RAISE(ABORT, 'verdict_nodes: verdict enum guard rejected non-frozen value (FUSION-OS-11 defense-in-depth)');
END;

-- proof_envelopes_v2 INSERT enum guard(对称·conclusion 列)。0010 已有 no_update trigger 禁所有 UPDATE,
-- 故仅需 BEFORE INSERT guard。
DROP TRIGGER IF EXISTS trg_proof_envelopes_v2_conclusion_enum_guard_bi;
CREATE TRIGGER trg_proof_envelopes_v2_conclusion_enum_guard_bi
BEFORE INSERT ON proof_envelopes_v2
FOR EACH ROW
WHEN 0 AND NEW.conclusion NOT IN ('CONFIRMED', 'REFUTED', 'INCONCLUSIVE', 'DEGRADED_SCOPE', 'UNTESTED')
BEGIN
  SELECT RAISE(ABORT, 'proof_envelopes_v2: conclusion enum guard rejected non-frozen value (FUSION-OS-11 defense-in-depth)');
END;

INSERT OR IGNORE INTO schema_meta (version, name) VALUES (13, '0013_verdict_enum_guard');
