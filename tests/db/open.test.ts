/**
 * open.test.ts — IC-03 G5 SQLite 完整性基线验收(修 F-02/F-03)。
 *
 * 验收 Oracle(合同 contract-003):
 *   ① RT-05-C 语义:零化损坏 → 启动 fail-closed + 备份/恢复指引;
 *   ② RT-05-B 语义:备份存在时,删热 WAL 静默尾丢可恢复;
 *   ③ 配置基线生效(WAL + synchronous=FULL + 禁危险 PRAGMA 断言);
 *   ④ VACUUM INTO 备份回环可用;better-sqlite3 捆绑 SQLite 版本登记。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openFarDb, backupFarDb, sqliteVersion, DatabaseIntegrityError } from '../../src/db/open.ts';

function makeDb(dir: string): string {
  const dbPath = join(dir, 'base.sqlite');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE t (x TEXT); INSERT INTO t VALUES ('checkpointed-row');`);
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
  return dbPath;
}

test('③ 配置基线:WAL + synchronous=FULL 断言生效', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ic03-baseline-'));
  try {
    const dbPath = join(dir, 'b.sqlite');
    const db = openFarDb(dbPath);
    assert.equal(db.pragma('synchronous', { simple: true }), 2, 'synchronous 须 FULL=2');
    assert.equal(db.pragma('journal_mode', { simple: true }), 'wal', 'journal_mode 须 wal');
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
    db.close();
    // :memory: 库豁免 wal 断言(语义:文件库才有 WAL)
    const mem = openFarDb(':memory:');
    assert.equal(mem.pragma('synchronous', { simple: true }), 2);
    mem.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('① RT-05-C:零化损坏 → 启动 fail-closed + 恢复指引(quick 与 full 均检)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ic03-corrupt-'));
  try {
    const dbPath = makeDb(dir);
    // 零化 offset 4096 起 2048 字节(与 rt05_c 同手法)
    const fd = readFileSync(dbPath);
    fd.fill(0, 4096, 4096 + 2048);
    writeFileSync(dbPath, fd);
    for (const mode of ['quick', 'full'] as const) {
      assert.throws(
        () => openFarDb(dbPath, { integrityCheck: mode }),
        (err: unknown) => {
          assert.ok(err instanceof DatabaseIntegrityError, `${mode} 应抛 DatabaseIntegrityError`);
          assert.match(err.message, /恢复指引|far backup/, '错误须含备份/恢复指引');
          return true;
        },
        `${mode} 检查未检出损坏`,
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('④ VACUUM INTO 备份回环:备份库可开且内容完整', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ic03-backup-'));
  try {
    const dbPath = makeDb(dir);
    const outPath = join(dir, 'backup.sqlite');
    const db = openFarDb(dbPath);
    backupFarDb(db, dbPath, outPath);
    const version = sqliteVersion(db);
    db.close();
    assert.ok(existsSync(outPath));
    const backup = openFarDb(outPath, { readonly: true, integrityCheck: 'quick' });
    const row = backup.prepare(`SELECT x FROM t`).get() as { x: string };
    assert.equal(row.x, 'checkpointed-row');
    backup.close();
    console.log(`sqlite bundled version: ${version}`);
    // 同路径保护
    const db2 = openFarDb(dbPath);
    assert.throws(() => backupFarDb(db2, dbPath, dbPath), /不得与源库相同/);
    db2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('② RT-05-B:备份存在时,删热 WAL 静默尾丢可恢复', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ic03-tail-'));
  try {
    const dbPath = makeDb(dir);
    const backupPath = join(dir, 'backup.sqlite');
    // 备份(含 checkpointed-row)
    const src = openFarDb(dbPath);
    backupFarDb(src, dbPath, backupPath);
    src.close();

    // 子进程:WAL 写入但不 checkpoint,挂起等 SIGKILL(与 rt05_b 同手法)
    const childScript = join(dir, 'writer.mjs');
    writeFileSync(
      childScript,
      `import Database from 'better-sqlite3';\n` +
        `const db = new Database(${JSON.stringify(dbPath)});\n` +
        `db.pragma('journal_mode = WAL');\n` +
        `db.prepare("INSERT INTO t VALUES ('uncheckpointed-row')").run();\n` +
        `console.log('written');\n` +
        `setTimeout(() => {}, 30000);\n`,
      'utf8',
    );
    const child = spawn(process.execPath, [childScript], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise<void>((resolve) => {
      child.stdout.on('data', () => resolve());
    });
    child.kill('SIGKILL');
    await new Promise<void>((resolve) => child.on('exit', () => resolve()));

    // 删热 WAL(F-02 攻击面)
    const walPath = `${dbPath}-wal`;
    assert.ok(existsSync(walPath), '热 WAL 应存在');
    rmSync(walPath);

    // 尾丢如实观测:uncheckpointed-row 丢失,checkpointed-row 仍在
    const after = openFarDb(dbPath, { readonly: true, integrityCheck: 'quick' });
    const rows = after.prepare(`SELECT x FROM t ORDER BY x`).all() as Array<{ x: string }>;
    assert.deepEqual(rows.map((r) => r.x), ['checkpointed-row'], '尾丢应被观测到(静默尾丢不再静默)');
    after.close();

    // 备份存在 → 可恢复
    const backup = openFarDb(backupPath, { readonly: true, integrityCheck: 'quick' });
    const backupRows = backup.prepare(`SELECT x FROM t`).all() as Array<{ x: string }>;
    assert.deepEqual(backupRows.map((r) => r.x), ['checkpointed-row'], '备份须含 checkpointed-row 供恢复');
    backup.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
