import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';

import type { ClarificationQuestion } from '../../src/dialogue/dialogue_types.ts';
import {
  createInMemoryClarificationStore,
  createSqliteClarificationStore,
  InMemoryClarificationStore,
  SqliteClarificationStore,
} from '../../src/dialogue/clarification_stores.ts';

const dialogueDdl = readFileSync(new URL('../../schema/migrations/0002_add_dialogue_tables.sql', import.meta.url), 'utf8');
const coreDdl = readFileSync(new URL('../../schema/migrations/0001_initial.sql', import.meta.url), 'utf8');

function makeQuestion(overrides: Partial<ClarificationQuestion> = {}): ClarificationQuestion {
  return {
    questionId: 'q-001',
    sessionId: 'sess-001',
    turnId: 'turn-001',
    questionType: 'scope',
    question: 'What is the scope of your research?',
    createdAt: '2026-06-27T00:00:00Z',
    ...overrides,
  };
}

function openDialogueDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(coreDdl);
  db.exec(dialogueDdl);
  return db;
}

test('InMemoryClarificationStore stores and retrieves a question', () => {
  const store = new InMemoryClarificationStore();
  const q = makeQuestion();
  store.store(q);
  assert.equal(store.getById('q-001')?.questionId, 'q-001');
});

test('InMemoryClarificationStore getBySession returns sorted by createdAt', () => {
  const store = new InMemoryClarificationStore();
  store.store(makeQuestion({ questionId: 'q-2', createdAt: '2026-06-27T00:00:02Z' }));
  store.store(makeQuestion({ questionId: 'q-1', createdAt: '2026-06-27T00:00:01Z' }));
  store.store(makeQuestion({ questionId: 'q-3', sessionId: 'other', createdAt: '2026-06-27T00:00:00Z' }));
  const result = store.getBySession('sess-001');
  assert.equal(result.length, 2);
  assert.equal(result[0]?.questionId, 'q-1');
  assert.equal(result[1]?.questionId, 'q-2');
});

test('InMemoryClarificationStore getById returns null for missing', () => {
  const store = new InMemoryClarificationStore();
  assert.equal(store.getById('nonexistent'), null);
});

test('InMemoryClarificationStore countBySession counts correctly', () => {
  const store = new InMemoryClarificationStore();
  store.store(makeQuestion({ questionId: 'q-1' }));
  store.store(makeQuestion({ questionId: 'q-2' }));
  store.store(makeQuestion({ questionId: 'q-3', sessionId: 'other' }));
  assert.equal(store.countBySession('sess-001'), 2);
  assert.equal(store.countBySession('other'), 1);
  assert.equal(store.countBySession('none'), 0);
});

test('createInMemoryClarificationStore factory works', () => {
  const store = createInMemoryClarificationStore();
  store.store(makeQuestion());
  assert.equal(store.countBySession('sess-001'), 1);
});

test('SqliteClarificationStore stores and retrieves a question', () => {
  const db = openDialogueDb();
  try {
    const store = new SqliteClarificationStore(db);
    db.prepare(`INSERT INTO research_sessions (session_id, status, created_at) VALUES (?, ?, ?)`).run('sess-001', 'active', '2026-06-27T00:00:00Z');
    db.prepare(`INSERT INTO dialogue_turns (turn_id, session_id, turn_no, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run('turn-001', 'sess-001', 1, 'user', 'test', '2026-06-27T00:00:00Z');
    store.store(makeQuestion());
    const retrieved = store.getById('q-001');
    assert.equal(retrieved?.questionId, 'q-001');
    assert.equal(retrieved?.questionType, 'scope');
  } finally {
    db.close();
  }
});

test('SqliteClarificationStore getBySession returns sorted results', () => {
  const db = openDialogueDb();
  try {
    const store = new SqliteClarificationStore(db);
    db.prepare(`INSERT INTO research_sessions (session_id, status, created_at) VALUES (?, ?, ?)`).run('sess-001', 'active', '2026-06-27T00:00:00Z');
    db.prepare(`INSERT INTO dialogue_turns (turn_id, session_id, turn_no, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run('turn-001', 'sess-001', 1, 'user', 'test', '2026-06-27T00:00:00Z');
    store.store(makeQuestion({ questionId: 'q-2', createdAt: '2026-06-27T00:00:02Z' }));
    store.store(makeQuestion({ questionId: 'q-1', createdAt: '2026-06-27T00:00:01Z' }));
    const result = store.getBySession('sess-001');
    assert.equal(result.length, 2);
    assert.equal(result[0]?.questionId, 'q-1');
    assert.equal(result[1]?.questionId, 'q-2');
  } finally {
    db.close();
  }
});

test('SqliteClarificationStore getById returns null for missing', () => {
  const db = openDialogueDb();
  try {
    const store = new SqliteClarificationStore(db);
    assert.equal(store.getById('nonexistent'), null);
  } finally {
    db.close();
  }
});

test('SqliteClarificationStore countBySession counts correctly', () => {
  const db = openDialogueDb();
  try {
    const store = new SqliteClarificationStore(db);
    db.prepare(`INSERT INTO research_sessions (session_id, status, created_at) VALUES (?, ?, ?)`).run('sess-001', 'active', '2026-06-27T00:00:00Z');
    db.prepare(`INSERT INTO dialogue_turns (turn_id, session_id, turn_no, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run('turn-001', 'sess-001', 1, 'user', 'test', '2026-06-27T00:00:00Z');
    store.store(makeQuestion({ questionId: 'q-1' }));
    store.store(makeQuestion({ questionId: 'q-2' }));
    assert.equal(store.countBySession('sess-001'), 2);
    assert.equal(store.countBySession('none'), 0);
  } finally {
    db.close();
  }
});

test('SqliteClarificationStore throws if table does not exist', () => {
  const db = new Database(':memory:');
  try {
    assert.throws(() => new SqliteClarificationStore(db), /table not found/);
  } finally {
    db.close();
  }
});

test('createSqliteClarificationStore factory works', () => {
  const db = openDialogueDb();
  try {
    db.prepare(`INSERT INTO research_sessions (session_id, status, created_at) VALUES (?, ?, ?)`).run('sess-001', 'active', '2026-06-27T00:00:00Z');
    db.prepare(`INSERT INTO dialogue_turns (turn_id, session_id, turn_no, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run('turn-001', 'sess-001', 1, 'user', 'test', '2026-06-27T00:00:00Z');
    const store = createSqliteClarificationStore(db);
    store.store(makeQuestion());
    assert.equal(store.countBySession('sess-001'), 1);
  } finally {
    db.close();
  }
});

test('both stores produce identical results for same input', () => {
  const memStore = createInMemoryClarificationStore();
  const db = openDialogueDb();
  try {
    db.prepare(`INSERT INTO research_sessions (session_id, status, created_at) VALUES (?, ?, ?)`).run('sess-001', 'active', '2026-06-27T00:00:00Z');
    db.prepare(`INSERT INTO dialogue_turns (turn_id, session_id, turn_no, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run('turn-001', 'sess-001', 1, 'user', 'test', '2026-06-27T00:00:00Z');
    const sqliteStore = createSqliteClarificationStore(db);
    const q = makeQuestion();
    memStore.store(q);
    sqliteStore.store(q);
    const memResult = memStore.getById('q-001');
    const sqliteResult = sqliteStore.getById('q-001');
    assert.deepEqual(memResult, sqliteResult);
  } finally {
    db.close();
  }
});
