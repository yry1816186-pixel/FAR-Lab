/**
 * open.ts — G5 SQLite 完整性基线(IC-03 · ADR-012/019 · F-02/F-03 修复)。
 *
 * 基线(合同 contract-003):
 *   1. 启动 integrity_check fail-closed(小库全量;大库 quick_check 分级;off 仅测试注入);
 *   2. 配置基线:WAL + synchronous=FULL + foreign_keys=ON(禁危险 PRAGMA——打开后断言);
 *   3. far backup 用 VACUUM INTO(禁文件级拷贝);
 *   4. 损坏即 fail-closed + 备份/恢复指引(不误用损坏库)。
 *
 * F-03 根因:启动路径无任何完整性检查(malformed 但 exit 0);F-02:无备份纪律。
 *
 * 零容忍合规:无 any / @ts-ignore / 空 catch / 双重断言。
 */

import Database from 'better-sqlite3';
import { runMigrations } from './migrator.ts';

export class DatabaseIntegrityError extends Error {
  readonly code = 'DB_INTEGRITY_CHECK_FAILED' as const;
  constructor(dbPath: string, detail: string) {
    super(
      `数据库完整性检查失败(fail-closed): ${dbPath}\n` +
        `  详情: ${detail}\n` +
        '  恢复指引: 若有 `far backup` 备份,从备份恢复后重开;' +
        '否则参照 RT-05 手册(勿在损坏库上继续写入——fail-closed 是为了不把损坏扩散进证据链)。',
    );
    this.name = 'DatabaseIntegrityError';
  }
}

export type IntegrityCheckMode = 'full' | 'quick' | 'off';

export interface OpenFarDbOptions {
  /** 只读打开(status/verify 等只读路径;只读时不写 PRAGMA、不跑迁移) */
  readonly readonly?: boolean;
  /** 完整性检查模式:full=integrity_check(全量,doctor 级);quick=quick_check(启动默认);off=禁用(测试注入) */
  readonly integrityCheck?: IntegrityCheckMode;
  /** 是否跑迁移(默认 true;只读打开时强制 false) */
  readonly migrations?: boolean;
}

interface PragmaRow {
  readonly [key: string]: string;
}

/** 配置基线断言(synchronous=FULL=2;文件库 journal_mode=wal)。 */
function assertPragmaBaseline(db: Database.Database, dbPath: string): void {
  const sync = db.pragma('synchronous', { simple: true });
  if (sync !== 2) {
    throw new Error(`G5 配置基线违反: synchronous=${String(sync)}(期望 FULL=2) @ ${dbPath}`);
  }
  if (dbPath !== ':memory:') {
    const jm = db.pragma('journal_mode', { simple: true });
    if (jm !== 'wal') {
      throw new Error(`G5 配置基线违反: journal_mode=${String(jm)}(期望 wal) @ ${dbPath}`);
    }
  }
  // F-5-10-002: 显式固化 busy_timeout（防依赖 better-sqlite3 隐式默认·换库即静默退化）
  const bt = db.pragma('busy_timeout', { simple: true }) as number;
  if (bt !== 5000) {
    throw new Error(`G5 配置基线违反: busy_timeout=${String(bt)}(期望 5000ms) @ ${dbPath}`);
  }
}

/**
 * FAR 数据库统一打开入口(写路径/读路径)。
 * 默认:WAL + synchronous=FULL + foreign_keys=ON + quick_check + migrations。
 */
export function openFarDb(dbPath: string, options: OpenFarDbOptions = {}): Database.Database {
  const readonly = options.readonly === true;
  const checkMode: IntegrityCheckMode = options.integrityCheck ?? 'quick';
  // F-V04-04 修复:写模式打开/PRAGMA 阶段遇头部损坏/截断时同样 fail-closed 并附恢复指引
  // (此前抛裸 SqliteError,与 readonly 路径的 DatabaseIntegrityError 语义不一致)。
  let db: Database.Database;
  try {
    db = readonly ? new Database(dbPath, { readonly: true }) : new Database(dbPath);
  } catch (error) {
    throw new DatabaseIntegrityError(dbPath, `打开失败: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!readonly) {
    try {
      db.pragma('journal_mode = WAL');
      db.pragma('synchronous = FULL');
      db.pragma('foreign_keys = ON');
      db.pragma('busy_timeout = 5000');
    } catch (error) {
      db.close();
      throw new DatabaseIntegrityError(
        dbPath,
        `PRAGMA 配置失败(库可能已损坏): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    assertPragmaBaseline(db, dbPath);
  }

  if (checkMode !== 'off') {
    const pragmaName = checkMode === 'full' ? 'integrity_check' : 'quick_check';
    let rows: PragmaRow[];
    try {
      rows = db.pragma(pragmaName) as PragmaRow[];
    } catch (error) {
      db.close();
      throw new DatabaseIntegrityError(dbPath, error instanceof Error ? error.message : String(error));
    }
    const first = rows[0];
    const result = first === undefined ? 'ok' : (first[pragmaName] ?? 'ok');
    if (result !== 'ok') {
      db.close();
      throw new DatabaseIntegrityError(dbPath, result);
    }
  }

  if (!readonly && options.migrations !== false) {
    runMigrations(db);
  }
  return db;
}

/** VACUUM INTO 安全备份(禁文件级拷贝;outPath 不得与库同路径)。 */
export function backupFarDb(db: Database.Database, dbPath: string, outPath: string): void {
  if (outPath === dbPath) {
    throw new Error('far backup: out 路径不得与源库相同');
  }
  const escaped = outPath.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${escaped}'`);
}

/** 当前 SQLite 版本(供应链基线评估用)。 */
export function sqliteVersion(db: Database.Database): string {
  const row = db.prepare('SELECT sqlite_version() AS v').get() as { v: string };
  return row.v;
}
