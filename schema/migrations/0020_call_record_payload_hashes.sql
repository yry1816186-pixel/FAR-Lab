-- 0020_call_record_payload_hashes.sql
-- call_records.request_payload_hash: payload 内容哈希覆盖(IC-07 · F-01 修复 · ADR-003)。
--
-- Authority: .far-design/IMPLEMENTATION_CONTRACTS/IC-07.contract.yaml + RT-04(rt04_tree.log)
--
-- 背景(F-01):verifyChainHead 的 canonical 输入只含 8 个元数据列;request_payload/
--   response_payload 无内容哈希 → DROP TRIGGER 旁路后改 payload 字节不可检(rt04_tree.log:
--   after_drop_trigger_tamper ok=true)。
--
-- 边界:
--   1. 非破坏性 ADD COLUMN TEXT(NULL 默认)。append-only 触发器只禁行级 UPDATE/DELETE,
--      不禁止 ALTER TABLE ADD COLUMN(DDL schema 变更)。
--   2. response_payload_hash 自 0001 已存在;本迁移只补 request_payload_hash。
--   3. 老行 request_payload_hash 恒 NULL(append-only 禁止回填)→ 读取侧如实标注
--      legacy-not-covered,不计 tampered。
--   4. 新哈希列只增不改;不进 canonical 链输入(避免历史 current_hash 失效;
--      独立内容寻址列,与链式哈希正交)。
--   5. 导出侧继续不含 payload(call_records.redacted 不变);哈希单向不泄露内容。

ALTER TABLE call_records ADD COLUMN request_payload_hash TEXT;

INSERT OR IGNORE INTO schema_meta (version, name) VALUES (20, '0020_call_record_payload_hashes');
