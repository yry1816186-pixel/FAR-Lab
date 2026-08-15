-- 0021_lifecycle_events.sql
-- lifecycle_events: 撤回/纠正/supersession 生命周期派生记录(IC-05 · PT-8 · ADR-004/012/021)。
--
-- Authority: docs/design/machine-readable/state-machines/retraction_lifecycle.yaml(冻结)+
--            design ledger
--
-- 设计要点:
--   1. 墓碑化 append-only:状态迁移以派生记录表达,原记录永不删除(hash 保留)。
--   2. 状态机(冻结 SSOT):active→contested;contested→active/corrected/retracted/superseded;
--      corrected/retracted/superseded=终态(不可逆)。非法迁移由 TS 执行层 fail-closed 拒绝。
--   3. 审计:每事件 actor+reason+created_at;事件级 prev_hash/current_hash 链
--      (canonical 输入=target_kind/target_id/from_state/to_state/actor/reason/prev_hash)
--      使文件级旁路篡改可检(与 call_records 链同构)。
--   4. ADR-021:设计稿不变量原文为「全部迁移入 falsification_audit_events」;
--      该表 contract_id FK RESTRICT + rule_id CHECK(RULE-FS-001/001b/002/003)
--      + check_kind='falsification_sufficiency' 均为 falsification 审计专用,
--      生命周期事件不属于其语义域;审计等价性由本表 append-only+hash 链+触发器提供
--      (见 design ledger)。
--   5. target 存在性不做 FK(目标跨多表,append-only 审计台账语义;存在性核查在执行层)。

CREATE TABLE IF NOT EXISTS lifecycle_events (
  event_id     TEXT PRIMARY KEY,
  target_kind  TEXT NOT NULL
    CHECK (target_kind IN ('claim', 'verdict_node', 'proof_envelope', 'evidence')),
  target_id    TEXT NOT NULL,
  from_state   TEXT NOT NULL
    CHECK (from_state IN ('active', 'contested', 'corrected', 'retracted', 'superseded')),
  to_state     TEXT NOT NULL
    CHECK (to_state IN ('active', 'contested', 'corrected', 'retracted', 'superseded')),
  actor        TEXT NOT NULL,
  reason       TEXT NOT NULL,
  audit_ref    TEXT,
  prev_hash    TEXT NOT NULL CHECK (length(prev_hash) = 64),
  current_hash TEXT NOT NULL CHECK (length(current_hash) = 64),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_events_target ON lifecycle_events (target_kind, target_id);

CREATE TRIGGER IF NOT EXISTS trg_lifecycle_events_no_update
BEFORE UPDATE ON lifecycle_events
BEGIN
  SELECT RAISE(ABORT, 'lifecycle_events is append-only: UPDATE forbidden');
END;

CREATE TRIGGER IF NOT EXISTS trg_lifecycle_events_no_delete
BEFORE DELETE ON lifecycle_events
BEGIN
  SELECT RAISE(ABORT, 'lifecycle_events is append-only: DELETE forbidden');
END;

INSERT OR IGNORE INTO schema_meta (version, name) VALUES (21, '0021_lifecycle_events');
