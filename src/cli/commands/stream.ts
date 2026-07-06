// src/cli/commands/stream.ts
// far stream "<question>" —— 同 far ask 但 SSE/stdio 流式打印每阶段。
//
// 复用 executeAskRun（runAgentLoop + ASK-9 密封）。通过 onArtifact 回调在每个 stage artifact
// 入链后立即打印（真·实时流，非跑完回放——runAgentLoop.onArtifact 钩子驱动）。
// 默认 offline_replay profile（零密钥·fixture）；真实推理同 far ask 的 profile 限制。

import Database from 'better-sqlite3';

import type { StageArtifact } from '../../agent_loop/types.ts';
import { runMigrations } from '../../db/migrator.ts';
import { resolveGitCommitSha } from '../git_commit_sha.ts';
import { executeAskRun } from './ask.ts';

export interface StreamArgs {
  readonly question: string;
  readonly mode: 'full' | 'quick';
  readonly json: boolean;
  readonly profile: string;
}

export function parseStreamArgs(argv: readonly string[]): StreamArgs {
  let question = '';
  let mode: 'full' | 'quick' = 'full';
  let json = false;
  let profile = 'offline_replay';

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a === '--mode') {
      const v = argv[++i];
      if (v !== 'full' && v !== 'quick') {
        throw new Error(`far stream: --mode 须为 full|quick（实际: ${v ?? '<missing>'}）`);
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
    if (a.startsWith('--')) {
      throw new Error(`far stream: 未知参数 "${a}"`);
    }
    if (question === '') {
      question = a;
    } else {
      question += ' ' + a;
    }
  }

  return { question, mode, json, profile };
}

const STAGE_LABELS: Readonly<Record<string, string>> = {
  stage1_understanding: '理解',
  stage2_integration: '整合',
  stage3_hypothesis: '假设',
  stage4_evidence: '证据',
  stage5_plan: '规划',
  stage6_feedback: '反馈',
};

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

export async function runStream(argv: readonly string[]): Promise<number> {
  const args = parseStreamArgs(argv);

  if (args.question.trim().length === 0) {
    process.stderr.write(
      'far stream: 缺少 question。\n  用法: far stream "<问题>" [--mode full|quick] [--json]\n',
    );
    return 2;
  }

  if (args.profile !== 'offline_replay') {
    process.stderr.write(
      `far stream: profile "${args.profile}" 需真实凭据路径（同 far ask）。当前 CLI 仅支持 offline_replay。\n`,
    );
    return 2;
  }

  if (!args.json) {
    process.stdout.write('\n  FAR-Chain · far stream（实时流式）\n');
    process.stdout.write(`  question : ${args.question}\n`);
    process.stdout.write('  ─────────────────────────────────────────────────\n');
  }

  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  runMigrations(db);
  try {
    const gitCommitSha = resolveGitCommitSha();
    const result = await executeAskRun(db, args.question, args.mode, gitCommitSha, (a) =>
      renderStageLine(a, args.json),
    );

    const ls = result.loopState;
    const vn = ls.verdictNode;
    if (!args.json) {
      process.stdout.write('  ─────────────────────────────────────────────────\n');
      process.stdout.write(`  ✓ run     : ${result.runId} · ${ls.artifacts.length} stages · ${ls.iterationsCompleted} iter\n`);
      process.stdout.write(`  ✓ stop    : ${ls.terminationReason}\n`);
      if (vn !== null) {
        process.stdout.write(`  ✓ verdict : ${vn.verdict}（${vn.verdictTrace.decisiveRuleId}）\n`);
      }
      process.stdout.write(`  ✓ chain   : ${result.reproHash}\n`);
      process.stdout.write(
        '\n  ⚠ honest : offline_replay fixture 驱动（非真实科学裁决）。裁决由 R0-R9 确定性内核给出（LLM 非裁决者）。\n\n',
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
        })}\n`,
      );
    }

    return ls.terminationReason === 'error' ? 1 : 0;
  } finally {
    db.close();
  }
}
