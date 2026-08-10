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

// Re-export integrity-check symbols from the shared module (backward compat)
export {
  FAR_PROOF_INTEGRITY_FILE,
  computeFarProofIntegrity,
  verifyFarProofPackageIntegrity,
} from './integrity_check.ts';
export type {
  FarProofIntegrityFile,
  FarProofIntegrityEntry,
  IntegrityVerificationResult,
} from './integrity_check.ts';

// Local imports of integrity-check symbols used within this module
import {
  FAR_PROOF_INTEGRITY_FILE,
  computeFarProofIntegrity,
  sha256File,
  verifyFarProofPackageIntegrity,
} from './integrity_check.ts';

/** Constant: FAR_PROOF_VERIFY_SCRIPT. */
export const FAR_PROOF_VERIFY_SCRIPT = 'verify.sh';

/** Input parameters for operations involving far proof package options. */
export interface FarProofPackageOptions {
  readonly bundleDir: string;
  readonly archivePath?: string;
  readonly generatedAt?: string;
}

/** Result/output structure for far proof package result. */
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

// Windows 上 PATH 里的 `tar` 常是 MSYS2/Git Bash 的 GNU tar：它把绝对路径中的盘符 `C:`
// 当 remote host:device（"Cannot connect to C: resolve failed"），又在 `-C` 反斜杠路径上
// 被 MSYS2 运行时改坏。两者都让 `far export far-proof` 静默产出空/坏归档。
// 解法：win32 优先用原生 bsdtar（%SystemRoot%\System32\tar.exe·Win10 1803+ 标配），原生处理
// 盘符+反斜杠，零 flag；找不到则降级 PATH 的 tar（GNU tar 时加 --force-local 兜盘符 bug）。
// posix 直接用 PATH 的 tar（Linux CI 的 GNU tar 无此问题）。
/** Interface defining tar invocation. */
export interface TarInvocation {
  readonly binary: string;
  readonly extraArgs: readonly string[];
}

let cachedTar: TarInvocation | undefined;

/**
 * resolve tar.
 */
export function resolveTar(): TarInvocation {
  if (cachedTar !== undefined) {
    return cachedTar;
  }
  if (process.platform === 'win32') {
    const sysRoot = process.env.SystemRoot ?? process.env.windir ?? 'C:\\Windows';
    const nativeTar = join(sysRoot, 'System32', 'tar.exe');
    if (existsSync(nativeTar)) {
      cachedTar = { binary: nativeTar, extraArgs: [] };
      return cachedTar;
    }
  }
  let extraArgs: readonly string[] = [];
  try {
    const version = execFileSync('tar', ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (version.includes('GNU tar')) {
      extraArgs = ['--force-local'];
    }
  } catch {
    // tar --version 不可用：不在此掩盖，让后续真实 tar 调用抛其自身的错。
  }
  cachedTar = { binary: 'tar', extraArgs };
  return cachedTar;
}

/**
 * package far proof bundle.
 */
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

  // FUSION-OS-3：seal 承诺点——所有受控写入（verify.sh + integrity.json + self-check）完成后捕获内容快照。
  // archive 写入后重算比对：任一文件 hash 变化/新增/删除 → post-seal 篡改（TOCTOU 注入检出·fail-closed）。
  // 用内容哈希而非 mtime 墙钟：NTFS mtime 与 Date.now() 时钟源存在跨毫秒偏移，墙钟比较不可靠（07_RISK_REGISTER §188）。
  const sealSnapshot = snapshotBundleContent(bundleDir);

  const tmp = mkdtempSync(join(tmpdir(), 'far-proof-package-'));
  try {
    const tarPath = join(tmp, 'bundle.tar');
    const tar = resolveTar();
    execFileSync(
      tar.binary,
      [...tar.extraArgs, '-cf', tarPath, '-C', dirname(bundleDir), basename(bundleDir)],
      {
        stdio: 'ignore',
      },
    );
    const tarBytes = readFileSync(tarPath);
    const compressed = zstdCompressSync(tarBytes);
    writeFileSync(archivePath, compressed);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  // FUSION-OS-3：archive 后 staleness 扫描——seal→archive 间内容变更视为 TOCTOU 注入，fail-closed 拒绝。
  const staleness = detectPostSealStaleness(bundleDir, sealSnapshot);
  if (!staleness.ok) {
    throw new Error(
      `packageFarProofBundle: post-seal content change detected (TOCTOU window): ${staleness.staleFiles.join(', ')}`,
    );
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

/**
 * FUSION-OS-3：post-seal 内容篡改检测（Open Science sentinel 重导出在 tar 后范式）。
 *
 * packageFarProofBundle 在收割（integrity.json + self-check）后捕获内容快照（seal 承诺点），
 * archive 写入后重算比对：任一文件 sha256 变化 / 新增 / 删除 → 视为 seal 后篡改（post-seal stale）→ fail-closed。
 * 收窄 harvest→archive 间 TOCTOU 窗口——并发进程在 seal 后注入/改写/删除文件可被检出（不静默放过）。
 *
 * 用内容哈希而非 mtime 墙钟：mtime 与 Date.now() 时钟源存在偏移（NTFS 跨毫秒、NFS clock skew），
 * 墙钟比较既会误报受控写入（jitter）又会漏报 backdated touch。内容比对确定性、无时钟依赖。
 */
export interface BundleContentSnapshot {
  readonly hashes: ReadonlyMap<string, string>;
}

/** Result/output structure for staleness result. */
export interface StalenessResult {
  readonly ok: boolean;
  readonly staleFiles: readonly string[];
}

/**
 * snapshot bundle content.
 */
export function snapshotBundleContent(bundleDir: string): BundleContentSnapshot {
  const hashes = new Map<string, string>();
  visitHash(resolve(bundleDir), resolve(bundleDir), hashes);
  return { hashes };
}

/**
 * detect post seal staleness.
 */
export function detectPostSealStaleness(bundleDir: string, baseline: BundleContentSnapshot): StalenessResult {
  const current = snapshotBundleContent(bundleDir);
  const stale: string[] = [];
  for (const [path, hash] of current.hashes) {
    const base = baseline.hashes.get(path);
    if (base === undefined) {
      stale.push(path);
    } else if (base !== hash) {
      stale.push(path);
    }
  }
  for (const path of baseline.hashes.keys()) {
    if (!current.hashes.has(path)) {
      stale.push(path);
    }
  }
  return { ok: stale.length === 0, staleFiles: stale };
}

function visitHash(root: string, dir: string, hashes: Map<string, string>): void {
  // fail-closed：readdir 失败（权限撤销/并发删除/IO 错误）须抛出，不得静默返回不完整快照。
  // detectPostSealStaleness 的契约是『seal 后注入/改写/删除文件可被检出（不静默放过）』，
  // 静默吞错会使快照缺失被篡改目录 → 比对漏报 → 攻击者通过撤销目录读权限绕过 sentinel（深度对抗轮发现）。
  // 与同文件 listBundleFiles（line 341 无 try/catch·fail-closed）对齐。
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      visitHash(root, full, hashes);
    } else if (entry.isFile()) {
      hashes.set(relative(root, full).split(sep).join('/'), createHash('sha256').update(readFileSync(full)).digest('hex'));
    }
  }
}

const VERIFY_SH = `#!/usr/bin/env sh
set -eu

BUNDLE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

# Cross-platform path normalization: git-bash/MSYS sh reports MSYS-style paths
# (/c/tmp/...) but Windows Node.js needs native paths (C:\\tmp\\...).
# Prefer cygpath -w when available; fall back to leaving the path as-is
# (POSIX systems and WSL pass native paths already).
if command -v cygpath >/dev/null 2>&1; then
  BUNDLE_DIR=$(cygpath -w "$BUNDLE_DIR")
fi

node - "$BUNDLE_DIR" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// Defensive MSYS path normalization (belt-and-suspenders): even without cygpath,
// normalize /c/tmp/... → C:\\tmp\\... so Windows Node can resolve the bundle.
function normalizeBundleDir(dir) {
  if (dir === undefined) return dir;
  // MSYS root-letter pattern: /c/path or /d/path → C:\\path / D:\\path
  const msysMatch = dir.match(/^\\/([a-zA-Z])\\/(.*)$/);
  if (msysMatch && process.platform === 'win32') {
    return msysMatch[1].toUpperCase() + ':\\\\\\\\' + msysMatch[2].replace(/\\//g, '\\\\\\\\');
  }
  return dir;
}

const bundleDir = normalizeBundleDir(process.argv[2]);
const integrityPath = path.join(bundleDir, 'integrity.json');

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

// 确定性字符串比较器（UTF-16 code-unit 序）——不依赖 locale/ICU，跨平台一致。
// localeCompare 在第三方机器上可能因 locale 不同而排序不同 → integrity hash 漂移（深度对抗轮发现）。
function cmpStr(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function listFiles(root) {
  const files = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => cmpStr(a.name, b.name));
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
  return files.sort((a, b) => cmpStr(a.path, b.path));
}

const expected = JSON.parse(fs.readFileSync(integrityPath, 'utf8'));
const actualFiles = listFiles(bundleDir);
// DB1-1 同步：必须与 computeFarProofIntegrity (src/far_proof/integrity_check.ts) 的聚合口径一致——
// hashed bytes = generatedAt line + newline + filelist, 而非裸 filelist。否则第三方提取 .far-proof 运行 verify.sh 必失败。
const actualHash = sha256Text([expected.generatedAt, actualFiles.map((file) => \`\${file.path} \${file.sha256}\`).sort(cmpStr).join('\\n')].join('\\n'));

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
