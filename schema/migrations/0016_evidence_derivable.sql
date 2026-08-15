-- 0016_evidence_derivable.sql
-- FUSION-OS-10: evidence_log 行 derivable 标记 + derivable=1 强制重算验证。
--
-- Authority: archived-plan §4 FUSION-OS-10（Open Science host_call_log.derivable 范式）
--            + archived-plan §C FUSION-OS-10。
--
-- 设计（反剧场「系统持有事实重导出」家族·与 F-3 seal 时序 / F-6 provenance 同族）：
--   derivable INTEGER NOT NULL DEFAULT 0 CHECK (derivable IN (0,1))
--     - 0 = 不可重算的外部观测（原始终点·字节须原样存档·不重算）
--     - 1 = 可由系统持有的 canonical 输入重算（评审时 verifyEvidencePayloadHashes 重算 hash 比对·
--           不信任 workload 自填字节·反剧场）
--   evidence_payload_hash TEXT（derivable=1 时 = sha256(canonical JSON of evidence_payload)·可空）
--     - appendEvidenceLog 写入时落 hash；verify 重算 sha256(stored evidence_payload) 比对，失配 → tampered。
--     - 闭合 canonicalHash（hasher.ts:5 只算 stageId/cred/payloadKind/prevHash 4 键·不含 evidence_payload）
--       的缺口：evidence 字节篡改此前不被哈希链捕获，本列加内容寻址绑定。
--
-- 边界（照 0007:6-12 推理）：
--   1. ADD COLUMN 是 DDL schema 变更，0001 trg_evidence_log_no_update/no_delete 仅禁行级 UPDATE/DELETE，不禁 ALTER。
--   2. 不进 cross_lang canonical_hash 白名单（4 键不变·避免破坏 12 GV + cross-lang 一致性）；
--      evidence_payload_hash 是独立内容寻址列，与链式 current_hash 正交。
--   3. 旧行 derivable=0 / evidence_payload_hash=NULL（append-only trigger 禁回填·仅新 INSERT 行携带）。
--
-- forward-only（append-only）：0001-0015 不可变；本迁移仅 ADD COLUMN + INDEX。

PRAGMA foreign_keys = ON;

ALTER TABLE evidence_log ADD COLUMN derivable INTEGER NOT NULL DEFAULT 0 CHECK (derivable IN (0, 1));
ALTER TABLE evidence_log ADD COLUMN evidence_payload_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_evidence_log_derivable ON evidence_log (derivable);

INSERT OR IGNORE INTO schema_meta (version, name) VALUES (16, '0016_evidence_derivable');
