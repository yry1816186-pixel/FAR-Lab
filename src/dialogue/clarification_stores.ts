/**
 * clarification_stores.ts —— 澄清提问存储（内存 + SQLite 双后端）。
 *
 * 设计要点：
 *   - ClarificationStore 接口统一内存与 SQLite 两种后端。
 *   - InMemoryClarificationStore：Map-based，用于测试与离线场景。
 *   - SqliteClarificationStore：落 dialogue_clarification_questions 表（0012 migration）。
 *   - snake_case↔camelCase 转换在 SQLite 后端内部完成（rowToClarificationQuestion）。
 *   - 不进 canonicalHash（39 §0#5）；不产判定节点（39 §0#2）。
 *
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch。
 */

import type Database from 'better-sqlite3';

import type { ClarificationQuestion } from './dialogue_types.ts';
import { CLARIFICATION_QUESTION_TYPES, isClarificationQuestionType } from './dialogue_types.ts';

// ---------- ClarificationStore 接口 ----------

export interface ClarificationStore {
  /** 存储一条澄清提问记录 */
  store(question: ClarificationQuestion): void;
  /** 按 session 取全部澄清提问（按 createdAt 升序） */
  getBySession(sessionId: string): readonly ClarificationQuestion[];
  /** 按 questionId 取单条（不存在返回 null） */
  getById(questionId: string): ClarificationQuestion | null;
  /** 按 session 取提问数量 */
  countBySession(sessionId: string): number;
}

// ---------- InMemoryClarificationStore ----------

export class InMemoryClarificationStore implements ClarificationStore {
  private readonly records = new Map<string, ClarificationQuestion>();

  store(question: ClarificationQuestion): void {
    this.records.set(question.questionId, question);
  }

  getBySession(sessionId: string): readonly ClarificationQuestion[] {
    return [...this.records.values()]
      .filter((q) => q.sessionId === sessionId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  getById(questionId: string): ClarificationQuestion | null {
    return this.records.get(questionId) ?? null;
  }

  countBySession(sessionId: string): number {
    return this.getBySession(sessionId).length;
  }
}

// ---------- SqliteClarificationStore ----------

interface ClarificationRow {
  question_id: string;
  session_id: string;
  turn_id: string;
  question_type: string;
  question: string;
  created_at: string;
}

function rowToClarificationQuestion(row: ClarificationRow): ClarificationQuestion {
  // SQLite 读出的 question_type 是 string；收窄为 ClarificationQuestionType union。
  // 非法值 = 数据完整性错误（schema CHECK 本应拦截写入），fail-fast 抛错而非掩盖。
  if (!isClarificationQuestionType(row.question_type)) {
    throw new Error(
      `rowToClarificationQuestion: invalid question_type "${row.question_type}" (expected one of ${CLARIFICATION_QUESTION_TYPES.join(', ')})`,
    );
  }
  return {
    questionId: row.question_id,
    sessionId: row.session_id,
    turnId: row.turn_id,
    questionType: row.question_type,
    question: row.question,
    createdAt: row.created_at,
  };
}

export class SqliteClarificationStore implements ClarificationStore {
  // 显式字段声明：Node 24 strip-only 模式不支持 TS parameter property
  // (constructor(private readonly db)) 语法，须用显式字段 + 构造函数赋值。
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    const tableExists = this.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'dialogue_clarification_questions'",
      )
      .get();
    if (tableExists === undefined) {
      throw new Error(
        'SqliteClarificationStore: dialogue_clarification_questions table not found (run 0002_add_dialogue_tables.sql first)',
      );
    }
  }

  store(question: ClarificationQuestion): void {
    this.db
      .prepare(
        `INSERT INTO dialogue_clarification_questions (
          question_id, session_id, turn_id, question_type, question, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        question.questionId,
        question.sessionId,
        question.turnId,
        question.questionType,
        question.question,
        question.createdAt,
      );
  }

  getBySession(sessionId: string): readonly ClarificationQuestion[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM dialogue_clarification_questions WHERE session_id = ? ORDER BY created_at ASC',
      )
      .all(sessionId) as ClarificationRow[];
    return rows.map(rowToClarificationQuestion);
  }

  getById(questionId: string): ClarificationQuestion | null {
    const row = this.db
      .prepare('SELECT * FROM dialogue_clarification_questions WHERE question_id = ?')
      .get(questionId) as ClarificationRow | undefined;
    return row === undefined ? null : rowToClarificationQuestion(row);
  }

  countBySession(sessionId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS count FROM dialogue_clarification_questions WHERE session_id = ?')
      .get(sessionId) as { count: number } | undefined;
    if (row === undefined) {
      throw new Error('SqliteClarificationStore.countBySession: query returned no row');
    }
    return row.count;
  }
}

// ---------- 工厂函数 ----------

export function createInMemoryClarificationStore(): ClarificationStore {
  return new InMemoryClarificationStore();
}

export function createSqliteClarificationStore(db: Database.Database): ClarificationStore {
  return new SqliteClarificationStore(db);
}
