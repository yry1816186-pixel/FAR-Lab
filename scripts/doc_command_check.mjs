/**
 * doc_command_check.mjs — DEF-14 偿还：文档命令抽取 + doc↔CLI 一致性校验。
 *
 * 职责：从 README.md/README.zh-CN.md 抽取 `far <sub>` 命令，与 `far --help` 真实子命令清单比对，
 *   任一文档命令在 CLI 不存在 → exit 1（文档腐烂/命令漂移检测·离线·确定性·不触网）。
 *
 * 机制（零新依赖）：
 *   1. 跑 `node src/cli/far.ts --help` → 正则抽 `^  far (\S+)` 得真实子命令集；
 *   2. 扫 README fenced code block，抽 `far <token>` 得文档命令集；
 *   3. 差集（文档有 / CLI 无）→ FAIL；额外校验文档命令无残留 `<X_FROM_STATUS_DUMP>` 类占位。
 *
 * 边界：本工具不执行文档命令（避免副作用），仅做静态子命令存在性 + 占位残留校验。
 *   链接活性检查需联网，属发布前外部动作，不在本离线工具范围（如实声明）。
 *
 * 权威：文档与命令一致性契约（doc↔CLI 同源）。
 * 零容忍合规：无 any / @ts-ignore / 空 catch / 桩返回。
 *
 * 用法：
 *   node scripts/doc_command_check.mjs           校验 doc↔CLI 一致性
 *   node scripts/doc_command_check.mjs --dir <d> 指定仓库根（测试用）
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const dirIdx = args.indexOf('--dir');
const ROOT = dirIdx !== -1 && args[dirIdx + 1] !== undefined ? resolve(args[dirIdx + 1]) : process.cwd();

// 步骤 1：真实子命令集（跑 far --help）
function realSubcommands() {
  const r = spawnSync(process.execPath, [join(ROOT, 'src/cli/far.ts'), '--help'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error(`doc_command_check: far --help failed (exit ${r.status})\n${r.stderr}`);
  }
  const subs = new Set();
  for (const line of r.stdout.split('\n')) {
    // 匹配 "  far <subcommand>" 形式（帮助文本里子命令行缩进 2 空格）
    const m = line.match(/^\s{2}far\s+([A-Za-z][\w-]*)/);
    if (m !== null && m[1] !== undefined) subs.add(m[1]);
  }
  return subs;
}

// 步骤 2：文档命令集（扫 README fenced code block）
function docCommands(readmePath) {
  if (!existsSync(readmePath)) return new Map();
  const text = readFileSync(readmePath, 'utf8');
  const cmds = new Map(); // sub → [sample lines]
  let inFence = false;
  for (const raw of text.split('\n')) {
    if (/^```/.test(raw.trim())) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) continue;
    // 命令行：可选 $ 前缀 + 可选包管理器前缀（pnpm far X / npm run far X），后跟 far <sub>
    const m = raw.match(/^\$?\s*(?:pnpm\s+|npm\s+run\s+)?far\s+([A-Za-z][\w-]*)/);
    if (m !== null && m[1] !== undefined) {
      const sub = m[1];
      if (!cmds.has(sub)) cmds.set(sub, []);
      cmds.get(sub).push(raw.trim());
    }
  }
  return cmds;
}

// 步骤 3：占位残留校验（CI backfill 占位须为 <X_FROM_STATUS_DUMP> 合法形式；裸 <foo> 视为残留）
function residualTokenScan(readmePath) {
  if (!existsSync(readmePath)) return [];
  const text = readFileSync(readmePath, 'utf8');
  const residues = [];
  let inFence = false;
  for (const raw of text.split('\n')) {
    if (/^```/.test(raw.trim())) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) continue;
    if (!/^\$?\s*(?:pnpm\s+|npm\s+run\s+)?far\s/.test(raw)) continue;
    // 允许 <X_FROM_STATUS_DUMP>（CI backfill 合法占位）；其余 <lower> 形式视为未填残留
    const bad = raw.match(/<(?![A-Z_]+_FROM_STATUS_DUMP>)[a-z][a-z0-9_-]*>/g);
    if (bad !== null) residues.push({ line: raw.trim(), badTokens: bad });
  }
  return residues;
}

// ---------------------------------------------------------------------------

const real = realSubcommands();
const readmes = ['README.md', 'README.zh-CN.md'].map((f) => join(ROOT, f));

const docAll = new Map();
const residueAll = [];
for (const r of readmes) {
  for (const [sub, samples] of docCommands(r)) {
    if (!docAll.has(sub)) docAll.set(sub, []);
    docAll.get(sub).push(...samples);
  }
  residueAll.push(...residualTokenScan(r).map((x) => ({ ...x, file: r })));
}

const drift = [...docAll.keys()].filter((sub) => !real.has(sub));

console.log('═══════════════════════════════════════════');
console.log('  FAR-Lab Doc Command Check (DEF-14 · doc↔CLI 一致性)');
console.log('═══════════════════════════════════════════');
console.log(`CLI 真实子命令 (${real.size}): ${[...real].sort().join(', ')}`);
console.log(`README 文档命令 (${docAll.size}): ${[...docAll.keys()].sort().join(', ')}`);
console.log(`占位残留: ${residueAll.length}`);

if (drift.length > 0) {
  console.error(`❌ doc_command_check: FAIL — ${drift.length} 个文档命令在 CLI 不存在:`);
  for (const sub of drift) console.error(`     far ${sub}  (示例: ${docAll.get(sub)?.[0]})`);
  process.exit(1);
}
if (residueAll.length > 0) {
  console.error(`❌ doc_command_check: FAIL — ${residueAll.length} 处文档命令含未填占位 <lower>:`);
  for (const r of residueAll) console.error(`     [${r.file.split(/[\\/]/).pop()}] ${r.line}  → ${r.badTokens.join(', ')}`);
  process.exit(1);
}
console.log(`✅ doc_command_check: PASS — ${docAll.size} 文档命令全部存在于 CLI，零占位残留`);
process.exit(0);
