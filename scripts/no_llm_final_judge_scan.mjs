// scripts/no_llm_final_judge_scan.mjs
// ci-04 no_llm_final_judge_scan: 确认最终裁决由确定性代码产出，无 LLM-as-judge（反 theater F1）。
//
// 权威 SSOT: FINAL_PACKAGE/23_CI_AND_VALIDATION.md §6.6.2（ci-04 · deterministic 标记点）
//          + 11_FALSIFICATION_ENGINE.md §7.2（migration 0020 verdict_protocols）+ 02 F3
//          + AT-04 审计裁决（2026-06-29，severity=minor）。
//
// 诚实边界（AT-04 · 反默认满足）:
//   spec §6.6.2 要求最终裁决（final judge）由确定性代码产出，禁止 LLM-as-judge。
//   通过检查 deterministic 标记字面量落地证明裁决路径非 LLM。当前 W1/V1 落地 4 个标记字面量
//   （compiledBy/compiled_by + sealedBy/sealed_by），缺 2（computed_by / deterministic_arbiter）
//   属 spec 0020 verdict_protocols = V2 范畴（11 §7.2，未在 W1 实现）。
//   本扫描器诚实报告 LANDED vs V2_PENDING，绝不默认声称 ci-04 5 标记点全部满足（spec §6.6.2）。
//
// 退出码语义:
//   - exit 0: V2_PENDING 不阻断 W1（诚实标注而非硬门；V2 schema 不属 W1 交付范围）。
//   - exit 1: （a）src 中出现 LLM-as-judge 模式（反 theater F1 硬门，零容忍）；
//             （b）某个 LANDED 标记字面量意外消失（regression，W1 已落地的不应回退）。
//
// 用法: node scripts/no_llm_final_judge_scan.mjs

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

function walk(p) {
  const s = statSync(p);
  if (s.isDirectory()) {
    if (p.endsWith('__pycache__')) return [];
    return readdirSync(p).flatMap((e) => walk(join(p, e)));
  }
  if (p.endsWith('.pyc')) return [];
  return [p];
}

// stripLineComment —— 剥离行注释，避免文档性注释（如「禁 LLM-as-judge」）触发 negative 误报。
function stripLineComment(filePath, rawLine) {
  const ext = extname(filePath).toLowerCase();
  const trimmed = rawLine.trimStart();
  if (trimmed === '' || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('*/')) {
    return '';
  }
  if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.mjs') {
    const idx = rawLine.indexOf('//');
    return idx >= 0 ? rawLine.slice(0, idx) : rawLine;
  }
  return rawLine;
}

// ── negative check（反 theater 硬门）: 禁 LLM-as-judge 模式 ──
// negativeRoots 默认 src（生产）；CI04_NEGATIVE_ROOTS env 供元测试用 mkdtemp 隔离，
// 避免与 zero_tolerance_scan.test.ts 并发注入/删除 src/ 临时文件造成 walk↔readFile 竞态。
const llmJudgePatterns = [
  { name: 'llm_as_judge', pattern: /llm[\s_-]?as[\s_-]?judge/i },
  { name: 'llm_judge', pattern: /\bllm[\s_-]?judge\b/i },
];

const negativeRootsRaw = process.env.CI04_NEGATIVE_ROOTS;
const negativeRoots = negativeRootsRaw
  ? negativeRootsRaw.split(',').map((s) => s.trim()).filter(Boolean)
  : ['src'];

const negativeFindings = [];
for (const root of negativeRoots) {
  for (const filePath of walk(root)) {
    const text = readFileSync(filePath, 'utf8');
    const lines = text.split(/\r?\n/);
    for (const [index, rawLine] of lines.entries()) {
      const line = stripLineComment(filePath, rawLine);
      for (const check of llmJudgePatterns) {
        if (check.pattern.test(line)) {
          negativeFindings.push(`${filePath}:${index + 1}: ${check.name}: ${rawLine.trim()}`);
        }
      }
    }
  }
}

if (negativeFindings.length > 0) {
  console.error(
    'ci-04 FAIL: LLM-as-judge pattern in src (anti-theater F1 zero-tolerance):\n' +
      negativeFindings.join('\n'),
  );
  process.exit(1);
}

// ── positive check（deterministic 标记点诚实报告）──
// expect: 'LANDED'（W1/V1 应落地，消失则 regression exit 1）| 'V2_PENDING'（spec 0020 V2，缺失为预期，诚实标注）
const MARKERS = [
  { id: 'compiled_by_ts', needle: 'deterministic_compiler', roots: ['src'], expect: 'LANDED', note: 'contracts.ts compiledBy (F3)' },
  { id: 'compiled_by_db', needle: 'compiled_by', roots: ['schema'], expect: 'LANDED', note: '0005 DDL CHECK (F3 DB 守卫)' },
  { id: 'sealed_by_ts', needle: 'deterministic_sealer', roots: ['src'], expect: 'LANDED', note: 'sealer.ts/auditor.ts sealedBy (F3)' },
  { id: 'sealed_by_db', needle: 'sealed_by', roots: ['schema'], expect: 'LANDED', note: '0004/0006 DDL CHECK (F3 DB 守卫)' },
  { id: 'created_by_v2', needle: 'deterministic_arbiter', roots: ['src'], expect: 'V2_PENDING', note: 'VerdictNode.createdBy (spec 0020, 11 §7.2)' },
  { id: 'computed_by_v2', needle: 'computed_by', roots: ['schema'], expect: 'V2_PENDING', note: 'verdict_protocols.computed_by (spec 0020, 11 §7.2)' },
];

function countHits(needle, roots) {
  let count = 0;
  const files = [];
  for (const root of roots) {
    for (const filePath of walk(root)) {
      const text = readFileSync(filePath, 'utf8');
      if (text.includes(needle)) {
        count += 1;
        files.push(filePath);
      }
    }
  }
  return { count, files };
}

console.log('═══════════════════════════════════════════');
console.log('  ci-04 no_llm_final_judge_scan');
console.log('  权威: 23 §6.6.2 + 11 §7.2 + 02 F3 + AT-04');
console.log('═══════════════════════════════════════════');
console.log('');
console.log('── LLM-as-judge negative check (anti-theater F1 硬门) ──');
console.log('  ✓ no LLM-as-judge patterns in src');
console.log('');
console.log('── deterministic marker coverage ──');

const report = { landed: 0, v2Pending: 0, regression: [] };
for (const marker of MARKERS) {
  const { count, files } = countHits(marker.needle, marker.roots);
  if (marker.expect === 'LANDED') {
    if (count > 0) {
      report.landed += 1;
      console.log(`  ✓ LANDED    ${marker.id.padEnd(16)} '${marker.needle}' (${marker.roots.join('/')}) — ${marker.note}`);
    } else {
      report.regression.push(marker.id);
      console.log(`  ✗ REGRESSION ${marker.id.padEnd(16)} '${marker.needle}' 应落地但未命中 — ${marker.note}`);
    }
  } else {
    // V2_PENDING: 缺失为预期（诚实标注），意外落地则提示更新扫描器
    if (count === 0) {
      report.v2Pending += 1;
      console.log(`  ○ V2-PENDING ${marker.id.padEnd(16)} '${marker.needle}' 未落地（预期）— ${marker.note}`);
    } else {
      report.landed += 1;
      console.log(`  ✓ LANDED(新) ${marker.id.padEnd(16)} '${marker.needle}' 已落地（V2 提前实现？更新扫描器 expect）— ${marker.note}`);
    }
  }
}

console.log('');
console.log('── summary ──');
console.log(`  LANDED:     ${report.landed} marker literal(s) (W1/V1 裁决路径 deterministic)`);
console.log(`  V2-PENDING: ${report.v2Pending} (spec 0020 verdict_protocols = V2, 诚实标注非默认满足)`);
console.log(`  REGRESSION: ${report.regression.length}`);

if (report.regression.length > 0) {
  console.error(
    `\nci-04 FAIL: LANDED marker(s) regressed (W1 已落地不应消失): ${report.regression.join(', ')}`,
  );
  process.exit(1);
}

console.log('');
console.log('── 红线覆盖边界（ci-04 范围声明 · 23 §6.6 / §6.6.5）──');
console.log('  ci-04 = F3 跨层 deterministic 标记 grep（compiledBy/sealedBy/createdBy/computed_by）。');
console.log('  F6 因果降级 / F12 UqGrade⊥Verdict = 运行时逻辑单测（23 §6.6.5 D2-06/D2-08），');
console.log('  非 deterministic 标记 grep，不在 ci-04 扫描范围。');
console.log('  W1 状态：F6/F12 字段（confoundingGateStatus / uq_grade / hashConsistencyRate）');
console.log('  未落地（21 roadmap V1 设计层·无 W1 milestone·23 §6.6 自述「CI 断言待实现」），');
console.log('  属 V2 scope。本扫描不假装覆盖 F6/F12（诚实边界·反默认满足）。');
console.log('');
console.log('ci-04: ok (V2-pending 诚实标注，不阻断 W1；LLM-as-judge 零命中)');
