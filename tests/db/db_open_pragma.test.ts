// tests/db/db_open_pragma.test.ts
//
// F-5-10-002 RED→GREEN: openFarDb 写路径显式固化 busy_timeout=5000，
// 不再依赖 better-sqlite3 隐式默认（换库/升级即静默退化为"立即 BUSY"）。
//
// Authority: 评委10 F-5-10-002 + src/db/open.ts assertPragmaBaseline。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openFarDb } from '../../src/db/open.ts';

test('openFarDb: 写路径显式 busy_timeout=5000（不依赖 better-sqlite3 隐式默认）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-busy-'));
  const dbPath = join(dir, 'test.db');
  const db = openFarDb(dbPath);
  try {
    const bt = db.pragma('busy_timeout', { simple: true }) as number;
    assert.equal(bt, 5000, 'busy_timeout 须显式为 5000ms');
    // 其他基线一并确认未被破坏
    assert.equal(db.pragma('synchronous', { simple: true }), 2, 'synchronous=FULL(2)');
    assert.equal(db.pragma('journal_mode', { simple: true }), 'wal', 'journal_mode=wal');
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1, 'foreign_keys=ON(1)');
  } finally {
    db.close();
  }
});

test('openFarDb: :memory: 写路径也须显式 busy_timeout=5000', () => {
  const db = openFarDb(':memory:');
  try {
    const bt = db.pragma('busy_timeout', { simple: true }) as number;
    assert.equal(bt, 5000, ':memory: 仍须显式 busy_timeout');
  } finally {
    db.close();
  }
});

test('openFarDb: readonly 路径打开成功（不强制设 PRAGMA·不破坏只读流程）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-ro-'));
  const dbPath = join(dir, 'test.db');
  const w = openFarDb(dbPath);
  w.close();
  // readonly 打开不应抛（即使不设 busy_timeout）
  const db = openFarDb(dbPath, { readonly: true });
  try {
    assert.doesNotThrow(() => db.pragma('busy_timeout', { simple: true }));
  } finally {
    db.close();
  }
});
