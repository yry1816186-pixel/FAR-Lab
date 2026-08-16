/**
 * report_replay.test.ts — 战役报告生成器 + 账本确定性重放（night-r7 S3）。
 *
 * fixture 自足原则：CampaignEvent 由本文件内联构造，事件哈希按契约公式
 * hashCanonicalJson({seq, at, payload, prevEventHash}) 现算（首事件 prevEventHash=''），
 * payload 为契约判别联合（types.ts CampaignEventPayload）——报告面测试（1-7）
 * 在运行时不依赖 sibling 模块，重放面测试（8-13）经 replay.ts 使用 sibling 的
 * readCampaignEvents / verifyCampaignEventChain / deriveCampaignState。
 *
 * 集成核对记录（2026-08-16，已对照 landed sibling 实现）：
 *   - 账本文件名 events.jsonl（= event_log.ts CAMPAIGN_EVENTS_FILENAME）✓；
 *   - type 位于 payload 判别联合内，CampaignEvent 无顶层 type 字段 ✓；
 *   - firstBrokenIndex 为 0-based（verifyCampaignEventChain 镜像 registry 语义）✓；
 *   - crash-retry（failed → 重试 started → OK）合法：scheduler 契约修订后的状态机
 *     （pending → running → OK|failed → running(重试) → OK|failed；OK 终态不可重试）✓。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { hashCanonicalJson } from '../../src/evidence_log/hasher.ts';
import {
  generateCampaignReport,
  renderCampaignReportLatex,
  renderCampaignReportMarkdown,
} from '../../src/campaign/report_generator.ts';
import {
  diffCampaignReplays,
  replayCampaignLedger,
  TIMELINE_END,
} from '../../src/campaign/replay.ts';
import type { CampaignEvent, CampaignEventPayload, CampaignState } from '../../src/campaign/types.ts';

// ---------------------------------------------------------------------------
// fixture 基建（运行产物全部落 .far/ —— gitignored，仓库根零污染）
// ---------------------------------------------------------------------------

const TMP_ROOT = join('.far', 'test-tmp', 'campaign-report-replay');

/** 固定纪元：seq n 的事件发生在 T0 + n 分钟 —— 时间确定性。 */
const T0 = Date.parse('2026-08-16T00:00:00.000Z');
function isoAt(seq: number): string {
  return new Date(T0 + seq * 60_000).toISOString();
}

/** 按契约公式构造自洽哈希链账本（与 event_log.buildCampaignEvent 同构）。 */
function buildLedger(payloads: readonly CampaignEventPayload[]): CampaignEvent[] {
  let prev = '';
  return payloads.map((payload, i) => {
    const seq = i + 1;
    const at = isoAt(seq);
    const eventHash = hashCanonicalJson({ seq, at, payload, prevEventHash: prev });
    const event: CampaignEvent = { seq, at, payload, prevEventHash: prev, eventHash };
    prev = eventHash;
    return event;
  });
}

function writeLedgerDir(name: string, events: readonly CampaignEvent[]): string {
  const dir = join(TMP_ROOT, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'events.jsonl'), `${events.map((e) => JSON.stringify(e)).join('\n')}\n`, 'utf8');
  return dir;
}

// ---------------------------------------------------------------------------
// 报告 fixture：3 OK / 1 failed / 1 pending，tokens 1000+1000+1000+700 = 3700
// ---------------------------------------------------------------------------

const Q0 = 'Q0 direct replication of Bem 2011 experiment 1';
const Q1 = 'Q1 robustness to exclusion criteria';
const Q2 = 'Q2 heterogeneity across labs';
const Q3 = 'Q3 publication-bias-adjusted effect size';
const Q4 = 'Q4 sequential-analysis boundary';

const REPORT_STATE: CampaignState = {
  campaignId: 'camp-report-1',
  topic: 'replication stability of preregistered analyses',
  budgetTokens: 100_000,
  questions: [
    { index: 0, question: Q0, status: 'OK' },
    { index: 1, question: Q1, status: 'OK' },
    { index: 2, question: Q2, status: 'OK' },
    { index: 3, question: Q3, status: 'failed' },
    { index: 4, question: Q4, status: 'pending' },
  ],
  cumulativeTokens: 3700,
  breakerTripped: false,
  completed: false,
};

const REPORT_EVENTS = buildLedger([
  {
    type: 'campaign_started',
    topic: REPORT_STATE.topic,
    plannedQuestions: [Q0, Q1, Q2, Q3, Q4],
    budgetTokens: 100_000,
  },
  { type: 'question_started', index: 0, question: Q0 },
  { type: 'question_completed', index: 0, question: Q0, runId: 'run-q0', tokens: 1000, status: 'OK' },
  { type: 'question_started', index: 1, question: Q1 },
  { type: 'question_completed', index: 1, question: Q1, runId: 'run-q1', tokens: 1000, status: 'OK' },
  { type: 'question_started', index: 2, question: Q2 },
  { type: 'question_completed', index: 2, question: Q2, runId: 'run-q2', tokens: 1000, status: 'OK' },
  { type: 'question_started', index: 3, question: Q3 },
  {
    type: 'question_failed',
    index: 3,
    question: Q3,
    errorKind: 'unknown',
    detail: 'required dataset DOI unresolved after 3 attempts',
  },
]);

const REPORT_INPUT = {
  campaignId: 'camp-report-1',
  events: REPORT_EVENTS,
  state: REPORT_STATE,
  runSummaries: [
    { question: Q0, runId: 'run-q0', tokens: 1000 },
    { question: Q1, runId: 'run-q1', tokens: 1000 },
    { question: Q2, runId: 'run-q2', tokens: 1000 },
    { question: Q3, runId: 'run-q3', tokens: 700 },
  ],
};

// ---------------------------------------------------------------------------
// 重放 fixture：6 事件，seq 5 为 question_failed（timeline/diff/篡改用）
// ---------------------------------------------------------------------------

const R0 = 'R0 question text';
const R1 = 'R1 question text';

const REPLAY_PAYLOADS: readonly CampaignEventPayload[] = [
  { type: 'campaign_started', topic: 'replay fixture topic', plannedQuestions: [R0, R1], budgetTokens: 50_000 },
  { type: 'question_started', index: 0, question: R0 },
  { type: 'question_completed', index: 0, question: R0, runId: 'run-r0', tokens: 900, status: 'OK' },
  { type: 'question_started', index: 1, question: R1 },
  { type: 'question_failed', index: 1, question: R1, errorKind: 'unknown', detail: 'no dataset' },
  { type: 'campaign_completed', completedCount: 1, failedCount: 1, totalTokens: 900 },
];

// ---------------------------------------------------------------------------
// 报告生成
// ---------------------------------------------------------------------------

test('totals math: 3 OK / 1 failed / 1 pending, tokens from ledger state, per-question tokens from run summaries', () => {
  const report = generateCampaignReport(REPORT_INPUT);

  assert.deepEqual(report.totals, {
    completed: 3,
    failed: 1,
    pending: 1,
    tokens: 3700,
    breakerTripped: false,
  });
  assert.equal(report.questions.length, 5);
  assert.equal(report.campaignId, 'camp-report-1');
  assert.equal(report.topic, REPORT_STATE.topic);

  // 问题表：failed 问题携带 run 与 tokens；pending 问题无 run（null）零 tokens
  const failedRow = report.questions[3]!;
  assert.equal(failedRow.runId, 'run-q3');
  assert.equal(failedRow.tokens, 700);
  const pendingRow = report.questions[4]!;
  assert.equal(pendingRow.runId, null);
  assert.equal(pendingRow.tokens, 0);
  assert.equal(pendingRow.errorKind, undefined);

  // 证据锚：事件数 + 最后事件哈希（可与 replay 对照）
  assert.equal(report.evidence.eventCount, 9);
  assert.equal(report.evidence.lastEventHash, REPORT_EVENTS.at(-1)!.eventHash);
});

test('negative results: failed question enters the ledger with exact errorKind and detail from the failure event', () => {
  const report = generateCampaignReport(REPORT_INPUT);

  assert.deepEqual(report.negativeResults, [
    {
      question: Q3,
      errorKind: 'unknown',
      detail: 'required dataset DOI unresolved after 3 attempts',
    },
  ]);
});

test('generatedAt: defaults to last event time, injected clock wins, regeneration is deep-equal', () => {
  const report = generateCampaignReport(REPORT_INPUT);
  assert.equal(report.generatedAt, isoAt(9), 'default clock = ledger last event at');

  const injected = generateCampaignReport({ ...REPORT_INPUT, now: '2026-08-16T12:00:00.000Z' });
  assert.equal(injected.generatedAt, '2026-08-16T12:00:00.000Z');

  assert.deepEqual(generateCampaignReport(REPORT_INPUT), report, 'pure function: same input, same report');
});

test('markdown: all six sections present, totals row, pending row with em-dash run, negative bullet, honesty line', () => {
  const report = generateCampaignReport(REPORT_INPUT);
  const md = renderCampaignReportMarkdown(report);

  assert.ok(md.includes('# FAR-Lab Campaign Report'));
  assert.ok(md.includes('## Totals'));
  assert.ok(md.includes('## Questions'));
  assert.ok(md.includes('## Negative results'));
  assert.ok(md.includes('## Breaker status'));
  assert.equal(md.match(/^## /gm)?.length, 4, 'exactly four H2 sections');

  assert.ok(md.includes('| 3 | 1 | 1 | 3700 | intact |'), 'totals row');
  assert.ok(md.includes('| pending | — | 0 |'), 'pending row: null runId renders em-dash, zero tokens');
  assert.ok(md.includes('run-q0'), 'completed row carries its runId');
  assert.ok(md.includes('[unknown] required dataset DOI unresolved after 3 attempts'), 'negative bullet');
  assert.ok(md.includes('- Circuit breaker: intact (not tripped).'), 'breaker status line');
  assert.ok(
    md.includes("run-level soundness is each run's verify chain's job"),
    'closing honesty line (cannot-prove)',
  );

  // 确定性：双渲染字节恒等（generatedAt 已冻结在 report 内）
  assert.equal(renderCampaignReportMarkdown(report), md);
});

test('latex: compile-ready skeleton and hostile question text fully escaped', () => {
  const HOSTILE_QUESTION = 'Does \\section{evil} & 100% of $5 #runs _fail ^2 ~z leak?';
  const hostileState: CampaignState = {
    campaignId: 'camp-hostile',
    topic: 'escape surface',
    budgetTokens: 1000,
    questions: [{ index: 0, question: HOSTILE_QUESTION, status: 'OK' }],
    cumulativeTokens: 10,
    breakerTripped: false,
    completed: true,
  };
  const report = generateCampaignReport({
    campaignId: 'camp-hostile',
    events: buildLedger([
      { type: 'campaign_started', topic: 'escape surface', plannedQuestions: [HOSTILE_QUESTION], budgetTokens: 1000 },
    ]),
    state: hostileState,
    runSummaries: [{ question: HOSTILE_QUESTION, runId: 'run-h&1', tokens: 10 }],
  });
  const tex = renderCampaignReportLatex(report);

  // 骨架（结构断言，与 tests/report/latex_renderer.test.ts 同法）
  assert.match(tex, /\\documentclass\[11pt\]\{article\}/);
  assert.match(tex, /\\usepackage\{booktabs\}/);
  assert.match(tex, /\\usepackage\{longtable\}/);
  assert.match(tex, /\\begin\{longtable\}/);
  assert.ok(tex.indexOf('\\begin{document}') < tex.indexOf('\\end{document}'));

  // 对抗：敌意问题文本不得以原始形式出现，转义形必须出现
  assert.doesNotMatch(tex, /\\section\{evil\}/);
  assert.ok(tex.includes('\\textbackslash{}section'), 'backslash escaped');
  assert.ok(tex.includes('100\\%'), 'percent escaped');
  assert.ok(tex.includes('\\$5'), 'dollar escaped');
  assert.ok(tex.includes('\\#runs'), 'hash escaped');
  assert.ok(tex.includes('\\_fail'), 'underscore escaped');
  assert.ok(tex.includes('\\textasciitilde{}z'), 'tilde escaped');
  assert.ok(tex.includes('run-h\\&1'), 'runId ampersand escaped in table cell');

  // 确定性
  assert.equal(renderCampaignReportLatex(report), tex);
});

test('latex: booktabs question rows, verbatim negative detail, embedded end-marker doubled not passed through', () => {
  const HOSTILE_DETAIL = '\\end{verbatim*} \\section{evil} boom';
  const events = buildLedger([
    { type: 'campaign_started', topic: 't', plannedQuestions: [Q0, Q1], budgetTokens: 100 },
    { type: 'question_started', index: 0, question: Q0 },
    { type: 'question_completed', index: 0, question: Q0, runId: 'run-q0', tokens: 1000, status: 'OK' },
    {
      type: 'question_failed',
      index: 1,
      question: Q1,
      errorKind: 'model_output_invalid',
      detail: HOSTILE_DETAIL,
    },
  ]);
  const state: CampaignState = {
    campaignId: 'camp-neg',
    topic: 't',
    budgetTokens: 100,
    questions: [
      { index: 0, question: Q0, status: 'OK' },
      { index: 1, question: Q1, status: 'failed' },
    ],
    cumulativeTokens: 1700,
    breakerTripped: false,
    completed: false,
  };
  const tex = renderCampaignReportLatex(
    generateCampaignReport({
      campaignId: 'camp-neg',
      events,
      state,
      runSummaries: [
        { question: Q0, runId: 'run-q0', tokens: 1000 },
        { question: Q1, runId: 'run-q1', tokens: 700 },
      ],
    }),
  );

  // booktabs 表结构 + 行内容
  assert.match(tex, /\\toprule/);
  assert.match(tex, /\\midrule/);
  assert.match(tex, /\\bottomrule/);
  assert.match(tex, /\\endfirsthead/);
  assert.match(tex, /\\endlastfoot/);
  assert.ok(tex.includes('run-q0 & 1000 \\\\'), 'question row carries runId and tokens');

  // 负结果 verbatim：细节原文保真 + 内嵌 end 标记双写（每块恰一个真实 closer）
  assert.ok(tex.includes('\\begin{verbatim*}'));
  const realClosers = tex.match(/^\\end\{verbatim\*\}$/gm) ?? [];
  const doubledMarkers = tex.match(/^\\\\end\{verbatim\*\}/gm) ?? [];
  assert.equal(realClosers.length, 1, 'exactly one real verbatim closer');
  assert.equal(doubledMarkers.length, 1, 'hostile end-marker doubled, not passed through');
});

test('breaker status surfaces in totals, markdown and latex; empty negative ledger stated honestly', () => {
  const state: CampaignState = {
    campaignId: 'camp-breaker',
    topic: REPORT_STATE.topic,
    budgetTokens: 100_000,
    questions: [
      { index: 0, question: Q0, status: 'OK' },
      { index: 1, question: Q4, status: 'pending' },
    ],
    cumulativeTokens: 1000,
    breakerTripped: true,
    completed: false,
  };
  const events = buildLedger([
    { type: 'campaign_started', topic: state.topic, plannedQuestions: [Q0, Q4], budgetTokens: 100_000 },
    { type: 'question_started', index: 0, question: Q0 },
    { type: 'question_completed', index: 0, question: Q0, runId: 'run-b0', tokens: 1000, status: 'OK' },
    { type: 'budget_breaker_tripped', cumulativeTokens: 1000, remainingQuestions: 1 },
  ]);
  const report = generateCampaignReport({
    campaignId: 'camp-breaker',
    events,
    state,
    runSummaries: [{ question: Q0, runId: 'run-b0', tokens: 1000 }],
  });

  assert.equal(report.totals.breakerTripped, true);
  assert.equal(report.totals.completed, 1);
  assert.equal(report.totals.pending, 1);

  const md = renderCampaignReportMarkdown(report);
  assert.ok(md.includes('| 1 | 0 | 1 | 1000 | TRIPPED |'));
  assert.ok(md.includes('- Circuit breaker: **TRIPPED** — budget guard halted the campaign.'));
  assert.ok(md.includes('No negative results recorded.'), 'empty negative ledger stated, not omitted silently');

  const tex = renderCampaignReportLatex(report);
  assert.ok(tex.includes('TRIPPED'), 'latex breaker status surfaces');
  assert.ok(tex.includes('No negative results recorded.'));
});

// ---------------------------------------------------------------------------
// 账本重放
// ---------------------------------------------------------------------------

test('replay timeline: seq ascending, exact type sequence, summaries carry runId / errorKind, derived state folds', () => {
  const dir = writeLedgerDir('ledger-basic', buildLedger(REPLAY_PAYLOADS));
  const replay = replayCampaignLedger(dir);

  assert.deepEqual(
    replay.timeline.map((t) => t.seq),
    [1, 2, 3, 4, 5, 6],
  );
  assert.deepEqual(
    replay.timeline.map((t) => t.type),
    [
      'campaign_started',
      'question_started',
      'question_completed',
      'question_started',
      'question_failed',
      'campaign_completed',
    ],
  );
  assert.equal(replay.timeline[2]!.summary.includes('run-r0'), true);
  assert.equal(replay.timeline[4]!.summary.includes('unknown'), true);
  assert.equal(replay.timeline[0]!.at, isoAt(1), 'timeline carries the recorded at timestamp');
  assert.equal(replay.state.campaignId, 'ledger-basic');

  // derive 接线：状态真从台账折叠（非透传常量）
  assert.deepEqual(
    replay.state.questions.map((q) => q.status),
    ['OK', 'failed'],
  );
  assert.equal(replay.state.cumulativeTokens, 900);
  assert.equal(replay.state.completed, true);
});

test('chain verification passthrough: tampered failure detail breaks the hash chain at the tampered index', () => {
  const events = buildLedger(REPLAY_PAYLOADS);
  // 篡改 seq=5 事件（0-based index 4，question_failed）的 detail：内容变了但
  // eventHash 未重算。状态机对 detail 不敏感（折叠照常）——哈希链捕获语义
  // 检测不到的史实改写，这正是链校验的独立价值。
  const tampered = events.map((e, i) =>
    i === 4 ? { ...e, payload: { ...e.payload, detail: 'rewritten: everything fine' } } : e,
  );
  const dir = writeLedgerDir('ledger-tampered', tampered);

  const { verification, state } = replayCampaignLedger(dir);
  assert.equal(verification.valid, false);
  assert.equal(verification.firstBrokenIndex, 4, '0-based index of the tampered event (seq 5)');
  assert.equal(typeof verification.reason, 'string');
  assert.ok(verification.reason!.length > 0, 'failure reason is a non-empty string');
  assert.equal(state.questions[1]!.status, 'failed', 'folding still succeeds — verification is the independent detector');

  // 对照：未篡改账本必须 valid（防测试自身假阳性）
  const clean = replayCampaignLedger(writeLedgerDir('ledger-clean', events));
  assert.deepEqual(clean.verification, { valid: true, firstBrokenIndex: null, reason: null });
});

test('diff: identical ledgers in different directories replay identically', () => {
  const a = replayCampaignLedger(writeLedgerDir('diff-a', buildLedger(REPLAY_PAYLOADS)));
  const b = replayCampaignLedger(writeLedgerDir('diff-b', buildLedger(REPLAY_PAYLOADS)));

  assert.deepEqual(a.timeline, b.timeline, 'timeline independent of directory name');
  const diff = diffCampaignReplays(a, b);
  assert.deepEqual(diff, { identical: true, firstDivergence: null });
});

test('diff: type divergence at seq 5 reported exactly with both types', () => {
  const variant: CampaignEventPayload[] = REPLAY_PAYLOADS.map((p) =>
    p.type === 'question_failed'
      ? { type: 'question_completed', index: 1, question: R1, runId: 'run-r1', tokens: 800, status: 'OK' }
      : p,
  );
  // 变体自身的收尾计数与折叠一致（2 OK / 0 failed / 1700 tokens）
  variant[5] = { type: 'campaign_completed', completedCount: 2, failedCount: 0, totalTokens: 1700 };

  const a = replayCampaignLedger(writeLedgerDir('diff-div-a', buildLedger(REPLAY_PAYLOADS)));
  const b = replayCampaignLedger(writeLedgerDir('diff-div-b', buildLedger(variant)));

  const diff = diffCampaignReplays(a, b);
  assert.equal(diff.identical, false);
  assert.deepEqual(diff.firstDivergence, {
    seq: 5,
    aType: 'question_failed',
    bType: 'question_completed',
  });
});

test('diff: length mismatch diverges at the shorter end, both directions, with TIMELINE_END sentinel', () => {
  const full = replayCampaignLedger(writeLedgerDir('diff-full', buildLedger(REPLAY_PAYLOADS)));
  const short = replayCampaignLedger(
    writeLedgerDir('diff-short', buildLedger(REPLAY_PAYLOADS.slice(0, 3))),
  );

  const shortFirst = diffCampaignReplays(short, full);
  assert.deepEqual(shortFirst.firstDivergence, {
    seq: 4,
    aType: TIMELINE_END,
    bType: 'question_started',
  });

  const fullFirst = diffCampaignReplays(full, short);
  assert.deepEqual(fullFirst.firstDivergence, {
    seq: 4,
    aType: 'question_started',
    bType: TIMELINE_END,
  });
  assert.equal(shortFirst.identical, false);
  assert.equal(fullFirst.identical, false);
});

test('crash-retry pattern: timeline preserves BOTH the failure and the later retry-success (dual-temporal history)', () => {
  const events = buildLedger([
    { type: 'campaign_started', topic: 'crash retry topic', plannedQuestions: ['CR0 question'], budgetTokens: 10_000 },
    { type: 'question_started', index: 0, question: 'CR0 question' },
    {
      type: 'question_failed',
      index: 0,
      question: 'CR0 question',
      errorKind: 'rate_limited',
      detail: 'provider 429 after 3 retries',
    },
    { type: 'question_started', index: 0, question: 'CR0 question' }, // 重试：failed → running（契约修订后合法）
    { type: 'question_completed', index: 0, question: 'CR0 question', runId: 'run-cr-retry', tokens: 1200, status: 'OK' },
    { type: 'campaign_completed', completedCount: 1, failedCount: 0, totalTokens: 1200 },
  ]);
  const replay = replayCampaignLedger(writeLedgerDir('ledger-crash-retry', events));

  const seqs = replay.timeline.map((t) => t.seq);
  for (let i = 1; i < seqs.length; i += 1) {
    assert.ok(seqs[i]! > seqs[i - 1]!, 'seqs strictly increasing');
  }
  const failedEntry = replay.timeline.find((t) => t.summary.includes('provider 429 after 3 retries'));
  const retriedEntry = replay.timeline.find((t) => t.summary.includes('run-cr-retry'));
  assert.ok(failedEntry !== undefined, 'failure entry preserved in timeline');
  assert.ok(retriedEntry !== undefined, 'retry-success entry present');
  assert.ok(failedEntry!.seq < retriedEntry!.seq, 'failure precedes the successful retry');
  assert.equal(replay.state.questions[0]!.status, 'OK', 'amended state machine: retry success terminal-marks OK');

  // 报告侧同精神：终态 OK，但历史失败仍入负结果台账（双时态）
  const state: CampaignState = {
    campaignId: 'ledger-crash-retry',
    topic: 'crash retry topic',
    budgetTokens: 10_000,
    questions: [{ index: 0, question: 'CR0 question', status: 'OK' }],
    cumulativeTokens: 1200,
    breakerTripped: false,
    completed: true,
  };
  const report = generateCampaignReport({
    campaignId: 'ledger-crash-retry',
    events,
    state,
    runSummaries: [{ question: 'CR0 question', runId: 'run-cr-retry', tokens: 1200 }],
  });
  assert.equal(report.questions[0]!.status, 'OK');
  assert.equal(report.questions[0]!.runId, 'run-cr-retry');
  assert.deepEqual(report.negativeResults, [
    {
      question: 'CR0 question',
      errorKind: 'rate_limited',
      detail: 'provider 429 after 3 retries',
    },
  ]);
});
