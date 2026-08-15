-- 0018_evidence_provenance_trigger.sql
-- FUSION-OS-6: evidence_log provenance 跨列不变式 DB 层 trigger（第二层物理兜底·闭合 0017 仅列级 CHECK 的缺口）。
--
-- 背景：0017 仅落 provenance_class 列级 enum CHECK（IN 三值）。两条跨列红线不变式此前**仅**由应用层
-- appendEvidenceLog（repository.ts:200-211）enforce：
--   (a) llm_generated → system_claim_hash IS NOT NULL（LLM 产出须绑系统侧重算 hash·来源不可自填）
--   (b) llm_generated → source_anchor_req IS NULL（LLM 自填字段禁直通 SourceAnchor·forged marker 检测）
-- 任何绕过 appendEvidenceLog 的直接 INSERT（DB 客户端 / 未来代码路径）即可违反——本迁移在 DB 层加 BEFORE
-- INSERT trigger 物理兜底，与应用层正交：应用层先 throw 则 INSERT 不达 DB；直达 DB 则 trigger ABORT。
--
-- 设计参照 0013（FUSION-OS-11 verdict enum guard）：evidence_log 经 0001:85-89 trg_evidence_log_no_update
-- 禁所有 UPDATE、0001:91-95 no_delete 禁 DELETE（strict append-only），故仅需 BEFORE INSERT guard
-- （与 0013:43-52 proof_envelopes_v2 INSERT-only 对称·UPDATE 路径已被 0001 物理封死）。
--
-- 边界：
--   1. CREATE TRIGGER 是 DDL，0001 no_update/no_delete 仅禁行级 UPDATE/DELETE，不禁 CREATE TRIGGER。
--   2. 旧行 provenance_class=system_derived（0017 缺省）→ WHEN 条件 provenance_class='llm_generated' 不命中·零回填影响。
--   3. 不进 cross_lang canonical_hash 白名单（不改 evidence_payload / hash 列·零回归 14 GV）。
--
-- Authority: FUSION-OS-6 +
--            「LLM 不作最终裁决者 / 来源不可自填」红线（落点约束 #9 anti-theater 须 DB trigger 物理兜底）。

PRAGMA foreign_keys = ON;

-- (a) llm_generated → system_claim_hash IS NOT NULL。
DROP TRIGGER IF EXISTS trg_evidence_log_llm_provenance_hash_bi;
CREATE TRIGGER trg_evidence_log_llm_provenance_hash_bi
BEFORE INSERT ON evidence_log
FOR EACH ROW
WHEN NEW.provenance_class = 'llm_generated' AND NEW.system_claim_hash IS NULL
BEGIN
  SELECT RAISE(ABORT, 'evidence_log: llm_generated provenance requires non-null system_claim_hash (FUSION-OS-6 defense-in-depth · 来源不可自填)');
END;

-- (b) llm_generated → source_anchor_req IS NULL。
DROP TRIGGER IF EXISTS trg_evidence_log_llm_provenance_req_null_bi;
CREATE TRIGGER trg_evidence_log_llm_provenance_req_null_bi
BEFORE INSERT ON evidence_log
FOR EACH ROW
WHEN NEW.provenance_class = 'llm_generated' AND NEW.source_anchor_req IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'evidence_log: llm_generated provenance requires null source_anchor_req (FUSION-OS-6 defense-in-depth · forged marker detected)');
END;

INSERT OR IGNORE INTO schema_meta (version, name) VALUES (18, '0018_evidence_provenance_trigger');
