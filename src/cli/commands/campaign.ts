/**
 * far campaign — 战役命令族（2.md §10；night-r7 基建）。
 *
 * start  : 计划（显式 --questions 确定性路径优先；LIVE LLM 分解无 key fail-closed）→ 事件账本 → 问题循环执行
 * status : 账本重放得状态（零网络零 LLM——确定性视图）
 * resume : 崩溃恢复（running 悬挂问题按 failure-then-retry 协议重跑）
 * report : 战役报告（markdown/LaTeX/json；负结果如实入报告）
 * replay : 账本时间机（timeline + 链验证 + 双回放 diff——§10 后 T1 的本体）
 *
 * 运行纪律（承 drive-day2 实战教训）：runQuestion 走子进程 research 管线（自带
 * checkpoint/限流退避），HEAD 锚在 campaign_started 载入时记录于事件 payload 外的
 * sidecar（不进哈希链——环境事实非战役语义）；429 由 scheduler 的 rate_limited
 * 分类停机（分日 resume，不硬撞）。
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { planCampaignQuestions } from '../../campaign/planner.ts';
import {
  CAMPAIGNS_ROOT,
  loadCampaign,
  newCampaignId,
  saveCampaignStarted,
  appendEvent,
} from '../../campaign/store.ts';
import { runCampaignLoop, lastStopReason, type RunQuestion } from '../../campaign/scheduler.ts';
import { readCampaignEvents } from '../../campaign/event_log.ts';
import {
  generateCampaignReport,
  renderCampaignReportLatex,
  renderCampaignReportMarkdown,
  type CampaignReport,
} from '../../campaign/report_generator.ts';
import { replayCampaignLedger, diffCampaignReplays } from '../../campaign/replay.ts';

function campaignDir(id: string): string {
  return join(CAMPAIGNS_ROOT, id);
}

function resolveCampaignDir(idOrPath: string): string {
  if (existsSync(idOrPath) && idOrPath.endsWith('.json') === false && idOrPath.includes('campaign')) {
    return idOrPath;
  }
  const dir = campaignDir(idOrPath);
  if (!existsSync(join(dir, 'events.jsonl'))) {
    throw new Error(`far campaign: no campaign ledger at ${dir} (list ids under ${CAMPAIGNS_ROOT})`);
  }
  return dir;
}

/** 生产 runQuestion：子进程驱动 research 管线（checkpoint/退避由管线自带）。 */
function makeCliRunQuestion(outputDir: string): RunQuestion {
  return (question: string) => {
    const slug = question.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24).replace(/^-+|-+$/g, '') || 'q';
    const outFile = join(outputDir, 'runs', `${Date.now()}-${slug}.json`);
    mkdirSync(join(outputDir, 'runs'), { recursive: true });
    const r = spawnSync(
      process.execPath,
      ['src/cli/far.ts', 'research', 'start', question, '--profile', 'competition_aliyun_qwen', '--out', outFile],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 50 * 60_000 },
    );
    if (r.status !== 0 || !existsSync(outFile)) {
      const tail = `${r.stdout ?? ''}${r.stderr ?? ''}`.split('\n').filter(Boolean).slice(-3).join(' | ');
      throw new Error(tail.slice(0, 300) || `research start exited ${r.status}`);
    }
    const run = JSON.parse(readFileSync(outFile, 'utf8')) as {
      runId: string;
      stageReceipts?: ReadonlyArray<{ tokenUsage?: { totalTokens?: number } }>;
    };
    const tokens = run.stageReceipts?.reduce((n, s) => n + (s.tokenUsage?.totalTokens ?? 0), 0) ?? 0;
    return Promise.resolve({ runId: run.runId, tokens, status: 'OK' as const });
  };
}

export function runCampaignStart(args: readonly string[]): Promise<number> {
  let topic = '';
  let questionsFlag: string | undefined;
  let budgetTokens = 2_500_000;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--questions') {
      questionsFlag = args[++i];
      if (!questionsFlag) return Promise.resolve(usage('far campaign start: --questions needs "q1|q2|..."'));
      continue;
    }
    if (a === '--budget-tokens') {
      const v = Number(args[++i]);
      if (!Number.isFinite(v) || v <= 0) return Promise.resolve(usage('far campaign start: --budget-tokens needs a positive number'));
      budgetTokens = v;
      continue;
    }
    if (a === '--json') continue;
    if (topic === '' && a !== undefined && !a.startsWith('--')) topic = a;
  }
  if (topic === '') return Promise.resolve(usage('far campaign start: missing <topic>'));

  return (async () => {
    // LIVE decomposer is a follow-up wiring point (fail-closed today): without
    // --questions we refuse honestly rather than fabricate sub-questions (R9).
    if (questionsFlag === undefined) {
      process.stderr.write(
        'far campaign start: no --questions provided — LLM topic decomposition is not wired in this build;\n' +
        '  provide explicit questions: far campaign start "<topic>" --questions "q1|q2|q3" (deterministic, offline-safe)\n',
      );
      return 2;
    }
    const planned = await planCampaignQuestions({ topic, questions: questionsFlag.split('|').map((q: string) => q.trim()).filter(Boolean) as string[] });
    const id = newCampaignId(topic);
    const dir = campaignDir(id);
    saveCampaignStarted(dir, { topic, plannedQuestions: [...planned.questions], budgetTokens });
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    writeFileSync(join(dir, 'head.txt'), head, 'utf8');
    process.stdout.write(`far campaign: started ${id} (${planned.questions.length} questions, budget ${budgetTokens} tokens, HEAD ${head.slice(0, 8)})\n`);
    const state = await runCampaignLoop({ dir, runQuestion: makeCliRunQuestion(dir) });
    process.stdout.write(
      `far campaign: loop ended — completed=${state.questions.filter((q) => q.status === 'OK').length} ` +
      `failed=${state.questions.filter((q) => q.status === 'failed').length} tokens=${state.cumulativeTokens} ` +
      `stop=${lastStopReason(readCampaignEvents(dir))}\n`,
    );
    return 0;
  })();
}

export function runCampaignStatus(args: readonly string[]): number {
  const id = args[0];
  if (!id) return usage('far campaign status <campaignId>');
  try {
    const { state, events } = loadCampaign(resolveCampaignDir(id));
    const ok = state.questions.filter((q: { status: string }) => q.status === 'OK').length;
    const failed = state.questions.filter((q: { status: string }) => q.status === 'failed').length;
    process.stdout.write(
      [
        `campaign ${state.campaignId}`,
        `  topic      : ${state.topic}`,
        `  questions  : ${state.questions.length} (ok=${ok} failed=${failed} pending=${state.questions.length - ok - failed})`,
        `  tokens     : ${state.cumulativeTokens} / budget ${state.budgetTokens}${state.breakerTripped ? ' [BREAKER TRIPPED]' : ''}`,
        `  status     : ${state.completed ? 'COMPLETED' : 'IN_PROGRESS'} · events=${events.length} · stop=${lastStopReason(events)}`,
      ].join('\n') + '\n',
    );
    return 0;
  } catch (error) {
    process.stderr.write(`far campaign status: ${(error as Error).message}\n`);
    return 1;
  }
}

export function runCampaignResume(args: readonly string[]): Promise<number> {
  const id = args[0];
  if (!id) return Promise.resolve(usage('far campaign resume <campaignId>'));
  try {
    const dir = resolveCampaignDir(id);
    const state = runCampaignLoop({ dir, runQuestion: makeCliRunQuestion(dir) }).then((s: { cumulativeTokens: number; completed: boolean }) => {
      process.stdout.write(`far campaign: resume ended — tokens=${s.cumulativeTokens} completed=${s.completed}\n`);
      return 0;
    }, (err: Error) => {
      process.stderr.write(`far campaign resume: ${err.message}\n`);
      return 1;
    });
    return state;
  } catch (error) {
    process.stderr.write(`far campaign resume: ${(error as Error).message}\n`);
    return Promise.resolve(1);
  }
}

export function runCampaignReport(args: readonly string[]): number {
  const id = args[0];
  if (!id) return usage('far campaign report <campaignId> [--format md|latex|json]');
  let format = 'md';
  const fmtIdx = args.indexOf('--format');
  if (fmtIdx !== -1) format = args[fmtIdx + 1] ?? 'md';
  try {
    const dir = resolveCampaignDir(id);
    const { state, events } = loadCampaign(dir);
    const runSummaries = state.questions
      .filter((q) => q.status === 'OK')
      .map((q) => {
        const completed = [...events]
          .reverse()
          .find((e) => e.payload.type === 'question_completed' && e.payload.index === q.index);
        if (completed?.payload.type !== 'question_completed') {
          throw new Error(`far campaign report: OK question #${q.index} has no completion event (ledger/state divergence)`);
        }
        return { question: q.question, runId: completed.payload.runId, tokens: completed.payload.tokens };
      });
    const report: CampaignReport = generateCampaignReport({
      campaignId: state.campaignId,
      events,
      state,
      runSummaries,
    });
    const text =
      format === 'latex' ? renderCampaignReportLatex(report) :
      format === 'json' ? JSON.stringify(report, null, 2) :
      renderCampaignReportMarkdown(report);
    const ext = format === 'latex' ? 'tex' : format === 'json' ? 'json' : 'md';
    const out = join(dir, `report.${ext}`);
    writeFileSync(out, text, 'utf8');
    process.stdout.write(`far campaign report: ${out} (${text.length}B)\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`far campaign report: ${(error as Error).message}\n`);
    return 1;
  }
}

export function runCampaignReplay(args: readonly string[]): number {
  const id = args[0];
  if (!id) return usage('far campaign replay <campaignId> [--diff <otherCampaignId>]');
  try {
    const dir = resolveCampaignDir(id);
    const replay = replayCampaignLedger(dir);
    if (!replay.verification.valid) {
      process.stderr.write(
        `far campaign replay: LEDGER CHAIN BROKEN at event ${replay.verification.firstBrokenIndex} (${replay.verification.reason})\n`,
      );
      return 7;
    }
    process.stdout.write(`far campaign replay: ${replay.timeline.length} events, chain valid\n`);
    for (const t of replay.timeline) {
      process.stdout.write(`  #${t.seq} ${t.at} ${t.type} — ${t.summary}\n`);
    }
    const diffIdx = args.indexOf('--diff');
    if (diffIdx !== -1) {
      const other = args[diffIdx + 1];
      if (!other) return usage('far campaign replay: --diff needs a second campaignId');
      const otherReplay = replayCampaignLedger(resolveCampaignDir(other));
      const diff = diffCampaignReplays(replay, otherReplay);
      process.stdout.write(
        diff.identical
          ? 'far campaign replay: diff IDENTICAL\n'
          : `far campaign replay: diff DIVERGED at seq ${diff.firstDivergence?.seq} (${diff.firstDivergence?.aType} vs ${diff.firstDivergence?.bType})\n`,
      );
      return diff.identical ? 0 : 7;
    }
    return 0;
  } catch (error) {
    process.stderr.write(`far campaign replay: ${(error as Error).message}\n`);
    return 1;
  }
}

function usage(message: string): number {
  process.stderr.write(`${message}\n  usage: far campaign start "<topic>" --questions "q1|q2|..." [--budget-tokens N]\n         far campaign status <id>\n         far campaign resume <id>\n         far campaign report <id> [--format md|latex|json]\n         far campaign replay <id> [--diff <id2>]\n`);
  return 2;
}

// appendEvent re-exported for potential CLI-level event additions (reserved).
export { appendEvent };
