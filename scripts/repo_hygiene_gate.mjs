/**
 * repo_hygiene_gate.mjs — Repository Content Gate（2026-08-18 重写，v2）。
 *
 * 单一规则源：本文件 + `.gitignore` + CI 三者语义一致。本 gate 是「tracked 内容
 * 是否应该存在」的机器判定；`.gitignore` 是「本地允许存在但不 tracked」的对照面。
 * 两者不允许矛盾：凡 `.gitignore` 忽略的路径类型，本 gate 拒绝 tracked；本 gate
 * 允许的路径，不得被 `.gitignore` 忽略。
 *
 * 检查（A–I 共 9 项，全部递归扫描 git index，非只查根目录）：
 *   A  tracked-ignored 文件（git ls-files -ci --exclude-standard）→ 零输出
 *   B  root allowlist：根目录只允许精确批准文件 + 一级源码目录
 *   C  recursive forbidden-path：任一路径段命中本地工具/报告/缓存/私有状态目录 → FAIL
 *   D  Markdown explicit allowlist：`.md` 默认禁止，只允许批准的 public 文档路径
 *   E  generated/runtime artifact：.far* / receipts / logs / cache / db / eval 产物 tracked → FAIL
 *   F  forbidden binary / presentation：ppt/pdf/docx/zip/7z 等 → FAIL（fixture 逐文件例外）
 *   G  suspicious process filenames：报告/总结/计划/审计/备份等过程命名（含中文）→ FAIL
 *   H  dangling local references：README/CONTRIBUTING/SECURITY/SUPPORT 中相对链接指向
 *      不存在的 tracked 文件 → FAIL
 *   I  file size policy：异常大 blob（> 1 MiB）→ FAIL（fixture 逐文件例外）
 *
 * 用途：CI blocking_gates 强制 + 本地 `pnpm repo:hygiene` / `node scripts/repo_hygiene_gate.mjs`。
 * 诚实边界：本 gate 证明「tracked 内容符合仓库内容政策」；不证明产品功能正确性
 * （那是 typecheck/lint/test 的职责）。
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ---------------------------------------------------------------------------
// 政策清单（Gate B/C/D/F/I 共用——单一规则源）
// ---------------------------------------------------------------------------

/** 根目录精确文件白名单（Gate B）。新增根文件必须同时更新本清单与 CONTRIBUTING.md。 */
const ROOT_ALLOW_FILES = new Set([
  'README.md', 'README.zh-CN.md', 'LICENSE', 'NOTICE', 'THIRD-PARTY-NOTICES.md',
  'CHANGELOG.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'SECURITY.md', 'SUPPORT.md',
  'MAINTAINERS.md', 'CITATION.cff',
  'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'eslint.config.mjs',
  'pyproject.toml', 'uv.lock', '.npmrc', '.env.example', 'Dockerfile', 'docker-compose.yml',
  'Makefile', '.gitignore', '.dockerignore', '.editorconfig', '.gitattributes',
  '.python-version', '.zenodo.json',
]);

/** 根目录一级源码/基础设施目录白名单（Gate B）。其下内容仍受 Gate C–I 递归检查。 */
const ROOT_ALLOW_DIRS = [
  '.github', 'ci', 'frontend', 'golden_vectors', 'repro', 'schema', 'scripts', 'src', 'tests',
];

/** 递归禁止路径段（Gate C）：任一 tracked 路径的任一目录段命中 → FAIL。 */
const FORBIDDEN_DIR_SEGMENTS = [
  // 本地 AI 工具/agent 状态
  '.claude', '.opencode', '.zcode', '.qoder', '.zed', '.hermes', '.trae', '.pi', '.codebuddy',
  '.cursor', '.windsurf', '.agent', '.agent-state', '.agent-governance', '.playwright-mcp',
  // 一次性实现/治理目录（公开仓库不承担）
  'docs', 'modules', 'agent', 'templates', 'experiments', 'dev', 'archive',
  'legacy', 'backup', 'reports', 'history', 'misc', 'old', 'scratch',
  // 构建/缓存/运行时
  'node_modules', '.venv', 'dist', 'coverage', 'cache', 'tmp', 'temp', '.cache',
  '.pytest_cache', '.ruff_cache', '.golden_cache', '.benchmarks', '__pycache__',
  '.vscode', '.idea', '0',
  // 运行时产物目录（Gate E 的路径面）
  '.far', '.far-proof', '.far-design', '.far-implementation', '.far-master', '.far-release',
  '.far-preflight',
];

/** Markdown default-deny（Gate D）：所有 tracked `.md` 必须在此精确 allowlist。 */
const MD_ALLOWLIST = new Set([
  // 根 public 文档
  'README.md', 'README.zh-CN.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md',
  'SECURITY.md', 'SUPPORT.md', 'MAINTAINERS.md', 'THIRD-PARTY-NOTICES.md',
  // GitHub community
  '.github/pull_request_template.md',
  // 独立工作区 / 子模块局部文档（解释代码不可见的长期契约）
  'frontend/README.md',
  'golden_vectors/versioning/README.md',
  'schema/json/README.md', 'schema/migrations/README.md',
  'src/llm_gateway/adapters/openai_compatible/README.md',
  // 测试 fixture（requirements_registry 测试输入）
  'tests/scripts/fixtures/requirements_registry/CORE_CONSTITUTION.md',
  'tests/scripts/fixtures/requirements_registry/DOMAIN_PROTOCOLS.md',
]);

/** 禁止 tracked 的二进制/展示格式（Gate F）；fixture 例外走 FILE_SIZE_EXCEPTIONS 同表逐文件声明。 */
const FORBIDDEN_BINARY_EXTENSIONS = new Set([
  '.ppt', '.pptx', '.pdf', '.key', '.pages', '.docx', '.zip', '.7z',
]);

/** 大文件例外（Gate I 用，>1 MiB 阈值）——逐文件精确路径，禁止目录级放行。 */
const LARGE_FILE_EXCEPTIONS = new Set([]);

/** 大文件阈值（字节）：当前合法 tracked blob 上限 < 600 KB（uv.lock / frontend lockfile / openapi.json）。 */
const MAX_BLOB_BYTES = 1024 * 1024;

/** 过程文件名模式（Gate G）：basename 命中 → FAIL。只检查非产品目录（见 isProcessFileCandidate）。 */
const PROCESS_NAME_PATTERNS = [
  /(?:_|^)(REPORT|SUMMARY|PLAN|PROGRESS|AUDIT|REVIEW|HANDOFF|PROMPT|RUN_ID|FILE_MANIFEST|PROJECT_MANIFEST|MANIFEST|DEBT|BACKUP|FINAL_FINAL)(?:_|\.|$)/i,
  /(?:总结|汇报|过程|评审记录|开发记录|阶段报告|设计稿|临时|草稿|任务记录|执行记录)/,
];

/** Gate G 豁免的产品目录（这些目录下的命名由代码/测试审查负责，不属过程文件面）。 */
const PROCESS_FILE_EXEMPT_DIRS = ['src', 'tests', 'frontend/src', 'schema', 'golden_vectors', 'repro', 'ci', 'scripts', '.github'];

/** Gate H：解析相对链接的文档面。 */
const LINK_CHECKED_DOCS = [
  'README.md', 'README.zh-CN.md', 'CONTRIBUTING.md', 'SECURITY.md', 'SUPPORT.md',
  'MAINTAINERS.md', 'CODE_OF_CONDUCT.md', '.github/pull_request_template.md',
];

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

function git(args) {
  try {
    const out = execFileSync('git', ['-c', 'core.quotePath=false', ...args], { cwd: ROOT, encoding: 'utf8' });
    return { code: 0, out: out.split(/\r?\n/).filter(Boolean) };
  } catch (error) {
    const e = error;
    if (e.stdout !== undefined) return { code: e.status ?? 1, out: String(e.stdout).split(/\r?\n/).filter(Boolean) };
    return { code: e.status ?? 1, out: [] };
  }
}

const norm = (p) => p.split(sep).join('/');

/** tracked 全量（相对路径，POSIX 形式）。 */
function trackedFiles() {
  const { out } = git(['ls-files']);
  return out.map(norm);
}

// ---------------------------------------------------------------------------
// Gate A — tracked ignored files
// ---------------------------------------------------------------------------
function gateA() {
  const { out } = git(['ls-files', '-ci', '--exclude-standard']);
  const violations = out.map((p) => `tracked 但被 .gitignore 忽略: ${p}`);
  return { ok: violations.length === 0, details: violations };
}

// ---------------------------------------------------------------------------
// Gate B — root allowlist
// ---------------------------------------------------------------------------
function gateB() {
  const violations = [];
  const { out } = git(['ls-files', '--cached', '.']);
  for (const p of out) {
    const n = norm(p);
    if (n.includes('/')) {
      const first = n.split('/')[0];
      if (!ROOT_ALLOW_DIRS.includes(first)) violations.push(`根目录一级条目白名单外: ${n}`);
    } else if (!ROOT_ALLOW_FILES.has(n)) {
      violations.push(`根目录文件白名单外: ${n}`);
    }
  }
  // 根目录 untracked 垃圾（本地开发防护：垃圾落根即红）
  const { out: st } = git(['status', '--porcelain']);
  for (const line of st) {
    if (!line.startsWith('?? ')) continue;
    const p = line.slice(3);
    if (p === '.gitignore') continue; // 自身修改不算
    const n = norm(p);
    const first = n.split('/')[0];
    const allowed = n.includes('/') ? ROOT_ALLOW_DIRS.includes(first) : ROOT_ALLOW_FILES.has(n);
    if (!allowed) violations.push(`根目录 untracked 垃圾: ${n}`);
  }
  return { ok: violations.length === 0, details: violations };
}

// ---------------------------------------------------------------------------
// Gate C — recursive forbidden-path policy
// ---------------------------------------------------------------------------
function gateC() {
  const violations = [];
  for (const p of trackedFiles()) {
    const segs = p.split('/');
    for (const seg of segs.slice(0, -1)) {
      if (FORBIDDEN_DIR_SEGMENTS.includes(seg)) {
        violations.push(`禁止路径段 "${seg}": ${p}`);
        break;
      }
    }
  }
  return { ok: violations.length === 0, details: violations };
}

// ---------------------------------------------------------------------------
// Gate D — Markdown explicit allowlist
// ---------------------------------------------------------------------------
function gateD() {
  const violations = [];
  for (const p of trackedFiles()) {
    if (/\.mdx?$/i.test(p) && !MD_ALLOWLIST.has(p)) {
      violations.push(`Markdown 未在 public 文档 allowlist: ${p}`);
    }
  }
  return { ok: violations.length === 0, details: violations };
}

// ---------------------------------------------------------------------------
// Gate E — generated/runtime artifact detection（递归）
// ---------------------------------------------------------------------------
const RUNTIME_PATTERNS = [
  /\.far-proof[\\/]/,
  /\.far[\\/]/,
  /\.receipts\.json$/,
  /run_log\.txt$/,
  /skeleton_evidence\.yaml$/,
  /\.rundb(-wal|-shm)?$/,
  /\.db(-wal|-shm)?$/,
  /coverage_output/,
  /^_audit_/,
  /evt_test\.txt$/,
  /0[\\/]v[0-9]*-x[0-9]*/,
  /\.wf_.*\.mjs$/,
];
function gateE() {
  const violations = [];
  for (const p of trackedFiles()) {
    if (RUNTIME_PATTERNS.some((re) => re.test(p))) violations.push(`生成/运行时产物被跟踪: ${p}`);
  }
  return { ok: violations.length === 0, details: violations };
}

// ---------------------------------------------------------------------------
// Gate F — forbidden binary / presentation artifacts
// ---------------------------------------------------------------------------
function gateF() {
  const violations = [];
  for (const p of trackedFiles()) {
    const ext = p.slice(p.lastIndexOf('.')).toLowerCase();
    if (FORBIDDEN_BINARY_EXTENSIONS.has(ext)) violations.push(`禁止的二进制/展示格式: ${p}`);
  }
  return { ok: violations.length === 0, details: violations };
}

// ---------------------------------------------------------------------------
// Gate G — suspicious process filenames（递归，非产品目录面）
// ---------------------------------------------------------------------------
function isProcessFileCandidate(p) {
  if (!/\.(md|txt|json|ya?ml)$/i.test(p)) return false;
  const first = p.split('/')[0];
  return !PROCESS_FILE_EXEMPT_DIRS.some((d) => p === d || p.startsWith(`${d}/`));
}
function gateG() {
  const violations = [];
  for (const p of trackedFiles()) {
    if (!isProcessFileCandidate(p)) continue;
    const base = p.split('/').pop() ?? p;
    if (PROCESS_NAME_PATTERNS.some((re) => re.test(base))) {
      violations.push(`可疑过程文件名: ${p}`);
    }
  }
  return { ok: violations.length === 0, details: violations };
}

// ---------------------------------------------------------------------------
// Gate H — dangling local references（README/CONTRIBUTING/SECURITY/SUPPORT 等相对链接）
// ---------------------------------------------------------------------------
function gateH() {
  const tracked = new Set(trackedFiles());
  const violations = [];
  const { out } = git(['ls-files', '--others', '--exclude-standard']);
  const ignoredUntracked = new Set(out.map(norm));
  for (const doc of LINK_CHECKED_DOCS) {
    const abs = join(ROOT, ...doc.split('/'));
    if (!existsSync(abs)) continue;
    const text = execFileSync('node', ['-e',
      `process.stdout.write(require('fs').readFileSync(process.argv[1], 'utf8'))`, abs], { encoding: 'utf8' });
    const linkRe = /\[[^\]]*\]\(([^)]+)\)/g;
    let m;
    while ((m = linkRe.exec(text)) !== null) {
      const target = m[1].trim();
      if (/^(https?|mailto|#|tel):/.test(target)) continue;
      if (target.includes('*') || target.includes('?')) continue; // glob 链接跳过
      const clean = target.split('#')[0].split('?')[0];
      if (clean === '') continue;
      if (clean.startsWith('http')) continue;
      // 运行时/生成路径不在 tracked 面（.far/ 等），且不得以相对链接指向不存在文件
      if (tracked.has(clean)) continue;
      if (ignoredUntracked.has(clean)) continue;
      // 目录存在（如指向目录的链接）也放行
      if (existsSync(join(ROOT, ...clean.split('/')))) continue;
      violations.push(`${doc}: 链接指向不存在的文件 "${target}"`);
    }
  }
  return { ok: violations.length === 0, details: violations };
}

// ---------------------------------------------------------------------------
// Gate I — file size policy
// ---------------------------------------------------------------------------
function gateI() {
  const violations = [];
  const { out } = git(['ls-tree', '-rl', 'HEAD']);
  for (const line of out) {
    const parts = line.split(/\s+/);
    const size = Number(parts[3] ?? 0);
    const path = norm(parts[4] ?? '');
    if (size > MAX_BLOB_BYTES && !LARGE_FILE_EXCEPTIONS.has(path)) {
      violations.push(`异常大 blob (${size} bytes > ${MAX_BLOB_BYTES}): ${path}`);
    }
  }
  return { ok: violations.length === 0, details: violations };
}

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------
const checks = {
  A_tracked_ignored_files: gateA(),
  B_root_allowlist: gateB(),
  C_forbidden_paths_recursive: gateC(),
  D_markdown_explicit_allowlist: gateD(),
  E_runtime_artifacts: gateE(),
  F_forbidden_binary: gateF(),
  G_process_filenames: gateG(),
  H_dangling_references: gateH(),
  I_file_size: gateI(),
};

const failed = Object.entries(checks).filter(([, r]) => !r.ok);
const pass = failed.length === 0;

console.log(`repo_hygiene_gate: ${pass ? 'PASS' : 'FAIL'}`);
for (const [name, result] of Object.entries(checks)) {
  console.log(`  [${result.ok ? 'ok' : 'XX'}] ${name}`);
  for (const d of result.details) console.log(`        ${d}`);
}
if (!pass) {
  console.error('\n仓库内容门禁失败。处理指引：');
  console.error('  - 每个报错问「fresh clone 的用户/贡献者/CI/构建/发布为什么需要这个文件？」');
  console.error('  - 没有强理由 → git rm 删除；确实必要 → 只加最窄的逐文件例外并同步 CONTRIBUTING.md Repository Content Policy');
  console.error('  - 禁止把整个目录加入 allowlist 来绕过');
  process.exit(1);
}
process.exit(0);
