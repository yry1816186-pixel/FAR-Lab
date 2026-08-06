-- 0024_hypothesize_idempotency.sql
-- 审计 P0-2：POST /hypothesize 幂等键支持——防双击/网络重试导致重复执行 LLM 与重复写证据链。
--
-- 语义：
--   - idempotency_key 由客户端生成（确定性 hash：researchInput+mode+dialogueMode）。
--   - 首次请求 INSERT（status=pending）→ 执行 run → UPDATE done + response_json。
--   - 重复请求命中已存在 key：status=done → 返回缓存的 response_json（cached=true）；
--     status=pending（并发同 key）→ 409。
--   - 不提供 key 的请求不记录（向后兼容）。
--
-- 零容忍合规：CHECK 约束防非法状态；response_json 由服务端 JSON 序列化（非用户输入直接拼接）。

CREATE TABLE IF NOT EXISTS hypothesize_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  research_input TEXT NOT NULL,
  mode TEXT,
  dialogue_mode TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'done')),
  run_id TEXT,
  response_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_hypothesize_idem_status
  ON hypothesize_idempotency (status);
