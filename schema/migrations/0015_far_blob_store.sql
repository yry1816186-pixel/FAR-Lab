-- 0015_far_blob_store.sql
-- FUSION-OS-9: 内容寻址 blob CAS 表（hash PK·evidence/FEC Plan/kernel trace 按 hash 去重）。
--
-- Authority: FAR_LAB_MASTER_PLAN/FUSION_OPEN_SCIENCE_DESIGN.md §4 FUSION-OS-9（Open Science content-addressable CAS 范式）
--            + FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md §C FUSION-OS-9。
--
-- 设计（内容寻址·去重·append-only·反剧场）：
--   hash = sha256(canonical JSON of content)（64-hex·PK·同一内容全局去重·内容寻址 SSOT）。
--   content TEXT（blob canonical JSON 序列化字节·复用 evidence_log/hasher.ts canonicalJson 保证字节稳定）。
--   size_bytes INTEGER（content utf8 字节数·非负·容量审计）。
--   append-only trigger（照 evidence_log 0001:85-95 范式·禁 UPDATE/DELETE·hash 不可变保证 CAS 完整性）。
--
-- 为何 hash PK 而非自增 id（CAS 范式）：
--   内容寻址 = hash 即地址。同内容写两次 → INSERT OR IGNORE 去重（单行·单 hash）。篡改 content → hash 失配
--   → 查不到（防 theater：artifact 不可静默替换）。与 evidence_log append-only 正交（evidence 按链式 prev_hash，
--   blob 按内容 hash 去重·不同维度）。
--
-- forward-only（append-only）：0001-0014 不可变；本迁移仅 CREATE TABLE + INDEX + TRIGGER。

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS far_blob_store (
  hash TEXT PRIMARY KEY CHECK (length(hash) = 64),
  content TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_far_blob_store_created_at ON far_blob_store (created_at);

CREATE TRIGGER IF NOT EXISTS trg_far_blob_store_no_update
BEFORE UPDATE ON far_blob_store
BEGIN
  SELECT RAISE(ABORT, 'far_blob_store is content-addressable CAS: UPDATE forbidden');
END;

CREATE TRIGGER IF NOT EXISTS trg_far_blob_store_no_delete
BEFORE DELETE ON far_blob_store
BEGIN
  SELECT RAISE(ABORT, 'far_blob_store is content-addressable CAS: DELETE forbidden');
END;

INSERT OR IGNORE INTO schema_meta (version, name) VALUES (15, '0015_far_blob_store');
