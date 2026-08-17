// src/cli/commands/backup.ts
// far backup —— VACUUM INTO 安全备份(IC-03 · G5 · ADR-012) + DR 本地面（CAMPAIGN-DR-001）。
//
// 纪律:备份前全量 integrity_check(fail-closed——不备份损坏库);备份用 VACUUM INTO(禁文件级拷贝);
// 备份后再 quick_check 自检;备份含数据→输出路径权限提示。
// DR 面:备份完成即写 DR receipt（sha256+表计数+RPO）;`--verify --backup <p>` 恢复演练
// （哈希/完整性/表计数三关 + RTO 实测）;`--keep N` 保留策略（新旧成对清理）。
// 退出码:0 成功 / 1 完整性或演练失败 / 2 参数错误。

import { existsSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

import { openFarDb, backupFarDb, sqliteVersion, DatabaseIntegrityError } from '../../db/open.ts';
import { applyRetention, drillRestore, latestReceiptInDir, writeDrReceipt } from '../../db/dr.ts';

interface BackupArgs {
  readonly dbPath: string;
  readonly outPath: string;
  readonly force: boolean;
  /** 恢复演练模式：对 --backup 指定的既有备份做三关演练（不做新备份）。 */
  readonly verify: boolean;
  readonly backupPath: string | null;
  /** 保留策略：新备份完成后同目录只保留最近 N 份（含新份）。 */
  readonly keep: number | null;
}

function parseArgs(argv: readonly string[]): BackupArgs | { error: string } {
  let dbPath: string | null = null;
  let outPath: string | null = null;
  let force = false;
  let verify = false;
  let backupPath: string | null = null;
  let keep: number | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--db') dbPath = argv[++i] ?? null;
    else if (a === '--out') outPath = argv[++i] ?? null;
    else if (a === '--force') force = true;
    else if (a === '--verify') verify = true;
    else if (a === '--backup') backupPath = argv[++i] ?? null;
    else if (a === '--keep') {
      const raw = argv[++i];
      const n = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
      if (!Number.isInteger(n) || n < 1) return { error: `--keep needs integer >= 1 (got '${raw ?? ''}')` };
      keep = n;
    } else return { error: `unknown arg '${a}'` };
  }
  if (dbPath === null) return { error: '--db <path> is required' };
  if (verify) {
    if (backupPath === null) return { error: '--verify requires --backup <path>' };
    return { dbPath, outPath: outPath ?? '', force, verify, backupPath, keep } as BackupArgs;
  }
  if (outPath === null) return { error: '--out <path> is required' };
  return { dbPath, outPath, force, verify, backupPath, keep } as BackupArgs;
}

/**
 * run backup.
 */
export function runBackup(argv: readonly string[]): number {
  const parsed = parseArgs(argv);
  if ('error' in parsed) {
    process.stderr.write(`far backup: ${parsed.error}\n`);
    return 2;
  }
  const { dbPath, outPath, force, verify, backupPath, keep } = parsed;

  // --- 恢复演练模式（CAMPAIGN-DR-001：未演练的备份不是可靠性证据）---
  if (verify) {
    const drill = drillRestore(backupPath as string);
    if (drill.ok) {
      process.stdout.write(
        `far backup --verify: 恢复演练 PASS（sha256/quick_check/表计数三关，RTO ${drill.rtoMs}ms）→ ${backupPath}\n`,
      );
      return 0;
    }
    for (const p of drill.problems) process.stderr.write(`  [drill] ${p}\n`);
    return 1;
  }

  if (outPath === dbPath) {
    process.stderr.write('far backup: --out 不得与 --db 同路径\n');
    return 2;
  }
  if (!existsSync(dbPath)) {
    process.stderr.write(`far backup: db not found: ${dbPath}\n`);
    return 2;
  }
  if (existsSync(outPath)) {
    if (!force) {
      process.stderr.write(`far backup: out exists: ${outPath}(用 --force 覆盖)\n`);
      return 2;
    }
    rmSync(outPath, { force: true });
  }

  let db;
  try {
    // 备份前全量完整性自检(fail-closed:不备份损坏库)
    db = openFarDb(dbPath, { integrityCheck: 'full', migrations: false });
  } catch (error) {
    if (error instanceof DatabaseIntegrityError) {
      process.stderr.write(`${error.message}\n`);
      return 1;
    }
    throw error;
  }
  try {
    const version = sqliteVersion(db);
    backupFarDb(db, dbPath, outPath);
    process.stdout.write(`far backup: VACUUM INTO 完成(sqlite ${version})\n`);
  } finally {
    db.close();
  }

  // 备份后自检(quick_check)
  const verifyDb = openFarDb(outPath, { readonly: true, integrityCheck: 'quick' });
  verifyDb.close();
  process.stdout.write(`far backup: 备份自检 ok → ${outPath}\n`);

  // --- DR receipt（CAMPAIGN-DR-001：checksum + 表计数锚点 + RPO 实测）---
  const receipt = writeDrReceipt({
    sourceDbPath: dbPath,
    backupPath: outPath,
    previous: latestReceiptInDir(dirname(outPath)),
  });
  process.stdout.write(
    `far backup: DR receipt → ${outPath}.dr-receipt.json (sha256 ${receipt.sha256.slice(0, 12)}…, RPO ${receipt.rpoSeconds ?? '首份'}s)\n`,
  );

  // --- 保留策略（可选）---
  if (keep !== null) {
    const retention = applyRetention(outPath, keep);
    if (retention.pruned.length > 0) {
      process.stdout.write(`far backup: 保留策略 keep=${keep} → 清理 ${retention.pruned.length} 份旧备份（含 receipt）\n`);
    }
  }

  process.stdout.write('  注意: 备份包含数据库全部内容(同库内数据敏感度);请妥善保管路径权限。\n');
  process.stdout.write('  注意: offsiteCopied=false——独立介质副本需操作者真实执行（DR-001 远端面）。\n');
  return 0;
}
