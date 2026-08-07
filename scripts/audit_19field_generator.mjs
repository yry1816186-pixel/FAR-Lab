/**
 * audit_19field_generator.mjs — 19 字段审计生成器与校验器。
 *
 * 用途：让 final-auditor agent 在 DONE 阶段产出结构化 audit.json（对接
 *   docs/governance/AGENT-LIFECYCLE.md §3 的 19 字段模板）。
 *
 * 两种模式：
 *   1. 校验模式（默认）：读 audit 草稿 JSON，校验 19 字段完整性 + 语义规则
 *   2. 采集模式（--collect）：自动跑 typecheck/lint/test/demo 填充 verification 字段
 *
 * 19 字段（AGENT-LIFECYCLE.md §3）:
 *   timestamp, trace_id, actor, event, task_id, risk, tool, args_redacted,
 *   status, verification, approval, memory_write, artifacts, policy_refs,
 *   summary, counter_case, residual_risk, rollback, falsification_dimension_covered
 *
 * 语义规则（对接 AGENTS.md §4.4/§8 + AGENT-LIFECYCLE.md §5）:
 *   - counter_case 非空（零 counter-case = 戏剧审查，FAIL）
 *   - rollback ≠ "none"（AGENTS.md §4.4 可逆性）
 *   - residual_risk 非空（AGENTS.md §8 残留风险显式）
 *   - verification 非占位符（禁 "应该通过"/"should pass"/"TODO" 等）
 *   - risk ∈ {P0,P1,P2,P3,P4}
 *   - status ∈ {DONE, IMPLEMENTED_UNVERIFIED, BLOCKED}
 *
 * 用法:
 *   node scripts/audit_19field_generator.mjs --input audit-draft.json --output audit.json
 *   cat audit-draft.json | node scripts/audit_19field_generator.mjs --collect > audit.json
 *   node scripts/audit_19field_generator.mjs --input audit-draft.json --collect --output audit.json
 *
 * exit 0 = 校验通过（输出完整 audit.json）；exit 1 = 字段缺失/语义违规
 *
 * 诚实边界：--collect 跑真实命令取 exit code + 摘要，不虚构验证结果；
 *   命令失败时如实记录 exit code 与 stderr 摘要，不假装通过。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ---------- 19 字段定义（AGENT-LIFECYCLE.md §3） ----------
const REQUIRED_FIELDS = [
  'timestamp',
  'trace_id',
  'actor',
  'event',
  'task_id',
  'risk',
  'tool',
  'args_redacted',
  'status',
  'verification',
  'approval',
  'memory_write',
  'artifacts',
  'policy_refs',
  'summary',
  'counter_case',
  'residual_risk',
  'rollback',
  'falsification_dimension_covered',
];

const VALID_RISK = new Set(['P0', 'P1', 'P2', 'P3', 'P4']);
const VALID_STATUS = new Set(['DONE', 'IMPLEMENTED_UNVERIFIED', 'BLOCKED']);

// 占位符信号（反"借口"协议，AGENT-LIFECYCLE.md §5.3）
const PLACEHOLDER_PATTERNS = [
  /应该能?通过/,
  /should\s+pass/i,
  /\bTODO\b/,
  /\bFIXME\b/,
  /看起来可以/,
  /之前修过/,
  /环境问题/,
  /占位/,
  /placeholder/i,
];

// ---------- CLI 参数解析 ----------
function parseArgs(argv) {
  const args = { input: null, output: null, collect: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input') args.input = argv[++i];
    else if (a === '--output') args.output = argv[++i];
    else if (a === '--collect') args.collect = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function printHelp() {
  console.log(`audit_19field_generator — 19 字段审计生成器与校验器

用法:
  node scripts/audit_19field_generator.mjs --input <draft.json> [--output <audit.json>] [--collect]
  cat draft.json | node scripts/audit_19field_generator.mjs [--collect] > audit.json

参数:
  --input <file>    audit 草稿 JSON 文件路径（不指定则读 stdin）
  --output <file>   输出 audit.json 文件路径（不指定则输出 stdout）
  --collect         自动跑 typecheck/lint/test/demo 填充 verification 字段
  --help, -h        显示帮助

语义规则:
  - 19 字段必填（AGENT-LIFECYCLE.md §3）
  - counter_case 非空（零 counter-case = 戏剧审查 FAIL）
  - rollback ≠ "none"（AGENTS.md §4.4 可逆性）
  - residual_risk 非空（AGENTS.md §8 残留风险显式）
  - verification 非占位符（反"借口"协议）
  - risk ∈ {P0,P1,P2,P3,P4}，status ∈ {DONE,IMPLEMENTED_UNVERIFIED,BLOCKED}

exit 0 = 校验通过；exit 1 = 字段缺失/语义违规`);
}

// ---------- 读取输入 ----------
function readDraft(inputPath) {
  let raw;
  if (inputPath) {
    raw = readFileSync(inputPath, 'utf8');
  } else if (!process.stdin.isTTY) {
    raw = readFileSync(0, 'utf8'); // stdin
  } else {
    console.error('错误：未指定 --input 且无 stdin 输入。用 --help 查看用法。');
    process.exit(1);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error(`错误：audit 草稿 JSON 解析失败: ${e.message}`);
    process.exit(1);
  }
}

// ---------- 自动采集 verification（--collect 模式） ----------
/** Windows 上 pnpm 是 .cmd shim，execFileSync 需显式 .cmd（governance_gate.mjs 同模式）。 */
const PNPM = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function runCmd(cmd, args, timeoutMs = 600000) {
  try {
    const out = execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'] });
    return { exit: 0, stdout: out, stderr: '' };
  } catch (e) {
    return {
      exit: typeof e.status === 'number' ? e.status : 1,
      stdout: String(e.stdout ?? ''),
      stderr: String(e.stderr ?? ''),
    };
  }
}

/** 从命令输出提取摘要行（node --test 的 TAP summary 或自定义）。 */
function extractSummary(stdout, kind) {
  const lines = stdout.split(/\r?\n/);
  if (kind === 'test') {
    // node --test 输出: # tests N / # pass N / # fail N / # skip N
    const tests = lines.find((l) => /^# tests\s+\d+/.test(l));
    const pass = lines.find((l) => /^# pass(ed)?\s+\d+/.test(l));
    const fail = lines.find((l) => /^# fail(ed)?\s+\d+/.test(l));
    const skip = lines.find((l) => /^# skip(ped)?\s+\d+/.test(l));
    return [tests, pass, fail, skip].filter(Boolean).join(' · ') || `exit=0 (no TAP summary)`;
  }
  if (kind === 'demo') {
    // far demo 输出含 golden vectors 计数
    const gv = lines.find((l) => /golden\s*vector/i.test(l));
    return gv || 'demo completed';
  }
  return `exit=0`;
}

function collectVerification() {
  const v = {};
  // typecheck
  const tc = runCmd('node', ['node_modules/typescript/bin/tsc', '--noEmit'], 120000);
  v.typecheck = `${tc.exit === 0 ? '0 errors' : `${tc.exit} (failed)`} (pnpm run typecheck)`;

  // lint
  const li = runCmd('node', ['node_modules/eslint/bin/eslint.js', 'src', '--max-warnings', '0'], 120000);
  v.lint = `${li.exit === 0 ? '0 errors' : `${li.exit} (failed)`} (pnpm run lint --max-warnings 0)`;

  // test
  const te = runCmd(PNPM, ['test'], 600000, );
  const teSummary = te.exit === 0 ? extractSummary(te.stdout, 'test') : `exit=${te.exit} (failed)`;
  v.test = teSummary;

  // demo
  const dm = runCmd('node', ['src/cli/far.ts', 'demo'], 120000);
  v.demo = dm.exit === 0 ? extractSummary(dm.stdout, 'demo') : `exit=${dm.exit} (failed)`;

  return v;
}

// ---------- 校验逻辑 ----------
function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isNonEmptyArray(v) {
  return Array.isArray(v) && v.length > 0;
}

function isNonEmptyObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0;
}

function hasPlaceholder(str) {
  if (typeof str !== 'string') return false;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(str));
}

/**
 * 校验 audit 草稿。返回 { errors: string[], warnings: string[] }。
 */
export function validateAudit(draft) {
  const errors = [];
  const warnings = [];

  // 1. 19 字段完整性
  for (const field of REQUIRED_FIELDS) {
    if (!(field in draft)) {
      errors.push(`缺失必填字段: ${field}`);
    }
  }

  // 2. risk 枚举
  if ('risk' in draft && !VALID_RISK.has(draft.risk)) {
    errors.push(`risk="${draft.risk}" 不在 {P0,P1,P2,P3,P4}`);
  }

  // 3. status 枚举
  if ('status' in draft && !VALID_STATUS.has(draft.status)) {
    errors.push(`status="${draft.status}" 不在 {DONE,IMPLEMENTED_UNVERIFIED,BLOCKED}`);
  }

  // 4. counter_case 非空（零 counter-case = 戏剧审查）
  if ('counter_case' in draft) {
    if (!isNonEmptyString(draft.counter_case)) {
      errors.push('counter_case 为空（零 counter-case = 戏剧审查 FAIL，见 AGENT-LIFECYCLE.md §5.1）');
    } else if (hasPlaceholder(draft.counter_case)) {
      errors.push('counter_case 含占位符信号（反"借口"协议）');
    }
  }

  // 5. rollback ≠ "none"（AGENTS.md §4.4 可逆性）
  if ('rollback' in draft) {
    if (!isNonEmptyString(draft.rollback)) {
      errors.push('rollback 为空（AGENTS.md §4.4 可逆性）');
    } else if (draft.rollback.trim().toLowerCase() === 'none') {
      errors.push('rollback="none" 被拒（AGENTS.md §4.4 可逆性 + §7 trust-kernel）');
    }
  }

  // 6. residual_risk 非空（AGENTS.md §8）
  if ('residual_risk' in draft) {
    if (!isNonEmptyString(draft.residual_risk)) {
      errors.push('residual_risk 为空（AGENTS.md §8 残留风险显式）');
    }
  }

  // 7. summary 非空
  if ('summary' in draft && !isNonEmptyString(draft.summary)) {
    errors.push('summary 为空');
  }

  // 8. verification 非占位符 + 是对象
  if ('verification' in draft) {
    if (!isNonEmptyObject(draft.verification)) {
      errors.push('verification 必须是非空对象（typecheck/lint/test/demo/coverage）');
    } else {
      const vstr = JSON.stringify(draft.verification);
      if (hasPlaceholder(vstr)) {
        errors.push('verification 含占位符信号（反"借口"协议：禁 "应该通过"/"should pass"/"TODO"）');
      }
    }
  }

  // 9. artifacts 非空数组
  if ('artifacts' in draft && !isNonEmptyArray(draft.artifacts)) {
    errors.push('artifacts 必须是非空数组（至少一个产出文件路径）');
  }

  // 10. tool 非空数组
  if ('tool' in draft && !isNonEmptyArray(draft.tool)) {
    errors.push('tool 必须是非空数组（使用的工具列表）');
  }

  // 11. policy_refs 非空数组
  if ('policy_refs' in draft && !isNonEmptyArray(draft.policy_refs)) {
    errors.push('policy_refs 必须是非空数组（引用的 AGENTS.md 章节）');
  }

  // 12. memory_write 是对象
  if ('memory_write' in draft && !isNonEmptyObject(draft.memory_write)) {
    errors.push('memory_write 必须是非空对象（progress_md/working_memory/adr/blind_spot）');
  }

  // 13. falsification_dimension_covered 非空
  if ('falsification_dimension_covered' in draft && !isNonEmptyString(draft.falsification_dimension_covered)) {
    errors.push('falsification_dimension_covered 为空（至少一个证伪维度：boundary/null/error-path/concurrency/security/performance/regression）');
  }

  // 14. timestamp 格式（ISO 8601 宽松检查）
  if ('timestamp' in draft && isNonEmptyString(draft.timestamp)) {
    if (Number.isNaN(Date.parse(draft.timestamp))) {
      warnings.push(`timestamp="${draft.timestamp}" 非有效 ISO 8601 日期`);
    }
  }

  return { errors, warnings };
}

// ---------- 自动填充缺失的可推导字段 ----------
function autofill(draft) {
  const filled = { ...draft };
  if (!filled.timestamp) {
    filled.timestamp = new Date().toISOString();
  }
  if (!filled.trace_id) {
    filled.trace_id = `task-${randomUUID()}`;
  }
  if (!filled.event) {
    filled.event = 'task_completed';
  }
  return filled;
}

// ---------- 主流程 ----------
function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  let draft = readDraft(args.input);

  // --collect：自动采集 verification
  if (args.collect) {
    if (!draft.verification || typeof draft.verification !== 'object') {
      draft.verification = {};
    }
    const collected = collectVerification();
    // 只填充草稿中缺失的 verification 子字段（不覆盖 agent 手填的）
    for (const [k, v] of Object.entries(collected)) {
      if (!draft.verification[k]) {
        draft.verification[k] = v;
      }
    }
    console.error(`[collect] verification 已采集: ${Object.keys(collected).join(', ')}`);
  }

  // 自动填充可推导字段
  draft = autofill(draft);

  // 校验
  const { errors, warnings } = validateAudit(draft);

  if (warnings.length > 0) {
    for (const w of warnings) console.error(`[warn] ${w}`);
  }

  if (errors.length > 0) {
    console.error(`\naudit 校验失败 (${errors.length} 项违规):`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    console.error('\n参考: docs/governance/AGENT-LIFECYCLE.md §3 (19 字段模板) + §5 (完成门禁)');
    process.exit(1);
  }

  // 校验通过，输出完整 audit.json
  const output = JSON.stringify(draft, null, 2) + '\n';
  if (args.output) {
    writeFileSync(args.output, output, 'utf8');
    console.error(`audit 校验通过 ✓ — 已写入 ${args.output}`);
  } else {
    process.stdout.write(output);
    console.error('\naudit 校验通过 ✓ (19 字段完整 + 语义规则通过)');
  }
  process.exit(0);
}

main();
