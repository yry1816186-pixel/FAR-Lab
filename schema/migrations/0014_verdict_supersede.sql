-- 0014_verdict_supersede.sql
-- FUSION-OS-12: verdict_nodes.superseded_by 自指 FK + 重评写新行设指针 + WHERE superseded_by IS NULL 查当前裁决。
--
-- Authority: FUSION-OS-12（Open Science memories.superseded_by 范式）
--            + FUSION-OS-12。
--
-- 为何不重建 trg_verdict_nodes_immutable_fields（设计决策·与 0012 相反）：
--   supersede 须 UPDATE 旧行 superseded_by = 新 verdict_id。immutable_fields（0001:128-146·0012 重建）
--   的 WHEN = 「列出的列被改 → RAISE」；superseded_by 不在 WHEN → UPDATE 不触发 RAISE → 天然可变。
--   0012 重建是把 verdict_trace_json/hash 纳入 WHEN（使其 immutable·verdict-critical）；superseded_by 应可变
--   （supersede 所需），故不纳入 WHEN = 不重建。误纳入会破坏 supersede（UPDATE 被拒）。
--
-- superseded_by 不进 current_hash 白名单（hash 决策）：
--   supersede 不改 old verdict 内容（verdict/evidence/trace 不变），只标记被取代（元数据）。若进 current_hash，
--   supersede 时 old.current_hash 变 → 破坏 prev_hash 链式哈希（cross-lang 一致性 + 12 GV + verifyVerdictNodes 重算）。
--   两层一致：immutable_fields WHEN 不含它（可变）+ current_hash 白名单不含它（不绑定）。
--
-- forward-only（append-only）：0001-0013 不可变；本迁移仅 ALTER ADD COLUMN + INDEX。
-- 自指 FK 先例：0001:100 parent_verdict_id TEXT REFERENCES verdict_nodes(verdict_id)。

PRAGMA foreign_keys = ON;

ALTER TABLE verdict_nodes ADD COLUMN superseded_by TEXT REFERENCES verdict_nodes (verdict_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_verdict_nodes_superseded_by ON verdict_nodes (superseded_by);

INSERT OR IGNORE INTO schema_meta (version, name) VALUES (14, '0014_verdict_supersede');
