-- 0002_add_dialogue_tables.sql
-- 研究对话层三表（research_sessions / dialogue_turns / intent_hypotheses）+ 澄清提问记录表。
--
-- Authority: FAR_CHAIN_DEV_SPEC/39 §1 接缝 + 02 §3.6-3.8（DDL SSOT·设计冻结）+ 31 §0（增量边界）。
--
-- 边界声明：
--   1. 不修改 0001_initial.sql 的核心五表。本迁移只新增四张对话层表。
--   2. 不进 hash 链（39 §0#5）：对话内容均不进 canonicalHash。
--   3. purpose_tag='dialogue' 已在 0001 §3.1 CHECK 中定义（9 值），本迁移不重建 call_records。
--   4. 与旧五表的单向连接：dialogue_turns.tool_call_seq → call_records.seq（ON DELETE SET NULL）。
--
-- snake_case 纪律：SQL 物理列 snake_case；TS 内存字段 camelCase（见 src/dialogue/dialogue_types.ts）。

PRAGMA foreign_keys = ON;

-- ===== §3.6 research_sessions：研究对话 session 元数据（5 值状态机） =====
CREATE TABLE IF NOT EXISTS research_sessions (
  session_id      TEXT PRIMARY KEY,
  user_id         TEXT,
  status          TEXT NOT NULL
    CHECK (status IN (
      'created', 'active', 'paused', 'finalized', 'archived'
    )),
  created_at      TEXT NOT NULL,
  finalized_at    TEXT,
  linked_run_id   TEXT
);

CREATE INDEX IF NOT EXISTS idx_research_sessions_status ON research_sessions(status);
CREATE INDEX IF NOT EXISTS idx_research_sessions_user ON research_sessions(user_id);

-- ===== §3.7 dialogue_turns：对话每轮记录（3 值角色枚举 + turn_no 唯一） =====
CREATE TABLE IF NOT EXISTS dialogue_turns (
  turn_id                  TEXT PRIMARY KEY,
  session_id               TEXT NOT NULL REFERENCES research_sessions(session_id) ON DELETE CASCADE,
  turn_no                  INTEGER NOT NULL,
  role                     TEXT NOT NULL
    CHECK (role IN ('user', 'assistant', 'system')),
  content                  TEXT NOT NULL,
  intent_hypothesis_id     TEXT REFERENCES intent_hypotheses(hypothesis_id) ON DELETE SET NULL,
  clarification_question_id TEXT,
  tool_call_seq            INTEGER REFERENCES call_records(seq) ON DELETE SET NULL,
  created_at               TEXT NOT NULL,
  UNIQUE(session_id, turn_no)
);

CREATE INDEX IF NOT EXISTS idx_dialogue_turns_session ON dialogue_turns(session_id, turn_no);
CREATE INDEX IF NOT EXISTS idx_dialogue_turns_role ON dialogue_turns(role);

-- ===== §3.8 intent_hypotheses：意图推断结果（intent_label 8 值 + 3 值状态机） =====
CREATE TABLE IF NOT EXISTS intent_hypotheses (
  hypothesis_id    TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL REFERENCES research_sessions(session_id) ON DELETE CASCADE,
  turn_id          TEXT NOT NULL REFERENCES dialogue_turns(turn_id) ON DELETE CASCADE,
  intent_label     TEXT NOT NULL
    CHECK (intent_label IN (
      'hypothesis_generation',
      'literature_review',
      'experiment_design',
      'data_analysis',
      'phenomenon_explanation',
      'method_comparison',
      'reproducibility_check',
      'open_ended_exploration'
    )),
  confidence       REAL NOT NULL
    CHECK (confidence >= 0.0 AND confidence <= 1.0),
  rationale        TEXT NOT NULL,
  status           TEXT NOT NULL
    CHECK (status IN ('pending', 'confirmed', 'rejected')),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_intent_hypotheses_session ON intent_hypotheses(session_id, status);
CREATE INDEX IF NOT EXISTS idx_intent_hypotheses_intent ON intent_hypotheses(intent_label);

-- ===== dialogue_clarification_questions：澄清提问记录（dialogue 层内部表·39 §5） =====
CREATE TABLE IF NOT EXISTS dialogue_clarification_questions (
  question_id      TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL REFERENCES research_sessions(session_id) ON DELETE CASCADE,
  turn_id          TEXT NOT NULL REFERENCES dialogue_turns(turn_id) ON DELETE CASCADE,
  question_type    TEXT NOT NULL
    CHECK (question_type IN (
      'scope', 'metric', 'baseline', 'dataset', 'method', 'general'
    )),
  question         TEXT NOT NULL,
  created_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dialogue_clarifications_session ON dialogue_clarification_questions(session_id);
CREATE INDEX IF NOT EXISTS idx_dialogue_clarifications_type ON dialogue_clarification_questions(question_type);

INSERT OR IGNORE INTO schema_meta (version, name) VALUES (2, '0002_add_dialogue_tables');
