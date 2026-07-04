/**
 * Offline .far-proof package builder.
 *
 * Produces a portable bundle directory with:
 *   - verify.sh: one-command local integrity + far verify runner
 *   - integrity.json: sha256 manifest, excluding itself to avoid self-reference
 *   - .tar.zst archive: tar payload compressed with Node's native zstd
 *
 * Boundary: this packages the V1 minimal self-verifiable FAR bundle. It does not
 * claim third-party RO-Crate/PROV-O certification.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { zstdCompressSync } from 'node:zlib';

import { verifyFarProofBundle } from './bundle_verifier.ts';

export const FAR_PROOF_INTEGRITY_FILE = 'integrity.json';
export const FAR_PROOF_VERIFY_SCRIPT = 'verify.sh';

export interface FarProofIntegrityFile {
  readonly schemaVersion: 'far.proof_bundle.integrity.v1';
  readonly generatedAt: string;
  readonly algorithm: 'sha256';
  readonly excludes: readonly ['integrity.json'];
  readonly fileCount: number;
  readonly files: readonly FarProofIntegrityEntry[];
  readonly integrityHash: string;
}

export interface FarProofIntegrityEntry {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface FarProofPackageOptions {
  readonly bundleDir: string;
  readonly archivePath?: string;
  readonly generatedAt?: string;
}

export interface FarProofPackageResult {
  readonly bundleDir: string;
  readonly archivePath: string;
  readonly archiveSha256: string;
  readonly compression: 'zstd';
  readonly integrityPath: string;
  readonly verifyScriptPath: string;
  readonly integrityHash: string;
  readonly fileCount: number;
  readonly warnings: readonly string[];
}

export interface IntegrityVerificationResult {
  readonly ok: boolean;
  readonly integrityHash: string | null;
  readonly expectedHash: string | null;
  readonly fileCount: number;
  readonly errors: readonly string[];
}

export function packageFarProofBundle(options: FarProofPackageOptions): FarProofPackageResult {
  const bundleDir = resolve(options.bundleDir);
  if (!existsSync(bundleDir) || !statSync(bundleDir).isDirectory()) {
    throw new Error(`packageFarProofBundle: bundleDir not found or not a directory: ${bundleDir}`);
  }

  const archivePath = resolve(options.archivePath ?? `${bundleDir}.tar.zst`);
  if (archivePath.startsWith(`${bundleDir}${sep}`)) {
    throw new Error('packageFarProofBundle: archivePath must not be inside bundleDir');
  }

  const preflight = verifyFarProofBundle(bundleDir, 'full');
  if (!preflight.ok) {
    throw new Error(`packageFarProofBundle: cannot package invalid bundle: ${preflight.errors.join(' | ')}`);
  }

  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const verifyScriptPath = join(bundleDir, FAR_PROOF_VERIFY_SCRIPT);
  writeFileSync(verifyScriptPath, VERIFY_SH, 'utf8');
  chmodSync(verifyScriptPath, 0o755);

  const integrity = computeFarProofIntegrity(bundleDir, generatedAt);
  const integrityPath = join(bundleDir, FAR_PROOF_INTEGRITY_FILE);
  writeFileSync(integrityPath, `${JSON.stringify(integrity, null, 2)}\n`, 'utf8');

  const integrityCheck = verifyFarProofPackageIntegrity(bundleDir);
  if (!integrityCheck.ok) {
    throw new Error(`packageFarProofBundle: integrity self-check failed: ${integrityCheck.errors.join(' | ')}`);
  }

  const tmp = mkdtempSync(join(tmpdir(), 'far-proof-package-'));
  try {
    const tarPath = join(tmp, 'bundle.tar');
    execFileSync('tar', ['-cf', tarPath, '-C', dirname(bundleDir), basename(bundleDir)], {
      stdio: 'ignore',
    });
    const tarBytes = readFileSync(tarPath);
    const compressed = zstdCompressSync(tarBytes);
    writeFileSync(archivePath, compressed);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  return {
    bundleDir,
    archivePath,
    archiveSha256: sha256File(archivePath),
    compression: 'zstd',
    integrityPath,
    verifyScriptPath,
    integrityHash: integrity.integrityHash,
    fileCount: integrity.fileCount,
    warnings: preflight.warnings,
  };
}

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
  const integrityHash = sha256Text(files.map((file) => `${file.path} ${file.sha256}`).sort().join('\n'));
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
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
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
  return files.sort();
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

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function sha256Text(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const VERIFY_SH = `#!/usr/bin/env sh
set -eu

BUNDLE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

node - "$BUNDLE_DIR" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const bundleDir = process.argv[2];
const integrityPath = path.join(bundleDir, 'integrity.json');

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function listFiles(root) {
  const files = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolute = path.join(dir, entry.name);
      const rel = path.relative(root, absolute).split(path.sep).join('/');
      if (entry.isDirectory()) {
        walk(absolute);
      } else if (entry.isFile() && rel !== 'integrity.json') {
        const stat = fs.statSync(absolute);
        files.push({ path: rel, sha256: sha256File(absolute), bytes: stat.size });
      } else if (entry.isSymbolicLink()) {
        throw new Error(\`symlink not allowed: \${rel}\`);
      } else if (rel !== 'integrity.json') {
        throw new Error(\`unsupported filesystem entry: \${rel}\`);
      }
    }
  }
  walk(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

const expected = JSON.parse(fs.readFileSync(integrityPath, 'utf8'));
const actualFiles = listFiles(bundleDir);
const actualHash = sha256Text(actualFiles.map((file) => \`\${file.path} \${file.sha256}\`).sort().join('\\n'));

if (actualHash !== expected.integrityHash) {
  throw new Error(\`integrityHash mismatch: expected=\${expected.integrityHash} actual=\${actualHash}\`);
}
if (actualFiles.length !== expected.fileCount) {
  throw new Error(\`file count mismatch: expected=\${expected.fileCount} actual=\${actualFiles.length}\`);
}
const expectedByPath = new Map(expected.files.map((file) => [file.path, file]));
const actualByPath = new Map(actualFiles.map((file) => [file.path, file]));
for (const file of expected.files) {
  const actual = actualByPath.get(file.path);
  if (!actual) throw new Error(\`missing file: \${file.path}\`);
  if (actual.sha256 !== file.sha256 || actual.bytes !== file.bytes) {
    throw new Error(\`file mismatch: \${file.path}\`);
  }
}
for (const file of actualFiles) {
  if (!expectedByPath.has(file.path)) {
    throw new Error(\`unexpected file: \${file.path}\`);
  }
}
console.log(\`integrity OK: \${actualFiles.length} files, root=\${actualHash.slice(0, 16)}...\`);
NODE

if [ -n "\${FAR_REPO_ROOT:-}" ]; then
  REPO_ROOT=$FAR_REPO_ROOT
elif [ -f "$BUNDLE_DIR/../src/cli/far.ts" ]; then
  REPO_ROOT=$(CDPATH= cd -- "$BUNDLE_DIR/.." && pwd)
else
  REPO_ROOT=$(pwd)
fi

if [ ! -f "$REPO_ROOT/src/cli/far.ts" ]; then
  echo "verify.sh: FAR repo root not found. Set FAR_REPO_ROOT=/path/to/FAR-Lab." >&2
  exit 1
fi

node "$REPO_ROOT/src/cli/far.ts" verify --bundle "$BUNDLE_DIR" --mode full --json
`;
