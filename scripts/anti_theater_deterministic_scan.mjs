// scripts/anti_theater_deterministic_scan.mjs
// ci-at anti_theater_deterministic_scan: 确认反剧场检测模块（src/anti_theater）由确定性代码产出，
// 无 LLM 调用（反 theater F3 + APPENDIX_E §6 grep 门控·镜像 no_llm_final_judge_scan.mjs）。
//
// 权威 SSOT: （7 CI 门控·2 grep gate 之一）
//            APPENDIX_E §1（runAntiTheaterLint computedBy="deterministic_compiler"）+ 02 F3。
//
// 设计（镜像 no_llm_final_judge_scan.mjs）:
//   - negative check（反 theater F3 硬门·零容忍）: walk src/anti_theater，stripLineComment 后
//     命中 LLM-client-usage 模式（openai import / new OpenAI / chat.completions / dashscope）→ exit 1。
//     stripLineComment 剥离注释，避免文档性「无 openai 字面量」合规声明触发误报。
//   - positive check（regression 守卫）: lint.ts 须含 'deterministic' + 'runAntiTheaterLint'
//     （F3 自声明 + 编排器存在）。LANDED 标记意外消失 → exit 1（W3 已落地不应回退）。
//
// 退出码语义:
//   - exit 0: src/anti_theater 无 LLM 调用 + deterministic 标记在位（F3 deterministic kernel）。
//   - exit 1: （a）src/anti_theater 出现 LLM-client-usage 模式（反 theater F3 硬门·零容忍）；
//             （b）lint.ts 的 deterministic 标记 / runAntiTheaterLint 编排器意外消失（regression）。
//
// 与 ci-04 no_llm_final_judge_scan 的边界:
//   ci-04 全局扫 src 禁 LLM-as-judge（最终裁决路径）；本扫描聚焦 src/anti_theater 禁 LLM 调用
//   （反剧场检测本身必须确定性·APPENDIX_E §6 第 2 grep gate）。两者互补·不重叠。
//
// 用法: node scripts/anti_theater_deterministic_scan.mjs

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

// stripLineComment —— 剥离行注释，避免文档性注释（如「无 openai 字面量」）触发 negative 误报。
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

// ── negative check（反 theater F3 硬门）: 禁 LLM-client-usage 模式 ──
// CI_AT_NEGATIVE_ROOTS env 供元测试用 mkdtemp 隔离，避免注入/删除 src/anti_theater 临时文件竞态。
const llmCallPatterns = [
  { name: 'openai_import', pattern: /import\s.*openai/i },
  { name: 'openai_client', pattern: /\bnew\s+OpenAI\b/ },
  { name: 'chat_completions', pattern: /chat\.completions/i },
  { name: 'dashscope', pattern: /dashscope/i },
];

const negativeRootsRaw = process.env.CI_AT_NEGATIVE_ROOTS;
const negativeRoots = negativeRootsRaw
  ? negativeRootsRaw.split(',').map((s) => s.trim()).filter(Boolean)
  : ['src/anti_theater'];

const negativeFindings = [];
for (const root of negativeRoots) {
  for (const filePath of walk(root)) {
    const text = readFileSync(filePath, 'utf8');
    const lines = text.split(/\r?\n/);
    for (const [index, rawLine] of lines.entries()) {
      const line = stripLineComment(filePath, rawLine);
      for (const check of llmCallPatterns) {
        if (check.pattern.test(line)) {
          negativeFindings.push(`${filePath}:${index + 1}: ${check.name}: ${rawLine.trim()}`);
        }
      }
    }
  }
}

if (negativeFindings.length > 0) {
  console.error(
    'ci-at FAIL: LLM-client-usage pattern in src/anti_theater (anti-theater F3 zero-tolerance):\n' +
      negativeFindings.join('\n'),
  );
  process.exit(1);
}

// ── positive check（deterministic 标记 + 编排器 regression 守卫）──
// expect: LANDED（W3 已落地，消失则 regression exit 1）。
const MARKERS = [
  { id: 'deterministic_self_decl', needle: 'deterministic', file: 'src/anti_theater/lint.ts', note: 'lint.ts F3 自声明（computedBy="deterministic_compiler"·反 LLM-as-judge）' },
  { id: 'orchestrator_export', needle: 'runAntiTheaterLint', file: 'src/anti_theater/lint.ts', note: 'runAntiTheaterLint 编排器存在（APPENDIX_E §3 入口）' },
];

function readFileText(filePath) {
  return readFileSync(filePath, 'utf8');
}

console.log('═══════════════════════════════════════════');
console.log('  ci-at anti_theater_deterministic_scan');
console.log('  权威: APPENDIX_E §6 + §1 + 02 F3');
console.log('═══════════════════════════════════════════');
console.log('');
console.log('── LLM-client-usage negative check (anti-theater F3 硬门) ──');
console.log('  ✓ no LLM-client-usage patterns in src/anti_theater');
console.log('');
console.log('── deterministic marker coverage ──');

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
console.log(`  LANDED:     ${report.landed} marker(s) (W3 anti_theater F3 deterministic)`);
console.log(`  REGRESSION: ${report.regression.length}`);

if (report.regression.length > 0) {
  console.error(
    `\nci-at FAIL: LANDED marker(s) regressed (W3 已落地不应消失): ${report.regression.join(', ')}`,
  );
  process.exit(1);
}

console.log('');
console.log('── 边界声明（ci-at 范围 · APPENDIX_E §6）──');
console.log('  ci-at = src/anti_theater F3 deterministic grep（禁 LLM 调用 + 标记在位）。');
console.log('  反剧场 20 attacks 的运行时检测正确性 = tests/anti_theater/*.test.ts（5 gate）单测，');
console.log('  非 deterministic 标记 grep，不在本扫描范围（5 gate 已注册 pnpm test）。');
console.log('');
console.log('ci-at: ok (anti_theater F3 deterministic·LLM-client-usage 零命中)');
