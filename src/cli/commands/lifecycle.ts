// src/cli/commands/lifecycle.ts
// far lifecycle —— 撤回/纠正/supersession 生命周期查询与迁移(IC-05 · PT-8)。
//
// 子命令:
//   far lifecycle state --db <path> --target-kind <k> --target-id <id>
//   far lifecycle history --db <path> --target-kind <k> --target-id <id> [--json]
//   far lifecycle transition --db <path> --target-kind <k> --target-id <id> --to <state> --actor <a> --reason <r> [--audit-ref <ref>]
//   far lifecycle verify --db <path> --target-kind <k> --target-id <id>
//
// 退出码:0 正常 / 1 非法迁移或校验失败 / 2 参数错误。
// 诚实声明:actor 是签核留痕字符串,CLI 不做身份鉴别(签核权威性属治理面,ADR-004/021)。

import Database from 'better-sqlite3';
import { runMigrations } from '../../db/migrator.ts';
import {
  applyLifecycleTransition,
  getLifecycleState,
  listLifecycleEvents,
  verifyLifecycleChain,
  LIFECYCLE_TARGET_KINDS,
  LIFECYCLE_STATES,
  type LifecycleTargetKind,
  type LifecycleState,
} from '../../evidence_log/index.ts';

interface LifecycleArgs {
  readonly sub: string;
  readonly dbPath: string;
  readonly targetKind: LifecycleTargetKind;
  readonly targetId: string;
  readonly toState: LifecycleState | null;
  readonly actor: string | null;
  readonly reason: string | null;
  readonly auditRef: string | null;
  readonly json: boolean;
}

function parseArgs(argv: readonly string[]): LifecycleArgs | { error: string } {
  const sub = argv[0] ?? '';
  if (!['state', 'history', 'transition', 'verify'].includes(sub)) {
    return { error: `unknown lifecycle subcommand '${sub}'(state|history|transition|verify)` };
  }
  let dbPath: string | null = null;
  let targetKind: string | null = null;
  let targetId: string | null = null;
  let toState: string | null = null;
  let actor: string | null = null;
  let reason: string | null = null;
  let auditRef: string | null = null;
  let json = false;
  for (let i = 1; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--db') dbPath = argv[++i] ?? null;
    else if (a === '--target-kind') targetKind = argv[++i] ?? null;
    else if (a === '--target-id') targetId = argv[++i] ?? null;
    else if (a === '--to') toState = argv[++i] ?? null;
    else if (a === '--actor') actor = argv[++i] ?? null;
    else if (a === '--reason') reason = argv[++i] ?? null;
    else if (a === '--audit-ref') auditRef = argv[++i] ?? null;
    else if (a === '--json') json = true;
    else return { error: `unknown arg '${a}'` };
  }
  if (dbPath === null) return { error: '--db <path> is required' };
  if (targetKind === null || !(LIFECYCLE_TARGET_KINDS as readonly string[]).includes(targetKind)) {
    return { error: `--target-kind must be one of ${LIFECYCLE_TARGET_KINDS.join('|')}` };
  }
  if (targetId === null) return { error: '--target-id is required' };
  if (sub === 'transition') {
    if (toState === null || !(LIFECYCLE_STATES as readonly string[]).includes(toState)) {
      return { error: `--to must be one of ${LIFECYCLE_STATES.join('|')}` };
    }
    if (actor === null) return { error: '--actor is required(签核留痕)' };
    if (reason === null) return { error: '--reason is required(墓碑化须理由)' };
  }
  return {
    sub,
    dbPath,
    targetKind: targetKind as LifecycleTargetKind,
    targetId: targetId as string,
    toState: toState as LifecycleState | null,
    actor,
    reason,
    auditRef,
    json,
  };
}
export async function runLifecycle(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if ('error' in parsed) {
    process.stderr.write(`far lifecycle: ${parsed.error}\n`);
    return 2;
  }
  const db = new Database(parsed.dbPath);
  runMigrations(db); // 幂等:新库建表,老库跳过已应用版本
  try {
    const kind = parsed.targetKind;
    const id = parsed.targetId ?? '';
    if (parsed.sub === 'state') {
      const state = getLifecycleState(db, kind, id);
      process.stdout.write(`${kind}:${id} → ${state}\n`);
      return 0;
    }
    if (parsed.sub === 'history') {
      const events = listLifecycleEvents(db, kind, id);
      if (parsed.json) {
        process.stdout.write(`${JSON.stringify(events, null, 2)}\n`);
      } else {
        const state = getLifecycleState(db, kind, id);
        process.stdout.write(`current: ${state}(${events.length} transitions)\n`);
        for (const e of events) {
          process.stdout.write(`  ${e.createdAt} ${e.fromState} → ${e.toState} actor=${e.actor} reason=${e.reason}\n`);
        }
      }
      return 0;
    }
    if (parsed.sub === 'transition') {
      try {
        const result = applyLifecycleTransition(db, {
          targetKind: kind,
          targetId: id,
          toState: parsed.toState ?? 'active',
          actor: parsed.actor ?? '',
          reason: parsed.reason ?? '',
          auditRef: parsed.auditRef,
        });
        if (result.alreadyInState) {
          process.stdout.write(`already in terminal state '${parsed.toState ?? ''}'(幂等,未重复记录)\n`);
          return 0;
        }
        process.stdout.write(`transition recorded: ${result.event?.fromState ?? '?'} → ${result.event?.toState ?? '?'} event=${result.event?.eventId ?? '?'}\n`);
        return 0;
      } catch (error) {
        process.stderr.write(`far lifecycle: ${error instanceof Error ? error.message : String(error)}\n`);
        return 1;
      }
    }
    // verify
    const chain = verifyLifecycleChain(db, kind, id);
    process.stdout.write(
      chain.ok
        ? `lifecycle chain ok(${chain.checkedCount} events)\n`
        : `lifecycle chain BROKEN at event ${chain.brokenAtEventId ?? '?'}\n`,
    );
    return chain.ok ? 0 : 1;
  } finally {
    db.close();
  }
}
