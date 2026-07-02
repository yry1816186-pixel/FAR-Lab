// scripts/confounding_gate_deterministic_scan.mjs
// ci-cg confounding_gate_deterministic_scan: 确认因果混杂门模块（src/confounding_gate）由确定性图算法产出，
// 无 LLM 调用（F6 红线 + 03 §7.5.1:1133 CI 验证门 CG-1/CG-2/CG-5/CG-6·镜像 anti_theater_deterministic_scan.mjs）。
//
// 权威 SSOT: PROJECT_PLAN/03_EVIDENCE_CONTRACT_AND_VERDICT.md §7.5.1:1133（CG-1/2/5/6 四门）+ §7.5:980（F6 红线）。
//
// 设计（镜像 anti_theater_deterministic_scan.mjs）:
//   - negative check（F6 硬门·零容忍）: walk src/confounding_gate，stripLineComment 后
//     命中 [CG-1] LLM-client-usage 模式（openai import / new OpenAI / chat.completions / dashscope）或
//     [CG-5] 禁止标识符（generateConfounders / askLLM）→ exit 1。
//     stripLineComment 剥离注释，避免 rationale/头注释里的「非 LLM 推理」诚实声明触发误报。
//   - positive check（regression 守卫）: [CG-2] dag.ts 须含 'assertAcyclic'（acyclic fail-closed·环→throw）；
//     [CG-6] rationale.ts 须含 'generateRationale'（纯模板）；adjudicate.ts 须含 'adjudicateConfounding'（编排器）。
//     LANDED 标记意外消失 → exit 1（W12 已落地不应回退）。
//
// 退出码语义:
//   - exit 0: src/confounding_gate 无 LLM 调用 + CG-2/CG-6 标记在位（F6 deterministic kernel）。
//   - exit 1: （a）src/confounding_gate 出现 LLM-client-usage / 禁止标识符（F6 硬门·零容忍）；
//             （b）CG-2/CG-6 标记意外消失（regression）。
//
// 与 ci-at anti_theater_deterministic_scan 的边界:
//   ci-at 聚焦 src/anti_theater（反剧场检测 F3）；本扫描聚焦 src/confounding_gate（F6 因果混杂门）。
//   两者互补·不重叠（APPENDIX_E:1171 明确 anti-theater 不重复混杂检测·defer to §7.5.1）。
//
// 用法: node scripts/confounding_gate_deterministic_scan.mjs

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

// stripLineComment —— 剥离行注释，避免文档性注释（如「非 LLM 推理」诚实声明）触发 negative 误报。
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

// ── negative check（F6 硬门）: [CG-1] 禁 LLM-client-usage + [CG-5] 禁 generateConfounders/askLLM ──
// CI_CG_NEGATIVE_ROOTS env 供元测试用 mkdtemp 隔离，避免注入/删除 src/confounding_gate 临时文件竞态。
const forbiddenPatterns = [
  // CG-1: LLM-client-usage（与 ci-at anti_theater 同一组 pattern·03 §7.5.1:1133 CG-1）。
  { name: 'openai_import', pattern: /import\s.*openai/i, gate: 'CG-1' },
  { name: 'openai_client', pattern: /\bnew\s+OpenAI\b/, gate: 'CG-1' },
  { name: 'chat_completions', pattern: /chat\.completions/i, gate: 'CG-1' },
  { name: 'dashscope', pattern: /dashscope/i, gate: 'CG-1' },
  // CG-5: 禁 generateConfounders / askLLM（03 §7.5.1:1133 CG-5·fail-closed）。
  { name: 'generate_confounders', pattern: /\bgenerateConfounders\b/, gate: 'CG-5' },
  { name: 'ask_llm', pattern: /\baskLLM\b/, gate: 'CG-5' },
];

const negativeRootsRaw = process.env.CI_CG_NEGATIVE_ROOTS;
const negativeRoots = negativeRootsRaw
  ? negativeRootsRaw.split(',').map((s) => s.trim()).filter(Boolean)
  : ['src/confounding_gate'];

const negativeFindings = [];
for (const root of negativeRoots) {
  for (const filePath of walk(root)) {
    const text = readFileSync(filePath, 'utf8');
    const lines = text.split(/\r?\n/);
    for (const [index, rawLine] of lines.entries()) {
      const line = stripLineComment(filePath, rawLine);
      for (const check of forbiddenPatterns) {
        if (check.pattern.test(line)) {
          negativeFindings.push(`${filePath}:${index + 1}: ${check.gate}/${check.name}: ${rawLine.trim()}`);
        }
      }
    }
  }
}

if (negativeFindings.length > 0) {
  console.error(
    'ci-cg FAIL: forbidden pattern in src/confounding_gate (F6 zero-tolerance·CG-1/CG-5):\n' +
      negativeFindings.join('\n'),
  );
  process.exit(1);
}

// ── positive check（CG-2 acyclic + CG-6 rationale template + 编排器 regression 守卫）──
// expect: LANDED（W12 已落地，消失则 regression exit 1）。
const MARKERS = [
  { id: 'cg2_acyclic_check', needle: 'assertAcyclic', file: 'src/confounding_gate/dag.ts', note: 'CG-2 acyclic fail-closed（topologicalSort 检环·环→throw·03 §7.5.1:1133）' },
  { id: 'cg6_rationale_template', needle: 'generateRationale', file: 'src/confounding_gate/rationale.ts', note: 'CG-6 generateRationale 纯模板函数（无 LLM·03 §7.5.1:1133）' },
  { id: 'cg_orchestrator', needle: 'adjudicateConfounding', file: 'src/confounding_gate/adjudicate.ts', note: 'adjudicateConfounding 编排器（§7.5.1 (3) 三值 outcome 入口）' },
];

function readFileText(filePath) {
  return readFileSync(filePath, 'utf8');
}

console.log('═══════════════════════════════════════════');
console.log('  ci-cg confounding_gate_deterministic_scan');
console.log('  权威: 03 §7.5.1:1133 (CG-1/2/5/6) + §7.5:980 (F6 红线)');
console.log('═══════════════════════════════════════════');
console.log('');
console.log('── forbidden-pattern negative check (F6 硬门·CG-1 LLM-client-usage + CG-5 标识符) ──');
console.log('  ✓ no forbidden patterns in src/confounding_gate');
console.log('');
console.log('── deterministic marker coverage (CG-2/CG-6) ──');

const report = { landed: 0, regression: [] };
for (const marker of MARKERS) {
  let count = 0;
  try {
    count = readFileText(marker.file).includes(marker.needle) ? 1 : 0;
  } catch (_err) {
    count = 0; // 文件缺失 = regression
  }
  if (count > 0) {
    report.landed += 1;
    console.log(`  ✓ LANDED    ${marker.id.padEnd(24)} '${marker.needle}' (${marker.file}) — ${marker.note}`);
  } else {
    report.regression.push(marker.id);
    console.log(`  ✗ REGRESSION ${marker.id.padEnd(24)} '${marker.needle}' 应落地但未命中 — ${marker.note}`);
  }
}

console.log('');
console.log('── summary ──');
console.log(`  LANDED:     ${report.landed} marker(s) (W12 confounding_gate F6 deterministic)`);
console.log(`  REGRESSION: ${report.regression.length}`);

if (report.regression.length > 0) {
  console.error(
    `\nci-cg FAIL: LANDED marker(s) regressed (W12 已落地不应消失): ${report.regression.join(', ')}`,
  );
  process.exit(1);
}

console.log('');
console.log('── 边界声明（ci-cg 范围 · 03 §7.5.1:1133）──');
console.log('  ci-cg = src/confounding_gate F6 deterministic grep（禁 LLM 调用/禁标识符 + CG-2/6 标记在位）。');
console.log('  d-separation/backdoor/adjudicate 的运行时正确性 = tests/confounding_gate/*.test.ts 单测，');
console.log('  非 deterministic 标记 grep，不在本扫描范围（单测已注册 pnpm test）。');
console.log('');
console.log('ci-cg: ok (confounding_gate F6 deterministic·forbidden-pattern 零命中)');
