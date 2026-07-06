-- 0012_verdict_trace_persist.sql
-- verdict_nodes 持久化裁决内核结构化输出（P0-2-EXT）：reasonCodes / ruleTrace / decisiveRuleId / evidenceSufficiency。
--
-- Authority: PROJECT_PLAN/04_PROOF_ENVELOPE_AND_VERIFIER.md §3.1（proofHash 白名单含 verdictTrace.*）
--            + §3.4（verdict 层 verdict-critical：reasonCodes/ruleTrace/decisiveRuleId/evidenceSufficiency →
--            改变须被察觉）+ CLAUDE.md §4 P0-2-EXT。
--
-- 背景（为何加列）：decideFiveValueVerdict（verdict_kernel_v2.ts:176）算出 4 字段后被
--   verdictResultFromKernelOutput（legacy_kernel_adapter.ts:299）投影丢弃——既不入 verdict_nodes，
--   也不入 current_hash → 内核裁决理由可被静默篡改无感知。本迁移加 verdict_trace_json（全文·可查可审）
--   + verdict_trace_hash（sha256 绑定）两列；后者由 repository.ts recordVerdict 纳入 current_hash 白名单
--   （与 falsifiability/verifier.ts verifyVerdictNodes 重算对齐）。
--
-- 为何不直接走 V2 ProofEnvelope：V2 envelope（04 §2.1）是 16 字段完整证据嵌入
--   （datasetBindings/workflowBindings/experimentRuns/measurementResults/statisticalResults/protocolFreeze/
--   antiTheaterReport），生产管道未填这些字段——sealProofEnvelopeV2 零生产 caller。强行接线须造 11 个桩
--   字段（零容忍 #5）。本迁移是 V2 之前的「内部 verdict 链 trace 绑定」：verdict_nodes.current_hash
--   覆盖 trace，篡改触发 current_hash 失配（verifyVerdictNodes 捕获）。V2 envelope proofHash 直接绑
--   verdictTrace 是 V2 evidence-embedding 迁移路线（多里程碑），不在本迁移范围（诚实声明）。
--
-- forward-only（不修改 0001）：ALTER TABLE ADD COLUMN + DROP/CREATE trigger，不回写 0001。
--   append-only 纪律：0001 不可变；本迁移仅扩张。
--
-- 边界:
--   1. ADD COLUMN NOT NULL DEFAULT：存量行（如有）取默认 '{}' / ''。fresh test DB 无存量行，不受影响。
--      注：存量行的 current_hash 是旧白名单算的（不含 verdict_trace_hash）→ verifyVerdictNodes 对其重算
--      会失配。本项目无生产存量 DB（竞赛交付·测试用 fresh DB），可接受；生产 DB 迁移需重插 verdict 链。
--   2. DROP IF EXISTS + CREATE（幂等·重复应用安全）。
--   3. 不可变 trigger 扩展两列：否则 UPDATE 这两列不触发 RAISE → 静默篡改（trace_hash 可被换）。

PRAGMA foreign_keys = ON;

-- 1. 加两列（trace 全文 + 绑定 hash）。DEFAULT 保证 NOT NULL 约束对存量行成立。
ALTER TABLE verdict_nodes ADD COLUMN verdict_trace_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE verdict_nodes ADD COLUMN verdict_trace_hash TEXT NOT NULL DEFAULT '';

-- 2. 重建不可变 trigger：把 verdict_trace_json / verdict_trace_hash 纳入 WHEN 守卫。
--    原 0001 trigger 不含这两列 → UPDATE 它们不触发 RAISE（致命：trace 可被静默替换）。
--    保留原「仅 verdict/metric_value/updated_at 可变」语义（verdict 有独立 terminal-rollback trigger）。
DROP TRIGGER IF EXISTS trg_verdict_nodes_immutable_fields;
CREATE TRIGGER trg_verdict_nodes_immutable_fields
BEFORE UPDATE ON verdict_nodes
FOR EACH ROW
WHEN OLD.evidence_id IS NOT NEW.evidence_id
  OR OLD.parent_verdict_id IS NOT NEW.parent_verdict_id
  OR OLD.node_kind IS NOT NEW.node_kind
  OR OLD.falsification_spec IS NOT NEW.falsification_spec
  OR OLD.threshold_spec IS NOT NEW.threshold_spec
  OR OLD.conflicting_evidence_count IS NOT NEW.conflicting_evidence_count
  OR OLD.scope_slip_text IS NOT NEW.scope_slip_text
  OR OLD.untested_reason IS NOT NEW.untested_reason
  OR OLD.source_anchor IS NOT NEW.source_anchor
  OR OLD.replay_prover IS NOT NEW.replay_prover
  OR OLD.prev_hash IS NOT NEW.prev_hash
  OR OLD.current_hash IS NOT NEW.current_hash
  OR OLD.verdict_trace_json IS NOT NEW.verdict_trace_json
  OR OLD.verdict_trace_hash IS NOT NEW.verdict_trace_hash
  OR OLD.created_at IS NOT NEW.created_at
BEGIN
  SELECT RAISE(ABORT, 'verdict_nodes: only verdict/metric_value/updated_at are mutable');
END;

INSERT OR IGNORE INTO schema_meta (version, name) VALUES (12, '0012_verdict_trace_persist');
