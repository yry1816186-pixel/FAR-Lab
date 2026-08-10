/**
 * repo_hygiene_gate.mjs — 仓库卫生门禁（2026-08-07 治理机制 D3）。
 *
 * 检查 4 项（全部可机器验证，无自判）：
 *   1. 根目录 tracked 文件 ⊆ ROOT_ALLOWLIST（文件精确匹配 / 目录前缀匹配）
 *   2. 根目录无白名单外 untracked 垃圾（git status ?? 且不在白名单 → fail）
 *   3. 无可复现运行时产物被 git 跟踪（.far-proof bundle / receipts / run_log / skeleton_evidence）
 *   4. NODE_COMPILE_CACHE 无泄漏（根 `0/` 与 `frontend/0/` 物理不存在）
 *
 * 用途：CI `.github/workflows/ci.yml` blocking_gates job 强制 + 本地 `node scripts/repo_hygiene_gate.mjs`。
 * 策略 SSOT：docs/governance/ROOT-HYGIENE-POLICY.md §2（本文件 ALLOWLIST 与之保持同步）。
 * 诚实边界：只查根目录（session-artifact 高频落点），不递归子目录内容。
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/** 根目录文件白名单（精确文件名）。与 docs/governance/ROOT-HYGIENE-POLICY.md §2 同步。 */
const ALLOW_FILES = new Set([
  'README.md', 'README.zh-CN.md', 'LICENSE', 'NOTICE', 'CHANGELOG.md', 'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md', 'SECURITY.md', 'SUPPORT.md', 'CITATION.cff', 'GOVERNANCE.md',
  'MAINTAINERS.md',
  'AGENTS.md', 'CLAUDE.md', 'CLAUDE.local.example.md',
  'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'eslint.config.mjs',
  'pyproject.toml', 'uv.lock', '.npmrc', '.env.example', 'Dockerfile', 'docker-compose.yml',
  'Makefile', '.gitignore', '.dockerignore', '.editorconfig', '.gitattributes', '.python-version',
  '.zenodo.json',
]);

/** 根目录目录白名单（前缀匹配，其下内容由各自规范管理）。 */
const ALLOW_DIRS = [
  'docs', 'frontend', 'src', 'scripts', 'tests', 'schema', 'repro', 'benchmark', 'modules', 'ci',
  'agent', 'golden_vectors', 'templates', '.claude', '.github', '.far-design', '.far-implementation',
  '.far-master', '.far-release', '.hermes', '.opencode', '.pi', '.zed', '.venv', 'node_modules',
  '.git',
];

/** 运行时产物模式：这些路径一旦被 git 跟踪 → fail（far demo/ask/export 每次运行重写）。 */
const RUNTIME_ARTIFACT_PATTERNS = [
  /\.far-proof[\\/]/,
  /\.receipts\.json$/,
  /run_log\.txt$/,
  /skeleton_evidence\.yaml$/,
  /\.rundb(-wal|-shm)?$/,
];

/** NODE_COMPILE_CACHE 泄漏位置（Node ≥22 默认写 cwd/0）。 */
const CACHE_LEAK_DIRS = ['0', join('frontend', '0')];

function git(args) {
  try {
    // -c core.quotePath=false：避免中文文件名被引号包裹（git 默认 C-style quote）
    const out = execFileSync('git', ['-c', 'core.quotePath=false', ...args], { cwd: ROOT, encoding: 'utf8' });
    return { code: 0, out: out.split(/\r?\n/).filter(Boolean) };
  } catch (error) {
    const e = error;
    // 无输出（如 git ls-files 空）也视为成功
    if (e.stdout !== undefined) return { code: e.status ?? 1, out: String(e.stdout).split(/\r?\n/).filter(Boolean) };
    return { code: e.status ?? 1, out: [] };
  }
}

function isAllowed(relPath) {
  const normalized = relPath.split(sep).join('/');
  if (normalized.includes('/')) {
    // 子目录内条目：第一段目录在白名单即可
    const first = normalized.split('/')[0];
    return ALLOW_DIRS.includes(first);
  }
  if (ALLOW_FILES.has(normalized)) return true;
  return false;
}

function checkRootTracked() {
  const { code, out } = git(['ls-files', '--cached', '.']);
  if (code !== 0) return { ok: false, details: [`git ls-files 失败 (exit ${code})`] };
  const violations = out
    .filter((p) => !isAllowed(p))
    .map((p) => `根目录 tracked 白名单外: ${p}`);
  return { ok: violations.length === 0, details: violations };
}

function checkRootUntracked() {
  const { code, out } = git(['status', '--porcelain']);
  if (code !== 0) return { ok: false, details: [`git status 失败 (exit ${code})`] };
  const violations = out
    .filter((line) => line.startsWith('?? '))
    .map((line) => line.slice(3))
    .filter((p) => !isAllowed(p))
    .map((p) => `根目录 untracked 垃圾: ${p}`);
  return { ok: violations.length === 0, details: violations };
}

function checkRuntimeArtifactsUntracked() {
  const { code, out } = git(['ls-files']);
  if (code !== 0) return { ok: false, details: [`git ls-files 失败 (exit ${code})`] };
  const violations = out
    .filter((p) => RUNTIME_ARTIFACT_PATTERNS.some((re) => re.test(p.split(sep).join('/'))))
    .map((p) => `可复现运行时产物被跟踪: ${p}`);
  return { ok: violations.length === 0, details: violations };
}

function checkCompileCacheLeak() {
  const violations = [];
  for (const dir of CACHE_LEAK_DIRS) {
    if (existsSync(join(ROOT, dir))) violations.push(`NODE_COMPILE_CACHE 泄漏: ${dir}/ 物理存在`);
  }
  return { ok: violations.length === 0, details: violations };
}

const checks = {
  root_tracked_allowlist: checkRootTracked(),
  root_untracked_clean: checkRootUntracked(),
  runtime_artifacts_untracked: checkRuntimeArtifactsUntracked(),
  compile_cache_no_leak: checkCompileCacheLeak(),
};

const failed = Object.entries(checks).filter(([, r]) => !r.ok);
const pass = failed.length === 0;

// 输出
console.log(`repo_hygiene_gate: ${pass ? 'PASS' : 'FAIL'}`);
for (const [name, result] of Object.entries(checks)) {
  console.log(`  [${result.ok ? 'ok' : 'XX'}] ${name}${result.ok ? '' : ''}`);
  for (const d of result.details) console.log(`        ${d}`);
}
if (!pass) {
  console.error('\n仓库卫生门禁失败。处理指引（见 docs/governance/ROOT-HYGIENE-POLICY.md）：');
  console.error('  - 白名单外根目录文件 → git mv 到 docs/ 子目录 或 删除');
  console.error('  - untracked 垃圾 → 删除或加入 .gitignore');
  console.error('  - 运行时产物被跟踪 → git rm --cached + .gitignore 追加规则');
  console.error('  - 0/ 泄漏 → 设置 NODE_COMPILE_CACHE=<仓库外目录> 并删除 0/');
  process.exit(1);
}
process.exit(0);
