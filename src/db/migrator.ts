import type Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { PACKAGE_ROOT } from '../paths.ts';

const DEFAULT_MIGRATIONS_DIR = join(PACKAGE_ROOT, 'schema/migrations');
const MIGRATION_FILE_PATTERN = /^(\d{4})_.+\.sql$/;

/** Interface defining migration file. */
export interface MigrationFile {
  readonly version: number;
  readonly name: string;
  readonly fileName: string;
  readonly sql: string;
}

/** Interface defining schema meta row. */
export interface SchemaMetaRow {
  readonly version: number;
  readonly name: string;
  readonly applied_at: string;
}

/** Result/output structure for migration result. */
export interface MigrationResult {
  readonly applied: readonly number[];
  readonly skipped: readonly number[];
}

/** Input parameters for operations involving run migrations options. */
export interface RunMigrationsOptions {
  readonly migrationsDir?: string;
}

/**
 * run migrations.
 */
export function runMigrations(
  db: Database.Database,
  options: RunMigrationsOptions = {},
): MigrationResult {
  db.pragma('foreign_keys = ON');
  ensureSchemaMeta(db);

  const migrations = readMigrationFiles(options.migrationsDir ?? DEFAULT_MIGRATIONS_DIR);
  assertContiguousVersions(migrations);

  const knownVersions = new Set(migrations.map((migration) => migration.version));
  const appliedBefore = getSchemaMetaRows(db);
  for (const row of appliedBefore) {
    if (!knownVersions.has(row.version)) {
      throw new Error(`db.migrator: database schema version ${row.version} is newer than available migrations`);
    }
  }

  const appliedSet = new Set(appliedBefore.map((row) => row.version));
  const applied: number[] = [];
  const skipped: number[] = [];

  for (const migration of migrations) {
    if (appliedSet.has(migration.version)) {
      skipped.push(migration.version);
      continue;
    }

    db.exec(migration.sql);
    db.prepare('INSERT OR IGNORE INTO schema_meta (version, name) VALUES (?, ?)').run(
      migration.version,
      migration.name,
    );
    applied.push(migration.version);
  }

  return {
    applied,
    skipped,
  };
}

/**
 * get schema meta rows.
 */
export function getSchemaMetaRows(db: Database.Database): readonly SchemaMetaRow[] {
  ensureSchemaMeta(db);
  return db
    .prepare('SELECT version, name, applied_at FROM schema_meta ORDER BY version ASC')
    .all() as SchemaMetaRow[];
}

/**
 * read migration files.
 */
export function readMigrationFiles(migrationsDir = DEFAULT_MIGRATIONS_DIR): readonly MigrationFile[] {
  return readdirSync(migrationsDir)
    .filter((fileName) => MIGRATION_FILE_PATTERN.test(fileName))
    .sort()
    .map((fileName) => {
      const match = fileName.match(MIGRATION_FILE_PATTERN);
      if (match === null) {
        throw new Error(`db.migrator: invalid migration filename ${fileName}`);
      }
      const versionText = match[1];
      if (versionText === undefined) {
        throw new Error(`db.migrator: missing migration version in ${fileName}`);
      }
      return {
        version: Number.parseInt(versionText, 10),
        name: basename(fileName, '.sql'),
        fileName,
        sql: readFileSync(join(migrationsDir, fileName), 'utf8'),
      };
    });
}

function ensureSchemaMeta(db: Database.Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_meta (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )`,
  );
}

function assertContiguousVersions(migrations: readonly MigrationFile[]): void {
  let expected = 1;
  for (const migration of migrations) {
    if (migration.version !== expected) {
      throw new Error(
        `db.migrator: migration versions must be contiguous, expected ${expected} but found ${migration.version}`,
      );
    }
    expected += 1;
  }
}
