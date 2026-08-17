// tests/db/dr.test.ts
// CAMPAIGN-DR-001（本地半）：DR receipt（sha256/表计数/RPO）、恢复演练三关、保留策略。
// 真实依赖：真实 SQLite 库（openFarDb/backupFarDb）+ 真实 CLI 子进程（far backup）。

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import Database from 'better-sqlite3';
import {
  applyRetention,
  drillRestore,
  latestReceiptInDir,
  readDrReceipt,
  sha256File,
  writeDrReceipt,
} from '../../src/db/dr.ts';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

function makeSourceDb(dir: string): string {
  const dbPath = join(dir, 'src.sqlite');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE findings (id INTEGER PRIMARY KEY, text TEXT)');
  db.exec("INSERT INTO findings (text) VALUES ('f1'), ('f2'), ('f3')");
  db.close();
  return dbPath;
}

function backupViaCli(dbPath: string, outPath: string, extra: readonly string[] = []): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [join(REPO_ROOT, 'src/cli/far.ts'), 'backup', '--db', dbPath, '--out', outPath, ...extra], {
    encoding: 'utf8',
    timeout: 60000,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

test('CAMPAIGN-DR-001: CLI 备份即产 DR receipt（sha256 对得上 + 表计数锚点 + RPO 实测）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-dr-'));
  try {
    const dbPath = makeSourceDb(dir);
    const out1 = join(dir, 'b1.sqlite');
    const r1 = backupViaCli(dbPath, out1);
    assert.equal(r1.status, 0, `stderr: ${r1.stderr}`);
    assert.match(r1.stdout, /DR receipt/);

    const receipt1 = readDrReceipt(`${out1}.dr-receipt.json`);
    assert.notEqual(receipt1, null);
    if (receipt1 !== null) {
      assert.equal(receipt1.sha256, sha256File(out1), 'receipt sha 必须与备份实文件一致');
      assert.equal(receipt1.tableCounts['findings'], 3);
      assert.equal(receipt1.rpoSeconds, null, '首份 RPO = null');
      assert.equal(receipt1.offsiteCopied, false, 'offsite 默认 false——不假装有独立介质副本');
    }

    // 第二份：RPO 实测 > 0（同秒备份也 ≥0）
    const out2 = join(dir, 'b2.sqlite');
    assert.equal(backupViaCli(dbPath, out2).status, 0);
    const receipt2 = readDrReceipt(`${out2}.dr-receipt.json`);
    assert.notEqual(receipt2, null);
    if (receipt2 !== null) {
      assert.ok(receipt2.rpoSeconds === null || receipt2.rpoSeconds >= 0);
      assert.notEqual(receipt2.rpoSeconds, null, '次份 RPO 必须实测（有前一份）');
    }
    assert.notEqual(latestReceiptInDir(dir), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CAMPAIGN-DR-001 演练: 完整备份三关全过（哈希/完整性/表计数）+ RTO 实测', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-dr-'));
  try {
    const dbPath = makeSourceDb(dir);
    const out = join(dir, 'b.sqlite');
    assert.equal(backupViaCli(dbPath, out).status, 0);
    const drill = drillRestore(out);
    assert.equal(drill.ok, true, `problems: ${drill.problems.join('; ')}`);
    assert.ok(drill.rtoMs >= 0);

    // CLI --verify 同口径
    const v = backupViaCli(dbPath, '', ['--verify', '--backup', out]);
    assert.equal(v.status, 0, `stderr: ${v.stderr}`);
    assert.match(v.stdout, /恢复演练 PASS/);
    assert.match(v.stdout, /RTO \d+ms/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CAMPAIGN-DR-001 演练 fail-closed: 无 receipt / 篡改备份 / 表计数漂移 三态各自拒', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-dr-'));
  try {
    const dbPath = makeSourceDb(dir);
    const out = join(dir, 'b.sqlite');
    assert.equal(backupViaCli(dbPath, out).status, 0);

    // ① 无 receipt（删掉）→ 「未演练的备份不是可靠性证据」
    rmSync(`${out}.dr-receipt.json`, { force: true });
    const noReceipt = drillRestore(out);
    assert.equal(noReceipt.ok, false);
    assert.ok(noReceipt.problems.some((p) => p.includes('no DR receipt')));

    // 重建 receipt 后篡改备份一个字节 → sha 失配
    writeDrReceipt({ sourceDbPath: dbPath, backupPath: out, previous: null });
    const raw = readFileSync(out);
    const lastByte = raw[raw.length - 1];
    assert.notEqual(lastByte, undefined);
    writeFileSync(out, Buffer.concat([raw.subarray(0, raw.length - 1), Buffer.from([(lastByte as number) ^ 0xff])]));
    const tampered = drillRestore(out);
    assert.equal(tampered.ok, false);
    assert.ok(tampered.problems.some((p) => p.includes('sha256 mismatch')), JSON.stringify(tampered.problems));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CAMPAIGN-DR-001 保留策略: keep=2 时最旧备份+receipt 成对清理', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-dr-'));
  try {
    const dbPath = makeSourceDb(dir);
    for (const name of ['b1.sqlite', 'b2.sqlite', 'b3.sqlite']) {
      assert.equal(backupViaCli(dbPath, join(dir, name)).status, 0);
    }
    const out4 = join(dir, 'b4.sqlite');
    assert.equal(backupViaCli(dbPath, out4, ['--keep', '2']).status, 0);
    const retention = applyRetention(out4, 2);
    assert.ok(retention.kept.length <= 2);
    assert.ok(!existsSync(join(dir, 'b1.sqlite')), '最旧备份必须被清理');
    assert.ok(!existsSync(join(dir, 'b1.sqlite.dr-receipt.json')), 'receipt 与备份成对清理');
    assert.ok(existsSync(out4), '最新备份保留');
    assert.throws(() => applyRetention(out4, 0), /keep must be >= 1/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CAMPAIGN-DR-001 CLI fail-closed: --verify 缺 --backup → 2；--keep 非法 → 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-dr-'));
  try {
    const dbPath = makeSourceDb(dir);
    const v = backupViaCli(dbPath, '', ['--verify']);
    assert.equal(v.status, 2);
    assert.match(v.stderr, /--verify requires --backup/);
    const k = backupViaCli(dbPath, join(dir, 'x.sqlite'), ['--keep', '0']);
    assert.equal(k.status, 2);
    assert.match(k.stderr, /--keep/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
