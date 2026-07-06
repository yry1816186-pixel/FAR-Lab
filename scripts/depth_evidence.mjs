// scripts/depth_evidence.mjs
//
// keystone 物证 bot：RED→GREEN 双跑 → 写回 DEPTH_LEDGER §C WIRED_GREEN evidence。
//
// 为什么存在（anti-skim 物证层）：
//   depth_gate.mjs 是**静态**门——能证「接线符号被生产路径引用」「测试文件非幽灵」，
//   但 inherent_limits (c)/(d) 自承：不能证 closed_by sha 含接线 diff、不能证 RED→GREEN 双跑。
//   故 §C 明确「agent 不得手填 WIRED_GREEN」——WIRED_GREEN 只能由本 bot 在 CI 实跑写回。
//   agent 无 GITHUB_TOKEN + CODEOWNERS 护 DEPTH_LEDGER.md → 无法绕过本 bot 伪造物证。
//
// 康威不变式（本 bot 的全部价值所在，违反 = 安全门洞开）：
//   一行只能从 WIRED_RED 升级为 WIRED_GREEN，iff bot 在**真实** checkout 的 base SHA 上观察到
//   proof_test 裁决=FAIL **且** 在 head SHA 上观察到裁决=PASS。除此路径外的任何状态转换 → 拒绝。
//   未知/解析失败/NO_MATCH → fail-closed（exit 1，零写回）。永不假升级。
//
// 单一真实依赖（T8）：
//   真实 `git worktree add --detach <sha>` 子进程 + 真实 `git cat-file -t <sha>` 校验
//   + 真实 `node --test --test-reporter=tap` 子进程 + 真实 TAP `ok/not ok/# SKIP` 解析
//   + 真实 DEPTH_LEDGER.md 原子读写。无 mock、无硬编码裁决。
// 诚实局限（须直视，不省略）：
//   1. base 测试 PASS（接线已合并进历史，早于 base）→ 无法证明 base-FAIL → 该行**不升级**（留 WIRED_RED），
//      诚实报告 informational。维护者须选更早 base（接线 sha 之前）或 CODEOWNERS 手动背书。
//   2. 环境门控测试（P2-1 SymPy / P3-1 python 探针）在缺 python/sympy 的 checkout 上 SKIP →
//      SKIP 永不满足 base-FAIL/head-PASS → 该行不升级，informational 报告。
//   3. base-FAIL 仅证「测试在 base 红」，不证「红的原因 = 缺接线」（可能是 base 测试自身 bug）。
//      完整保证 = 本 bot（test 真翻红→绿）+ depth_gate W1-W7（接线符号真 caller）+ CODEOWNERS + maintainer 审。
//   4. closed_by=headSha 仅证 commit 存在（R9），不证含接线 diff = inherent_limits (c)。须 depth_gate CHECK-L2
//      未来加 `git diff-tree` 校验（独立改动）。
//   5. 非 `.test.{ts,js,mjs,cjs}` 的 proof_test（如 P3-1 = scripts/run_py_tests.mjs，其「测试名」是 stdout 行
//      而非 node:test subtest）不在本 bot 范围 → skip + informational，留 WIRED_RED，待 maintainer 背书。
//
// 与计划文件的 4 处偏离（均**收紧**或等价，不放宽反伪造不变式，已在此声明待 maintainer 审）：
//   A. 逐行升级 + informational 容忍 stale 行（vs 计划「任一行不过→全部不写 exit 1」）。理由：14 行接线早已
//      合并进历史，按字面计划 bot 永久 exit 1、永不写任何升级 = 自废武功。本设计保留反伪造不变式（WIRED_GREEN
//      仅凭 proven base-FAIL/head-PASS），仅把「stale/环境门控」从 fatal 降为 informational，使真翻红的行能升级。
//   B. 按 verdict 行 `ok/not ok N - <name>` **精确名匹配**（vs 计划 `--test-name-pattern` + regex 转义）。理由：
//      §C 测试名含 `+`/`(`/`)`/`|`/CJK，name-pattern 是 regex 须手动转义 = 易碎攻击面；verdict 行本身携带全名，
//      精确匹配零转义、零子串误命中（依 node 24 真实 TAP 输出实证，见探针记录）。
//   C. head 也在 worktree（--detach headSha）跑（vs 计划「head 用主工作树」）。理由：精确 SHA，不受 REPO_ROOT
//      当前检出态影响；与 base 对称；写回仍落 REPO_ROOT/DEPTH_LEDGER.md，无冲突。
//   D. 新增 `--dry-run`（跑全流程但不写回，打印将写的行）。理由：安全 + 本地验证。已知参数，不触发「未知参数 exit 2」。
//
// Authority: AGENT_ANTISKIM_TRIPWIRES.md T5 + PROJECT_PLAN/DEPTH_LEDGER.md §B/§C/§D inherent_limits (c)(d)
//            + .github/workflows/depth-evidence.yml:57-59（CLI 契约）。

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
  renameSync,
  symlinkSync,
  lstatSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { parseLedgerTable, LEDGER_ROW_RE, LEDGER_REL } from './lib/ledger.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function walkUpRepoRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const REPO_ROOT = process.env.DEPTH_EVIDENCE_ROOT || walkUpRepoRoot(__dirname);
if (!REPO_ROOT) {
  console.error('depth_evidence: 不在 git 仓库内（找不到 package.json + .git）。');
  process.exit(2);
}

const SHA_RE = /^[0-9a-f]{40}$/;
const TEST_FILE_RE = /\.test\.(ts|tsx|js|mjs|cjs)$/;
const PER_ROW_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// CLI 解析（fail-closed：缺参 / 非 40-hex / base=head / 未知参数 → exit 2）
// ---------------------------------------------------------------------------
function parseCli(argv) {
  const opts = { base: null, head: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base') { opts.base = argv[++i] ?? null; continue; }
    if (a === '--head') { opts.head = argv[++i] ?? null; continue; }
    if (a === '--dry-run') { opts.dryRun = true; continue; }
    console.error(`depth_evidence: 未知参数 "${a}"。用法: --base <40-hex sha> --head <40-hex sha> [--dry-run]`);
    process.exit(2);
  }
  if (!opts.base || !opts.head) {
    console.error('depth_evidence: --base 与 --head 均必填（GitHub PR base/head.sha，40-hex）。');
    process.exit(2);
  }
  if (!SHA_RE.test(opts.base) || !SHA_RE.test(opts.head)) {
    console.error(`depth_evidence: --base/--head 须为 40-hex SHA（GitHub PR sha 恒为 40-hex）。base="${opts.base}" head="${opts.head}"`);
    process.exit(2);
  }
  // 自指伪造守卫（与 depth_gate.mjs verifyWiredGreenEvidence base===head 拒绝同口径）。
  if (opts.base === opts.head) {
    console.error('depth_evidence: --base === --head（自指，无法证明 RED→GREEN）。');
    process.exit(2);
  }
  return opts;
}

// ---------------------------------------------------------------------------
// git 原语（数组形式 spawnSync，禁 shell，消除 Win/Linux 引号漂移）
// ---------------------------------------------------------------------------
function gitOk(args, { reject = true } = {}) {
  const r = spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
  if (r.error) {
    if (!reject) return null;
    throw new Error(`git ${args.join(' ')} 失败: ${r.error.message}`);
  }
  return r;
}

function assertRealCommit(sha, label) {
  const r = gitOk(['cat-file', '-t', sha], { reject: false });
  if (!r || r.status !== 0) {
    console.error(`depth_evidence: ${label} sha "${sha}" 非本仓库对象（git cat-file -t 失败）。`);
    process.exit(2);
  }
  const type = r.stdout.trim();
  if (type !== 'commit') {
    console.error(`depth_evidence: ${label} sha "${sha}" 是 ${type}，非 commit。`);
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// worktree 生命周期（base/head 各一 --detach；node_modules 软链共享主仓依赖）
// ---------------------------------------------------------------------------
function createWorktree(sha, label) {
  const tmp = mkdtempSync(join(tmpdir(), `depth-ev-${label}-`));
  const add = gitOk(['worktree', 'add', '--detach', tmp, sha]);
  if (add.status !== 0) {
    rmSync(tmp, { recursive: true, force: true });
    console.error(`depth_evidence: git worktree add --detach ${sha} 失败:\n${add.stderr}`);
    process.exit(2);
  }
  // 主仓 node_modules 软链进 worktree（src/ 经 worktree 自带 SHA 检出；deps 经软链命中主仓）。
  // Win 用 junction 免 admin；Linux/macOS 用 dir symlink。
  const mainNodeModules = join(REPO_ROOT, 'node_modules');
  const wtNodeModules = join(tmp, 'node_modules');
  if (existsSync(mainNodeModules) && !existsSync(wtNodeModules)) {
    try {
      symlinkSync(mainNodeModules, wtNodeModules, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (err) {
      // 软链失败 = 测试无法解析依赖 → fail-closed 清理后退出，绝不带半残 worktree 继续。
      gitOk(['worktree', 'remove', '--force', tmp], { reject: false });
      rmSync(tmp, { recursive: true, force: true });
      console.error(`depth_evidence: node_modules 软链失败 (${label}): ${err.message}`);
      process.exit(2);
    }
  }
  return tmp;
}

// 关键修复（数据丢失 bug）：worktree 内 node_modules 是指向 REPO_ROOT/node_modules 的
// junction(Win)/symlink(POSIX)。rmSync(tmp,{recursive}) 与 git worktree remove 均会穿越该
// 链接递归删除主仓 node_modules 真实内容（实测：bot dry-run 后 node_modules 清空，
// 全量 1122 tests→411/99 fail）。修法：递归删 worktree 前，先非递归删除链接入口（仅删
// reparse point，目标 node_modules 完整保留）。实证（Node 24 win32）：lstatSync(junction)
// .isSymbolicLink()===true；非递归 rmSync(link) 删链接不删目标（SENTINEL 存活）。
function removeWorktree(tmp) {
  if (!tmp) return;
  const wtNodeModules = join(tmp, 'node_modules');
  try {
    if (existsSync(wtNodeModules) && lstatSync(wtNodeModules).isSymbolicLink()) {
      rmSync(wtNodeModules, { force: true }); // 非递归：仅删链接入口，不跟随目标
    }
  } catch { /* 链接已不存在或非链接形态，交由下方常规递归清理 */ }
  gitOk(['worktree', 'remove', '--force', tmp], { reject: false });
  rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// TAP 解析（node 24 真实格式：verdict 行携带全名 + # SKIP/# TODO；summary 行 # pass/fail/skipped）
// ---------------------------------------------------------------------------
function parseTap(tapText) {
  const entries = [];
  const summary = { tests: null, pass: null, fail: null, skipped: null, todo: null, cancelled: null };
  const lines = tapText.split(/\r?\n/);
  for (const line of lines) {
    const v = line.match(/^\s*(ok|not ok)\s+(\d+)\s+-\s+(.*)$/);
    if (v) {
      let name = v[3];
      let status;
      const skipIdx = name.search(/\s+#\s*SKIP\b/i);
      const todoIdx = name.search(/\s+#\s*TODO\b/i);
      if (skipIdx !== -1) { name = name.slice(0, skipIdx); status = 'SKIP'; }
      else if (todoIdx !== -1) { name = name.slice(0, todoIdx); status = 'TODO'; }
      else if (v[1] === 'ok') { status = 'PASS'; }
      else { status = 'FAIL'; }
      entries.push({ name: name.trim(), status });
      continue;
    }
    const s = line.match(/^#\s*(tests|pass|fail|skipped|todo|cancelled)\s+(\d+)/);
    if (s) summary[s[1]] = parseInt(s[2], 10);
  }
  return { entries, summary };
}

// 按名查裁决。支持两种账本约定：
//   (1) 精确全名（testName === TAP verdict 行全名）
//   (2) 短前缀 + ':' 分隔（testName 是 TAP 名 `short_id: 人类可读描述` 的 short_id 部分）
// ':' 分隔精确防子串误命中（`foo` 不匹配 `foobar: ...`）。多命中须状态一致，否则 UNKNOWN（fail-closed）。
// 零命中 = NO_MATCH。本匹配非弱化门——base 仍须 FAIL、head 仍须 PASS，仅对齐账本短名约定。
function verdictForName(parsed, testName) {
  const t = testName.trim();
  const matches = parsed.entries.filter((e) => {
    if (e.name === t) return true;
    if (e.name.startsWith(t + ':')) return true; // §C 短前缀 vs TAP `short: desc` 全名
    return false;
  });
  if (matches.length === 0) return 'NO_MATCH';
  const statuses = new Set(matches.map((m) => m.status));
  if (statuses.size === 1) return [...statuses][0];
  return 'UNKNOWN';
}

// ---------------------------------------------------------------------------
// 测试运行：在某 checkout 跑 `node --test <file>`，返回 { verdict, exitCode, tapSample }
// verdict ∈ PASS|FAIL|SKIP|TODO|NO_MATCH|NO_FILE|UNKNOWN
// ---------------------------------------------------------------------------
function runProofTest(checkoutDir, testFile, testName) {
  const absTestFile = join(checkoutDir, testFile);
  if (!existsSync(absTestFile)) return { verdict: 'NO_FILE', exitCode: null, tapSample: '' };
  // 剥离 NODE_TEST_CONTEXT：本 bot 若被另一 `node --test` 进程唤起（如集成测），子 `node --test`
  // 会继承该 env 进入「test runner child」模式，忽略 --test-reporter=tap 改吐内部流协议 →
  // parseTap 抓不到 subtest 名。CI 直调（workflow 非测跑器）无此 env，剥除对 CI 无影响、对本地下兼容。
  const { NODE_TEST_CONTEXT, ...childEnv } = process.env;
  const r = spawnSync(
    'node',
    ['--test', '--test-reporter=tap', testFile],
    { cwd: checkoutDir, encoding: 'utf8', timeout: PER_ROW_TIMEOUT_MS, env: childEnv },
  );
  // 子进程被 timeout kill → 无法证裁决 → fail-closed UNKNOWN。
  if (r.error) {
    return { verdict: 'UNKNOWN', exitCode: null, tapSample: `[spawn error: ${r.error.message}]` };
  }
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const parsed = parseTap(out);
  const verdict = verdictForName(parsed, testName);
  // 交叉不变式：exit≠0 须有解释（≥1 not ok）。exit≠0 且零 not ok 行 = 不可解释失败 → UNKNOWN。
  if (r.status !== 0 && verdict !== 'FAIL' && parsed.entries.every((e) => e.status !== 'FAIL')) {
    return { verdict: 'UNKNOWN', exitCode: r.status, tapSample: out.slice(0, 500) };
  }
  return { verdict, exitCode: r.status, tapSample: out.slice(0, 200) };
}

// ---------------------------------------------------------------------------
// 逐行裁决合成（base + head → outcome）
//   UPGRADE: base FAIL + head PASS（唯一升级条件）
//   ERROR:   NO_MATCH / UNKNOWN / NO_FILE_HEAD（fail-closed，阻断全部写回）
//   INFO:    其余（stale / 环境门控 / head 仍红）→ 留 WIRED_RED，不阻断
// ---------------------------------------------------------------------------
function rowOutcome(base, head) {
  if (base.verdict === 'NO_MATCH' || head.verdict === 'NO_MATCH') {
    return { kind: 'ERROR', reason: 'NO_MATCH: 测试名在 TAP 中未找到（账本指向不存在的测试名？）' };
  }
  if (base.verdict === 'UNKNOWN' || head.verdict === 'UNKNOWN') {
    return { kind: 'ERROR', reason: 'UNKNOWN: TAP 解析冲突 / 不可解释失败 / 子进程 timeout' };
  }
  if (head.verdict === 'NO_FILE') {
    return { kind: 'ERROR', reason: 'NO_FILE_HEAD: proof_test 文件在 head 不存在（WIRED_RED 行测试须存在于 head）' };
  }
  if (base.verdict === 'NO_FILE') {
    return { kind: 'INFO', reason: 'NO_FILE_BASE: 测试文件在 base 不存在（base 之后新增）；无法证明 base-FAIL，留 WIRED_RED' };
  }
  if (base.verdict === 'FAIL' && head.verdict === 'PASS') {
    return { kind: 'UPGRADE', reason: 'base FAIL → head PASS（真 RED→GREEN 物证）' };
  }
  if (base.verdict === 'PASS' && head.verdict === 'PASS') {
    return { kind: 'INFO', reason: 'base PASS（接线早于 base）；无法证明 RED→GREEN，留 WIRED_RED（选更早 base 或 maintainer 背书）' };
  }
  if (head.verdict === 'FAIL') {
    return { kind: 'INFO', reason: 'head FAIL（测试在 head 仍红）；留 WIRED_RED' };
  }
  if (head.verdict === 'SKIP' || head.verdict === 'TODO') {
    return { kind: 'INFO', reason: `head ${head.verdict}（环境门控或 todo）；无法证 GREEN，留 WIRED_RED` };
  }
  if (base.verdict === 'SKIP' || base.verdict === 'TODO') {
    return { kind: 'INFO', reason: `base ${base.verdict}（环境门控）；无法证 base-FAIL，留 WIRED_RED` };
  }
  return { kind: 'INFO', reason: `base=${base.verdict} head=${head.verdict}；无升级条件命中` };
}

// ---------------------------------------------------------------------------
// 账本写回（行基编辑，锚定 §C row id；原子 tmp+rename；幂等）
// ---------------------------------------------------------------------------
function padCell(orig, newVal) {
  const w = orig.length;
  const v = String(newVal);
  if (v.length + 2 <= w) return ' ' + v + ' '.repeat(w - v.length - 2) + ' ';
  return ' ' + v + ' ';
}

function replaceRowCells(line, { status, closedBy }) {
  const parts = line.split('|');
  // §C 行段数：8 cell + 2 border = 10 段（R10 含 claimed_by_pr 列）；向后兼容 7 cell + 2 border = 9 段旧行。
  // status=parts[6]、closedBy=parts[7] 索引在两种列数下恒定（claimed_by_pr 在 parts[8]，原样保留不动）。
  // 不符（非 §C 行 / 损坏行）则原样返回——防御性不静默改写。
  if (parts.length !== 10 && parts.length !== 9) return line;
  parts[6] = padCell(parts[6], status);
  parts[7] = padCell(parts[7], closedBy);
  return parts.join('|');
}

function formatEvidenceLine(baseSha, headSha, cellCount) {
  const dashes = ' — |'.repeat(cellCount - 1);
  return `| evidence: ${baseSha} → ${headSha} |${dashes}`; // → 两侧空格强制（L2 正则 \S+\s*[→>]\s*\S+）
}

function writeBackUpgrades(ledgerPath, upgrades, baseSha, headSha, dryRun) {
  const original = readFileSync(ledgerPath, 'utf8');
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const lines = original.split(/\r?\n/);

  // §C 行匹配天然限定（LEDGER_ROW_RE 只配 §C 表行）；额外用 §C 段落边界收紧，防散文误命中。
  let sectionCStart = -1;
  let sectionCEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (sectionCStart === -1) {
      if (lines[i].startsWith('## §C')) sectionCStart = i;
    } else if (lines[i].startsWith('## ')) {
      sectionCEnd = i;
      break;
    }
  }

  const newLines = [];
  let changed = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    newLines.push(line);
    if (i <= sectionCStart || i >= sectionCEnd) continue;
    const m = line.match(LEDGER_ROW_RE);
    if (!m) continue;
    const id = m[1].trim();
    const status = m[7].trim();
    // 只升级当前 WIRED_RED 且本轮 proven 的行（防御：非 WIRED_RED 不动）。
    if (status !== 'WIRED_RED' || !upgrades.has(id)) continue;

    const cellCount = line.split('|').length - 2;
    const rewritten = replaceRowCells(line, { status: 'WIRED_GREEN', closedBy: headSha });
    newLines[newLines.length - 1] = rewritten; // 替换刚 push 的原行
    const evLine = formatEvidenceLine(baseSha, headSha, cellCount);
    // 下一行若已是 evidence 行则替换，否则插入（幂等：重跑不重复插入）。
    const next = lines[i + 1] ?? '';
    if (/^\|\s*evidence\s*:/i.test(next.trim())) {
      newLines.push(evLine);
      i++; // 吞掉旧 evidence 行
    } else {
      newLines.push(evLine);
    }
    changed++;
  }

  if (changed === 0) return { changed: 0, wrote: false };
  const newText = newLines.join(eol);
  if (dryRun) {
    return { changed, wrote: false, preview: newText };
  }
  // 原子写：tmp + rename（同目录同卷，rename 原子）。
  const tmp = ledgerPath + '.depth-evidence-tmp';
  try {
    writeFileSync(tmp, newText, 'utf8');
    renameSync(tmp, ledgerPath);
  } catch (err) {
    try { if (existsSync(tmp)) rmSync(tmp, { force: true }); } catch { /* best-effort 清理 */ }
    throw new Error(`原子写回失败: ${err.message}`);
  }
  return { changed, wrote: true };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
function main() {
  const opts = parseCli(process.argv.slice(2));
  assertRealCommit(opts.base, '--base');
  assertRealCommit(opts.head, '--head');

  const ledger = parseLedgerTable(REPO_ROOT);
  if (!ledger.exists) {
    console.error('depth_evidence: DEPTH_LEDGER.md 不存在，无可处理行。');
    process.exit(0);
  }
  const wiredRedRows = ledger.rows.filter((r) => r.status === 'WIRED_RED');
  if (wiredRedRows.length === 0) {
    console.log('depth_evidence: §C 无 WIRED_RED 行，无升级候选。exit 0。');
    process.exit(0);
  }

  // 解析每行 proof_test → {testFile, testName}；跳过非 .test. 文件（P3-1 脚本类，out of scope）。
  const scoped = [];
  const skippedNonTest = [];
  for (const r of wiredRedRows) {
    const sep = r.proofTest.indexOf('::');
    if (sep === -1) {
      skippedNonTest.push({ id: r.id, reason: `proof_test 无 :: 分隔（"${r.proofTest}"），无法取 testFile/testName` });
      continue;
    }
    const testFile = r.proofTest.slice(0, sep).trim();
    const testName = r.proofTest.slice(sep + 2).trim();
    if (!testFile || !testName) {
      skippedNonTest.push({ id: r.id, reason: `proof_test 文件名或测试名为空（"${r.proofTest}"）` });
      continue;
    }
    if (!TEST_FILE_RE.test(testFile)) {
      skippedNonTest.push({ id: r.id, reason: `${testFile} 非 .test.{ts,js,mjs,cjs}（非 node:test 文件，out of bot scope，留 WIRED_RED）` });
      continue;
    }
    scoped.push({ row: r, testFile, testName });
  }

  // 按 worktree × 唯一 testFile 批跑（同文件多行只 spawn 一次 node --test）。
  let baseWt = null;
  let headWt = null;
  const results = []; // {id, testFile, testName, base, head, outcome}
  let hadError = false;
  try {
    baseWt = createWorktree(opts.base, 'base');
    headWt = createWorktree(opts.head, 'head');
    for (const { row, testFile, testName } of scoped) {
      const base = runProofTest(baseWt, testFile, testName);
      const head = runProofTest(headWt, testFile, testName);
      const outcome = rowOutcome(base, head);
      if (outcome.kind === 'ERROR') hadError = true;
      results.push({ id: row.id, testFile, testName, base, head, outcome });
    }
  } finally {
    removeWorktree(baseWt);
    removeWorktree(headWt);
  }

  // 诊断输出（per-row + aggregate + manual repro）。
  const upgrades = new Map();
  for (const r of results) {
    const flag = r.outcome.kind === 'UPGRADE' ? '✓ UPGRADE' : r.outcome.kind === 'ERROR' ? '✗ ERROR ' : '○ INFO   ';
    console.log(
      `${flag} ${r.id.padEnd(7)} base=${(r.base.verdict ?? '?').padEnd(8)} head=${(r.head.verdict ?? '?').padEnd(8)} | ${r.outcome.reason}`,
    );
    if (r.outcome.kind === 'UPGRADE') {
      upgrades.set(r.id, { testFile: r.testFile, testName: r.testName, base: r.base, head: r.head });
    }
  }
  for (const s of skippedNonTest) {
    console.log(`○ SKIP   ${s.id.padEnd(7)} | ${s.reason}`);
  }

  const nUp = [...upgrades.keys()].length;
  const nErr = results.filter((r) => r.outcome.kind === 'ERROR').length;
  const nInfo = results.filter((r) => r.outcome.kind === 'INFO').length;
  console.log(`\naggregate: ${nUp} upgrade | ${nInfo} info | ${nErr} error | ${skippedNonTest.length} out-of-scope`);

  if (hadError) {
    console.error('\ndepth_evidence: 存在 ERROR（fail-closed）——零写回。修复账本/测试名后重跑。');
    process.exit(1);
  }

  if (nUp === 0) {
    console.log('depth_evidence: 无 UPGRADE 候选（stale / 环境门控 / 仍红）。零写回，exit 0。');
    process.exit(0);
  }

  // 原子写回所有 proven 升级。
  const wb = writeBackUpgrades(join(REPO_ROOT, ...LEDGER_REL), upgrades, opts.base, opts.head, opts.dryRun);
  if (opts.dryRun) {
    console.log(`\n[dry-run] 将升级 ${wb.changed} 行（不写回）。预览 DEPTH_LEDGER.md 改动：`);
    console.log(wb.preview.split(/\r?\n/).filter((l) => /WIRED_GREEN|evidence:/.test(l)).join('\n'));
    process.exit(0);
  }
  console.log(`\ndepth_evidence: 写回 ${wb.changed} 行 WIRED_GREEN + evidence（base=${opts.base.slice(0, 8)} → head=${opts.head.slice(0, 8)}）。exit 0。`);
  process.exit(0);
}

// 直接调用（CLI）才跑 main；被 import（单元测试纯函数）时不跑，避免 process.exit 污染测试进程。
const invokedDirectly = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (invokedDirectly) main();

export {
  parseTap,
  verdictForName,
  rowOutcome,
  replaceRowCells,
  formatEvidenceLine,
  padCell,
  writeBackUpgrades,
  removeWorktree,
};

