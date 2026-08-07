/**
 * deep_audit_counter_case_gate.mjs — Deep Audit counter-case 门禁。
 *
 * 用途：校验 REVIEW 阶段产出的 review.md 是否含 ≥1 个带证据的 counter-case。
 *   "全正面审查是戏剧"——零 counter-case 的审查判 FAIL（AGENT-LIFECYCLE.md §2.5 + §5.1）。
 *
 * 触发角色：verification-engineer / scientific-trust-reviewer / security-adversary
 *   产出的 review.md 必须经此门禁才能进入 INTEGRATE 阶段。
 *
 * 校验规则:
 *   1. 必须含 counter-case 节（标题匹配：##/### Counter-case / 反例 / Adversarial / Red team / 攻击）
 *   2. counter-case 节内必须带证据（file:line / tests/ 路径 / exit code / pass|fail / 攻击 trace）
 *   3. 零 counter-case → exit 1（戏剧审查）
 *   4. counter-case 无证据 → exit 1（空壳 counter-case 等于没有）
 *
 * 证伪维度（AGENT-LIFECYCLE.md §2.5，至少覆盖一个）:
 *   boundary / null / error-path / concurrency / security / performance / regression
 *
 * 用法:
 *   node scripts/deep_audit_counter_case_gate.mjs --input review.md
 *   cat review.md | node scripts/deep_audit_counter_case_gate.mjs
 *
 * exit 0 = 通过（≥1 带证据 counter-case）；exit 1 = 戏剧审查（零/空壳 counter-case）
 */
import { readFileSync } from 'node:fs';

function parseArgs(argv) {
  const args = { input: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input') args.input = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function printHelp() {
  console.log(`deep_audit_counter_case_gate — Deep Audit counter-case 门禁

用法:
  node scripts/deep_audit_counter_case_gate.mjs --input <review.md>
  cat review.md | node scripts/deep_audit_counter_case_gate.mjs

校验规则（对接 docs/governance/AGENT-LIFECYCLE.md §2.5 + §5.1）:
  1. 含 counter-case 节（##/### Counter-case / 反例 / Adversarial / Red team / 攻击）
  2. counter-case 带证据（file:line / tests/ / exit code / pass|fail / trace）
  3. 零 counter-case → exit 1（"全正面审查是戏剧"）
  4. counter-case 无证据 → exit 1（空壳）

证伪维度（至少一个）: boundary / null / error-path / concurrency / security / performance / regression

exit 0 = 通过；exit 1 = 戏剧审查`);
}

function readInput(inputPath) {
  if (inputPath) return readFileSync(inputPath, 'utf8');
  if (!process.stdin.isTTY) return readFileSync(0, 'utf8');
  console.error('错误：未指定 --input 且无 stdin。用 --help 查看用法。');
  process.exit(1);
}

// counter-case 节标题模式
const COUNTER_CASE_HEADERS = [
  /^#{1,4}\s+counter[- ]?case/i,
  /^#{1,4}\s+反例/,
  /^#{1,4}\s+adversarial/i,
  /^#{1,4}\s+red[- ]?team/i,
  /^#{1,4}\s+攻击/,
  /^#{1,4}\s+falsification/i,
  /^#{1,4}\s+证伪/,
];

// 证据标记模式（file:line / tests/ 路径 / exit code / pass|fail / 攻击 trace）
const EVIDENCE_PATTERNS = [
  /[\w/.-]+\.[a-z]+:\d+/,          // file.ts:123
  /tests\/[\w/.-]+/,                // tests/foo.test.ts
  /\bexit\s*(code)?[:\s=]?\s*\d/i,  // exit 0 / exit code 1
  /\b(pass|fail|通过|失败|绿)\b/i,   // pass/fail/绿
  /\b(trace|堆栈|stack|攻击|attack)\b/i, // 攻击 trace
  /\b\d+\s*(ms|秒|seconds?)\b/i,    // 性能证据 123ms
];

// 证伪维度关键词
const FALSIFICATION_DIMENSIONS = [
  { name: 'boundary', pattern: /boundar|边界|boundary/i },
  { name: 'null', pattern: /\bnull\b|空值|undefined|缺失/i },
  { name: 'error-path', pattern: /error[- ]?path|错误路径|异常路径|fail/i },
  { name: 'concurrency', pattern: /concurren|并发|race|竞争/i },
  { name: 'security', pattern: /secur|安全|inject|tamper|篡改|注入/i },
  { name: 'performance', pattern: /performance|性能|latency|延迟|吞吐/i },
  { name: 'regression', pattern: /regress|回归|previously|之前/i },
];

/**
 * 按 markdown 标题分节。返回 [{ level, title, content }]。
 */
function splitAllSections(text) {
  const sections = [];
  const lines = text.split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (m) {
      if (current) sections.push(current);
      current = { level: m[1].length, title: m[2].trim(), content: [] };
    } else if (current) {
      current.content.push(line);
    }
  }
  if (current) sections.push(current);
  return sections;
}

function isCounterCaseHeader(title) {
  return COUNTER_CASE_HEADERS.some((re) => re.test(title));
}

function hasEvidence(content) {
  const text = content.join('\n');
  return EVIDENCE_PATTERNS.some((re) => re.test(text));
}

function getDimensions(content) {
  const text = content.join('\n');
  return FALSIFICATION_DIMENSIONS
    .filter((d) => d.pattern.test(text))
    .map((d) => d.name);
}

/**
 * 校验 review 文本。返回 { errors, warnings, counterCases, dimensions }。
 */
export function validateCounterCase(text) {
  const errors = [];
  const warnings = [];
  const sections = splitAllSections(text);

  // 找所有 counter-case 节（含子节）
  const counterCaseSections = sections.filter((s) => isCounterCaseHeader(s.title));

  if (counterCaseSections.length === 0) {
    errors.push('零 counter-case — "全正面审查是戏剧"（AGENT-LIFECYCLE.md §2.5），审查判 FAIL');
    return { errors, warnings, counterCases: [], dimensions: [] };
  }

  // 检查每个 counter-case 是否带证据
  const validCases = [];
  const emptyCases = [];
  for (const s of counterCaseSections) {
    if (hasEvidence(s.content)) {
      validCases.push(s.title);
    } else {
      emptyCases.push(s.title);
    }
  }

  if (emptyCases.length > 0) {
    for (const t of emptyCases) {
      errors.push(`counter-case "${t}" 无证据（空壳 counter-case 等于没有，需 file:line / tests/ / exit code / trace）`);
    }
  }

  if (validCases.length === 0) {
    errors.push('所有 counter-case 均无证据 — 审查判 FAIL');
  }

  // 证伪维度覆盖检查（建议至少一个，不强制则 warning）
  const allDims = new Set();
  for (const s of counterCaseSections) {
    for (const d of getDimensions(s.content)) allDims.add(d);
  }
  if (allDims.size === 0) {
    warnings.push('counter-case 未显式标注证伪维度（建议: boundary / null / error-path / concurrency / security / performance / regression）');
  }

  return {
    errors,
    warnings,
    counterCases: validCases,
    dimensions: [...allDims],
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const text = readInput(args.input);
  const { errors, warnings, counterCases, dimensions } = validateCounterCase(text);

  for (const w of warnings) console.error(`[warn] ${w}`);

  if (errors.length > 0) {
    console.error(`\nDeep Audit counter-case 门禁失败 (${errors.length} 项违规):`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    console.error('\n参考: docs/governance/AGENT-LIFECYCLE.md §2.5 (REVIEW 红队) + §5.1 (find_gaps)');
    process.exit(1);
  }

  console.error(`Deep Audit counter-case 门禁通过 ✓ (${counterCases.length} 个带证据 counter-case` +
    (dimensions.length > 0 ? `, 证伪维度: ${dimensions.join(', ')}` : '') + ')');
  process.exit(0);
}

main();
