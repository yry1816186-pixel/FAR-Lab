/**
 * scheduler.test.ts — 战役循环执行器 + 存储门面（night-r7 S2）。
 *
 * 全部用注入的 fake runQuestion 与固定时钟（确定性）；台账经 REAL event_log
 * 函数构建与校验（sibling 契约）。零网络、零真实 LLM。
 *
 * 已知契约依赖（若 sibling 实现有出入，此处会 fail-visibly 供 coordinator 对齐）：
 *   - payload 以 `type` 字段判别（tagged union）；
 *   - guardian 停机公式按「cumulativeTokens + ESTIMATED_PER_QUESTION_TOKENS(300k)
 *     > budgetTokens 则不再开始下一题」理解（预算测试 budget=500k / q1=300k
 *     恰为一次估算 —— 若 sibling 公式不同，仅该测试需要调参）；
 *   - 台账文件为目录内唯一 .jsonl（篡改测试据此定位文件）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import {
  appendEvent,
  campaignDir,
  CAMPAIGNS_ROOT,
  CorruptCampaignLedgerError,
  loadCampaign,
  newCampaignId,
  saveCampaignStarted,
} from '../../src/campaign/store.ts';
import {
  classifyErrorKind,
  lastStopReason,
  runCampaignLoop,
  type RunQuestion,
  type RunQuestionOutcome,
} from '../../src/campaign/scheduler.ts';
import { readCampaignEvents, verifyCampaignEventChain } from '../../src/campaign/event_log.ts';
import type { CampaignEvent, CampaignEventPayload } from '../../src/campaign/types.ts';

const NOW = () => new Date('2026-08-16T12:00:00.000Z');
const TOPIC = 'dark energy campaign test';
const QUESTIONS = ['what is dark energy?', 'is it a cosmological constant?', 'how is w measured?'];
const HUGE_BUDGET = 100_000_000;

function tmpDir(label: string): string {
  return mkdtempSync(join(tmpdir(), `far-campaign-${label}-`));
}

function startCampaign(
  label: string,
  opts?: { budget?: number; questions?: string[] },
): string {
  const dir = tmpDir(label);
  saveCampaignStarted(dir, {
    topic: TOPIC,
    plannedQuestions: opts?.questions ?? QUESTIONS,
    budgetTokens: opts?.budget ?? HUGE_BUDGET,
    now: NOW,
  });
  return dir;
}

function okOutcome(i: number, tokens: number): RunQuestionOutcome {
  return { runId: `run-${i}`, tokens, status: 'OK' };
}

/** 按问题脚本化的 fake 执行器：记录调用顺序；Error = 该题抛错。 */
function scriptedRun(
  plan: ReadonlyArray<{ question: string; result: RunQuestionOutcome | Error }>,
): { run: RunQuestion; calls: string[] } {
  const calls: string[] = [];
  const run: RunQuestion = async (question) => {
    calls.push(question);
    const step = plan.find((p) => p.question === question);
    if (step === undefined) throw new Error(`fake: unexpected question "${question}"`);
    if (step.result instanceof Error) throw step.result;
    return step.result;
  };
  return { run, calls };
}

function planAll(tokens: number): Array<{ question: string; result: RunQuestionOutcome }> {
  return QUESTIONS.map((q, i) => ({ question: q, result: okOutcome(i, tokens) }));
}

function payloadOf<T extends CampaignEventPayload['type']>(
  events: readonly CampaignEvent[],
  type: T,
): Extract<CampaignEventPayload, { type: T }> {
  const ev = events.find((e) => e.payload.type === type);
  assert.ok(ev, `event ${type} not found in ledger`);
  return ev.payload as Extract<CampaignEventPayload, { type: T }>;
}

function payloadsOf<T extends CampaignEventPayload['type']>(
  events: readonly CampaignEvent[],
  type: T,
): Array<Extract<CampaignEventPayload, { type: T }>> {
  return events
    .filter((e) => e.payload.type === type)
    .map((e) => e.payload as Extract<CampaignEventPayload, { type: T }>);
}

function eventsOf(dir: string): CampaignEvent[] {
  return readCampaignEvents(dir);
}

/** 定位台账文件（目录内唯一 .jsonl；否则唯一文件）。 */
function ledgerPath(dir: string): string {
  const names = readdirSync(dir);
  const jsonl = names.find((n) => n.endsWith('.jsonl'));
  if (jsonl !== undefined) return join(dir, jsonl);
  assert.equal(names.length, 1, `expected exactly one ledger file in ${dir}, got: ${names.join(',')}`);
  return join(dir, names[0]!);
}

/** 篡改：改写首事件 payload 但不重算 eventHash —— 链校验必须能发现。 */
function tamperFirstPayload(dir: string): void {
  const path = ledgerPath(dir);
  const lines = readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  const first = JSON.parse(lines[0]!) as { payload: { topic?: string } };
  assert.ok(first.payload.topic !== undefined, 'first event must be campaign_started (payload.topic)');
  first.payload.topic = `${first.payload.topic} (tampered)`;
  lines[0] = JSON.stringify(first);
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8');
}

function assertChainIntegral(dir: string): CampaignEvent[] {
  const events = eventsOf(dir);
  events.forEach((e, i) => assert.equal(e.seq, i + 1, `seq must be contiguous 1..n (got break at ${i})`));
  for (let i = 1; i < events.length; i += 1) {
    assert.equal(
      events[i]!.prevEventHash,
      events[i - 1]!.eventHash,
      `prevEventHash linkage broken at seq ${events[i]!.seq}`,
    );
  }
  const chain = verifyCampaignEventChain(events);
  assert.ok(chain.valid, `real verifyCampaignEventChain must accept: ${chain.reason ?? ''}`);
  return events;
}

// ---------------------------------------------------------------- store ---

test('newCampaignId: UTC stamp format, slug rules, determinism', () => {
  const t = new Date(Date.UTC(2026, 7, 16, 9, 30, 5)); // 2026-08-16 09:30:05 UTC
  assert.equal(newCampaignId('Is Dark Energy Real?', t), 'cmp-20260816-093005-is-dark');
  assert.match(newCampaignId(TOPIC, t), /^cmp-\d{8}-\d{6}-[a-z0-9-]{1,8}$/);
  // 确定性：同 topic 同钟 → 同 ID
  assert.equal(newCampaignId(TOPIC, t), newCampaignId(TOPIC, t));
  // 非 ascii topic：仅 ascii-alnum 存活；全无 → 回退 'topic'
  assert.equal(newCampaignId('暗能量 42', t), 'cmp-20260816-093005-42');
  assert.equal(newCampaignId('暗能量', t), 'cmp-20260816-093005-topic');
  // 目录约定（产物必须落 .far/ 下）
  assert.equal(CAMPAIGNS_ROOT, '.far/campaigns');
  assert.equal(campaignDir('cmp-x'), join('.far/campaigns', 'cmp-x'));
});

test('saveCampaignStarted + loadCampaign roundtrip: one event, all pending, campaignId from basename', () => {
  const dir = startCampaign('roundtrip');
  try {
    const { events, state } = loadCampaign(dir);
    assert.equal(events.length, 1);
    const started = payloadOf(events, 'campaign_started');
    assert.equal(started.topic, TOPIC);
    assert.deepEqual(started.plannedQuestions, QUESTIONS);
    assert.equal(started.budgetTokens, HUGE_BUDGET);
    assert.equal(events[0]!.seq, 1);
    assert.equal(events[0]!.prevEventHash, '');
    assert.equal(state.campaignId, basename(dir), 'campaignId must come from directory name');
    assert.equal(state.topic, TOPIC);
    assert.equal(state.budgetTokens, HUGE_BUDGET);
    assert.equal(state.cumulativeTokens, 0);
    assert.equal(state.breakerTripped, false);
    assert.equal(state.completed, false);
    assert.deepEqual(
      state.questions.map((q) => q.status),
      ['pending', 'pending', 'pending'],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('saveCampaignStarted: refuses to start twice (fail-closed idempotency guard)', () => {
  const dir = startCampaign('twice');
  try {
    assert.throws(
      () =>
        saveCampaignStarted(dir, {
          topic: TOPIC,
          plannedQuestions: QUESTIONS,
          budgetTokens: 1,
          now: NOW,
        }),
      /refusing to start a campaign twice/,
    );
    assert.equal(eventsOf(dir).length, 1, 'ledger unchanged after refused second start');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('appendEvent: seq contiguity + prevEventHash linkage + real chain verification', () => {
  const dir = startCampaign('append');
  try {
    appendEvent(dir, { type: 'question_started', index: 0, question: QUESTIONS[0]! }, NOW);
    appendEvent(
      dir,
      { type: 'question_completed', index: 0, question: QUESTIONS[0]!, runId: 'r0', tokens: 1234, status: 'OK' },
      NOW,
    );
    const events = assertChainIntegral(dir);
    assert.equal(events.length, 3);
    const state = loadCampaign(dir).state;
    assert.equal(state.questions[0]!.status, 'OK');
    assert.equal(state.cumulativeTokens, 1234);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('appendEvent: refuses to append onto a tampered ledger (typed error)', () => {
  const dir = startCampaign('tamper-append');
  try {
    tamperFirstPayload(dir);
    assert.throws(
      () => appendEvent(dir, { type: 'question_started', index: 0, question: 'x' }, NOW),
      (err) => err instanceof CorruptCampaignLedgerError,
    );
    assert.equal(eventsOf(dir).length, 1, 'tampered ledger must not grow');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadCampaign: empty ledger → typed fail-closed error', () => {
  const dir = tmpDir('empty');
  try {
    assert.throws(
      () => loadCampaign(dir),
      (err) =>
        err instanceof CorruptCampaignLedgerError &&
        err.firstBrokenIndex === null &&
        err.reason !== null && err.reason.includes('empty'),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------ scheduler ---

test('runCampaignLoop happy path: 3 questions complete, token accumulation, single campaign_completed', async () => {
  const dir = startCampaign('happy');
  try {
    const { run, calls } = scriptedRun(planAll(1000));
    const final = await runCampaignLoop({ dir, runQuestion: run, now: NOW });
    assert.deepEqual(calls, QUESTIONS, 'questions must run in planned order');
    assert.deepEqual(
      final.questions.map((q) => q.status),
      ['OK', 'OK', 'OK'],
    );
    assert.equal(final.cumulativeTokens, 3000);
    assert.equal(final.completed, true);
    const events = assertChainIntegral(dir);
    // 1 started + 3*(started+completed) + 1 campaign_completed = 8
    assert.equal(events.length, 8);
    const done = payloadOf(events, 'campaign_completed');
    assert.deepEqual(
      [done.completedCount, done.failedCount, done.totalTokens],
      [3, 0, 3000],
    );
    assert.equal(events.filter((e) => e.payload.type === 'campaign_completed').length, 1);
    assert.equal(lastStopReason(events), 'completed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('question isolation: q2 throws unknown error → q1/q3 still complete, campaign completes with failedCount=1', async () => {
  const dir = startCampaign('isolation');
  try {
    const plan = [
      { question: QUESTIONS[0]!, result: okOutcome(0, 1000) },
      { question: QUESTIONS[1]!, result: new Error('boom: pipeline exploded') },
      { question: QUESTIONS[2]!, result: okOutcome(2, 3000) },
    ];
    const { run, calls } = scriptedRun(plan);
    const final = await runCampaignLoop({ dir, runQuestion: run, now: NOW });
    assert.deepEqual(calls, QUESTIONS, 'one failure must not kill the loop');
    assert.deepEqual(
      final.questions.map((q) => q.status),
      ['OK', 'failed', 'OK'],
    );
    assert.equal(final.completed, true);
    assert.equal(final.cumulativeTokens, 4000, 'failed question contributes no tokens');
    const failed = payloadOf(eventsOf(dir), 'question_failed');
    assert.equal(failed.errorKind, 'unknown');
    assert.equal(failed.index, 1);
    assert.match(failed.detail, /boom: pipeline exploded/);
    const done = payloadOf(eventsOf(dir), 'campaign_completed');
    assert.deepEqual([done.completedCount, done.failedCount], [2, 1]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rate_limited: q2 hits 429 → loop stops honestly, q3 stays pending, lastStopReason=rate_limit', async () => {
  const dir = startCampaign('rate');
  try {
    const plan = [
      { question: QUESTIONS[0]!, result: okOutcome(0, 1000) },
      { question: QUESTIONS[1]!, result: new Error('HTTP 429: rate limit exceeded') },
      { question: QUESTIONS[2]!, result: okOutcome(2, 1000) },
    ];
    const { run, calls } = scriptedRun(plan);
    const final = await runCampaignLoop({ dir, runQuestion: run, now: NOW });
    assert.deepEqual(calls, QUESTIONS.slice(0, 2), 'loop must stop at the rate-limited question');
    assert.deepEqual(
      final.questions.map((q) => q.status),
      ['OK', 'failed', 'pending'],
    );
    assert.equal(final.completed, false);
    const events = eventsOf(dir);
    assert.equal(events.filter((e) => e.payload.type === 'campaign_completed').length, 0);
    assert.equal(events.filter((e) => e.payload.type === 'budget_breaker_tripped').length, 0,
      'rate limiting is not budget — no breaker event');
    assert.equal(
      events.some((e) => e.payload.type === 'question_started' && e.payload.index === 2),
      false,
      'q3 must never start',
    );
    const failed = payloadOf(events, 'question_failed');
    assert.equal(failed.errorKind, 'rate_limited');
    assert.equal(lastStopReason(events), 'rate_limit');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('model_output_invalid: "not valid JSON" on q1 → classified, loop continues to completion', async () => {
  const dir = startCampaign('moi');
  try {
    const plan = [
      { question: QUESTIONS[0]!, result: new Error('stage output was not valid JSON (truncated)') },
      { question: QUESTIONS[1]!, result: okOutcome(1, 500) },
      { question: QUESTIONS[2]!, result: okOutcome(2, 500) },
    ];
    const { run } = scriptedRun(plan);
    const final = await runCampaignLoop({ dir, runQuestion: run, now: NOW });
    assert.deepEqual(
      final.questions.map((q) => q.status),
      ['failed', 'OK', 'OK'],
    );
    assert.equal(final.completed, true);
    const failed = payloadOf(eventsOf(dir), 'question_failed');
    assert.equal(failed.errorKind, 'model_output_invalid');
    assert.equal(failed.index, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('budget pre-trip: guardian stops before q2 → breaker recorded, q2/q3 pending, lastStopReason=budget', async () => {
  // 契约假设：guardian 按 cumulativeTokens + 300k(估算/题) > budgetTokens 停机。
  // budget=500k、q1 实耗 300k：q1 可跑（0+300k ≤ 500k），q2 前熔断（300k+300k > 500k）。
  const dir = startCampaign('budget', { budget: 500_000 });
  try {
    const plan = [
      { question: QUESTIONS[0]!, result: okOutcome(0, 300_000) },
      { question: QUESTIONS[1]!, result: okOutcome(1, 1) },
      { question: QUESTIONS[2]!, result: okOutcome(2, 1) },
    ];
    const { run, calls } = scriptedRun(plan);
    const final = await runCampaignLoop({ dir, runQuestion: run, now: NOW });
    assert.deepEqual(calls, QUESTIONS.slice(0, 1), 'only q1 may run');
    assert.deepEqual(
      final.questions.map((q) => q.status),
      ['OK', 'pending', 'pending'],
    );
    assert.equal(final.completed, false);
    assert.equal(final.breakerTripped, true);
    const events = eventsOf(dir);
    const breaker = payloadOf(events, 'budget_breaker_tripped');
    assert.equal(breaker.cumulativeTokens, 300_000);
    assert.equal(breaker.remainingQuestions, 2);
    assert.equal(
      events.some((e) => e.payload.type === 'question_started' && e.payload.index === 1),
      false,
      'q2 must never start',
    );
    assert.equal(events.filter((e) => e.payload.type === 'budget_breaker_tripped').length, 1);
    assert.equal(lastStopReason(events), 'budget');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('budget breaker restart idempotency: re-running a tripped campaign appends no second breaker', async () => {
  const dir = startCampaign('budget-restart', { budget: 500_000 });
  try {
    const plan = [
      { question: QUESTIONS[0]!, result: okOutcome(0, 300_000) },
      { question: QUESTIONS[1]!, result: okOutcome(1, 1) },
      { question: QUESTIONS[2]!, result: okOutcome(2, 1) },
    ];
    const { run, calls } = scriptedRun(plan);
    await runCampaignLoop({ dir, runQuestion: run, now: NOW });
    const n = eventsOf(dir).length;
    const final = await runCampaignLoop({ dir, runQuestion: run, now: NOW });
    assert.equal(calls.length, 1, 'restart must not run any question after breaker tripped');
    assert.equal(eventsOf(dir).length, n, 'restart must append nothing');
    assert.equal(final.breakerTripped, true);
    assert.equal(
      eventsOf(dir).filter((e) => e.payload.type === 'budget_breaker_tripped').length,
      1,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('crash recovery: q1 left running (crash) → failure-then-retry protocol, completes exactly once', async () => {
  const dir = startCampaign('crash');
  try {
    // 模拟崩溃残留：q1 有 question_started 无 terminal 事件
    appendEvent(dir, { type: 'question_started', index: 0, question: QUESTIONS[0]! }, NOW);
    const plan = QUESTIONS.map((q, i) => ({ question: q, result: okOutcome(i, 4242) }));
    const { run, calls } = scriptedRun(plan);
    const final = await runCampaignLoop({ dir, runQuestion: run, now: NOW });
    // 协议：q1 补记 crash-recovered 失败 → 重新 started → 完成；q2/q3 正常
    assert.deepEqual(calls, QUESTIONS, 'crashed question re-runs first, then remaining');
    const events = assertChainIntegral(dir);
    const starts0 = events.filter(
      (e) => e.payload.type === 'question_started' && e.payload.index === 0,
    );
    assert.equal(starts0.length, 2, 'crash recovery needs exactly one extra question_started');
    const failures = payloadsOf(events, 'question_failed');
    assert.equal(failures.length, 1);
    assert.equal(failures[0]!.errorKind, 'unknown');
    assert.match(failures[0]!.detail, /crash-recovered/);
    assert.deepEqual(
      final.questions.map((q) => q.status),
      ['OK', 'OK', 'OK'],
    );
    assert.equal(final.completed, true);
    assert.equal(final.cumulativeTokens, 4242 * 3, 'tokens counted once per actual run');
    assert.equal(lastStopReason(events), 'completed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('crash retry isolation: crashed question fails again on retry → no infinite retry, campaign completes', async () => {
  const dir = startCampaign('crash-fail');
  try {
    appendEvent(dir, { type: 'question_started', index: 0, question: QUESTIONS[0]! }, NOW);
    const plan = [
      { question: QUESTIONS[0]!, result: new Error('mystery failure') },
      { question: QUESTIONS[1]!, result: okOutcome(1, 100) },
      { question: QUESTIONS[2]!, result: okOutcome(2, 100) },
    ];
    const { run, calls } = scriptedRun(plan);
    const final = await runCampaignLoop({ dir, runQuestion: run, now: NOW });
    assert.deepEqual(calls, QUESTIONS, 'each question attempted (crashed one retried once)');
    const events = eventsOf(dir);
    const starts0 = events.filter(
      (e) => e.payload.type === 'question_started' && e.payload.index === 0,
    );
    assert.equal(starts0.length, 2, 'exactly one automatic retry — no infinite loop');
    const fails0 = payloadsOf(events, 'question_failed').filter((p) => p.index === 0);
    assert.equal(fails0.length, 2, 'crash-recovery failure + live retry failure');
    assert.deepEqual(
      final.questions.map((q) => q.status),
      ['failed', 'OK', 'OK'],
    );
    assert.equal(final.completed, true);
    const done = payloadOf(events, 'campaign_completed');
    assert.deepEqual([done.completedCount, done.failedCount], [2, 1]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('idempotent campaign_completed: second loop run appends nothing and calls runQuestion zero times', async () => {
  const dir = startCampaign('idem');
  try {
    const { run, calls } = scriptedRun(planAll(1000));
    const first = await runCampaignLoop({ dir, runQuestion: run, now: NOW });
    const n = eventsOf(dir).length;
    const second = await runCampaignLoop({ dir, runQuestion: run, now: NOW });
    assert.equal(calls.length, 3, 'completed campaign must not re-run questions');
    assert.equal(eventsOf(dir).length, n, 'second run must append no events');
    assert.equal(
      eventsOf(dir).filter((e) => e.payload.type === 'campaign_completed').length,
      1,
    );
    assert.equal(second.completed, true);
    assert.equal(first.completed, true);
    assert.deepEqual(second.questions, first.questions);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('corrupt ledger: loadCampaign throws typed error; runCampaignLoop rejects (startup and mid-run tamper)', async () => {
  // startup tamper
  const dir1 = startCampaign('corrupt1');
  try {
    tamperFirstPayload(dir1);
    assert.throws(
      () => loadCampaign(dir1),
      (err) =>
        err instanceof CorruptCampaignLedgerError &&
        err.firstBrokenIndex === 0 &&
        typeof err.reason === 'string' && err.reason.length > 0,
    );
    await assert.rejects(
      runCampaignLoop({ dir: dir1, runQuestion: async () => okOutcome(0, 1), now: NOW }),
      CorruptCampaignLedgerError,
    );
  } finally {
    rmSync(dir1, { recursive: true, force: true });
  }
  // mid-run tamper: q2 执行期间外部篡改台账 → 后续 append 必须 fail-closed
  const dir2 = startCampaign('corrupt2');
  try {
    const run: RunQuestion = async (question) => {
      if (question === QUESTIONS[1]!) tamperFirstPayload(dir2);
      return okOutcome(0, 1);
    };
    await assert.rejects(
      runCampaignLoop({ dir: dir2, runQuestion: run, now: NOW }),
      CorruptCampaignLedgerError,
    );
    assert.equal(
      eventsOf(dir2).some((e) => e.payload.type === 'campaign_completed'),
      false,
      'no completion may be recorded on a tampered ledger',
    );
  } finally {
    rmSync(dir2, { recursive: true, force: true });
  }
});

test('determinism: identical inputs (fixed clock) → byte-identical ledgers', async () => {
  const dirA = startCampaign('det-a');
  const dirB = startCampaign('det-b');
  try {
    const mk = () => scriptedRun(planAll(777)).run;
    await runCampaignLoop({ dir: dirA, runQuestion: mk(), now: NOW });
    await runCampaignLoop({ dir: dirB, runQuestion: mk(), now: NOW });
    assertChainIntegral(dirA);
    assertChainIntegral(dirB);
    const a = readFileSync(ledgerPath(dirA), 'utf8');
    const b = readFileSync(ledgerPath(dirB), 'utf8');
    assert.equal(a, b, 'same inputs must produce byte-identical event ledgers (incl. hashes)');
    const evA = eventsOf(dirA);
    const evB = eventsOf(dirB);
    assert.deepEqual(evA.map((e) => e.eventHash), evB.map((e) => e.eventHash));
  } finally {
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  }
});

test('lastStopReason: derives from ledger tail (completed/budget/rate_limit/in_progress)', async () => {
  // completed
  const done = startCampaign('lsr-done');
  try {
    await runCampaignLoop({ dir: done, runQuestion: scriptedRun(planAll(1)).run, now: NOW });
    assert.equal(lastStopReason(eventsOf(done)), 'completed');
  } finally {
    rmSync(done, { recursive: true, force: true });
  }
  // rate_limit
  const rate = startCampaign('lsr-rate');
  try {
    const plan = [
      { question: QUESTIONS[0]!, result: new Error('rate limited by provider') },
      { question: QUESTIONS[1]!, result: okOutcome(1, 1) },
      { question: QUESTIONS[2]!, result: okOutcome(2, 1) },
    ];
    await runCampaignLoop({ dir: rate, runQuestion: scriptedRun(plan).run, now: NOW });
    assert.equal(lastStopReason(eventsOf(rate)), 'rate_limit');
  } finally {
    rmSync(rate, { recursive: true, force: true });
  }
  // budget
  const budget = startCampaign('lsr-budget', { budget: 500_000 });
  try {
    const plan = [
      { question: QUESTIONS[0]!, result: okOutcome(0, 300_000) },
      { question: QUESTIONS[1]!, result: okOutcome(1, 1) },
      { question: QUESTIONS[2]!, result: okOutcome(2, 1) },
    ];
    await runCampaignLoop({ dir: budget, runQuestion: scriptedRun(plan).run, now: NOW });
    assert.equal(lastStopReason(eventsOf(budget)), 'budget');
  } finally {
    rmSync(budget, { recursive: true, force: true });
  }
  // in_progress：手工构造台账（尾事件 question_started / question_completed / 空）
  const mid = startCampaign('lsr-mid');
  try {
    appendEvent(mid, { type: 'question_started', index: 0, question: QUESTIONS[0]! }, NOW);
    assert.equal(lastStopReason(eventsOf(mid)), 'in_progress');
    appendEvent(
      mid,
      { type: 'question_completed', index: 0, question: QUESTIONS[0]!, runId: 'r', tokens: 5, status: 'OK' },
      NOW,
    );
    assert.equal(lastStopReason(eventsOf(mid)), 'in_progress', 'question_completed tail is not a stop');
    appendEvent(
      mid,
      { type: 'question_failed', index: 1, question: QUESTIONS[1]!, errorKind: 'unknown', detail: 'x' },
      NOW,
    );
    assert.equal(lastStopReason(eventsOf(mid)), 'in_progress', 'non-rate failure tail is not a stop');
    assert.equal(lastStopReason([]), 'in_progress');
  } finally {
    rmSync(mid, { recursive: true, force: true });
  }
});

test('classifyErrorKind: word-boundary rate detection, 429, JSON/schema branches, unknown fallback', () => {
  assert.equal(classifyErrorKind('HTTP 429 Too Many Requests'), 'rate_limited');
  assert.equal(classifyErrorKind('rate limit exceeded'), 'rate_limited');
  assert.equal(classifyErrorKind('Rate_Limited by provider'), 'rate_limited');
  assert.equal(classifyErrorKind('model output was not valid JSON'), 'model_output_invalid');
  assert.equal(classifyErrorKind('Schema validation failed: missing field x'), 'model_output_invalid');
  assert.equal(classifyErrorKind('boom'), 'unknown');
  // 词边界收紧：'generate' 含 'rate' 子串但不是限流 —— 绝不能误停整个战役
  assert.equal(classifyErrorKind('failed to generate stage output'), 'unknown');
  assert.equal(classifyErrorKind('moderate confidence'), 'unknown');
  assert.equal(classifyErrorKind('accurate but slow'), 'unknown');
  // 非 Error 抛出物 → String() 后走同一路径（detail 记录在 scheduler 内）
  assert.equal(classifyErrorKind(String({ weird: 'throw' })), 'unknown');
});
