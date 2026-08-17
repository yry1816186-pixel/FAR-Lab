#!/usr/bin/env node
// scripts/diff_self_check.mjs —— ENG-DIFF-001：Diff 级自查门。
//
// 与 zero_tolerance_scan（全树静态）互补：本门只看「这次改动引入了什么」——
// 宪法 G1 节失败信号的 diff 面：
//   ESCAPE          新增行注入逃逸（: any / @ts-ignore / @ts-nocheck / as unknown as / 空 catch）
//   TEST_REMOVAL    删除测试或新增 skip/todo 而无理由注释（相邻行含理由标记）
//   ASSERT_WEAKEN   断言削弱（equal/deepEqual/strictEqual 行被改为弱断言）
//   THRESHOLD_DRIFT 科学阈值数值变更无依据注释（src/ 内 threshold/limit/budget 类键）
//   MODE_LABEL      模式标识/错误语义行被改动（LIVE/RECORDED_REPLAY/runMode/错误枚举）——
//                   语义漂移高危面，必须显式豁免
//   SCHEMA_DRIFT    public schema 类型文件被改而 diff 中无 schema.json 再生或 migration
//                   （粗信号——精确再生校验由 generate_json_schema --check 既有门承担）
//   TEST_GAP        src/ 生产码变更而 diff 无任何测试文件变更（warn 级）
//   TODO_INSTEAD    新增 TODO/FIXME 替代修复（src/ 内，warn 级）
//
// 退出码：0 干净（或仅 warn 且未 --strict）/ 7 违规 / 2 用法错误。
// 用法：
//   node scripts/diff_self_check.mjs --diff-file <unified.diff> [--strict]
//   node scripts/diff_self_check.mjs --git 'origin/main...HEAD'   （内部 git diff）
// 豁免：行内或紧邻上下文含 JUSTIFICATION 标记（理由/rationale/REASON:/because/依据）。

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const JUSTIFICATION_RE = /(理由|rationale|REASON\s*:|because|依据|justification|iii-exempt)/i;

const ESCAPE_PATTERNS = [
  { id: 'ESCAPE', re: /:\s*any\b/, msg: ': any 注入' },
  { id: 'ESCAPE', re: /@ts-ignore/, msg: '@ts-ignore 注入' },
  { id: 'ESCAPE', re: /@ts-nocheck/, msg: '@ts-nocheck 注入' },
  { id: 'ESCAPE', re: /as\s+unknown\s+as/, msg: 'as unknown as 双重断言注入' },
  { id: 'ESCAPE', re: /catch\s*(\(\s*\w*\s*\))?\s*\{\s*\}/, msg: '空 catch 注入' },
];

const STRONG_ASSERT_RE = /assert\.(equal|deepEqual|strictEqual|deepStrictEqual)\s*\(/;
const WEAK_ASSERT_RE = /assert\.ok\([^)]*!==?\s*undefined\)|toBeDefined\(\)|toBeTruthy\(\)|assert\.defined\(/;

const THRESHOLD_KEY_RE = /(threshold|阈值|limit|budget|max_|min_)/i;
const THRESHOLD_NUM_RE = /:\s*(-?\d+(?:\.\d+)?)\s*[,})]|=\s*(-?\d+(?:\.\d+)?)\s*[,;)\n]/;

const MODE_LABEL_RE = /'LIVE'|'RECORDED_REPLAY'|runMode|ExecutionMode|executionMode/;

const PUBLIC_SCHEMA_RE = /^src\/(fec|schema|far_proof|proof_envelope|canonical)\/.*\.ts$|^schema\//;
const SCHEMA_ARTIFACT_RE = /\.schema\.json|^schema\/migrations\//;

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const diffFileIdx = args.indexOf('--diff-file');
const gitIdx = args.indexOf('--git');

let diffText = '';
if (diffFileIdx !== -1) {
  const path = args[diffFileIdx + 1];
  if (path === undefined) usage('--diff-file needs a path');
  diffText = readFileSync(path, 'utf8');
} else if (gitIdx !== -1) {
  const range = args[gitIdx + 1];
  if (range === undefined) usage('--git needs a range');
  diffText = execFileSync('git', ['diff', '--unified=3', range], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
} else {
  usage('provide --diff-file <path> or --git <range>');
}

function usage(msg) {
  process.stderr.write(`diff_self_check: ${msg}\n用法: node scripts/diff_self_check.mjs --diff-file <unified.diff> | --git 'origin/main...HEAD' [--strict]\n`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// 解析 unified diff → 逐文件的新增/删除行（含 hunk 上下文）
// ---------------------------------------------------------------------------

function parseDiff(text) {
  const files = [];
  let current = null;
  let oldLine = 0;
  let newLine = 0;
  for (const raw of text.split('\n')) {
    if (raw.startsWith('+++ b/')) {
      current = { path: raw.slice(6), added: [], removed: [], context: [] };
      files.push(current);
      continue;
    }
    if (current === null) continue;
    if (raw.startsWith('@@')) {
      const m = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
      if (m !== null) {
        oldLine = Number(m[1]);
        newLine = Number(m[1]);
      }
      continue;
    }
    if (raw.startsWith('+')) {
      current.added.push({ line: newLine, text: raw.slice(1) });
      newLine += 1;
    } else if (raw.startsWith('-')) {
      current.removed.push({ line: oldLine, text: raw.slice(1) });
      oldLine += 1;
    } else if (raw.startsWith(' ')) {
      current.context.push({ line: newLine, text: raw.slice(1) });
      oldLine += 1;
      newLine += 1;
    }
  }
  return files;
}

const files = parseDiff(diffText);
const findings = [];
const warn = (rule, path, line, msg) => findings.push({ severity: 'warn', rule, path, line, msg });
const fail = (rule, path, line, msg) => findings.push({ severity: 'fail', rule, path, line, msg });

function hasJustificationNear(file, entry) {
  const near = [...file.context, ...file.added, ...file.removed]
    .filter((e) => Math.abs(e.line - entry.line) <= 3)
    .map((e) => e.text);
  return near.some((t) => JUSTIFICATION_RE.test(t));
}

const srcChanged = [];
const testChanged = [];

for (const file of files) {
  const isTest = /(^|\/)(tests?\/|_test\.|\.test\.|\.spec\.)/.test(file.path) || /\.test\.tsx?$/.test(file.path);
  if (file.path.startsWith('src/')) srcChanged.push(file.path);
  if (isTest) testChanged.push(file.path);

  // --- ① 逃逸注入（新增行；扫描器 skippedFiles 精神——本门只看 diff，全树债务归全树门）---
  for (const a of file.added) {
    for (const p of ESCAPE_PATTERNS) {
      if (p.re.test(a.text) && !JUSTIFICATION_RE.test(a.text)) {
        fail('ESCAPE', file.path, a.line, `${p.msg}: ${a.text.trim().slice(0, 80)}`);
      }
    }
  }

  // --- ② 测试删除/skip 无理由 ---
  if (isTest) {
    for (const r of file.removed) {
      if (/^\s*(test|it)\s*\(/.test(r.text) && !hasJustificationNear(file, r)) {
        fail('TEST_REMOVAL', file.path, r.line, `删除测试用例而无理由注释: ${r.text.trim().slice(0, 80)}`);
      }
    }
    for (const a of file.added) {
      if (/\.(skip|todo)\s*\(/.test(a.text) && !hasJustificationNear(file, a)) {
        fail('TEST_REMOVAL', file.path, a.line, `新增 skip/todo 而无理由注释: ${a.text.trim().slice(0, 80)}`);
      }
    }

    // --- ③ 断言削弱：强断言行被删、同 hunk 出现弱断言新增 ---
    const strongRemoved = file.removed.some((r) => STRONG_ASSERT_RE.test(r.text));
    const weakAdded = file.added.some((a) => WEAK_ASSERT_RE.test(a.text));
    if (strongRemoved && weakAdded) {
      fail('ASSERT_WEAKEN', file.path, 0, '强断言（equal/deepEqual/strictEqual）删除且新增弱断言（toBeDefined/ok(x!==undefined)）——疑似削弱');
    }
  }

  // --- ④ 科学阈值漂移（src/ 内数值键变更无依据注释）---
  if (file.path.startsWith('src/')) {
    const removedByKey = new Map(file.removed.map((r) => [r.text.trim(), r]));
    for (const a of file.added) {
      if (THRESHOLD_KEY_RE.test(a.text) && THRESHOLD_NUM_RE.test(a.text)) {
        const counterpart = [...removedByKey.keys()].find((k) => k.replace(/-?\d+(\.\d+)?/, '#') === a.text.trim().replace(/-?\d+(\.\d+)?/, '#'));
        if (counterpart !== undefined && !hasJustificationNear(file, a)) {
          fail('THRESHOLD_DRIFT', file.path, a.line, `科学阈值数值变更无依据注释: ${a.text.trim().slice(0, 80)}`);
        }
      }
    }

    // --- ⑤ 模式标识/错误语义改动（高危面——必须显式豁免）---
    for (const r of file.removed) {
      if (MODE_LABEL_RE.test(r.text) && !hasJustificationNear(file, r)) {
        fail('MODE_LABEL', file.path, r.line, `模式标识/执行模式行改动（语义漂移高危）: ${r.text.trim().slice(0, 80)}`);
      }
    }

    // --- ⑧ TODO 替代修复 ---
    for (const a of file.added) {
      if (/\b(TODO|FIXME)\b/.test(a.text) && !JUSTIFICATION_RE.test(a.text)) {
        warn('TODO_INSTEAD', file.path, a.line, `新增 TODO/FIXME: ${a.text.trim().slice(0, 80)}`);
      }
    }
  }
}

// --- ⑥ public schema 粗信号：类型文件变更而 diff 无 schema 产物/迁移 ---
const schemaTypeChanged = files.some((f) => PUBLIC_SCHEMA_RE.test(f.path) && (f.added.length > 0 || f.removed.length > 0));
const schemaArtifactInDiff = files.some((f) => SCHEMA_ARTIFACT_RE.test(f.path));
if (schemaTypeChanged && !schemaArtifactInDiff) {
  findings.push({
    severity: 'fail', rule: 'SCHEMA_DRIFT', path: '(diff)', line: 0,
    msg: 'public schema 类型文件被改而 diff 无 *.schema.json 再生或 schema/migrations 变更（精确校验由 generate_json_schema --check 承担）',
  });
}

// --- ⑦ 生产码变更无测试（warn）---
if (srcChanged.length > 0 && testChanged.length === 0) {
  warn('TEST_GAP', '(diff)', 0, `src/ 变更 ${srcChanged.length} 文件而 diff 无测试文件变更——确认无行为影响或补测试`);
}

// ---------------------------------------------------------------------------
// 输出
// ---------------------------------------------------------------------------

const fails = findings.filter((f) => f.severity === 'fail');
const warns = findings.filter((f) => f.severity === 'warn');

if (findings.length > 0) {
  process.stdout.write(`diff_self_check: ${fails.length} fail / ${warns.length} warn\n`);
  for (const f of fails) process.stdout.write(`  [FAIL ${f.rule}] ${f.path}:${f.line} ${f.msg}\n`);
  for (const w of warns) process.stdout.write(`  [warn ${w.rule}] ${w.path}:${w.line} ${w.msg}\n`);
} else {
  process.stdout.write('diff_self_check: PASS — 本次 diff 无逃逸/语义漂移信号\n');
}

if (fails.length > 0) process.exit(7);
if (strict && warns.length > 0) process.exit(7);
process.exit(0);
