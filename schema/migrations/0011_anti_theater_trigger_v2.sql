-- 0011_anti_theater_trigger_v2.sql
-- ProofEnvelope V2 anti-theater trigger 升级：overallStatus → hasFail/canSealConfirmed（D1 类型统一后）。
--
-- Authority: archived-plan §1（AntiTheaterReport A §7 权威存储类型）+
--            APPENDIX_A_TYPES.md §7:1055-1191（findings/hasFail/failCount/warnCount/llmOverrideRejected/
--            antiTheaterScore?/canSealConfirmed?/verdictConstraint?）+ 04 §2.4 RULE-PE-007
--            （blocked = hasFail || canSealConfirmed===false，CONFIRMED 时 FAIL）+ task #10 W3.4（D10）。
--
-- 背景（为何改 trigger）：0010 建 trg_proof_envelopes_v2_anti_theater 时，V2 antiTheaterReport 是
--   "生产者未实现时的占位"简化版（{findings, overallStatus}）。W3.1 D1 类型统一后，antiTheaterReport
--   改为 A §7 权威形状（无 overallStatus 字段，改用 hasFail + canSealConfirmed）。故 0010 trigger 的
--   `LIKE '%"overallStatus":"WARN"%'` 永不命中（字段已不存在）→ anti-theater F1 物理兜底失效。
--   0011 重建 trigger 匹配新字段，恢复 F1 物理兜底。
--
-- D10 forward-only（不修改 0010）：DROP 旧 trigger + CREATE 新版本（同名替换），不回填 0010。
--   理由：append-only 纪律（0001-0010 不可变）+ 0010 的 overallStatus trigger 在新形状下是 no-op
--   （字段不存在·永不命中），DROP 它无损（本就失效）。
--
-- 匹配逻辑（对齐 validator.ts RULE-PE-007 + lint.ts canSealConfirmed 三重条件）：
--   blocked = antiTheaterReport.hasFail === true OR antiTheaterReport.canSealConfirmed === false
--   canonical JSON（fast-json-stable-stringify·键排序）序列化 JS boolean 为 true/false（无引号），
--   故模式为 `"hasFail":true` / `"canSealConfirmed":false`。
--   - hasFail 必填（A §7·恒存在）→ `"hasFail":true` 命中任何 FAIL finding。
--   - canSealConfirmed 可选（undefined 时 fast-json-stable-stringify 省略键）→ 仅 `"canSealConfirmed":false`
--     命中（explicit false = anti-theater score<70 或 BLOCK finding 或 forcedVerdict≠undefined）。
--
-- 边界:
--   1. 不修改 0001-0010（append-only 铁律）。
--   2. proof_envelopes_v2 表结构不变（0010 已建·本迁移仅改 trigger）。
--   3. DROP IF EXISTS + CREATE（幂等·重复应用安全）。
--   4. 仅结论=CONFIRMED 时阻断（REFUTED/INCONCLUSIVE/DEGRADED_SCOPE/UNTESTED 不受阻·honest degradation）。

PRAGMA foreign_keys = ON;

-- 1. DROP 0010 旧 trigger（overallStatus 模式·新形状下 no-op·同名替换）。
DROP TRIGGER IF EXISTS trg_proof_envelopes_v2_anti_theater;

-- 2. CREATE 新 trigger：antiTheaterReport.hasFail=true 或 canSealConfirmed=false + CONFIRMED → ABORT。
--    canonical JSON 形式: "hasFail":true 或 "canSealConfirmed":false（A §7 权威形状·D1 统一后）。
CREATE TRIGGER trg_proof_envelopes_v2_anti_theater
BEFORE INSERT ON proof_envelopes_v2
FOR EACH ROW
WHEN (NEW.envelope_json LIKE '%"hasFail":true%' OR NEW.envelope_json LIKE '%"canSealConfirmed":false%')
     AND NEW.conclusion = 'CONFIRMED'
BEGIN
  SELECT RAISE(ABORT, 'proof_envelopes_v2: antiTheaterReport.hasFail=true or canSealConfirmed=false, cannot seal CONFIRMED (anti-theater F1)');
END;

INSERT OR IGNORE INTO schema_meta (version, name) VALUES (11, '0011_anti_theater_trigger_v2');
