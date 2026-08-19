#!/usr/bin/env node
/**
 * test_registry.mjs — CLI 命令注册表完整性检查（CI test_registry job 的真实语义）。
 *
 * 偿还的占位债：ci.yml test_registry job 曾因 "scripts/test_registry.ts 未实现" 而用
 * 全量 `pnpm run test` 兜底（每 PR 多跑一遍全量测试，昂贵且语义空心）。本脚本提供
 * 该 job 本该有的检查：命令注册表 ↔ 用户可见 help ↔ 逐命令专属帮助 三方一致。
 *
 * 检查项（全部离线、确定性、零新依赖）：
 *   R1  注册表提取：静态解析 src/cli/far.ts COMMANDS 数组的 name 项；
 *       name 必须唯一且 description 非空（注册结构完整）。
 *   R2  help ↔ 注册表双向一致：`far --help` 输出中每个 `  far <cmd>` 命令都必须
 *       已注册（防幽灵命令），每个注册命令都必须在 help 出现（防隐藏命令——
 *       2026-08-20 实发缺陷：monitor/plugin/snapshot-verify 注册但 help 缺席）。
 *   R3  GETTING STARTED 段有意重复入口命令，但该段出现的命令也必须已注册。
 *   R4  逐命令专属帮助：`far <cmd> --help` 首行必须是 `FAR-Lab CLI — <cmd>`，
 *       证明 DETAILED_HELP 有该命令的专属段落（commandHelp 找不到段时会静默
 *       fallback 到通用 HELP_TEXT——R4 把这个静默降级变成显式 FAIL）。
 *       --quick 跳过 R4（本地快速模式；CI 全量跑）。
 *
 * 退出码：0 = 三方一致；1 = 任何漂移（逐项打印）。
 *
 * 用法：
 *   node scripts/test_registry.mjs [--dir <repo-root>] [--quick]
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const dirIdx = args.indexOf('--dir');
const ROOT = dirIdx !== -1 && args[dirIdx + 1] !== undefined ? resolve(args[dirIdx + 1]) : process.cwd();
const QUICK = args.includes('--quick');

/** R1: 从 far.ts 源码静态提取 COMMANDS 数组的注册项 {name, description}。
 *  行级扫描：`name: '...'` 行向下找最近的 `description: '...'`（同一注册项内，
 *  中间可有 aliases 等字段；遇到下一个 `name:` 即停）。 */
export function parseCommandRegistry(farTsSource) {
  const start = farTsSource.indexOf('const COMMANDS');
  if (start === -1) return [];
  const end = farTsSource.indexOf('\n];', start);
  const body = farTsSource.slice(start, end === -1 ? undefined : end);
  const entries = [];
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const nameM = /name:\s*'([^']+)'/.exec(lines[i]);
    if (nameM === null) continue;
    for (let j = i; j < Math.min(i + 15, lines.length); j += 1) {
      const descM = /description:\s*'((?:[^'\\]|\\.)*)'/.exec(lines[j]);
      if (descM !== null) {
        entries.push({ name: nameM[1], description: descM[1] });
        break;
      }
      if (j > i && /name:\s*'/.test(lines[j])) break;
    }
  }
  return entries;
}

/** 从 help 文本抽取命令集：`  far <cmd>` 行首形（过滤 `<placeholder>` 占位符与续行）。 */
export function parseHelpCommands(helpText) {
  const cmds = new Set();
  for (const line of helpText.split('\n')) {
    const m = /^  far ([A-Za-z][\w-]*)/.exec(line);
    if (m !== null) cmds.add(m[1]);
  }
  return cmds;
}

/** GETTING STARTED 段（有意重复入口）内的命令集。 */
export function parseGettingStartedCommands(helpText) {
  const lines = helpText.split('\n');
  const start = lines.findIndex((l) => /^GETTING STARTED/.test(l));
  if (start === -1) return new Set();
  const end = lines.findIndex((l, i) => i > start && /^[A-Z][A-Z &()]+$/.test(l.trim()) && l.trim() !== '');
  const seg = lines.slice(start + 1, end === -1 ? undefined : end);
  const cmds = new Set();
  for (const line of seg) {
    const m = /^  far ([A-Za-z][\w-]*)/.exec(line);
    if (m !== null) cmds.add(m[1]);
  }
  return cmds;
}

// ── 主检查流程 ──────────────────────────────────────────────────────────────
const farPath = join(ROOT, 'src/cli/far.ts');
const farSource = readFileSync(farPath, 'utf8');

// R1 · 注册表结构
const registry = parseCommandRegistry(farSource);
const failures = [];
if (registry.length === 0) {
  failures.push('R1: COMMANDS 数组解析出 0 个注册项——far.ts 结构已变，本检查器需要同步更新');
}
const names = registry.map((e) => e.name);
const dupes = names.filter((n, i) => names.indexOf(n) !== i);
if (dupes.length > 0) failures.push(`R1: 重复注册的命令名: ${[...new Set(dupes)].join(', ')}`);
for (const e of registry) {
  if (e.description.trim() === '') failures.push(`R1: 命令 '${e.name}' description 为空`);
}

// 真实 help 输出（黑盒：用户所见即所检）
const helpRun = spawnSync(process.execPath, [farPath, '--help'], { cwd: ROOT, encoding: 'utf8' });
if (helpRun.status !== 0) {
  console.error(`test_registry: far --help exited ${helpRun.status}\n${helpRun.stderr}`);
  process.exit(1);
}
const helpCmds = parseHelpCommands(helpRun.stdout);
const registered = new Set(names);

// R2 · 双向一致
for (const n of names) {
  if (!helpCmds.has(n)) failures.push(`R2: 隐藏命令——'${n}' 已注册但 far --help 未列出`);
}
for (const c of helpCmds) {
  if (!registered.has(c)) failures.push(`R2: 幽灵命令——far --help 列出 '${c}' 但 COMMANDS 未注册`);
}

// R3 · GETTING STARTED 段命令也必须注册
for (const c of parseGettingStartedCommands(helpRun.stdout)) {
  if (!registered.has(c)) failures.push(`R3: GETTING STARTED 段的 '${c}' 未在 COMMANDS 注册`);
}

// R4 · 逐命令专属帮助（检测 commandHelp 的静默 fallback）
if (!QUICK) {
  for (const n of names) {
    const r = spawnSync(process.execPath, [farPath, n, '--help'], { cwd: ROOT, encoding: 'utf8' });
    if (r.status !== 0) {
      failures.push(`R4: far ${n} --help 退出码 ${r.status}（应为 0）`);
      continue;
    }
    const firstLine = (r.stdout.split('\n')[0] ?? '').trim();
    if (firstLine !== `FAR-Lab CLI — ${n}`) {
      failures.push(`R4: far ${n} --help 无专属段落（首行非 'FAR-Lab CLI — ${n}'，DETAILED_HELP 缺段→静默 fallback）`);
    }
  }
}

// ── 汇报 ────────────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error(`FAIL — ${failures.length} 项注册表/help 漂移：`);
  for (const f of failures) console.error(`  ✖ ${f}`);
  process.exit(1);
}
console.log(
  `PASS — ${registry.length} 命令注册表↔help↔专属帮助三方一致` +
    (QUICK ? '（--quick：R4 逐命令帮助未跑）' : '（R1 结构 + R2 双向 + R3 入口段 + R4 逐命令专属帮助全绿）'),
);
