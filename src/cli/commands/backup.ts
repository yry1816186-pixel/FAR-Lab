// src/cli/commands/backup.ts
// far backup —— VACUUM INTO 安全备份(IC-03 · G5 · ADR-012)。
//
// 纪律:备份前全量 integrity_check(fail-closed——不备份损坏库);备份用 VACUUM INTO(禁文件级拷贝);
// 备份后再 quick_check 自检;备份含数据→输出路径权限提示。
// 退出码:0 成功 / 1 完整性失败 / 2 参数错误。

import { existsSync, rmSync } from 'node:fs';
import { openFarDb, backupFarDb, sqliteVersion, DatabaseIntegrityError } from '../../db/open.ts';

interface BackupArgs {
  readonly dbPath: string;
  readonly outPath: string;
  readonly force: boolean;
}

function parseArgs(argv: readonly string[]): BackupArgs | { error: string } {
  let dbPath: string | null = null;
  let outPath: string | null = null;
  let force = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--db') dbPath = argv[++i] ?? null;
    else if (a === '--out') outPath = argv[++i] ?? null;
    else if (a === '--force') force = true;
    else return { error: `unknown arg '${a}'` };
  }
  if (dbPath === null) return { error: '--db <path> is required' };
  if (outPath === null) return { error: '--out <path> is required' };
  return { dbPath, outPath, force } as BackupArgs;
}

export function runBackup(argv: readonly string[]): number {
  const parsed = parseArgs(argv);
  if ('error' in parsed) {
    process.stderr.write(`far backup: ${parsed.error}\n`);
    return 2;
  }
  const { dbPath, outPath, force } = parsed;
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
  const verify = openFarDb(outPath, { readonly: true, integrityCheck: 'quick' });
  verify.close();
  process.stdout.write(`far backup: 备份自检 ok → ${outPath}\n`);
  process.stdout.write('  注意: 备份包含数据库全部内容(同库内数据敏感度);请妥善保管路径权限。\n');
  return 0;
}
