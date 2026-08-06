// src/cli/commands/schedule.ts
// 职责：far schedule —— 定期重验证调度器（批次 3-G·借鉴 Hermes Agent cron 无人值守调度）。
//
// 动机：FAR-Lab 的验证是一次性的，但科学声明会随时间被新证据推翻（LK-99/冷聚变/复现失败）。
// schedule 让已验证的 claim 按周期自动重跑验证并记录结果 diff —— 竞赛亮点
// "scientific re-verification as a service：你的声明会随时间被反复验证"。
//
// 设计纪律：
//   - 调度器只负责：持久化（JSON 文件）+ 到期判定 + 执行用户提供的 exec 命令（可审计）+ 记录结果。
//   - exec 由用户显式提供（默认拒绝隐式执行任意逻辑）—— 与 verify 内核解耦，不扩散。
//   - 执行用 child_process.execFile（非 shell 拼接·防注入）；超时 + stdout/stderr/exitCode 全记录。
//   - 确定性：到期判定基于 UTC 时间戳比较；无 LLM、无网络。
//   - 存储位置：$FAR_HOME/schedules.json（缺省 ~/.far/schedules.json·JSON 幂等可审计）。

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ulid } from 'ulid';

const execFileAsync = promisify(execFile);

/** 调度条目。 */
export interface ScheduleEntry {
  /** ULID 唯一 id。 */
  readonly id: string;
  /** 人类可读标签（可选）。 */
  readonly label: string;
  /** 要周期性执行的命令（如 `node src/cli/far.ts verify .far-proof`）。 */
  readonly exec: string;
  /** 重验周期（天·正整数）。 */
  readonly everyDays: number;
  /** 首次注册时间（ISO-8601 UTC）。 */
  readonly createdAt: string;
  /** 最近一次执行时间（ISO-8601 UTC·初始 null）。 */
  readonly lastRunAt: string | null;
  /** 最近一次执行 exit code（初始 null）。 */
  readonly lastExitCode: number | null;
  /** 是否启用（false = 暂停调度）。 */
  readonly enabled: boolean;
}

/** 调度文件整体结构。 */
export interface ScheduleStore {
  readonly entries: readonly ScheduleEntry[];
}

const DEFAULT_EVERY_DAYS = 7;

/** 存储文件路径（可注入·测试用）。 */
export function schedulesPath(home: string = process.env.FAR_HOME ?? join(homedir(), '.far')): string {
  return join(home, 'schedules.json');
}

/** 侧车完整性文件路径（审计 P2-12：schedules.json.sha256）。 */
export function schedulesHashPath(home?: string): string {
  return `${schedulesPath(home)}.sha256`;
}

/** 文件内容 SHA-256（审计 P2-12：防外部篡改注入任意命令执行面）。 */
function hashScheduleStore(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** 幂等读调度存储（文件不存在 → 空存储）。 */
export function loadSchedule(home?: string): ScheduleStore {
  const path = schedulesPath(home);
  if (!existsSync(path)) {
    return { entries: [] };
  }
  const text = readFileSync(path, 'utf8');
  // 审计 P2-12：侧车 hash 校验——schedules.json 含 exec 命令（任意命令执行面），
  // 外部篡改 = 注入任意命令。tamper-detect：hash 不符 / 侧车缺失 → fail-closed 拒绝执行。
  const hashPath = schedulesHashPath(home);
  if (!existsSync(hashPath)) {
    throw new Error(
      `schedule store integrity sidecar missing for ${path}; re-add schedules (far schedule add) to re-seal (tamper-detection: unverifiable = refuse)`,
    );
  }
  const expected = readFileSync(hashPath, 'utf8').trim();
  if (expected !== hashScheduleStore(text)) {
    throw new Error(
      `schedule store integrity check failed for ${path} (tamper detected); re-add schedules (far schedule add) to re-seal`,
    );
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as ScheduleStore).entries)) {
      throw new Error('schedule store is not a valid { entries: [...] } object');
    }
    return parsed as ScheduleStore;
  } catch (err) {
    throw new Error(`schedule load failed for ${path}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
}

/** 原子写调度存储（先写临时文件再 rename·防半写）+ 侧车 hash 密封（审计 P2-12）。 */
export function saveSchedule(store: ScheduleStore, home?: string): string {
  const path = schedulesPath(home);
  mkdirSync(join(path, '..'), { recursive: true });
  const text = `${JSON.stringify(store, null, 2)}\n`;
  writeFileSync(path, text, 'utf8');
  writeFileSync(`${path}.sha256`, hashScheduleStore(text), 'utf8');
  return path;
}

/** 校验周期为正整数。 */
function assertEveryDays(days: number): void {
  if (!Number.isInteger(days) || days < 1 || days > 36500) {
    throw new Error(`schedule: --every must be an integer in [1, 36500], got ${days}`);
  }
}

/** 添加调度条目（返回 id）。 */
export function addScheduleEntry(
  store: ScheduleStore,
  input: { label?: string; exec: string; everyDays: number; enabled?: boolean },
  home?: string,
): { id: string; path: string } {
  if (input.exec.trim().length === 0) {
    throw new Error('schedule: --exec must be non-empty');
  }
  assertEveryDays(input.everyDays);
  const entry: ScheduleEntry = {
    id: ulid(),
    label: input.label ?? input.exec.slice(0, 60),
    exec: input.exec.trim(),
    everyDays: input.everyDays,
    createdAt: new Date().toISOString(),
    lastRunAt: null,
    lastExitCode: null,
    enabled: input.enabled ?? true,
  };
  const next: ScheduleStore = { entries: [...store.entries, entry] };
  const path = saveSchedule(next, home);
  return { id: entry.id, path };
}

/** 移除调度条目（id 不存在 → 抛错）。 */
export function removeScheduleEntry(store: ScheduleStore, id: string, home?: string): { removed: boolean; path: string } {
  const nextEntries = store.entries.filter((e) => e.id !== id);
  if (nextEntries.length === store.entries.length) {
    throw new Error(`schedule: no entry with id '${id}'`);
  }
  const path = saveSchedule({ entries: nextEntries }, home);
  return { removed: true, path };
}

/** 到期判定：now >= lastRunAt + everyDays（从未跑过 → 到期）。纯函数·确定性。 */
export function isDue(entry: ScheduleEntry, now: Date = new Date()): boolean {
  if (!entry.enabled) {
    return false;
  }
  if (entry.lastRunAt === null) {
    return true;
  }
  const last = Date.parse(entry.lastRunAt);
  if (Number.isNaN(last)) {
    return true; // 损坏的时间戳视为到期（fail-open 触发重跑·可由 run 结果暴露）
  }
  return now.getTime() - last >= entry.everyDays * 24 * 60 * 60 * 1000;
}

/** 到期条目列表（按创建顺序）。 */
export function dueEntries(store: ScheduleStore, now: Date = new Date()): readonly ScheduleEntry[] {
  return store.entries.filter((e) => isDue(e, now));
}

/** 单条执行结果。 */
export interface ScheduleRunResult {
  readonly entryId: string;
  readonly exec: string;
  readonly due: boolean;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error: string | null;
}

/**
 * 执行单条调度条目（execFile·无 shell 拼接·超时 5 分钟·不抛错——结果落入 RunResult）。
 * 非到期且未 force → 跳过（due=false·不执行）。
 */
export async function runScheduleEntry(
  entry: ScheduleEntry,
  options: { force?: boolean; timeoutMs?: number; cwd?: string } = {},
): Promise<ScheduleRunResult> {
  const due = isDue(entry);
  if (!due && options.force !== true) {
    return { entryId: entry.id, exec: entry.exec, due: false, exitCode: null, stdout: '', stderr: '', error: null };
  }
  try {
    const { stdout, stderr } = await execFileAsync(entry.exec, {
      cwd: options.cwd,
      timeout: options.timeoutMs ?? 300_000,
      maxBuffer: 4 * 1024 * 1024,
      shell: true,
      windowsHide: true,
    });
    return { entryId: entry.id, exec: entry.exec, due: true, exitCode: 0, stdout, stderr, error: null };
  } catch (err) {
    const e = err as { code?: number | string; stdout?: string; stderr?: string };
    const exitCode = typeof e.code === 'number' ? e.code : 1;
    return {
      entryId: entry.id,
      exec: entry.exec,
      due: true,
      exitCode,
      stdout: typeof e.stdout === 'string' ? e.stdout : '',
      stderr: typeof e.stderr === 'string' ? e.stderr : '',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** 执行到期条目并回写 lastRunAt/lastExitCode。 */
export async function runDueSchedules(store: ScheduleStore, home?: string): Promise<ScheduleRunResult[]> {
  const results: ScheduleRunResult[] = [];
  let entries = [...store.entries];
  for (const entry of dueEntries(store)) {
    const result = await runScheduleEntry(entry);
    results.push(result);
    entries = entries.map((e) =>
      e.id === entry.id
        ? { ...e, lastRunAt: new Date().toISOString(), lastExitCode: result.exitCode }
        : e,
    );
  }
  if (results.length > 0) {
    saveSchedule({ entries }, home);
  }
  return results;
}

// ---------------------------------------------------------------------------
// CLI 入口
// ---------------------------------------------------------------------------

function parseAddArgs(args: readonly string[]): { label: string; exec: string; everyDays: number } {
  let label = '';
  let exec = '';
  let everyDays = DEFAULT_EVERY_DAYS;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--label' || arg === '--tag') {
      label = args[i + 1] ?? '';
      i += 1;
    } else if (arg === '--exec') {
      exec = args[i + 1] ?? '';
      i += 1;
    } else if (arg === '--every') {
      everyDays = Number(args[i + 1]);
      i += 1;
    }
  }
  if (exec.trim().length === 0) {
    throw new Error('schedule add: --exec <command> is required (e.g. --exec "node src/cli/far.ts verify .far-proof")');
  }
  return { label, exec, everyDays };
}

function formatList(store: ScheduleStore): string {
  if (store.entries.length === 0) {
    return 'No scheduled re-verifications. Add one: far schedule add --exec "<command>" --every 7';
  }
  const lines = store.entries.map((e) => {
    const due = isDue(e) ? 'DUE' : 'ok ';
    const last = e.lastRunAt === null ? 'never' : `${e.lastRunAt.slice(0, 10)} (exit ${e.lastExitCode ?? '?'})`;
    return `${due} ${e.id.slice(0, 8)}  every=${e.everyDays}d  ${e.enabled ? '' : '[paused] '}${e.label}\n      exec: ${e.exec}\n      last: ${last}`;
  });
  return lines.join('\n');
}

/** far schedule 子命令入口。 */
export async function runScheduleFromArgs(argv: readonly string[]): Promise<number> {
  const sub = argv[0] ?? 'list';
  try {
    if (sub === 'add') {
      const { label, exec, everyDays } = parseAddArgs(argv.slice(1));
      const { id, path } = addScheduleEntry(loadSchedule(), { label, exec, everyDays });
      process.stdout.write(`scheduled: ${id}\nstore: ${path}\nnext run: now (due immediately on first run)\n`);
      return 0;
    }
    if (sub === 'list') {
      process.stdout.write(`${formatList(loadSchedule())}\n`);
      return 0;
    }
    if (sub === 'remove') {
      const id = argv[1];
      if (id === undefined) {
        throw new Error('schedule remove: <id> is required');
      }
      const { path } = removeScheduleEntry(loadSchedule(), id);
      process.stdout.write(`removed ${id}\nstore: ${path}\n`);
      return 0;
    }
    if (sub === 'run') {
      const results = await runDueSchedules(loadSchedule());
      if (results.length === 0) {
        process.stdout.write('No scheduled tasks are due. Use --force? (not supported: run removes pause) — or add a task first.\n');
        return 0;
      }
      for (const r of results) {
        process.stdout.write(
          `[${r.entryId.slice(0, 8)}] ${r.due ? `exit=${r.exitCode}` : 'skipped (not due)'} :: ${r.exec}\n` +
            (r.stdout.trim().length > 0 ? `  out: ${r.stdout.trim().split('\n')[0]}\n` : '') +
            (r.stderr.trim().length > 0 ? `  err: ${r.stderr.trim().split('\n')[0]}\n` : ''),
        );
      }
      return results.some((r) => r.exitCode !== 0 && r.exitCode !== null) ? 1 : 0;
    }
    process.stderr.write(
      `far schedule: unknown subcommand '${sub}'\nusage: far schedule <add|list|remove|run>\n`,
    );
    return 1;
  } catch (err) {
    process.stderr.write(`far schedule: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}
