-- 0008_anti_theater_fail_coverage.sql
-- AT-02 审计裁决修复：anti-theater trigger 扩展覆盖 FAIL。
--
-- Authority:（checks 含 WARN/FAIL → verdict 不可 CONFIRMED）
--          + 02_CONSTRAINTS_AND_RED_LINES.md F1 + AT-02 审计裁决（2026-06-29）。
--
-- 根因（AT-02）：0004 trg_proof_envelopes_anti_theater 的 WHEN 仅匹配 '%"WARN"%'
--   → FAIL-only check + CONFIRMED 的 ProofEnvelope（如 RULE-PE-005 reproHash 长度异常 → FAIL，
--     无 WARN）可落库，F1 机器化防线被绕过。
--
-- 修复策略（防御纵深，append-only migration）：
--   1. sealer.ts INSERT 前 hasAntiTheaterViolation → throw（第一道 TS 层防线，已落地）。
--   2. 本 migration：DROP 旧 trigger + 重建匹配 WARN/FAIL（SQLite trigger 无 ALTER，须 DROP+CREATE），
--      作为物理兜底防线，防直接 SQL INSERT 绕过 sealer。
--   3. 补 FAIL+CONFIRMED 阻断单测（proof_envelope.test.ts）。
--
-- 边界：
--   - 不修改 0004 文件（append-only；旧 trigger 由本 migration DROP 替换）。
--   - 不触碰 0001-0007 五表/proof_envelopes 结构，仅替换 trigger 定义。
--   - 连续编号 0008 接续 0007（migrator assertContiguousVersions）。

DROP TRIGGER IF EXISTS trg_proof_envelopes_anti_theater;

-- Anti-theater trigger: WARN 或 FAIL check → conclusion ≠ CONFIRMED（F1 机器化）
-- checks JSON 含 "WARN" 或 "FAIL" → 硬阻断 CONFIRMED 落库（与 sealer.ts step 1b 双层防线一致）
CREATE TRIGGER trg_proof_envelopes_anti_theater
BEFORE INSERT ON proof_envelopes
FOR EACH ROW
WHEN (NEW.checks LIKE '%"WARN"%' OR NEW.checks LIKE '%"FAIL"%') AND NEW.conclusion = 'CONFIRMED'
BEGIN
  SELECT RAISE(ABORT, 'proof_envelopes: WARN/FAIL check present, cannot seal CONFIRMED (anti-theater F1)');
END;

INSERT OR IGNORE INTO schema_meta (version, name) VALUES (8, '0008_anti_theater_fail_coverage');
