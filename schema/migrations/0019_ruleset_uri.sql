-- 0019_ruleset_uri.sql
-- proof_envelopes.ruleset_uri: 内核规则集版本 URI(ADR-007 H1+H3 · IC-01)。
--
-- Authority: .far-design/IMPLEMENTATION_CONTRACTS/IC-01.contract.yaml + ADR-007
--
-- 边界:
--   1. 非破坏性 ADD COLUMN TEXT(NULL 默认)。append-only 触发器只禁行级
--      UPDATE/DELETE,不禁止 ALTER TABLE ADD COLUMN(DDL schema 变更)。
--   2. NULL = legacy V1 信封(版本化落地前密封);读取/导出/验证一律按
--      farlab.dev/ruleset/v1 默认派发(IC-01 migration 条款,不追溯回填)。
--   3. 新密封信封由 sealer.ts 硬编码写入 CURRENT_RULESET_URI;
--      版本 bump 不追溯历史行(invariant: 旧证明按声明版本复算)。

ALTER TABLE proof_envelopes ADD COLUMN ruleset_uri TEXT;

INSERT OR IGNORE INTO schema_meta (version, name) VALUES (19, '0019_ruleset_uri');
