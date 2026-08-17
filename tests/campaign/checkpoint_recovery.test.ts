// tests/campaign/checkpoint_recovery.test.ts
// CAMPAIGN-CHECKPOINT-001：三层 checkpoint 的缺失验收面补齐——
//   ① 磁盘满（ENOSPC 故障注入：写前抛/写一半抛 两态，验证 fail-closed 与恢复）
//   ② 版本升级（checkpoint schemaVersion：legacy 兼容/未来版本 fail-closed/迁移注册表）
//   ③ 跨进程（campaign 台账真实双进程 SIGKILL 恢复——对既有 K1 逐阶段 SIGKILL 的战役层补位）
// 既有覆盖不重复：缓存损坏（K3/corrupt ledger/快照篡改）、kill -9 逐阶段（K1）。
// 真实依赖：appendCampaignEvent 注入 io 缝 / parseCheckpoint / runCampaignLoop 双进程真跑。

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  appendCampaignEvent,
  readCampaignEvents,
  type CampaignWriteIo,
} from '../../src/campaign/event_log.ts';
import { appendEvent, loadCampaign, saveCampaignStarted } from '../../src/campaign/store.ts';
import { CRASH_RECOVERY_DETAIL } from '../../src/campaign/scheduler.ts';
import {
  CHECKPOINT_MIGRATIONS,
  CHECKPOINT_SCHEMA_VERSION,
  migrateCheckpointPayload,
  parseCheckpoint,
} from '../../src/research/run_lifecycle.ts';
import { buildCampaignEvent } from '../../src/campaign/event_log.ts';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

function makeLedgerDir(): string {
  return mkdtempSync(join(tmpdir(), 'far-cp-'));
}

function seedStarted(dir: string): void {
  saveCampaignStarted(dir, {
    topic: 'checkpoint-recovery',
    plannedQuestions: ['q1'],
    budgetTokens: 1_000_000,
  });
}

function nextEventAfter(dir: string): ReturnType<typeof buildCampaignEvent> {
  const events = readCampaignEvents(dir);
  const tail = events.at(-1);
  assert.notEqual(tail, undefined);
  return buildCampaignEvent(
    (tail as { seq: number }).seq + 1,
    new Date().toISOString(),
    // 任意合法 payload——这里用 question_failed 占位（内容无关紧要，链形状才是）
    { type: 'question_started', index: 0, question: 'q1' },
    (tail as { eventHash: string }).eventHash,
  );
}

// ---------------------------------------------------------------------------
// ① 磁盘满（ENOSPC 故障注入，两态）
// ---------------------------------------------------------------------------

class EnospcError extends Error {
  constructor() {
    super('ENOSPC: no space left on device, write');
    this.name = 'EnospcError';
    this.cause = { code: 'ENOSPC' };
  }
}

test('CAMPAIGN-CHECKPOINT-001 磁盘满 A: 写前抛 → 错误上浮、台账原样、恢复后可继续追加', () => {
  const dir = makeLedgerDir();
  try {
    seedStarted(dir);
    const before = readCampaignEvents(dir);

    const throwBeforeWrite: CampaignWriteIo = {
      writeFileSync: () => {
        throw new EnospcError();
      },
    };
    const event = nextEventAfter(dir);
    assert.throws(
      () => appendCampaignEvent(dir, event, throwBeforeWrite),
      /ENOSPC/,
      '磁盘满必须 fail-closed 上浮，不得静默吞掉',
    );

    // 台账原样（写前抛 = 零字节落盘）
    assert.deepEqual(readCampaignEvents(dir), before);
    // 「磁盘腾空」后正常追加 → 链继续成立
    appendCampaignEvent(dir, event);
    const after = readCampaignEvents(dir);
    assert.equal(after.length, before.length + 1);
    assert.doesNotThrow(() => loadCampaign(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CAMPAIGN-CHECKPOINT-001 磁盘满 B: 写一半抛（最坏情形）→ 损坏行被 fail-closed 检出，绝不静默续链', () => {
  const dir = makeLedgerDir();
  try {
    seedStarted(dir);
    const eventsPath = join(dir, 'events.jsonl');
    const fullBefore = readFileSync(eventsPath, 'utf8');
    const event = nextEventAfter(dir);

    // 最坏情形：真写出半行 JSON（磁盘满截断）再抛
    const partialWriteThenThrow: CampaignWriteIo = {
      writeFileSync: (_path, data) => {
        const half = data.slice(0, Math.floor(data.length / 2));
        writeFileSync(eventsPath, half, 'utf8');
        throw new EnospcError();
      },
    };
    assert.throws(() => appendCampaignEvent(dir, event, partialWriteThenThrow), /ENOSPC/);

    // 半行 JSON = 损坏行 → readCampaignEvents fail-closed（不静默截断、不在坏链上续写）
    assert.throws(() => readCampaignEvents(dir), /corrupt event line/i);
    assert.throws(() => appendEvent(dir, event.payload), /corrupt/i, '坏链上拒绝追加');
    // 恢复路径 = 从完整前态回滚（DR 域职责）；回滚后链恢复有效
    writeFileSync(eventsPath, fullBefore, 'utf8');
    assert.doesNotThrow(() => loadCampaign(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// ② 版本升级（checkpoint schemaVersion）
// ---------------------------------------------------------------------------

function v1CheckpointRaw(): string {
  return JSON.stringify({
    runId: '01KZZ74P2YEEN0BTBD1V4KK9PD',
    question: 'q?',
    profile: 'competition_aliyun_qwen',
    sources: [],
    maxPerQuery: 5,
    target: 10,
    state: 'COMPLETED',
    completedStages: [],
    ctx: {},
  });
}

test('CAMPAIGN-CHECKPOINT-001 版本: legacy（无 schemaVersion）checkpoint 照常解析（向后兼容）', () => {
  const cp = parseCheckpoint(v1CheckpointRaw());
  assert.equal(cp.runId, '01KZZ74P2YEEN0BTBD1V4KK9PD');
  assert.equal(cp.state, 'COMPLETED');
});

test('CAMPAIGN-CHECKPOINT-001 版本 fail-closed: 未来版本拒读（不伪造理解）+ 非法版本拒', () => {
  const v2 = JSON.stringify({ ...JSON.parse(v1CheckpointRaw()), schemaVersion: 2 });
  assert.throws(() => parseCheckpoint(v2), /newer than supported.*migration required/i);

  for (const bad of [0, -1, 1.5, '2']) {
    const raw = JSON.stringify({ ...JSON.parse(v1CheckpointRaw()), schemaVersion: bad });
    assert.throws(() => parseCheckpoint(raw), /invalid schemaVersion/i, `schemaVersion=${String(bad)} must fail`);
  }
});

test('CAMPAIGN-CHECKPOINT-001 版本: 迁移注册表逐级确定性（当前 v1 恒等；注册表完整性）', () => {
  assert.equal(CHECKPOINT_SCHEMA_VERSION, 1);
  // v1 恒等迁移：内容不变
  const cp = JSON.parse(v1CheckpointRaw()) as Record<string, unknown>;
  const migrated = migrateCheckpointPayload(cp);
  assert.equal(migrated.runId, cp.runId);
  assert.equal(migrated.question, cp.question);
  // 注册表必须覆盖 1..(CURRENT-1) 每一级（未来升 v3 而忘注册 v2 迁移 → 此处红）
  for (let v = 1; v < CHECKPOINT_SCHEMA_VERSION; v += 1) {
    assert.ok(CHECKPOINT_MIGRATIONS[v] !== undefined, `migration ${v}->${v + 1} must be registered`);
  }
  // 当前版本 checkpoint（显式 schemaVersion:1）可解析
  const explicit = JSON.stringify({ ...JSON.parse(v1CheckpointRaw()), schemaVersion: 1 });
  assert.equal(parseCheckpoint(explicit).runId, '01KZZ74P2YEEN0BTBD1V4KK9PD');
});

// ---------------------------------------------------------------------------
// ③ 跨进程（campaign 台账真实双进程 SIGKILL 恢复）
// ---------------------------------------------------------------------------

/** 子进程脚本模板：A=创建战役+挂起执行；B=恢复循环+成功完成。永续 interval 挂起（无干净退出）。 */
function childScript(mode: 'hang' | 'recover', dir: string, storeUrl: string, schedulerUrl: string): string {
  const head =
    `import { saveCampaignStarted } from ${JSON.stringify(storeUrl)};\n` +
    `import { runCampaignLoop } from ${JSON.stringify(schedulerUrl)};\n`;
  if (mode === 'hang') {
    return (
      head +
      `await saveCampaignStarted(${JSON.stringify(dir)}, { topic: 'dual-proc', plannedQuestions: ['q1'], budgetTokens: 1000000 });\n` +
      `console.log('campaign-created');\n` +
      `await runCampaignLoop({ dir: ${JSON.stringify(dir)}, runQuestion: async () => { console.log('q-started'); return await new Promise(() => {}); } });\n` +
      `setInterval(() => {}, 1 << 30);\n`
    );
  }
  return (
    head +
    `const state = await runCampaignLoop({ dir: ${JSON.stringify(dir)}, runQuestion: async (q) => ({ runId: 'recovered-run', tokens: 42, status: 'OK' }) });\n` +
    `console.log('RECOVERED:' + JSON.stringify({ status: state.questions[0].status, tokens: state.cumulativeTokens }));\n`
  );
}

test('CAMPAIGN-CHECKPOINT-001 跨进程: 进程 A 挂起被 SIGKILL → 进程 B 从台账恢复补记并完成', { timeout: 60_000 }, async () => {
  const dir = makeLedgerDir();
  const dirArg = dir.replace(/\\/g, '/');
  try {
    const storeUrl = new URL('src/campaign/store.ts', pathToUrl(REPO_ROOT)).href;
    const schedulerUrl = new URL('src/campaign/scheduler.ts', pathToUrl(REPO_ROOT)).href;

    // 进程 A：建战役 → 启动问题 → 挂起（永续 interval，只可能被 SIGKILL）
    const scriptA = join(dir, 'childA.mjs');
    writeFileSync(scriptA, childScript('hang', dirArg, storeUrl, schedulerUrl), 'utf8');
    const childA = spawn(process.execPath, [scriptA], { stdio: ['ignore', 'pipe', 'pipe'] });
    const sawQStarted = await waitForLine(childA, 'q-started', 20_000);
    assert.ok(sawQStarted, '进程 A 须启动问题执行（q-started 信号）');
    const exitedA = new Promise<void>((resolve) => childA.once('exit', () => resolve()));
    childA.kill('SIGKILL');
    await exitedA;
    // kill 后台账处于「running 残留」态（question_started 无终态）
    const mid = loadCampaign(dir);
    assert.equal(mid.state.questions[0]?.status, 'running');

    // 进程 B：同目录恢复——崩溃协议补记 question_failed(crash-recovered) + 重试一次 → OK
    const scriptB = join(dir, 'childB.mjs');
    writeFileSync(scriptB, childScript('recover', dirArg, storeUrl, schedulerUrl), 'utf8');
    const childB = spawn(process.execPath, [scriptB], { stdio: ['ignore', 'pipe', 'pipe'] });
    const recovered = await waitForLine(childB, 'RECOVERED:', 30_000);
    assert.ok(recovered !== null, '进程 B 须完成恢复并输出终态');
    const exitB = await new Promise<number | null>((resolve) => childB.once('exit', (c) => resolve(c)));
    assert.equal(exitB, 0, '进程 B 须干净退出');

    // 台账终局断言：崩溃补记在场 + 问题 OK + 链完整 + campaign_completed
    const final = loadCampaign(dir); // 验链内含
    assert.equal(final.state.questions[0]?.status, 'OK');
    assert.ok(
      final.events.some(
        (e) => e.payload.type === 'question_failed' && e.payload.detail === CRASH_RECOVERY_DETAIL,
      ),
      '崩溃补记事件（crash-recovered）必须在账',
    );
    assert.ok(final.events.some((e) => e.payload.type === 'campaign_completed'));
    assert.ok(final.state.cumulativeTokens >= 42);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function pathToUrl(root: string): string {
  const withSlash = root.endsWith('/') ? root : `${root}/`;
  return `file:///${withSlash.replace(/^\//, '').replace(/\\/g, '/')}`;
}

interface ChildLike {
  stdout: NodeJS.ReadableStream;
  stderr?: NodeJS.ReadableStream;
}

function waitForLine(child: ChildLike, needle: string, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    let buffer = '';
    let errTail = '';
    const timer = setTimeout(() => resolve(null), timeoutMs);
    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString('utf8');
      if (buffer.includes(needle)) {
        clearTimeout(timer);
        resolve(needle);
      }
    };
    child.stdout.on('data', onData);
    child.stderr?.on('data', (chunk: Buffer) => {
      errTail += chunk.toString('utf8');
    });
    child.stdout.on('end', () => {
      clearTimeout(timer);
      if (buffer.includes(needle)) resolve(needle);
      else resolve(null);
      if (errTail.trim().length > 0) console.error(`[child stderr] ${errTail.slice(0, 800)}`);
    });
  });
}
