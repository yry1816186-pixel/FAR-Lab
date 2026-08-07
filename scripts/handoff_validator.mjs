/**
 * handoff_validator.mjs — Handoff 协议三件套校验器。
 *
 * 用途：校验角色间交接的 handoff 文档是否符合 AGENT-ORCHESTRATION.md §2 的三件套协议
 *   （Artifact + Context + Decision）。缺失即阻塞（AGENTS.md §9 委托 + §4.4 状态机）。
 *
 * Handoff 文档格式（AGENT-ORCHESTRATION.md §2.4）:
 *   ## Handoff: <from-role> → <to-role>
 *   ### Artifact
 *   - <file/path> @ <commit-ref>
 *   - <test evidence: command + numbers>
 *   ### Context
 *   - Decisions made: ...
 *   - Constraints: ...
 *   - Open questions (must resolve or mark as assumption): ...
 *   ### Decision
 *   - Next step: <to-role> does <action>
 *   - Risk budget: P<n>
 *   - Rollback: <method> (none rejected)
 *
 * 校验规则:
 *   1. 必须含 "## Handoff:" 标题 + from→to 角色方向
 *   2. 必须含 ### Artifact 节，且至少一个文件路径（含 @ ref 或 commit hash）
 *   3. 必须含 ### Context 节，且含 Decisions/Constraints/Open questions 三要素
 *   4. 必须含 ### Decision 节，且含 Next step/Risk budget/Rollback
 *   5. rollback ≠ "none"（AGENTS.md §4.4 可逆性 + §7 trust-kernel，铁律）
 *   6. Open questions 如有，必须显式标注（assumption 或 will-resolve-in-<stage>）
 *   7. Risk budget 必须是 P0-P4（对接 AGENT-LIFECYCLE.md §4）
 *
 * 用法:
 *   node scripts/handoff_validator.mjs --input handoff.md
 *   cat handoff.md | node scripts/handoff_validator.mjs
 *
 * exit 0 = 校验通过；exit 1 = 三件套缺失/语义违规
 */
import { readFileSync } from 'node:fs';

// ---------- CLI 参数解析 ----------
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
  console.log(`handoff_validator — Handoff 协议三件套校验器

用法:
  node scripts/handoff_validator.mjs --input <handoff.md>
  cat handoff.md | node scripts/handoff_validator.mjs

校验规则（对接 docs/governance/AGENT-ORCHESTRATION.md §2）:
  1. "## Handoff: <from> → <to>" 标题 + 角色方向
  2. ### Artifact 节 + 至少一个文件路径（@ ref）
  3. ### Context 节 + Decisions/Constraints/Open questions
  4. ### Decision 节 + Next step/Risk budget/Rollback
  5. rollback ≠ "none"（铁律）
  6. Open questions 显式标注（assumption / will-resolve-in-<stage>）
  7. Risk budget ∈ {P0,P1,P2,P3,P4}

exit 0 = 通过；exit 1 = 违规`);
}

function readInput(inputPath) {
  if (inputPath) return readFileSync(inputPath, 'utf8');
  if (!process.stdin.isTTY) return readFileSync(0, 'utf8');
  console.error('错误：未指定 --input 且无 stdin。用 --help 查看用法。');
  process.exit(1);
}

// ---------- Handoff 解析与校验 ----------
const VALID_ROLES = new Set([
  'repository-architect', 'implementation-engineer', 'integration-engineer',
  'verification-engineer', 'scientific-trust-reviewer', 'security-adversary',
  'final-auditor', 'release-engineer', 'main', 'orchestrator',
]);

const VALID_RISK = new Set(['P0', 'P1', 'P2', 'P3', 'P4']);

/**
 * 按 markdown ### 标题分节。返回 { title: content } 映射。
 */
function splitSections(text) {
  const sections = {};
  const lines = text.split(/\r?\n/);
  let currentTitle = null;
  let buffer = [];
  for (const line of lines) {
    const m = line.match(/^###\s+(.+?)\s*$/);
    if (m) {
      if (currentTitle) sections[currentTitle] = buffer.join('\n');
      currentTitle = m[1].trim();
      buffer = [];
    } else if (currentTitle) {
      buffer.push(line);
    }
  }
  if (currentTitle) sections[currentTitle] = buffer.join('\n');
  return sections;
}

/**
 * 提取 "## Handoff: X → Y" 标题。返回 { from, to } 或 null。
 */
function parseHandoffHeader(text) {
  const m = text.match(/^##\s+Handoff:\s*(\S+)\s*→\s*(\S+)\s*$/m);
  if (!m) return null;
  return { from: m[1], to: m[2] };
}

/**
 * 校验 handoff 文本。返回 { errors: string[], warnings: string[] }。
 */
export function validateHandoff(text) {
  const errors = [];
  const warnings = [];

  // 1. Handoff 标题 + 角色方向
  const header = parseHandoffHeader(text);
  if (!header) {
    errors.push('缺失 "## Handoff: <from-role> → <to-role>" 标题（AGENT-ORCHESTRATION.md §2.4）');
  } else {
    if (!VALID_ROLES.has(header.from)) {
      warnings.push(`from-role="${header.from}" 不在 8 角色注册表（AGENT-ORCHESTRATION.md §1）`);
    }
    if (!VALID_ROLES.has(header.to)) {
      warnings.push(`to-role="${header.to}" 不在 8 角色注册表（AGENT-ORCHESTRATION.md §1）`);
    }
  }

  const sections = splitSections(text);

  // 2. Artifact 节 + 文件路径 + @ ref
  if (!('Artifact' in sections)) {
    errors.push('缺失 ### Artifact 节（AGENT-ORCHESTRATION.md §2.1）');
  } else {
    const art = sections.Artifact;
    // 文件路径 + @ ref 模式：path/to/file @ commit-ref 或 path/to/file @ <hash>
    const hasFileRef = /[\w/.-]+\s+@\s+[\w.-]+/.test(art);
    if (!hasFileRef) {
      errors.push('### Artifact 节缺文件路径 + @ ref（例: src/foo.ts @ cd45a4a，见 §2.1）');
    }
    // 测试证据（command + numbers）
    const hasTestEvidence = /(test|验证|evidence|exit|pass|fail|绿)/i.test(art);
    if (!hasTestEvidence) {
      warnings.push('### Artifact 节建议含测试证据（command + numbers）');
    }
  }

  // 3. Context 节 + Decisions/Constraints/Open questions
  if (!('Context' in sections)) {
    errors.push('缺失 ### Context 节（AGENT-ORCHESTRATION.md §2.2）');
  } else {
    const ctx = sections.Context;
    if (!/decision/i.test(ctx) && !/决策/.test(ctx)) {
      errors.push('### Context 节缺 "Decisions made"（已做决策，见 §2.2）');
    }
    if (!/constraint/i.test(ctx) && !/约束/.test(ctx)) {
      errors.push('### Context 节缺 "Constraints"（约束，见 §2.2）');
    }
    // Open questions 检查
    const hasOpenQ = /open question/i.test(ctx) || /开放问题/.test(ctx);
    if (hasOpenQ) {
      // Open questions 必须标注 assumption 或 will-resolve-in-<stage>
      const openQLine = ctx.split(/\r?\n/).find((l) => /open question|开放问题/i.test(l));
      const marked = /assumption|假设|will-resolve-in|resolve-in|下阶段|下个阶段/i.test(openQLine ?? '') ||
        /assumption|假设|will-resolve-in|resolve-in|下阶段|下个阶段/i.test(ctx);
      if (!marked) {
        errors.push('### Context 的 Open questions 必须显式标注（assumption / will-resolve-in-<stage>，见 §2.2）');
      }
    } else {
      warnings.push('### Context 节建议含 "Open questions"（即使为 "none" 也要显式声明，见 §2.2）');
    }
  }

  // 4. Decision 节 + Next step/Risk budget/Rollback
  if (!('Decision' in sections)) {
    errors.push('缺失 ### Decision 节（AGENT-ORCHESTRATION.md §2.3）');
  } else {
    const dec = sections.Decision;
    if (!/next step/i.test(dec) && !/下一步/.test(dec)) {
      errors.push('### Decision 节缺 "Next step"（下一步动作，见 §2.3）');
    }
    // Risk budget（宽松匹配 P\d+，再校验枚举——避免 P5 报"缺失"而非"非法"）
    const riskMatch = dec.match(/risk\s+budget:?\s*(P\d+)/i) || dec.match(/风险预算:?\s*(P\d+)/);
    if (!riskMatch) {
      errors.push('### Decision 节缺 "Risk budget: P<n>"（n∈0-4，见 §2.3 + AGENT-LIFECYCLE.md §4）');
    } else if (!VALID_RISK.has(riskMatch[1])) {
      errors.push(`Risk budget="${riskMatch[1]}" 不在 {P0,P1,P2,P3,P4}`);
    }
    // Rollback
    const rollbackMatch = dec.match(/rollback:?\s*(.+)/i) || dec.match(/回滚:?\s*(.+)/);
    if (!rollbackMatch) {
      errors.push('### Decision 节缺 "Rollback"（回滚方法，见 §2.3）');
    } else {
      const rollbackVal = rollbackMatch[1].trim();
      if (rollbackVal.toLowerCase() === 'none' || /^none\b/i.test(rollbackVal)) {
        errors.push('Rollback="none" 被拒（AGENTS.md §4.4 可逆性 + §7 trust-kernel，铁律）');
      }
    }
  }

  return { errors, warnings };
}

// ---------- 主流程 ----------
function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const text = readInput(args.input);
  const { errors, warnings } = validateHandoff(text);

  for (const w of warnings) console.error(`[warn] ${w}`);

  if (errors.length > 0) {
    console.error(`\nhandoff 校验失败 (${errors.length} 项违规):`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    console.error('\n参考: docs/governance/AGENT-ORCHESTRATION.md §2 (Handoff 协议三件套)');
    process.exit(1);
  }

  console.error('handoff 校验通过 ✓ (三件套完整 + 语义规则通过)');
  process.exit(0);
}

main();
