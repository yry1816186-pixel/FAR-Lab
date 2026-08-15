-- 0017_evidence_provenance_class.sql
-- FUSION-OS-6: evidence_log provenance_class tag + system_claim_hash 绑定（LLM 产出 provenance 强制 null + 系统 hash 重算）。
--
-- Authority: FUSION-OS-6（Open Science data_vid=None + forged marker 范式）
--            +  FUSION-OS-6「LLM 不作最终裁决者 / 来源不可自填」红线。
--
-- 设计（反剧场「来源不可自填」家族·与 F-5 AST 门 / F-10 derivable 同族）：
--   provenance_class TEXT NOT NULL DEFAULT 'system_derived' CHECK (IN 三值)
--     - system_derived（缺省）= 系统持有 canonical 输入导出（可信·原始终点）
--     - llm_generated       = LLM 产出（不可信·red-line：不得直接升 CONFIRMED/REFUTED，须配 system_claim_hash 绑定）
--     - human               = 人工录入（外部观测·须人工核验）
--   system_claim_hash TEXT（llm_generated 时 = sha256(canonical JSON of {claimText, canonicalSystemInput, rawResponseHash})·可空）
--     - bindProvenance（external_facts.ts）系统侧重导出：claimText + canonicalSystemInput 由系统持有，
--       非 LLM 自填；appendEvidenceLog fail-closed：llm_generated 须 system_claim_hash 非空 + dashscopeRequestId=null。
--     - 闭合 extractExternalFact（external_facts.ts:26-30 直通 response.credential.dashscopeRequestId/isoTimestamp）
--       的自填窗口：llm_generated evidence 的 SourceAnchor.dashscopeRequestId 强制 null（forged marker 检测）。
--
-- 边界（照 0007:6-12 / 0016 推理）：
--   1. ADD COLUMN 是 DDL，0001 trg_evidence_log_no_update/no_delete 仅禁行级 UPDATE/DELETE，不禁 ALTER。
--   2. 不进 cross_lang canonical_hash 白名单（4 键不变·与 0016 evidence_payload_hash 同·零回归 14 GV）。
--   3. 旧行 provenance_class=system_derived / system_claim_hash=NULL（append-only 禁回填·仅新 INSERT 行携带）。
--
-- forward-only（append-only）：0001-0016 不可变；本迁移仅 ADD COLUMN + INDEX。

PRAGMA foreign_keys = ON;

ALTER TABLE evidence_log ADD COLUMN provenance_class TEXT NOT NULL DEFAULT 'system_derived'
  CHECK (provenance_class IN ('system_derived', 'llm_generated', 'human'));
ALTER TABLE evidence_log ADD COLUMN system_claim_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_evidence_log_provenance_class ON evidence_log (provenance_class);

INSERT OR IGNORE INTO schema_meta (version, name) VALUES (17, '0017_evidence_provenance_class');
