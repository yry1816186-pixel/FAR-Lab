/**
 * schedule.test.ts —— 定期重验证调度器（批次 3-G·借鉴 Hermes cron）。
 *
 * 覆盖：
 *   1. add/list/remove 持久化（临时目录·JSON 往返）。
 *   2. 到期判定 isDue：从未跑过 → 到期；lastRunAt + everyDays 内 → 未到期；禁用 → 永不到期。
 *   3. 周期边界：恰好 everyDays 后到期。
 *   4. 参数校验：--every 非法值抛错；--exec 空抛错。
 *   5. runScheduleEntry 执行真实命令（node --version）并回写 lastRunAt/exitCode。
 *   6. runDueSchedules 只跑到期条目 + 回写存储。
 *   7. exec 失败 → exitCode 非 0 + error 记录（不抛错）。
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addScheduleEntry,
  dueEntries,
  isDue,
  loadSchedule,
  removeScheduleEntry,
  runDueSchedules,
  runScheduleEntry,
  schedulesPath,
  type ScheduleEntry,
} from '../../src/cli/commands/schedule.ts';

function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'far-schedule-test-'));
  return dir;
}

function makeEntry(overrides: Partial<ScheduleEntry> = {}): ScheduleEntry {
  return {
    id: 'test-entry-1',
    label: 'reverify claim',
    exec: 'node --version',
    everyDays: 7,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastRunAt: null,
    lastExitCode: null,
    enabled: true,
    ...overrides,
  };
}

test('add → load round-trip persists to schedules.json', () => {
  const home = tempHome();
  try {
    const { id } = addScheduleEntry(loadSchedule(home), { exec: 'node --version', everyDays: 3, label: 'weekly' }, home);
    assert.ok(id.length > 0);
    const loaded = loadSchedule(home);
    assert.equal(loaded.entries.length, 1);
    assert.equal(loaded.entries[0]!.label, 'weekly');
    assert.equal(loaded.entries[0]!.exec, 'node --version');
    assert.equal(loaded.entries[0]!.everyDays, 3);
    assert.ok(schedulesPath(home).endsWith('schedules.json'));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('remove deletes entry; unknown id throws', () => {
  const home = tempHome();
  try {
    const { id } = addScheduleEntry(loadSchedule(home), { exec: 'echo hi', everyDays: 1 }, home);
    const { removed } = removeScheduleEntry(loadSchedule(home), id, home);
    assert.equal(removed, true);
    assert.equal(loadSchedule(home).entries.length, 0);
    assert.throws(() => removeScheduleEntry(loadSchedule(home), 'nope', home), /no entry/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('isDue: never-run → due; within period → not due; disabled → never due', () => {
  const now = new Date('2026-02-01T00:00:00.000Z');
  const neverRun = makeEntry();
  assert.equal(isDue(neverRun, now), true, 'never-run entry is due');

  const ran = makeEntry({ lastRunAt: '2026-01-29T00:00:00.000Z' });
  assert.equal(isDue(ran, now), false, 'within 7-day window not due');

  const disabled = makeEntry({ lastRunAt: '2026-01-01T00:00:00.000Z', enabled: false });
  assert.equal(isDue(disabled, now), false, 'disabled entry never due');
});

test('isDue boundary: exactly everyDays later is due', () => {
  const now = new Date('2026-02-05T00:00:00.000Z');
  const ran = makeEntry({ lastRunAt: '2026-01-29T00:00:00.000Z', everyDays: 7 });
  assert.equal(isDue(ran, now), true, 'exactly 7 days later → due');
});

test('dueEntries filters by deadline and order', () => {
  const store = {
    entries: [
      makeEntry({ id: 'a', lastRunAt: null }),
      makeEntry({ id: 'b', lastRunAt: '2026-01-29T00:00:00.000Z', everyDays: 7 }),
      makeEntry({ id: 'c', lastRunAt: '2026-01-01T00:00:00.000Z', enabled: false }),
    ],
  };
  const now = new Date('2026-02-05T00:00:00.000Z');
  const due = dueEntries(store, now).map((e) => e.id);
  assert.deepEqual(due, ['a', 'b']);
});

test('parameter validation: empty exec throws; invalid everyDays throws', () => {
  assert.throws(() => addScheduleEntry({ entries: [] }, { exec: '   ', everyDays: 1 }), /--exec/);
  assert.throws(() => addScheduleEntry({ entries: [] }, { exec: 'echo x', everyDays: 0 }), /\[1, 36500\]/);
  assert.throws(() => addScheduleEntry({ entries: [] }, { exec: 'echo x', everyDays: 1.5 }), /\[1, 36500\]/);
});

test('runScheduleEntry executes real command and returns exit code', async () => {
  const entry = makeEntry(); // due (never run)
  const result = await runScheduleEntry(entry, { cwd: join(tmpdir()) });
  assert.equal(result.due, true);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /^v\d+\.\d+\.\d+/);
  assert.equal(result.error, null);
});

test('runScheduleEntry skips when not due unless force', async () => {
  const entry = makeEntry({ lastRunAt: new Date().toISOString(), everyDays: 7 });
  const skipped = await runScheduleEntry(entry);
  assert.equal(skipped.due, false);
  assert.equal(skipped.exitCode, null);
  assert.equal(skipped.stdout, '');
});

test('runScheduleEntry captures failure exit code and error without throwing', async () => {
  const entry = makeEntry({ exec: 'node -e "process.exit(3)"' });
  const result = await runScheduleEntry(entry);
  assert.equal(result.due, true);
  assert.equal(result.exitCode, 3);
  assert.ok(result.error !== null, 'failed command records error message');
});

test('runDueSchedules executes only due entries and writes back lastRunAt', async () => {
  const home = tempHome();
  try {
    addScheduleEntry(loadSchedule(home), { exec: 'node --version', everyDays: 1 }, home);
    addScheduleEntry(
      loadSchedule(home),
      { exec: 'node --version', everyDays: 7, label: 'fresh' },
      home,
    );
    // 两个都是 never-run → 都 due
    const results = await runDueSchedules(loadSchedule(home), home);
    assert.equal(results.length, 2);
    const stored = loadSchedule(home);
    assert.ok(stored.entries.every((e) => e.lastRunAt !== null), 'lastRunAt written back');
    assert.ok(stored.entries.every((e) => e.lastExitCode === 0));
    // 再次 run → 未到期（同一天内）→ 无执行
    const second = await runDueSchedules(loadSchedule(home), home);
    assert.equal(second.length, 0);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('篡改检测：外部改写 schedules.json 后 loadSchedule 拒绝（P2-12）', () => {
  const home = tempHome();
  try {
    addScheduleEntry(loadSchedule(home), { exec: 'node --version', everyDays: 3 }, home);
    const path = schedulesPath(home);
    // 模拟外部篡改：把 exec 换成任意命令。
    const text = JSON.stringify({ entries: [{ id: 'evil', label: 'x', exec: 'rm -rf /', everyDays: 1, createdAt: '2026-01-01T00:00:00.000Z', lastRunAt: null, lastExitCode: null, enabled: true }] }, null, 2);
    writeFileSync(path, text, 'utf8');
    assert.throws(() => loadSchedule(home), /integrity check failed|tamper/, '篡改必须被拒绝（fail-closed·不执行任意命令）');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('无侧车 hash 文件：fail-closed 拒绝（P2-12）', () => {
  const home = tempHome();
  try {
    addScheduleEntry(loadSchedule(home), { exec: 'node --version', everyDays: 3 }, home);
    // 删除侧车文件 → 不可验证 → 拒绝。
    rmSync(`${schedulesPath(home)}.sha256`, { force: true });
    assert.throws(() => loadSchedule(home), /sidecar|integrity/, '无侧车必须拒绝（不可验证 = 不执行）');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
