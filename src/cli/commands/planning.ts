// src/cli/commands/planning.ts
// 职责：`far planning <subcommand>` —— 规划门禁方法论源代码化的 CLI 入口。
//
// 子命令（全部确定性，无 LLM）：
//   plan <file>       校验 Plan DAG（zod parse + validatePlan）→ 门禁报告 + 拓扑执行序
//   spec <file>       校验 Spec（zod parse + validateSpec）→ 门禁报告
//   batch <file>      校验 batch contract（CORE-BATCH-001 十二字段）；--closure <file> 收尾对拍
//   risk <signals...> 风险分级 P0-P4（gradeRisk，可审计 reasons）
//   state <from> <to> 规划状态机转移校验（--compress 允许压缩模式）
//   gate <file>       验证门禁报告（四步门函数；结论 DONE/IMPLEMENTED_UNVERIFIED/BLOCKED）
//   checkpoint <file> 解析 PROGRESS.md 检查点（--template 生成模板）
//
// 退出码：0 = 通过 / 7 = 门禁失败 / 3 = IMPLEMENTED_UNVERIFIED / 2 = 用法或文件错误
// （7 与 fec compile / verify 的 fail 语义一致；3 对应 grade 的中间态）

import { existsSync, readFileSync } from 'node:fs';

import { buildGateReport, renderGateReport } from '../../planning/gate.ts';
import { parseCheckpoint, renderCheckpoint, nextStepFrom } from '../../planning/checkpoint.ts';
import {
  BatchClosureSchema,
  BatchContractSchema,
  matchClosureToContract,
  validateBatchContract,
} from '../../planning/batch_contract.ts';
import {
  CheckpointSchema,
  PlanSchema,
  SpecSchema,
  VerificationReportSchema,
} from '../../planning/types.ts';
import { gradeRisk } from '../../planning/risk.ts';
import type { RiskSignals } from '../../planning/types.ts';
import { validatePlan } from '../../planning/plan.ts';
import { transitionStage } from '../../planning/state_machine.ts';
import { validateSpec } from '../../planning/spec.ts';

const RISK_SIGNAL_NAMES = [
  'readOnly',
  'docOnly',
  'boundedWrite',
  'touchesTrustKernel',
  'newCliOrApi',
  'crossModule',
  'destructive',
  'irreversible',
  'ambiguous',
] as const;

const STAGE_NAMES = ['ANALYZE', 'PLAN', 'EXECUTE', 'VERIFY', 'REVIEW', 'REPORT'] as const;

/** far planning 命令总入口。argv = 子命令名 + 参数。--json 任意位置启用机器可读输出。 */
export function runPlanningFromArgs(argv: readonly string[]): number {
  const sub = argv[0];
  if (sub === undefined || sub === '--help' || sub === '-h') {
    process.stdout.write(USAGE);
    return sub === undefined ? 2 : 0;
  }
  const json = argv.includes('--json');
  switch (sub) {
    case 'plan':
      return runPlanCheck(argv.slice(1), json);
    case 'spec':
      return runSpecCheck(argv.slice(1), json);
    case 'batch':
      return runBatchCheck(argv.slice(1), json);
    case 'risk':
      return runRisk(argv.slice(1), json);
    case 'state':
      return runState(argv.slice(1), json);
    case 'gate':
      return runGate(argv.slice(1), json);
    case 'checkpoint':
      return runCheckpoint(argv.slice(1), json);
    default:
      process.stderr.write(`far planning: unknown subcommand '${sub}'\n\n${USAGE}`);
      return 2;
  }
}

const USAGE = `far planning — 规划门禁方法论源代码化（确定性门禁引擎）
用法:
  far planning plan <file>           校验 Plan DAG → 门禁报告 + 拓扑执行序
  far planning spec <file>           校验 Spec（≥3 可验证 AC / Delta / trust-kernel 声明）
  far planning batch <file>          校验 batch contract（§4.2 十二字段）；--closure <file> 收尾对拍
  far planning risk <signal>...      风险分级 P0-P4（信号: ${RISK_SIGNAL_NAMES.join('/')}）
  far planning state <from> <to>     状态机转移校验（--compress 允许压缩模式）
  far planning gate <file>           验证门禁报告（四步门函数，not_run 显式标注）
  far planning checkpoint <file>     解析检查点（--template 生成模板）
  --json                             任意位置启用机器可读 JSON 输出
退出码: 0 通过 / 7 门禁失败 / 3 IMPLEMENTED_UNVERIFIED / 2 用法或文件错误
`;

// ---------------------------------------------------------------------------
// plan 子命令
// ---------------------------------------------------------------------------

function runPlanCheck(args: readonly string[], json: boolean): number {
  const file = args[0];
  if (file === undefined) {
    process.stderr.write('far planning plan: missing <file>\n');
    return 2;
  }
  const raw = readJsonOrExit(file, 'plan');
  if (raw === undefined) return 2;

  const parsed = PlanSchema.safeParse(raw);
  if (!parsed.success) {
    if (json) {
      process.stdout.write(`${JSON.stringify({ subcommand: 'plan', gate: 'FAIL', violations: [{ code: 'SCHEMA', message: zodSummary(parsed.error) }] })}\n`);
    } else {
      process.stderr.write(`far planning plan: invalid plan structure — ${zodSummary(parsed.error)}\n`);
    }
    return 7;
  }

  const result = validatePlan(parsed.data);
  if (json) {
    process.stdout.write(`${JSON.stringify({ subcommand: 'plan', gate: result.ok ? 'PASS' : 'FAIL', violations: result.violations, executionOrder: result.executionOrder })}\n`);
  } else if (!result.ok) {
    process.stderr.write(`far planning plan: PLAN GATE FAILED (exit 7)\n`);
    for (const v of result.violations) {
      process.stderr.write(`  [${v.code}] ${v.message}\n`);
    }
  } else {
    process.stdout.write(
      `far planning plan: PLAN GATE PASS — ${parsed.data.steps.length} step(s), execution order: ${result.executionOrder.join(' → ')}\n`,
    );
  }
  return result.ok ? 0 : 7;
}

// ---------------------------------------------------------------------------
// spec 子命令
// ---------------------------------------------------------------------------

function runSpecCheck(args: readonly string[], json: boolean): number {
  const file = args[0];
  if (file === undefined) {
    process.stderr.write('far planning spec: missing <file>\n');
    return 2;
  }
  const raw = readJsonOrExit(file, 'spec');
  if (raw === undefined) return 2;

  const parsed = SpecSchema.safeParse(raw);
  if (!parsed.success) {
    if (json) {
      process.stdout.write(`${JSON.stringify({ subcommand: 'spec', gate: 'FAIL', violations: [{ code: 'SCHEMA', message: zodSummary(parsed.error) }] })}\n`);
    } else {
      process.stderr.write(`far planning spec: invalid spec structure — ${zodSummary(parsed.error)}\n`);
    }
    return 7;
  }

  const result = validateSpec(parsed.data);
  if (json) {
    process.stdout.write(`${JSON.stringify({ subcommand: 'spec', gate: result.ok ? 'PASS' : 'FAIL', violations: result.violations })}\n`);
  } else if (!result.ok) {
    process.stderr.write(`far planning spec: SPEC GATE FAILED (exit 7)\n`);
    for (const v of result.violations) {
      process.stderr.write(`  [${v.code}] ${v.message}\n`);
    }
  } else {
    process.stdout.write(
      `far planning spec: SPEC GATE PASS — ${parsed.data.acceptanceCriteria.length} verifiable ACs, delta ${summarizeDelta(parsed.data.delta.added, parsed.data.delta.modified, parsed.data.delta.removed)}\n`,
    );
  }
  return result.ok ? 0 : 7;
}

function summarizeDelta(added: readonly string[], modified: readonly string[], removed: readonly string[]): string {
  const parts: string[] = [];
  if (added.length > 0) parts.push(`+${added.length}`);
  if (modified.length > 0) parts.push(`~${modified.length}`);
  if (removed.length > 0) parts.push(`-${removed.length}`);
  return parts.length === 0 ? 'empty' : parts.join('/');
}

// ---------------------------------------------------------------------------
// batch 子命令（CORE-BATCH-001：batch contract + 可选收尾对拍）
// ---------------------------------------------------------------------------

function runBatchCheck(args: readonly string[], json: boolean): number {
  const closureFlag = args.indexOf('--closure');
  const contractFile = closureFlag === -1 ? args[0] : args.slice(0, closureFlag)[0];
  const closureFile = closureFlag === -1 ? undefined : args[closureFlag + 1];
  if (contractFile === undefined) {
    process.stderr.write('far planning batch: missing <contract-file>\n');
    return 2;
  }
  if (closureFlag !== -1 && (closureFile === undefined || closureFile.startsWith('--'))) {
    process.stderr.write('far planning batch: --closure requires <closure-file>\n');
    return 2;
  }

  const rawContract = readJsonOrExit(contractFile, 'batch');
  if (rawContract === undefined) return 2;
  const parsedContract = BatchContractSchema.safeParse(rawContract);
  if (!parsedContract.success) {
    const msg = zodSummary(parsedContract.error);
    if (json) {
      process.stdout.write(`${JSON.stringify({ subcommand: 'batch', gate: 'FAIL', violations: [{ code: 'SCHEMA', message: msg }] })}\n`);
    } else {
      process.stderr.write(`far planning batch: invalid contract structure — ${msg}\n`);
    }
    return 7;
  }

  const validation = validateBatchContract(parsedContract.data);
  if (!validation.ok) {
    if (json) {
      process.stdout.write(`${JSON.stringify({ subcommand: 'batch', gate: 'FAIL', violations: validation.violations })}\n`);
    } else {
      process.stderr.write('far planning batch: BATCH CONTRACT GATE FAILED (exit 7)\n');
      for (const v of validation.violations) {
        process.stderr.write(`  [${v.code}] ${v.message}\n`);
      }
    }
    return 7;
  }

  // 无 --closure：合同本身通过即出口（开批门禁）
  if (closureFile === undefined) {
    const summary = `batch '${parsedContract.data.batchId}' — ${parsedContract.data.requirementIds.join('/')} risk ${parsedContract.data.risk}, ${parsedContract.data.acceptanceCommands.length} acceptance command(s), write set ${parsedContract.data.allowedWriteSet.length} entr(ies)`;
    if (json) {
      process.stdout.write(`${JSON.stringify({ subcommand: 'batch', gate: 'PASS', summary })}\n`);
    } else {
      process.stdout.write(`far planning batch: CONTRACT PASS — ${summary}\n`);
    }
    return 0;
  }

  // 有 --closure：收尾对拍（closure-evidence-match）
  const rawClosure = readJsonOrExit(closureFile, 'batch');
  if (rawClosure === undefined) return 2;
  const parsedClosure = BatchClosureSchema.safeParse(rawClosure);
  if (!parsedClosure.success) {
    const msg = zodSummary(parsedClosure.error);
    if (json) {
      process.stdout.write(`${JSON.stringify({ subcommand: 'batch', match: 'FAIL', violations: [{ code: 'SCHEMA', message: msg }] })}\n`);
    } else {
      process.stderr.write(`far planning batch: invalid closure structure — ${msg}\n`);
    }
    return 7;
  }

  const match = matchClosureToContract(parsedContract.data, parsedClosure.data);
  if (json) {
    process.stdout.write(`${JSON.stringify({ subcommand: 'batch', match: match.ok ? 'PASS' : 'FAIL', violations: match.violations, summary: match.summary })}\n`);
    return match.ok ? 0 : 7;
  }
  if (!match.ok) {
    process.stderr.write('far planning batch: CLOSURE MATCH FAILED (exit 7)\n');
    for (const v of match.violations) {
      process.stderr.write(`  [${v.code}] ${v.message}\n`);
    }
    return 7;
  }
  const s = match.summary;
  process.stdout.write(
    `far planning batch: CLOSURE MATCH PASS — acceptance ${s.acceptancePassed}/${s.acceptanceTotal}, outcomes ${Object.entries(s.outcomesByKind).map(([k, n]) => `${k}=${n}`).join(' ')}, files written ${s.filesWritten}, unknowns resolved ${s.unknownsResolved}\n`,
  );
  return 0;
}

// ---------------------------------------------------------------------------
// risk 子命令
// ---------------------------------------------------------------------------

function runRisk(args: readonly string[], json: boolean): number {
  if (args.length === 0 || !RISK_SIGNAL_NAMES.some((n) => args.includes(n))) {
    process.stderr.write(`far planning risk: no valid signal provided (valid: ${RISK_SIGNAL_NAMES.join(', ')})\n`);
    return 2;
  }
  const signals: RiskSignals = {
    readOnly: args.includes('readOnly'),
    docOnly: args.includes('docOnly'),
    boundedWrite: args.includes('boundedWrite'),
    touchesTrustKernel: args.includes('touchesTrustKernel'),
    newCliOrApi: args.includes('newCliOrApi'),
    crossModule: args.includes('crossModule'),
    destructive: args.includes('destructive'),
    irreversible: args.includes('irreversible'),
    ambiguous: args.includes('ambiguous'),
  };
  const result = gradeRisk(signals);
  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  }
  process.stdout.write(`far planning risk: ${result.level}\n`);
  for (const reason of result.reasons) {
    process.stdout.write(`  - ${reason}\n`);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// state 子命令
// ---------------------------------------------------------------------------

function runState(args: readonly string[], json: boolean): number {
  const compress = args.includes('--compress');
  const positional = args.filter((a) => a !== '--compress');
  const from = positional[0];
  const to = positional[1];
  if (from === undefined || to === undefined) {
    process.stderr.write('far planning state: missing <from> <to>\n');
    return 2;
  }
  if (!STAGE_NAMES.includes(from as (typeof STAGE_NAMES)[number]) || !STAGE_NAMES.includes(to as (typeof STAGE_NAMES)[number])) {
    process.stderr.write(`far planning state: invalid stage (valid: ${STAGE_NAMES.join(', ')})\n`);
    return 2;
  }
  const result = transitionStage(from as (typeof STAGE_NAMES)[number], to as (typeof STAGE_NAMES)[number], compress ? 'compressed' : 'full');
  if (json) {
    process.stdout.write(`${JSON.stringify({ from, to, mode: compress ? 'compressed' : 'full', ok: result.ok, reason: result.reason ?? null, allowedNext: result.allowedNext })}\n`);
    return result.ok ? 0 : 7;
  }
  if (!result.ok) {
    process.stderr.write(
      `far planning state: ILLEGAL TRANSITION ${from} → ${to} (${result.reason ?? 'PROTOCOL_DEVIATION'})\n  allowed next: ${result.allowedNext.join(', ')}\n`,
    );
    return 7;
  }
  process.stdout.write(`far planning state: LEGAL TRANSITION ${from} → ${to} (${compress ? 'compressed' : 'full'} mode)\n`);
  return 0;
}

// ---------------------------------------------------------------------------
// gate 子命令
// ---------------------------------------------------------------------------

function runGate(args: readonly string[], json: boolean): number {
  const file = args[0];
  if (file === undefined) {
    process.stderr.write('far planning gate: missing <file>\n');
    return 2;
  }
  const raw = readJsonOrExit(file, 'gate');
  if (raw === undefined) return 2;

  const parsed = VerificationReportSchema.safeParse(raw);
  if (!parsed.success) {
    if (json) {
      process.stdout.write(`${JSON.stringify({ subcommand: 'gate', conclusion: 'BLOCKED', rationale: `invalid gate report: ${zodSummary(parsed.error)}` })}\n`);
    } else {
      process.stderr.write(`far planning gate: invalid gate report structure — ${zodSummary(parsed.error)}\n`);
    }
    return 7;
  }

  const report = buildGateReport(parsed.data.items, parsed.data.results);
  if (json) {
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } else {
    process.stdout.write(renderGateReport(report) + '\n');
  }

  if (report.conclusion === 'BLOCKED') return 7;
  if (report.conclusion === 'IMPLEMENTED_UNVERIFIED') return 3;
  return 0;
}

// ---------------------------------------------------------------------------
// checkpoint 子命令
// ---------------------------------------------------------------------------

function runCheckpoint(args: readonly string[], json: boolean): number {
  if (args.includes('--template')) {
    const cp = CheckpointSchema.parse({
      taskId: 'task-example',
      goal: '示例目标（≤20 词）',
      completed: ['示例：已完成 X（证据：命令输出）'],
      state: 'branch: main / commit: xxxxx / dirty: no',
      nextStep: '示例：下一步具体动作（可执行命令）',
      blockers: [],
      excludedApproaches: [],
      assumptions: [],
      valueHypothesis: '示例：预期交付什么价值给谁（可被后续证据证实/证伪）',
      successCriteria: ['示例：怎么算达成（可验收判据）'],
      evidenceGaps: [],
      unachieved: [],
    });
    if (json) {
      process.stdout.write(`${JSON.stringify(cp)}\n`);
    } else {
      process.stdout.write(renderCheckpoint(cp));
    }
    return 0;
  }

  const file = args[0];
  if (file === undefined) {
    process.stderr.write('far planning checkpoint: missing <file> or --template\n');
    return 2;
  }
  if (!existsSync(file)) {
    process.stderr.write(`far planning checkpoint: file not found: ${file}\n`);
    return 2;
  }

  const parsed = parseCheckpoint(readFileSync(file, 'utf8'));
  if (!parsed.ok) {
    process.stderr.write(`far planning checkpoint: ${parsed.error ?? 'parse failed'}\n`);
    return 7;
  }
  const next = nextStepFrom(parsed.sections);
  if (json) {
    process.stdout.write(`${JSON.stringify({ taskId: parsed.taskId ?? null, nextStep: next ?? null, sections: parsed.sections })}\n`);
    return 0;
  }
  process.stdout.write(
    `far planning checkpoint: task=${parsed.taskId ?? '?'} sections=${Object.keys(parsed.sections).join(', ')}\n  next step: ${next ?? '（无）'}\n`,
  );
  return 0;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function readJsonOrExit(file: string, sub: string): unknown | undefined {
  if (!existsSync(file)) {
    process.stderr.write(`far planning ${sub}: file not found: ${file}\n`);
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as unknown;
  } catch (error) {
    process.stderr.write(`far planning ${sub}: failed to parse JSON: ${error instanceof Error ? error.message : String(error)}\n`);
    return undefined;
  }
}

function zodSummary(error: { issues: readonly { path: readonly (string | number)[]; message: string }[] }): string {
  const first = error.issues[0];
  if (first === undefined) return 'unknown schema error';
  const path = first.path.length > 0 ? first.path.join('.') : '(root)';
  return `${path}: ${first.message}`;
}
