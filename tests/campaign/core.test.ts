// tests/campaign/core.test.ts
// §10 campaign 基础设施核心纯逻辑的契约（night-r7 S1）：
//   - 事件哈希：build→verify 往返；中段篡改在正确索引检出；乱序断链检出
//   - 台账 IO：缺失目录 → []；损坏行 fail-closed（带 cause）；拒绝向断链/断链前驱追加
//   - 状态折叠：完整生命周期 / 事件先于 campaign_started / 缺 campaign_started /
//     重复终态事件 / 未 start 即终态 / 重复 campaign_started / 索引越界 / 文本失配 → 全部抛错；
//     崩溃恢复重试合法（failed→running→OK）；重开 running / 重试 OK 终态 → 抛错
//   - breaker 事件只置旗，不改写 token 累计（累计只来自 question_completed）
//   - planner：显式问题确定胜出（离线安全、不调注入函数）；注入分解成功 → source 'llm'；
//     注入失败原样传播（零伪造）；空 topic / 规划后空清单 → 抛错
//   - guardian：预算前置检查边界（恰好等于预算继续，+1 超出停）；tripped/completed 停；
//     running 的问题不阻止调度其它问题（每题独立）

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildCampaignEvent,
  appendCampaignEvent,
  readCampaignEvents,
  verifyCampaignEventChain,
  deriveCampaignState,
  campaignEventsPath,
  type CampaignEvent,
  type CampaignEventPayload,
  type CampaignState,
} from '../../src/campaign/event_log.ts';
import { planCampaignQuestions } from '../../src/campaign/planner.ts';
import { shouldContinue, ESTIMATED_PER_QUESTION_TOKENS } from '../../src/campaign/guardian.ts';

const FIXED_AT = '2026-08-16T09:00:00.000Z';
const FIXED_AT_2 = '2026-08-16T09:05:00.000Z';

/** 构建一条合法链事件（seq/at/prev 显式传参，镜像调用方注入时钟的纪律）。 */
function ev(seq: number, payload: CampaignEventPayload, prevEventHash: string, at = FIXED_AT): CampaignEvent {
  return buildCampaignEvent(seq, at, payload, prevEventHash);
}

/** 完整两问生命周期的合法事件链（q0 成功 250k tokens，q1 限流失败，跳闸，收尾）。 */
function fullLifecycleEvents(): CampaignEvent[] {
  const started = ev(
    1,
    { type: 'campaign_started', topic: 'llm hallucination rates', plannedQuestions: ['q about detection', 'q about mitigation'], budgetTokens: 1_000_000 },
    '',
  );
  const q0Start = ev(2, { type: 'question_started', index: 0, question: 'q about detection' }, started.eventHash, FIXED_AT_2);
  const q0Done = ev(3, { type: 'question_completed', index: 0, question: 'q about detection', runId: 'run-a1b2', tokens: 250_000, status: 'OK' }, q0Start.eventHash, FIXED_AT_2);
  const q1Start = ev(4, { type: 'question_started', index: 1, question: 'q about mitigation' }, q0Done.eventHash, FIXED_AT_2);
  const q1Fail = ev(5, { type: 'question_failed', index: 1, question: 'q about mitigation', errorKind: 'rate_limited', detail: '429 after 3 retries' }, q1Start.eventHash, FIXED_AT_2);
  const breaker = ev(6, { type: 'budget_breaker_tripped', cumulativeTokens: 250_000, remainingQuestions: 0 }, q1Fail.eventHash, FIXED_AT_2);
  const done = ev(7, { type: 'campaign_completed', completedCount: 1, failedCount: 1, totalTokens: 250_000 }, breaker.eventHash, FIXED_AT_2);
  return [started, q0Start, q0Done, q1Start, q1Fail, breaker, done];
}

// ── 事件哈希链 ────────────────────────────────────────────────────────────────

describe('campaign event hash chain', () => {
  it('buildCampaignEvent round-trips: 64-hex eventHash over everything except itself, full chain verifies', () => {
    const events = fullLifecycleEvents();
    for (const e of events) {
      assert.match(e.eventHash, /^[0-9a-f]{64}$/, 'eventHash must be sha256 hex');
      assert.notEqual(e.eventHash, '', 'eventHash is never empty');
    }
    assert.equal(events[0]!.prevEventHash, '', 'genesis event carries prevEventHash = ""');
    const verdict = verifyCampaignEventChain(events);
    assert.deepEqual(verdict, { valid: true, firstBrokenIndex: null, reason: null });
  });

  it('eventHash binds the full record: mutating a middle payload breaks verification at exactly that index', () => {
    const events = fullLifecycleEvents();
    const tampered: CampaignEvent = {
      ...events[2]!,
      payload: { ...events[2]!.payload, type: 'question_completed', index: 0, question: 'q about detection', runId: 'run-a1b2', tokens: 999_999, status: 'OK' } as CampaignEventPayload,
    };
    const withTamper = [...events.slice(0, 2), tampered, ...events.slice(3)];
    const verdict = verifyCampaignEventChain(withTamper);
    assert.equal(verdict.valid, false);
    assert.equal(verdict.firstBrokenIndex, 2, 'must pinpoint the tampered event, not a downstream victim');
    assert.match(verdict.reason ?? '', /eventHash mismatch/);
  });

  it('reordering events breaks the prev-link chain (swap of adjacent events detected)', () => {
    const events = fullLifecycleEvents();
    const reordered = [events[1]!, events[0]!, ...events.slice(2)];
    const verdict = verifyCampaignEventChain(reordered);
    assert.equal(verdict.valid, false);
    assert.equal(verdict.firstBrokenIndex, 0, 'swapped-in first event no longer carries genesis prev ""');
    assert.match(verdict.reason ?? '', /prevEventHash/);
  });

  it('truncating history is detected: a later event presented as genesis has non-empty prev', () => {
    const events = fullLifecycleEvents();
    const verdict = verifyCampaignEventChain(events.slice(3));
    assert.equal(verdict.valid, false);
    assert.equal(verdict.firstBrokenIndex, 0);
  });

  it('empty chain is trivially valid (no events, nothing broken)', () => {
    assert.deepEqual(verifyCampaignEventChain([]), { valid: true, firstBrokenIndex: null, reason: null });
  });
});

// ── 台账 IO（fail-closed）────────────────────────────────────────────────────

describe('campaign event ledger IO', () => {
  it('append + read round-trips through disk; missing dir reads as empty', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-campaign-io-'));
    try {
      assert.deepEqual(readCampaignEvents(dir), [], 'missing dir → [] (first run)');
      for (const e of fullLifecycleEvents()) {
        appendCampaignEvent(dir, e);
      }
      const back = readCampaignEvents(dir);
      assert.equal(back.length, 7);
      assert.deepEqual(back, fullLifecycleEvents(), 'JSONL round-trip preserves every event');
      assert.equal(readFileSync(campaignEventsPath(dir), 'utf8').trim().split('\n').length, 7);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('corrupt line throws with line context and cause (fail-closed, no silent truncation)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-campaign-corrupt-'));
    try {
      appendCampaignEvent(dir, fullLifecycleEvents()[0]!);
      const path = campaignEventsPath(dir);
      writeFileSync(path, `${readFileSync(path, 'utf8')}{"seq": "not-a-number"`);
      assert.throws(() => readCampaignEvents(dir), (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /line 2/);
        return true;
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('append refuses a wrong prevEventHash link (including non-empty genesis prev)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-campaign-link-'));
    try {
      const [started, q0Start] = fullLifecycleEvents();
      assert.throws(
        () => appendCampaignEvent(dir, q0Start!),
        /prevEventHash|genesis/i,
        'first append must be the genesis event (prev = "")',
      );
      appendCampaignEvent(dir, started!);
      const orphan = buildCampaignEvent(3, FIXED_AT_2, { type: 'question_started', index: 0, question: 'q about detection' }, 'f'.repeat(64));
      assert.throws(
        () => appendCampaignEvent(dir, orphan),
        /prevEventHash/,
        'appending an event that does not chain onto the head is refused',
      );
      assert.equal(readCampaignEvents(dir).length, 1, 'refused appends leave the ledger untouched');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('append refuses to extend a tampered ledger (edit a historical line, then append)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-campaign-tamper-'));
    try {
      const events = fullLifecycleEvents();
      appendCampaignEvent(dir, events[0]!);
      appendCampaignEvent(dir, events[1]!);
      const path = campaignEventsPath(dir);
      const edited = readFileSync(path, 'utf8').replace('"index":0', '"index":9');
      writeFileSync(path, edited);
      assert.throws(
        () => appendCampaignEvent(dir, events[2]!),
        /broken|chain/i,
        'never append onto a ledger whose existing chain no longer verifies',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── 状态折叠（fail-closed 状态机）────────────────────────────────────────────

describe('deriveCampaignState fold', () => {
  it('full lifecycle: every field derived (pending→running→OK/failed, tokens accumulate, flags set)', () => {
    const state = deriveCampaignState('camp-001', fullLifecycleEvents());
    const expected: CampaignState = {
      campaignId: 'camp-001',
      topic: 'llm hallucination rates',
      budgetTokens: 1_000_000,
      questions: [
        { index: 0, question: 'q about detection', status: 'OK' },
        { index: 1, question: 'q about mitigation', status: 'failed' },
      ],
      cumulativeTokens: 250_000,
      breakerTripped: true,
      completed: true,
    };
    assert.deepEqual(state, expected);
  });

  it('events before campaign_started throw (state machine refuses pre-genesis facts)', () => {
    const started = ev(1, { type: 'campaign_started', topic: 't', plannedQuestions: ['q'], budgetTokens: 100 }, '');
    const early = ev(2, { type: 'question_started', index: 0, question: 'q' }, started.eventHash);
    assert.throws(() => deriveCampaignState('camp-x', [early]), /before campaign_started|campaign_started/);
  });

  it('missing campaign_started throws (empty log cannot derive a campaign)', () => {
    assert.throws(() => deriveCampaignState('camp-x', []), /campaign_started/);
  });

  it('crash-recovery retry is legal: failed → started → OK folds to OK (scheduler contract amendment)', () => {
    const started = ev(1, { type: 'campaign_started', topic: 't', plannedQuestions: ['q0'], budgetTokens: 1_000_000 }, '');
    const s1 = ev(2, { type: 'question_started', index: 0, question: 'q0' }, started.eventHash, FIXED_AT_2);
    const f1 = ev(3, { type: 'question_failed', index: 0, question: 'q0', errorKind: 'unknown', detail: 'crash-recovered: process killed mid-run' }, s1.eventHash, FIXED_AT_2);
    const s2 = ev(4, { type: 'question_started', index: 0, question: 'q0' }, f1.eventHash, FIXED_AT_2);
    const c1 = ev(5, { type: 'question_completed', index: 0, question: 'q0', runId: 'run-retry', tokens: 310_000, status: 'OK' }, s2.eventHash, FIXED_AT_2);
    const state = deriveCampaignState('camp-r', [started, s1, f1, s2, c1]);
    assert.equal(state.questions[0]!.status, 'OK', 'retry success terminal-marks the question');
    assert.equal(state.cumulativeTokens, 310_000, 'tokens count the (single) completion');
  });

  it('reopening a running question throws, and retrying an OK terminal question throws', () => {
    const started = ev(1, { type: 'campaign_started', topic: 't', plannedQuestions: ['q0'], budgetTokens: 100 }, '');
    const s1 = ev(2, { type: 'question_started', index: 0, question: 'q0' }, started.eventHash, FIXED_AT_2);
    const doubleStart = ev(3, { type: 'question_started', index: 0, question: 'q0' }, s1.eventHash, FIXED_AT_2);
    assert.throws(() => deriveCampaignState('camp-x', [started, s1, doubleStart]), /invariant I4|status is running/);

    const c1 = ev(3, { type: 'question_completed', index: 0, question: 'q0', runId: 'r1', tokens: 1, status: 'OK' }, s1.eventHash, FIXED_AT_2);
    const zombie = ev(4, { type: 'question_started', index: 0, question: 'q0' }, c1.eventHash, FIXED_AT_2);
    assert.throws(() => deriveCampaignState('camp-x', [started, s1, c1, zombie]), /invariant I4|status is OK/);
  });

  it('duplicate terminal event throws (double question_completed is a ledger contradiction)', () => {
    const events = fullLifecycleEvents();
    const dup = ev(8, { type: 'question_completed', index: 0, question: 'q about detection', runId: 'run-a1b2', tokens: 1, status: 'OK' }, events[6]!.eventHash);
    assert.throws(() => deriveCampaignState('camp-x', [...events, dup]), /terminal|running/i);
  });

  it('terminal without start throws (completed/failed requires the question be running)', () => {
    const started = ev(1, { type: 'campaign_started', topic: 't', plannedQuestions: ['q0'], budgetTokens: 100 }, '');
    const ghost = ev(2, { type: 'question_failed', index: 0, question: 'q0', errorKind: 'unknown', detail: 'never started' }, started.eventHash);
    assert.throws(() => deriveCampaignState('camp-x', [started, ghost]), /terminal|running/i);
  });

  it('duplicate campaign_started throws, and unknown question index / text mismatch throw', () => {
    const started = ev(1, { type: 'campaign_started', topic: 't', plannedQuestions: ['q0', 'q1'], budgetTokens: 100 }, '');
    const restarted = ev(2, { type: 'campaign_started', topic: 't', plannedQuestions: ['q0'], budgetTokens: 100 }, started.eventHash);
    assert.throws(() => deriveCampaignState('camp-x', [started, restarted]), /campaign_started/);

    const outOfRange = ev(2, { type: 'question_started', index: 5, question: 'q5' }, started.eventHash);
    assert.throws(() => deriveCampaignState('camp-x', [started, outOfRange]), /index/);

    const mismatched = ev(2, { type: 'question_started', index: 0, question: 'a different question' }, started.eventHash);
    assert.throws(() => deriveCampaignState('camp-x', [started, mismatched]), /mismatch|question/);
  });

  it('budget_breaker_tripped sets the flag but never rewrites token accounting', () => {
    const started = ev(1, { type: 'campaign_started', topic: 't', plannedQuestions: ['q0'], budgetTokens: 100 }, '');
    const breaker = ev(2, { type: 'budget_breaker_tripped', cumulativeTokens: 4_242_424, remainingQuestions: 1 }, started.eventHash);
    const state = deriveCampaignState('camp-x', [started, breaker]);
    assert.equal(state.breakerTripped, true, 'flag folds from the event');
    assert.equal(state.cumulativeTokens, 0, 'tokens accumulate from question_completed only — the breaker payload is an informational snapshot');
    assert.equal(state.questions[0]!.status, 'pending', 'breaker does not terminal-mark questions');
  });
});

// ── planner ──────────────────────────────────────────────────────────────────

describe('planCampaignQuestions', () => {
  it('explicit questions win: deterministic, offline-safe, injected decomposer never invoked', async () => {
    let decomposeCalls = 0;
    const result = await planCampaignQuestions({
      topic: 'protein folding',
      questions: ['q1?', 'q2?'],
      decompose: async () => {
        decomposeCalls += 1;
        return ['fabricated?'];
      },
    });
    assert.deepEqual(result.questions, ['q1?', 'q2?']);
    assert.equal(result.source, 'explicit');
    assert.equal(decomposeCalls, 0, 'explicit path must stay offline-safe — no LLM call');
  });

  it('injected decomposer produces the questions and is credited as source "llm"', async () => {
    const result = await planCampaignQuestions({
      topic: 'protein folding',
      decompose: async (topic) => [`how does ${topic} scale?`, 'what limits accuracy?'],
    });
    assert.deepEqual(result.questions, ['how does protein folding scale?', 'what limits accuracy?']);
    assert.equal(result.source, 'llm');
  });

  it('injected decomposer failure propagates verbatim — zero fallback fabrication', async () => {
    const boom = new Error('research_live_profile_unavailable: no model API key found');
    await assert.rejects(
      planCampaignQuestions({
        topic: 'dark matter',
        decompose: async () => {
          throw boom;
        },
      }),
      (err: unknown) => err === boom,
      'the SAME error object must surface — the planner never fabricates questions to survive',
    );
  });

  it('empty topic throws; empty question list after planning throws; no questions and no decomposer throws', async () => {
    await assert.rejects(planCampaignQuestions({ topic: '   ' }), /topic/i);
    await assert.rejects(
      planCampaignQuestions({
        topic: 'valid topic',
        decompose: async () => [],
      }),
      /empty|question/i,
      'decomposer returning [] is an empty plan — fail-closed, no padding',
    );
    await assert.rejects(
      planCampaignQuestions({ topic: 'valid topic' }),
      /decompose|question/i,
      'nothing to plan with and no decomposer — refusing rather than inventing',
    );
    await assert.rejects(
      planCampaignQuestions({ topic: 'valid topic', questions: [''] }),
      /empty|question/i,
      'a blank explicit question is a defect, not a plan',
    );
  });
});

// ── guardian ─────────────────────────────────────────────────────────────────

describe('shouldContinue budget guardian', () => {
  /** 直接构造纯数据状态（guardian 无 IO，不依赖事件折叠）。 */
  function stateOf(patch: Partial<CampaignState> = {}): CampaignState {
    return {
      campaignId: 'camp-g',
      topic: 't',
      budgetTokens: 700_000,
      questions: [
        { index: 0, question: 'q0', status: 'OK' },
        { index: 1, question: 'q1', status: 'pending' },
      ],
      cumulativeTokens: 400_000,
      breakerTripped: false,
      completed: false,
      ...patch,
    };
  }

  it('calibration constant pinned at 300k (measured a2/d9 span 225k-315k)', () => {
    assert.equal(ESTIMATED_PER_QUESTION_TOKENS, 300_000);
  });

  it('budget pre-trip arithmetic boundary: exactly at budget continues, one token over stops', () => {
    // 400_000 + 300_000 === 700_000 → not > budget → continue (honest pre-check, no off-by-one)
    assert.deepEqual(shouldContinue(stateOf()), { continue: true, reason: 'ok' });
    const over = shouldContinue(stateOf({ cumulativeTokens: 400_001 }));
    assert.equal(over.continue, false);
    assert.equal(over.reason, 'budget_precheck_over_budget');
  });

  it('tripped breaker stops scheduling regardless of remaining budget headroom', () => {
    const decision = shouldContinue(stateOf({ breakerTripped: true, cumulativeTokens: 0, budgetTokens: 10_000_000 }));
    assert.equal(decision.continue, false);
    assert.equal(decision.reason, 'breaker_tripped');
  });

  it('completed campaign stops (no post-completion zombie scheduling)', () => {
    const decision = shouldContinue(stateOf({ completed: true }));
    assert.equal(decision.continue, false);
    assert.equal(decision.reason, 'campaign_completed');
  });

  it('a running question does not block scheduling OTHER pending questions (per-question independence)', () => {
    const decision = shouldContinue(
      stateOf({
        questions: [
          { index: 0, question: 'q0', status: 'running' },
          { index: 1, question: 'q1', status: 'pending' },
          { index: 2, question: 'q2', status: 'pending' },
        ],
        cumulativeTokens: 0,
        budgetTokens: 1_000_000,
      }),
    );
    assert.deepEqual(decision, { continue: true, reason: 'ok' });
  });

  it('no pending questions and not completed: guardian does not invent a stop (campaign_completed is the closer)', () => {
    const decision = shouldContinue(
      stateOf({
        questions: [
          { index: 0, question: 'q0', status: 'running' },
          { index: 1, question: 'q1', status: 'failed' },
        ],
      }),
    );
    assert.equal(decision.continue, true);
    assert.equal(decision.reason, 'no_pending_questions');
  });
});
