// src/cli/commands/governance.ts
// 职责：`far governance <subcommand>` —— Unknown/Assumption 登记机器层 CLI
// （宪法 GOV-UNKNOWN-001 / GOV-REOPEN-001 的登记 + reopen 账目操作面）。
//
// 子命令（引擎为 src/governance/unknown_registry.ts 纯函数；本文件只做 IO 边界）：
//   lint [--registry <yaml>] [--known <ids-file>]   登记完整性门（violation → exit 7）
//   stale [--registry <yaml>] [--today <date>]      过期假设 + 结论降级面（命中 → exit 7）
//   trigger <event-json> [--registry <yaml>] [--log <jsonl>] [--dry-run]
//                                                   应用 reopen 触发器：转换登记 + 追加不可变账目
//
// 登记默认 `.far/state/UNKNOWN_REGISTRY.yaml`（私有治理层·gitignored）；账目默认
// `.far/state/REOPEN_LOG.jsonl`。源缺失 exit 3 fail-closed（与 requirements_compile 同语义——
// 禁止静默回退到任何替代源）。
// 退出码：0 = 通过/已应用 / 7 = 门禁失败或状态转换非法 / 2 = 用法错误 / 3 = 源缺失。

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { PACKAGE_ROOT } from '../paths.ts';
import {
  appendReopenLog,
  applyTrigger,
  degradedConclusions,
  findStaleAssumptions,
  lintRegistry,
} from '../../governance/unknown_registry.ts';
import { GovernanceRegistrySchema } from '../../governance/types.ts';
import type { ReopenEvent, TriggerEvent } from '../../governance/types.ts';

const DEFAULT_REGISTRY = join(PACKAGE_ROOT, '.far', 'state', 'UNKNOWN_REGISTRY.yaml');
const DEFAULT_LOG = join(PACKAGE_ROOT, '.far', 'state', 'REOPEN_LOG.jsonl');

const USAGE = `far governance <lint|stale|trigger> [options]

  lint [--registry <yaml>] [--known <ids-file>]
      validate the Unknown/Assumption registry (zod SSOT + reference integrity).
      --known: plain-text file, one known decision/requirement/claim id per line;
      when provided, dangling references are violations.
  stale [--registry <yaml>] [--today <YYYY-MM-DD>]
      report overdue ACTIVE assumptions and the conclusions they degrade
      (today defaults to the system date).
  trigger <event-json> [--registry <yaml>] [--log <jsonl>] [--dry-run]
      apply a reopen trigger; event-json shape:
        {"trigger":"invalidated_assumption","at":"YYYY-MM-DD","assumptionId":"ASM-x","reason":"..."}
        {"trigger":"new_evidence","at":"YYYY-MM-DD","unknownId":"UNK-x","resolutionEvidence":["..."]}
        {"trigger":"regression|changed_requirement|benchmark_fcs_shift|dependency_security_event|architecture_schema_change|correction_retraction|reproducibility_failure",
         "at":"YYYY-MM-DD","subjectIds":["..."],"causeRef":"...","reason":"..."}
      writes the updated registry and appends immutable events to the reopen log
      unless --dry-run.

exit codes: 0 ok / 7 gate fail or illegal transition / 2 usage / 3 registry source missing`;

/** 用户提供的路径：绝对 → 原样；相对 → 相对 CWD 解析。 */
function resolvePath(p: string): string {
  return isAbsolute(p) ? p : join(process.cwd(), p);
}

/** 读取 + zod 校验登记；缺失/不合法 → 不抛，返回 error exit code 语义由调用方处理。 */
function loadRegistry(path: string): { ok: true; registry: ReturnType<typeof GovernanceRegistrySchema.parse> } | { ok: false; code: 3 | 7; message: string } {
  if (!existsSync(path)) {
    return { ok: false, code: 3, message: `registry source missing: ${path} (fail-closed; no silent fallback)` };
  }
  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(path, 'utf8'));
  } catch (exc) {
    return { ok: false, code: 7, message: `registry is not valid YAML: ${(exc as Error).message}` };
  }
  const parsed = GovernanceRegistrySchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return { ok: false, code: 7, message: `registry violates schema SSOT — ${issues}` };
  }
  return { ok: true, registry: parsed.data };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 读 reopen 账目（缺失 = 空账目；坏行 fail-closed）。 */
function loadLog(path: string): { ok: true; events: ReopenEvent[] } | { ok: false; message: string } {
  if (!existsSync(path)) return { ok: true, events: [] };
  const events: ReopenEvent[] = [];
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '');
  for (const line of lines) {
    try {
      events.push(JSON.parse(line) as ReopenEvent);
    } catch {
      return { ok: false, message: `reopen log has a corrupt line (append-only integrity broken): ${line.slice(0, 80)}` };
    }
  }
  return { ok: true, events };
}

/** far governance 命令总入口。argv = 子命令名 + 参数。--json 任意位置启用机器可读输出。 */
export function runGovernanceFromArgs(argv: readonly string[]): number {
  const sub = argv[0];
  if (sub === undefined || sub === '--help' || sub === '-h') {
    process.stdout.write(USAGE + '\n');
    return sub === undefined ? 2 : 0;
  }
  const json = argv.includes('--json');
  switch (sub) {
    case 'lint':
      return runLint(argv.slice(1), json);
    case 'stale':
      return runStale(argv.slice(1), json);
    case 'trigger':
      return runTrigger(argv.slice(1), json);
    default:
      process.stderr.write(`far governance: unknown subcommand '${sub}'\n\n${USAGE}\n`);
      return 2;
  }
}

function optionValue(args: readonly string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : undefined;
}

function runLint(args: readonly string[], json: boolean): number {
  const registryPathRaw = optionValue(args, '--registry');
  const registryPath = registryPathRaw === undefined ? DEFAULT_REGISTRY : resolvePath(registryPathRaw);
  const knownPath = optionValue(args, '--known');
  const loaded = loadRegistry(registryPath);
  if (!loaded.ok) {
    process.stderr.write(`far governance lint: FAIL — ${loaded.message}\n`);
    return loaded.code;
  }
  let knownItemIds: string[] | undefined;
  if (knownPath !== undefined) {
    if (!existsSync(knownPath)) {
      process.stderr.write(`far governance lint: FAIL — known-item file missing: ${knownPath}\n`);
      return 2;
    }
    knownItemIds = readFileSync(knownPath, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
  }
  const violations = lintRegistry(loaded.registry, { knownItemIds });
  if (json) {
    process.stdout.write(JSON.stringify({ violations, count: violations.length }) + '\n');
  } else if (violations.length === 0) {
    const n = loaded.registry.unknowns.length;
    const a = loaded.registry.assumptions.length;
    process.stdout.write(`governance lint: PASS — ${n} unknown(s), ${a} assumption(s), 0 violation(s)\n`);
  } else {
    process.stdout.write(`governance lint: FAIL — ${violations.length} violation(s)\n`);
    for (const v of violations) {
      process.stdout.write(`  [${v.rule}] ${v.entryId}: ${v.detail}\n`);
    }
  }
  return violations.length === 0 ? 0 : 7;
}

function runStale(args: readonly string[], json: boolean): number {
  const registryPathRaw = optionValue(args, '--registry');
  const registryPath = registryPathRaw === undefined ? DEFAULT_REGISTRY : resolvePath(registryPathRaw);
  const today = optionValue(args, '--today') ?? todayIso();
  const loaded = loadRegistry(registryPath);
  if (!loaded.ok) {
    process.stderr.write(`far governance stale: FAIL — ${loaded.message}\n`);
    return loaded.code;
  }
  const stale = findStaleAssumptions(loaded.registry, today);
  const degraded = degradedConclusions(loaded.registry, today);
  if (json) {
    process.stdout.write(JSON.stringify({ today, stale, degraded }) + '\n');
  } else {
    process.stdout.write(`governance stale @ ${today}: ${stale.length} stale assumption(s), ${degraded.length} degraded conclusion(s)\n`);
    for (const s of stale) {
      process.stdout.write(`  STALE ${s.id} (reviewDate ${s.reviewDate}, ${s.daysOverdue} day(s) overdue)\n`);
    }
    for (const d of degraded) {
      process.stdout.write(`  DEGRADED ${d.decisionId} <- ${d.assumptionId} (${d.cause})\n`);
    }
  }
  return stale.length === 0 && degraded.length === 0 ? 0 : 7;
}

function runTrigger(args: readonly string[], json: boolean): number {
  const positional = args.filter((a) => !a.startsWith('--'));
  const eventJson = positional[0];
  if (eventJson === undefined) {
    process.stderr.write('far governance trigger: usage — far governance trigger <event-json> [--dry-run]\n');
    return 2;
  }
  let event: TriggerEvent;
  try {
    event = JSON.parse(eventJson) as TriggerEvent;
  } catch (exc) {
    process.stderr.write(`far governance trigger: event-json is not valid JSON — ${(exc as Error).message}\n`);
    return 2;
  }
  const registryPathRaw = optionValue(args, '--registry');
  const registryPath = registryPathRaw === undefined ? DEFAULT_REGISTRY : resolvePath(registryPathRaw);
  const logPath = optionValue(args, '--log') ?? DEFAULT_LOG;
  const dryRun = args.includes('--dry-run');

  const loaded = loadRegistry(registryPath);
  if (!loaded.ok) {
    process.stderr.write(`far governance trigger: FAIL — ${loaded.message}\n`);
    return loaded.code;
  }
  const logLoaded = loadLog(logPath);
  if (!logLoaded.ok) {
    process.stderr.write(`far governance trigger: FAIL — ${logLoaded.message}\n`);
    return 7;
  }

  let outcome;
  try {
    outcome = applyTrigger(loaded.registry, event, logLoaded.events.length);
  } catch (exc) {
    process.stderr.write(`far governance trigger: FAIL — illegal transition: ${(exc as Error).message}\n`);
    return 7;
  }

  const grownLog = appendReopenLog(logLoaded.events, outcome.events);
  if (!dryRun) {
    writeFileSync(registryPath, stringifyYaml(outcome.registry), 'utf8');
    writeFileSync(logPath, grownLog.map((e) => JSON.stringify(e)).join('\n') + (grownLog.length > 0 ? '\n' : ''), 'utf8');
  }
  if (json) {
    process.stdout.write(JSON.stringify({ applied: !dryRun, events: outcome.events }) + '\n');
  } else {
    process.stdout.write(`governance trigger: ${event.trigger} applied${dryRun ? ' (dry-run)' : ''} — ${outcome.events.length} event(s)\n`);
    for (const e of outcome.events) {
      process.stdout.write(`  #${e.seq} [${e.kind}/${e.via}/d${e.chainDepth}] ${e.subjectId} <- ${e.causeRef} (${e.trigger})\n`);
    }
    if (!dryRun) {
      process.stdout.write(`  registry: ${registryPath}\n  reopen log: ${logPath} (${grownLog.length} entries)\n`);
    }
  }
  return 0;
}
