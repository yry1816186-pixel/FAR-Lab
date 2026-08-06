/**
 * FAR proof package integrity checking.
 *
 * Provides integrity.json manifest computation and verification, shared by
 * both the offline packager (offline_package.ts) and the bundle verifier
 * (bundle_verifier.ts) to avoid a circular dependency between those two modules.
 */

import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { compareStringsDeterministic } from '../evidence_log/hasher.ts';

/** integrity.json 文件名常量：全分量 sha256 清单，自排除避免自引用。 */
export const FAR_PROOF_INTEGRITY_FILE = 'integrity.json';

/** Interface defining far proof integrity file. */
export interface FarProofIntegrityFile {
  readonly schemaVersion: 'far.proof_bundle.integrity.v1';
  readonly generatedAt: string;
  readonly algorithm: 'sha256';
  readonly excludes: readonly ['integrity.json'];
  readonly fileCount: number;
  readonly files: readonly FarProofIntegrityEntry[];
  readonly integrityHash: string;
}

/** Interface defining far proof integrity entry. */
export interface FarProofIntegrityEntry {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

/** Result/output structure for integrity verification result. */
export interface IntegrityVerificationResult {
  readonly ok: boolean;
  readonly integrityHash: string | null;
  readonly expectedHash: string | null;
  readonly fileCount: number;
  readonly errors: readonly string[];
}

/**
 * compute far proof integrity.
 */
export function computeFarProofIntegrity(bundleDir: string, generatedAt: string): FarProofIntegrityFile {
  const files = listBundleFiles(bundleDir)
    .filter((file) => file !== FAR_PROOF_INTEGRITY_FILE)
    .map((file) => {
      const absolute = join(bundleDir, ...file.split('/'));
      return {
        path: file,
        sha256: sha256File(absolute),
        bytes: statSync(absolute).size,
      };
    });
  const integrityHash = sha256Text(files.map((file) => `${file.path} ${file.sha256}`).sort(compareStringsDeterministic).join('\n'));
  return {
    schemaVersion: 'far.proof_bundle.integrity.v1',
    generatedAt,
    algorithm: 'sha256',
    excludes: ['integrity.json'],
    fileCount: files.length,
    files,
    integrityHash,
  };
}

/**
 * verify far proof package integrity.
 */
export function verifyFarProofPackageIntegrity(bundleDir: string): IntegrityVerificationResult {
  const errors: string[] = [];
  const integrityPath = join(bundleDir, FAR_PROOF_INTEGRITY_FILE);
  if (!existsSync(integrityPath)) {
    return {
      ok: false,
      integrityHash: null,
      expectedHash: null,
      fileCount: 0,
      errors: [`MISSING_INTEGRITY_FILE: ${FAR_PROOF_INTEGRITY_FILE}`],
    };
  }

  let expected: FarProofIntegrityFile;
  try {
    expected = parseIntegrity(readFileSync(integrityPath, 'utf8'));
  } catch (error) {
    return {
      ok: false,
      integrityHash: null,
      expectedHash: null,
      fileCount: 0,
      errors: [`INTEGRITY_UNREADABLE: ${errorMessage(error)}`],
    };
  }

  const actual = computeFarProofIntegrity(bundleDir, expected.generatedAt);
  if (actual.integrityHash !== expected.integrityHash) {
    errors.push(`INTEGRITY_HASH_MISMATCH: expected=${expected.integrityHash} actual=${actual.integrityHash}`);
  }
  if (actual.fileCount !== expected.fileCount) {
    errors.push(`INTEGRITY_FILE_COUNT_MISMATCH: expected=${expected.fileCount} actual=${actual.fileCount}`);
  }

  const expectedByPath = new Map(expected.files.map((file) => [file.path, file]));
  const actualByPath = new Map(actual.files.map((file) => [file.path, file]));
  for (const expectedFile of expected.files) {
    const actualFile = actualByPath.get(expectedFile.path);
    if (actualFile === undefined) {
      errors.push(`INTEGRITY_MISSING_FILE: ${expectedFile.path}`);
      continue;
    }
    if (actualFile.sha256 !== expectedFile.sha256 || actualFile.bytes !== expectedFile.bytes) {
      errors.push(`INTEGRITY_FILE_MISMATCH: ${expectedFile.path}`);
    }
  }
  for (const actualFile of actual.files) {
    if (!expectedByPath.has(actualFile.path)) {
      errors.push(`INTEGRITY_UNEXPECTED_FILE: ${actualFile.path}`);
    }
  }

  return {
    ok: errors.length === 0,
    integrityHash: actual.integrityHash,
    expectedHash: expected.integrityHash,
    fileCount: actual.fileCount,
    errors,
  };
}

function listBundleFiles(root: string): string[] {
  const files: string[] = [];
  function walk(dir: string): void {
    // code-unit 序（确定性·跨平台一致）——localeCompare 依赖运行时 locale/ICU，非 ASCII 文件名排序可能漂移
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      compareStringsDeterministic(a.name, b.name),
    );
    for (const entry of entries) {
      const absolute = join(dir, entry.name);
      const rel = relative(root, absolute).split(sep).join('/');
      if (entry.isDirectory()) {
        walk(absolute);
      } else if (entry.isFile()) {
        files.push(rel);
      } else if (entry.isSymbolicLink()) {
        const stat = lstatSync(absolute);
        throw new Error(`packageFarProofBundle: symlink not allowed in offline bundle: ${rel} (${stat.mode})`);
      } else {
        throw new Error(`packageFarProofBundle: unsupported filesystem entry in offline bundle: ${rel}`);
      }
    }
  }
  walk(root);
  return files.sort(compareStringsDeterministic);
}

function parseIntegrity(raw: string): FarProofIntegrityFile {
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('integrity root must be an object');
  }
  const record = parsed as Record<string, unknown>;
  if (record.schemaVersion !== 'far.proof_bundle.integrity.v1') {
    throw new Error(`unsupported schemaVersion: ${String(record.schemaVersion)}`);
  }
  if (!Array.isArray(record.files)) {
    throw new Error('files must be an array');
  }
  const files = record.files.map((entry, index): FarProofIntegrityEntry => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`files[${index}] must be an object`);
    }
    const row = entry as Record<string, unknown>;
    if (typeof row.path !== 'string' || typeof row.sha256 !== 'string' || typeof row.bytes !== 'number') {
      throw new Error(`files[${index}] has invalid shape`);
    }
    return { path: row.path, sha256: row.sha256, bytes: row.bytes };
  });
  if (typeof record.generatedAt !== 'string' || typeof record.integrityHash !== 'string') {
    throw new Error('generatedAt/integrityHash must be strings');
  }
  return {
    schemaVersion: 'far.proof_bundle.integrity.v1',
    generatedAt: record.generatedAt,
    algorithm: 'sha256',
    excludes: ['integrity.json'],
    fileCount: typeof record.fileCount === 'number' ? record.fileCount : files.length,
    files,
    integrityHash: record.integrityHash,
  };
}

/**
 * sha256 file.
 */
export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function sha256Text(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
