// src/cli/commands/stream.ts
// far stream "<question>" —— 同 far ask 但 SSE/stdio 流式打印每阶段。
//
// 复用 executeAskRun（runAgentLoop + ASK-9 密封）。通过 onArtifact 回调在每个 stage artifact
// 入链后立即打印（真·实时流，非跑完回放——runAgentLoop.onArtifact 钩子驱动）。
// 默认 offline_replay profile（零密钥·fixture）；真实推理同 far ask 的 profile 限制。


import type { StageArtifact } from '../../agent_loop/types.ts';
import type { AgentLoopEvent } from '../../agent_loop/events.ts';
import { openFarDb } from '../../db/open.ts';
import { resolveGitCommitSha } from '../git_commit_sha.ts';
import { executeAskRun } from './ask.ts';

/** Input parameters for operations involving stream args. */
export interface StreamArgs {
  readonly question: string;
  readonly mode: 'full' | 'quick';
  readonly json: boolean;
  readonly profile: string;
  /** P0-3 事件流显示（run_started/stage_started/stage_completed/...·2026-08-07）。 */
  readonly events: boolean;
}

/**
 * parse stream args.
 */
export function parseStreamArgs(argv: readonly string[]): StreamArgs {
  let question = '';
  let mode: 'full' | 'quick' = 'full';
  let json = false;
  let profile = 'offline_replay';
  let events = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a === '--mode') {
      const v = argv[++i];
      if (v !== 'full' && v !== 'quick') {
        throw new Error(`far stream: --mode must be full|quick (got: ${v ?? '<missing>'})`);
      }
      mode = v;
      continue;
    }
    if (a === '--json') {
      json = true;
      continue;
    }
    if (a === '--profile') {
      profile = argv[++i] ?? profile;
      continue;
    }
    if (a === '--events') {
      events = true;
      continue;
    }
    if (a.startsWith('--')) {
      throw new Error(`far stream: unknown argument "${a}"`);
    }
    if (question === '') {
      question = a;
    } else {
      question += ' ' + a;
    }
  }

  return { question, mode, json, profile, events };
}

const STAGE_LABELS: Readonly<Record<string, string>> = {
  stage1_understanding: 'Understanding',
  stage2_integration: 'Integration',
  stage3_hypothesis: 'Hypothesis',
  stage4_evidence: 'Evidence',
  stage5_plan: 'Planning',
  stage6_feedback: 'Feedback',
};

/** P0-3 事件流渲染（--events）。json 模式输出单行 JSON 事件（管道/SSE 消费友好）。 */
function renderEventLine(evt: AgentLoopEvent, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(evt)}\n`);
    return;
  }
  switch (evt.type) {
    case 'run_started':
      process.stdout.write(`  ▶ run started · max ${evt.maxIterations} iter · ${evt.verdictDriven ? 'verdict-driven' : 'feedback'}\n`);
      break;
    case 'stage_started': {
      const label = STAGE_LABELS[evt.stageId] ?? evt.stageId;
      process.stdout.write(`  ◐ iter ${evt.iteration} · ${evt.stageId} (${label})...\n`);
      break;
    }
    case 'stage_completed': {
      const flag = evt.degraded ? ' ⚠degraded' : '';
      process.stdout.write(`  ◑ iter ${evt.iteration} · ${evt.stageId} ✓ · ${evt.payloadKind} · ${evt.tokens} tokens${flag}\n`);
      break;
    }
    case 'iteration_completed':
      process.stdout.write(`  ↻ iter ${evt.iteration} done · ${evt.tokensConsumed} tokens · verdict=${evt.verdict ?? 'n/a'}\n`);
      break;
    case 'run_completed':
      process.stdout.write(`  ✓ run done · reason=${evt.reason} · ${evt.iterations} iter · verdict=${evt.verdict ?? 'n/a'}\n`);
      break;
    case 'run_error':
      process.stdout.write(`  ✗ run error · code=${evt.code} · ${evt.message}\n`);
      break;
  }
}

function renderStageLine(artifact: StageArtifact, json: boolean): void {
  const tokens = artifact.callResult.credential.tokenUsage.totalTokens;
  if (json) {
    process.stdout.write(
      `${JSON.stringify({
        stageId: artifact.stageId,
        payloadKind: artifact.payloadKind,
        tokens,
        degraded: artifact.degraded,
      })}\n`,
    );
    return;
  }
  const label = STAGE_LABELS[artifact.stageId] ?? artifact.stageId;
  const flag = artifact.degraded ? ' ⚠degraded' : '';
  process.stdout.write(`  ◐ ${artifact.stageId.padEnd(22)} ${label.padEnd(4)} · ${tokens} tokens${flag}\n`);
}

/**
 * run stream.
 */
export async function runStream(argv: readonly string[]): Promise<number> {
  const args = parseStreamArgs(argv);

  if (args.question.trim().length === 0) {
    process.stderr.write(
      'far stream: missing question.\n  usage: far stream "<question>" [--mode full|quick] [--json] [--events]\n',
    );
    return 2;
  }

  if (args.profile !== 'offline_replay') {
    process.stderr.write(
      `far stream: profile "${args.profile}" needs a real-credential path (same as far ask). The CLI currently supports offline_replay only.\n`,
    );
    return 2;
  }

  if (!args.json) {
    process.stdout.write('\n  FAR-Lab · far stream (live streaming)\n');
    process.stdout.write(`  question : ${args.question}\n`);
    process.stdout.write('  ─────────────────────────────────────────────────\n');
  }

  const db = openFarDb(':memory:');
  try {
    const gitCommitSha = resolveGitCommitSha();
    const result = await executeAskRun(
      db,
      args.question,
      args.mode,
      gitCommitSha,
      (a) => renderStageLine(a, args.json),
      args.events ? (evt) => renderEventLine(evt, args.json) : undefined,
    );

    const ls = result.loopState;
    const vn = ls.verdictNode;
    if (!args.json) {
      process.stdout.write('  ─────────────────────────────────────────────────\n');
      process.stdout.write(`  ✓ run     : ${result.runId} · ${ls.artifacts.length} stages · ${ls.iterationsCompleted} iter\n`);
      process.stdout.write(`  ✓ stop    : ${ls.terminationReason}\n`);
      if (vn !== null) {
        process.stdout.write(`  ✓ verdict : ${vn.verdict} (${vn.verdictTrace.decisiveRuleId})\n`);
      }
      process.stdout.write(`  ✓ chain   : ${result.reproHash}\n`);
      const tg = result.traceGrade;
      process.stdout.write(
        `  ✓ grade   : ${tg.score.toFixed(3)} (${tg.gradedBy})${tg.failureCodes.length > 0 ? ` · failures=${tg.failureCodes.join(',')}` : ''}\n`,
      );
      process.stdout.write(
        '\n  ⚠ honest : offline_replay fixture driven (not a real scientific verdict). The verdict is given by the deterministic R0-R9 kernel (the LLM is not the adjudicator).\n\n',
      );
    } else {
      process.stdout.write(
        `${JSON.stringify({
          runId: result.runId,
          terminationReason: ls.terminationReason,
          stageCount: ls.artifacts.length,
          verdict: vn === null ? null : vn.verdict,
          decisiveRuleId: vn === null ? null : vn.verdictTrace.decisiveRuleId,
          chainHeadHash: result.reproHash,
          traceGrade: {
            score: result.traceGrade.score,
            gradedBy: result.traceGrade.gradedBy,
            failureCodes: result.traceGrade.failureCodes,
          },
        })}\n`,
      );
    }

    return ls.terminationReason === 'error' ? 1 : 0;
  } finally {
    db.close();
  }
}
