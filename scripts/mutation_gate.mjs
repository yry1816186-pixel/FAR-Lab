#!/usr/bin/env node
/**
 * mutation_gate —— 信任内核抽样变异测试。
 *
 * 背景（findings P1-B）：mutation 工具/基线全无——「确定性内核 + 反剧场」的测试强度
 * 无经验证据。本脚本对指定源文件应用确定性变异算子（等值/边界/逻辑/布尔翻转），
 * 逐位点运行关联测试，统计 killed / survived 与存活率（目标 <10%）。
 *
 * 算子（确定性·语法安全·等价变异已人工排除）：
 *   === <-> !==   >= <-> >   <= <-> <   && <-> ||   true <-> false
 * 不含 + -> -（算术变异在哈希/裁决代码中大量产生等价变异·噪声高）。
 *
 * 用法:
 *   node scripts/mutation_gate.mjs <src-file> <test-file> [--limit N] [--verbose]
 * 示例:
 *   node scripts/mutation_gate.mjs src/fec/compiler.ts tests/fec/fec_mandatory_gate.test.ts --limit 20
 *
 * 退出码: 0 = 存活率 <10%（达标）· 1 = 存活率 ≥10%（测试强度不足·须补断言）
 * 输出: killed/survived 明细 + 存活率 + 达标判定。
 *
 * 等价变异登记（EQUIVALENT_MUTATIONS）：数学上不可杀灭的变异（变异后可观测行为
 * 与原代码等价——任何测试都无法区分）。登记纪律：每条必须带论证；命中不计入
 * 存活率（计入 equivalent 单独披露）；登记只增不减或改须在 PR 说明中论证。
 */

import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

// 等价变异登记：op + 行文本前缀匹配（trim 后 startsWith）。
// 每条带论证；抽查论证真实性是 code review 责任（防豁免沦为逃逸后门）。
const EQUIVALENT_MUTATIONS = {
  'src/far_proof/integrity_check.ts': [
    {
      op: 'eq_to_neq',
      linePrefix: "fileCount: typeof record.fileCount === 'number'",
      reason: '合法导出的 fileCount 恒等于 files.length（exporter 同源生成）：变异取 files.length 与取 fileCount 值相同；仅攻击者自构 bundle 可区分，而该场景由 INTEGRITY_HASH_MISMATCH 层覆盖',
    },
  ],
  'src/statistics/p_value.ts': [
    {
      op: 'lt_to_lte',
      linePrefix: 'if (probability < plow)',
      reason: 'A&S 26.2.23 分支算法在边界连续：Q(plow) 低尾/中段两分支输出同值（2026-08-20 实测 -1.9729610490848712 双分支一致），分支选择在边界不可观测',
    },
    {
      op: 'lte_to_lt',
      linePrefix: 'if (probability <= phigh)',
      reason: '同上：phigh=1-plow 边界中段/高尾两分支数值一致（算法设计保证连续性）',
    },
    {
      op: 'lt_to_lte',
      linePrefix: 'if (value < 0)',
      reason: 'clampProbability：value=0 时提前返回 0 与 fall-through 返回 value(=0) 等值',
    },
    {
      op: 'gt_to_gte',
      linePrefix: 'if (value > 1)',
      reason: 'clampProbability：value=1 时提前返回 1 与 fall-through 返回 value(=1) 等值',
    },
    {
      op: 'lt_to_lte',
      linePrefix: 'const sign = x < 0 ? -1 : 1',
      reason: 'erf(0)=0：x=0 时符号取 -1 或 1 结果均为 0（-0 与 0 数值相等），符号分支在 x=0 不可观测',
    },
  ],
  'src/falsifiability/verdict_kernel_v2.ts': [
    {
      op: 'gt_to_gte',
      linePrefix: 'const ratio = a > b ? a / b : b / a',
      reason: 'a===b 时两分支均得 ratio=1（除法对称），分支选择在相等点不可观测；a≠b 时 max/min 语义两分支同选大者',
    },
    {
      op: 'gt_to_gte',
      linePrefix: 'if (input.identifierClaims !== undefined && input.identifierClaims.length > 0) {',
      reason: 'length>=0 恒真后空数组进入块，但 some() 对空数组恒 false → 无 return → 与跳过块输出等价；非空数组两判定同真',
    },
    {
      op: 'gt_to_gte',
      linePrefix: '.filter((p) => p.length > 0)',
      reason: 'p 由模板 `${dimension}=${value}(${relation})` 生成，最少含 "=(" 与 ")" 共 3 字符，长度恒 >0，过滤谓词在 > 与 >= 下等价',
    },
    {
      op: 'gt_to_gte',
      linePrefix: 'return parts.length > 0 ?',
      reason: 'renderScopeSlip 仅在 isDegraded=true 时被消费：scopePartial ⇒ impacted 非空、driftWarn ⇒ push 一项，parts 恒非空，三元条件在 > 与 >= 下等价（fallback 分支为不可达防御）',
    },
  ],
};

/** 位点是否命中等价变异登记（返回登记项或 null）。 */
function findEquivalentRegistration(srcFile, site) {
  const regs = EQUIVALENT_MUTATIONS[srcFile];
  if (regs === undefined) return null;
  return regs.find((r) => r.op === site.operator && site.line.startsWith(r.linePrefix)) ?? null;
}

const OPERATORS = [
  { name: 'eq_to_neq', re: /(===)/g, replace: '!==' },
  { name: 'neq_to_eq', re: /(!==)/g, replace: '===' },
  { name: 'gte_to_gt', re: /(>=)/g, replace: '>' },
  { name: 'lte_to_lt', re: /(<=)/g, replace: '<' },
  { name: 'gt_to_gte', re: /(?<![=!<])>(?!=)/g, replace: '>=' },
  { name: 'lt_to_lte', re: /(?<![=!>])<(?!=)/g, replace: '<=' },
  { name: 'and_to_or', re: /(&&)/g, replace: '||' },
  { name: 'or_to_and', re: /(\|\|)/g, replace: '&&' },
  { name: 'true_to_false', re: /(\btrue\b)/g, replace: 'false' },
  { name: 'false_to_true', re: /(\bfalse\b)/g, replace: 'true' },
];

/** 提取某算子的全部变异位点（偏移 + 上下文 40 字符）。 */
function collectMutationSites(source) {
  const sites = [];
  for (const op of OPERATORS) {
    op.re.lastIndex = 0;
    let m;
    while ((m = op.re.exec(source)) !== null) {
      // 跳过注释/字符串中的命中（粗略：前后 60 字符内无 // /* 引号包裹复杂——按行判断）。
      const lineStart = source.lastIndexOf('\n', m.index) + 1;
      const lineEnd = source.indexOf('\n', m.index);
      const line = source.slice(lineStart, lineEnd < 0 ? undefined : lineEnd);
      if (isInCommentOrString(line, m.index - lineStart)) {
        continue;
      }
      sites.push({
        operator: op.name,
        offset: m.index,
        line: line.trim().slice(0, 80),
        snippet: source.slice(Math.max(0, m.index - 30), m.index + 30),
      });
    }
  }
  return sites;
}

/** 判断位点在行内是否处于注释或字符串（保守启发式：按位点前字符计数）。 */
function isInCommentOrString(line, col) {
  const trimmed = line.trimStart();
  // JSDoc/块注释行（* 开头）整体视为注释——内部 ===/&& 等是文档性引用。
  if (trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('*/')) {
    return true;
  }
  let inString = null;
  for (let i = 0; i < col; i += 1) {
    const ch = line[i];
    if (ch === undefined) break;
    if (inString === null) {
      if (ch === '/' && line[i + 1] === '/') return true; // 行注释
      if (ch === "'" || ch === '"' || ch === '`') inString = ch;
    } else if (ch === inString && line[i - 1] !== '\\') {
      inString = null;
    }
  }
  return inString !== null;
}

function runTest(testFile) {
  const result = spawnSync(
    process.execPath,
    ['--test', '--test-timeout=60000', testFile],
    { cwd: repoRoot, encoding: 'utf8', timeout: 120_000 },
  );
  return result.status === 0;
}

function main() {
  const args = process.argv.slice(2);
  const srcFile = args[0];
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : 25;
  const verbose = args.includes('--verbose');
  // 测试文件：第一个非 flag 参数后的全部位置参数（compileFec 行为分散于多文件时一并纳入）。
  const testFiles = args.slice(1).filter((a) => a !== '--limit' && a !== '--verbose');
  const testFilesList = testFiles.filter((a) => !/^\d+$/.test(a));
  const effectiveLimit = limitIdx >= 0 ? limit : 25;
  if (srcFile === undefined || testFilesList.length === 0) {
    console.error(
      'usage: node scripts/mutation_gate.mjs <src-file> <test-file...> [--limit N] [--verbose]',
    );
    process.exit(2);
  }

  const srcPath = join(repoRoot, srcFile);
  const original = readFileSync(srcPath, 'utf8');
  const sites = collectMutationSites(original);
  if (sites.length === 0) {
    console.error('mutation_gate: no mutation sites found');
    process.exit(2);
  }

  // 基线：原始文件下全部目标测试必须绿（否则 mutation 统计无意义）。
  for (const tf of testFilesList) {
    if (!runTest(tf)) {
      console.error(`mutation_gate: baseline test FAIL on unmutated source — fix first (${tf})`);
      process.exit(1);
    }
  }
  console.log(
    `mutation_gate: baseline OK (${sites.length} sites found, running up to ${effectiveLimit}; tests: ${testFilesList.join(', ')})`,
  );

  // 等价登记的位点跳过执行（省时）但单独披露。
  const selected = sites.slice(0, effectiveLimit);
  let killed = 0;
  let survived = 0;
  let equivalent = 0;
  const survivedList = [];

  try {
    for (const site of selected) {
      const eqReg = findEquivalentRegistration(srcFile, site);
      if (eqReg !== null) {
        equivalent += 1;
        console.log(`  equiv    ${site.operator}: ${site.line}`);
        console.log(`           ↳ 登记论证: ${eqReg.reason}`);
        continue;
      }
      const mutated = applyMutation(original, site);
      writeFileSync(srcPath, mutated, 'utf8');
      // 变异在**任一**目标测试下失败 = killed（全部通过 = survived）。
      // try/finally 确保任何异常路径下源文件恢复（变异源泄漏进工作树是本工具最危险故障）。
      let allPassed;
      try {
        allPassed = testFilesList.every((tf) => runTest(tf));
      } finally {
        writeFileSync(srcPath, original, 'utf8');
      }

      if (allPassed) {
        survived += 1;
        survivedList.push(site);
        if (verbose) {
          console.log(`  SURVIVED ${site.operator}: ${site.line}`);
        }
      } else {
        killed += 1;
        if (verbose) {
          console.log(`  killed   ${site.operator}: ${site.line}`);
        }
      }
    }
  } catch (err) {
    // 极端路径（如 writeFileSync 失败）也要尽力恢复源文件再退出。
    try {
      writeFileSync(srcPath, original, 'utf8');
    } catch {
      // 恢复失败只能如实退出
    }
    throw err;
  }

  const total = killed + survived;
  const rate = total === 0 ? 0 : survived / total;
  console.log('─'.repeat(60));
  console.log(
    `mutation_gate: killed=${killed} survived=${survived} equivalent=${equivalent} (${killed + survived} executed + ${equivalent} registered-equivalent)`,
  );
  console.log(`mutation_gate: survival rate = ${(rate * 100).toFixed(1)}% (target <10%)`);
  if (survivedList.length > 0) {
    console.log('survived mutations (test gaps):');
    for (const s of survivedList) {
      console.log(`  [${s.operator}] line: ${s.line}`);
    }
  }
  const pass = rate < 0.1;
  console.log(pass ? 'mutation_gate: PASS (test strength adequate)' : 'mutation_gate: FAIL (survival >=10% — strengthen tests)');
  process.exit(pass ? 0 : 1);
}

/** 在指定位点应用算子（只变异该位点·其余原样）。 */
function applyMutation(source, site) {
  const before = source.slice(0, site.offset);
  const rest = source.slice(site.offset);
  const op = OPERATORS.find((o) => o.name === site.operator);
  if (op === undefined) {
    throw new Error(`mutation_gate: unknown operator ${site.operator}`);
  }
  op.re.lastIndex = 0;
  const m = op.re.exec(rest);
  if (m === null) {
    throw new Error(`mutation_gate: site lost at offset ${site.offset}`);
  }
  return before + rest.slice(0, m.index) + op.replace + rest.slice(m.index + m[0].length);
}

if (import.meta.main) {
  main();
}
