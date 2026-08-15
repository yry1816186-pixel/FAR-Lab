-- 0007_add_degraded_from.sql
-- call_records.degraded_from: FallbackChain 降级来源模型 id 审计列。
--
-- Authority: .2/§9 (FallbackChain) + 24 §5
--
-- 边界:
--   1. 非破坏性 ADD COLUMN TEXT（NULL 默认）。0001 trg_call_records_no_update/no_delete
--      仅禁止行级 UPDATE/DELETE，不禁止 ALTER TABLE ADD COLUMN（DDL schema 变更）。
--   2. 不进 cross_lang canonical_hash 白名单（hasher.ts / canonical_json.py 只算
--      stageId/cred/payloadKind/prevHash 4 键）。degraded_from 是纯审计列，
--      记录"该次调用由哪个模型降级而来"，不影响链式哈希确定性。
--   3. 旧行 degraded_from 恒为 NULL（append-only trigger 禁止回填；
--      降级是运行时新信息，仅新 INSERT 行携带）。

ALTER TABLE call_records ADD COLUMN degraded_from TEXT;

INSERT OR IGNORE INTO schema_meta (version, name) VALUES (7, '0007_add_degraded_from');
