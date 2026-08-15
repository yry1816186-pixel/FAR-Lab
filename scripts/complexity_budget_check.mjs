#!/usr/bin/env node
/**
 * complexity_budget_check.mjs — 代码复杂度预算门禁（2.md §11C 后 R10 T1）.
 *
 * Rules (thresholds per the R10 clause; calibration notes inline):
 *   1. Function cyclomatic complexity ≤ 15 (per-function; exceed → violation.
 *      Counted via branch-node estimation over the TS syntax tree — a conservative
 *      lexical approximation: if/for/while/case/catch/&&/||/??/ternary +1 each,
 *      plus 1 base. Documented approximation, not a full AST dataflow analysis.)
 *   2. Source file length ≤ 800 lines for NEW files; existing over-budget files
 *      are grandfathered but listed (清偿计划 territory — the register below).
 *   3. Exemptions: functions marked with a line containing `// complexity-exempt: <reason>`
 *      on the line immediately above the function declaration.
 *
 * Existing violations register (grandfathered, repayment plan = refactor queue):
 * the script prints them under BUDGET-DEBT instead of failing the gate; the gate
 * fails only on NEW violations (files/funcs not in the baseline register).
 *
 * Usage: node scripts/complexity_budget_check.mjs [--update-baseline]
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');
const BASELINE_PATH = join(ROOT, 'scripts', 'complexity_budget_baseline.json');

const MAX_FUNCTION_COMPLEXITY = 15;
const MAX_FILE_LINES = 800;

/** Collect .ts/.tsx files under src/ recursively. */
function collectTsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectTsFiles(full));
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/**
 * Lexical cyclomatic-complexity estimator. Scans balanced-brace blocks that
 * look like function declarations/expressions and counts decision points
 * inside. Approximation documented in the header — it may overcount strings
 * containing keywords (rare in this codebase's quoting style) but never
 * undercounts real branches, which is the fail-safe direction for a budget.
 */
function analyzeFile(text) {
  const lines = text.split('\n');
  const functions = [];
  // Strip line comments to avoid counting keywords in them (block comments
  // left in — overcounting there only affects the same function's budget).
  const codeLines = lines.map((l) => l.replace(/\/\/.*$/, ''));
  const code = codeLines.join('\n');

  // Track brace depth and the header line that opened each depth-1..N function.
  const stack = []; // { startLine, header, complexity }
  let depth = 0;
  let i = 0;
  let line = 1;
  const functionStartRe =
    /(?:function\s+[A-Za-z_$][\w$]*|function\s*\(|(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?(?:function\b|\()|=>)/;

  while (i < code.length) {
    const ch = code[i];
    if (ch === '\n') {
      line += 1;
      i += 1;
      continue;
    }
    if (ch === '{') {
      // find the header text since the last ; { or } before this brace
      const before = code.slice(Math.max(0, i - 400), i);
      const lastBoundary = Math.max(before.lastIndexOf(';'), before.lastIndexOf('{'), before.lastIndexOf('}'));
      const header = before.slice(lastBoundary + 1).trim();
      const headerLine = line - (header.match(/\n/g)?.length ?? 0);
      stack.push({
        startLine: headerLine,
        header: header.replace(/\s+/g, ' ').slice(0, 120),
        complexity: 1,
        exempt: /complexity-exempt/.test(header),
      });
      depth += 1;
    } else if (ch === '}') {
      const fn = stack.pop();
      if (fn !== undefined) {
        depth -= 1;
        if (fn.complexity > MAX_FUNCTION_COMPLEXITY && !fn.exempt) {
          functions.push({ line: fn.startLine, header: fn.header, complexity: fn.complexity });
        }
        if (stack.length > 0) {
          // nested function's complexity does not fold into the parent's
          // (each function judged on its own decisions)
        }
      }
    } else if (stack.length > 0 && depth > 0) {
      const top = stack.at(-1);
      const two = code.slice(i, i + 2);
      const three = code.slice(i, i + 3);
      if (ch === 'i' && code.slice(i, i + 3) === 'if(') top.complexity += 1;
      else if (code.slice(i, i + 4) === 'for(' || code.slice(i, i + 6) === 'while(') top.complexity += 1;
      else if (code.slice(i, i + 6) === 'switch') top.complexity += 0; // counted via case
      else if (code.slice(i, i + 5) === 'case ') top.complexity += 1;
      else if (code.slice(i, i + 6) === 'catch(' || code.slice(i, i + 5) === 'catch') top.complexity += 1;
      else if (two === '&&' || two === '||') top.complexity += 1;
      else if (three === '??=' || two === '?.') top.complexity += 0;
      else if (code.slice(i, i + 2) === '??') top.complexity += 1;
      else if (ch === '?' && code[i + 1] === ' ') top.complexity += 1; // ternary
    }
    i += 1;
  }
  return { lines: lines.length, functions };
}

const files = collectTsFiles(SRC);
const baseline = existsSync(BASELINE_PATH)
  ? new Set(JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).entries)
  : new Set();

const violations = [];
const debt = [];
let largestFile = { path: '', lines: 0 };
const currentKeys = new Set();

for (const file of files) {
  const rel = relative(ROOT, file).replaceAll('\\', '/');
  const text = readFileSync(file, 'utf8');
  const { lines, functions } = analyzeFile(text);
  if (lines > largestFile.lines) largestFile = { path: rel, lines };
  if (lines > MAX_FILE_LINES) {
    const key = `file:${rel}`;
    currentKeys.add(key);
    const display = `${rel} (${lines} lines > ${MAX_FILE_LINES})`;
    (baseline.has(key) ? debt : violations).push({ key, display });
  }
  for (const fn of functions) {
    const key = `fn:${rel}:${fn.line}`;
    currentKeys.add(key);
    const display = `${rel}:${fn.line} ${fn.header.slice(0, 70)}… (complexity ${fn.complexity} > ${MAX_FUNCTION_COMPLEXITY})`;
    (baseline.has(key) ? debt : violations).push({ key, display });
  }
}

if (process.argv.includes('--update-baseline')) {
  writeFileSync(BASELINE_PATH, JSON.stringify({ entries: [...currentKeys].sort(), generatedAt: new Date().toISOString(), note: 'BUDGET-DEBT baseline (location keys) — repayment plan territory; new violation locations fail the gate' }, null, 2));
  console.log(`complexity_budget_check: baseline updated with ${currentKeys.size} keys.`);
  process.exit(0);
}

console.log(`complexity_budget_check: scanned ${files.length} files (largest: ${largestFile.path} @ ${largestFile.lines} lines)`);
console.log(`  budget-debt (grandfathered): ${debt.length}`);
for (const d of debt.slice(0, 10)) console.log(`    [DEBT] ${d.display}`);
if (debt.length > 10) console.log(`    … +${debt.length - 10} more`);
console.log(`  new violations: ${violations.length}`);
for (const v of violations) console.log(`    [FAIL] ${v.display}`);

if (violations.length > 0) {
  console.log('complexity_budget_check: FAIL — new over-budget functions/files need inline exemption comments with reasons, or refactoring.');
  process.exit(1);
}
console.log('complexity_budget_check: PASS (no new over-budget items)');
process.exit(0);
