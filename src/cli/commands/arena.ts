// src/cli/commands/arena.ts
// far arena "<hypothesis>" —— 对抗科学竞技场。
//
// 一个 hypothesis 由确定性内核裁决（原始 verdict），N 个 refuter 各自尝试从不同角度反驳，
// deterministic arbiter 判定每个 refuter 的裁决是否「着陆」（verdict 与原始分歧 = 有效攻击），
// 产出记分板。
// 诚实边界：offline_replay 下 refuter 回放同一套 fixture，verdict 必然与原始相同 → 无有效攻击
// （展示「稳健」是 fixture 一致的结果，非真实抗攻击）。真实对抗需 --refuters 接真实 provider。
// 红线：refuter 的 verdict 仍由 R0-R9 确定性内核给出（LLM 非裁决者）；arbiter 是确定性规则，非 LLM 仲裁。

import Database from 'better-sqlite3';
import { ulid } from 'ulid';

import { createLlmGateway } from '../../llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../llm_gateway/adapters/offline_replay/client.ts';
import { runMigrations } from '../../db/migrator.ts';
import { resolveGitCommitSha } from '../git_commit_sha.ts';
import { executeAskRun } from './ask.ts';

export interface ArenaArgs {
  readonly hypothesis: string;
  readonly refuters: readonly string[];
  readonly json: boolean;
}

const DEFAULT_REFUTERS = ['scope-launderer', 'post-hoc-threshold', 'dataset-drift'];

export function parseArenaArgs(argv: readonly string[]): ArenaArgs {
  let hypothesis = '';
  let refuters: readonly string[] = DEFAULT_REFUTERS;
  let json = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a === '--refuters') {
      const raw = argv[++i] ?? '';
      const parts = raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
      if (parts.length === 0) {
        throw new Error('far arena: --refuters 须为逗号分隔的非空列表');
      }
      refuters = parts;
      continue;
    }
    if (a === '--json') {
      json = true;
      continue;
    }
    if (a.startsWith('--')) {
      throw new Error(`far arena: 未知参数 "${a}"`);
    }
    hypothesis = hypothesis === '' ? a : `${hypothesis} ${a}`;
  }

  return { hypothesis, refuters, json };
}

interface RefuteAttempt {
  readonly refuter: string;
  readonly verdict: string | null;
  readonly attackLanded: boolean;
  readonly error: string | null;
}

interface ArenaResult {
  readonly arenaId: string;
  readonly hypothesis: string;
  readonly originalVerdict: string | null;
  readonly originalRule: string | null;
  readonly attempts: readonly RefuteAttempt[];
  readonly landedCount: number;
  readonly robust: boolean;
  readonly honestNote: string;
}

export function detectRefuterAttack(originalVerdict: string | null, refuterVerdict: string | null): boolean {
  return originalVerdict !== null && refuterVerdict !== null && refuterVerdict !== originalVerdict;
}

async function runOne(question: string, modelId: string, gitCommitSha: string): Promise<{
  verdict: string | null;
  rule: string | null;
  error: string | null;
}> {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  runMigrations(db);
  try {
    const gateway = createLlmGateway([createOfflineReplayAdapter({ modelId })]);
    const result = await executeAskRun(db, question, 'quick', gitCommitSha, undefined, gateway);
    const vn = result.loopState.verdictNode;
    return {
      verdict: vn === null ? null : vn.verdict,
      rule: vn === null ? null : vn.verdictTrace.decisiveRuleId,
      error: result.loopState.error === null ? null : result.loopState.error.message,
    };
  } catch (err) {
    return { verdict: null, rule: null, error: err instanceof Error ? err.message : String(err) };
  } finally {
    db.close();
  }
}

async function executeArenaSession(args: ArenaArgs, gitCommitSha: string): Promise<ArenaResult> {
  const orig = await runOne(args.hypothesis, 'arena-proponent', gitCommitSha);
  const originalVerdict = orig.verdict;

  const attempts: RefuteAttempt[] = [];
  for (const refuter of args.refuters) {
    const r = await runOne(`${args.hypothesis} [refute: ${refuter}]`, `arena-refuter-${refuter}`, gitCommitSha);
    const attackLanded = detectRefuterAttack(originalVerdict, r.verdict);
    attempts.push({ refuter, verdict: r.verdict, attackLanded, error: r.error });
  }

  const landedCount = attempts.filter((a) => a.attackLanded).length;

  return {
    arenaId: ulid(),
    hypothesis: args.hypothesis,
    originalVerdict,
    originalRule: orig.rule,
    attempts,
    landedCount,
    robust: landedCount === 0,
    honestNote:
      'offline_replay 下 refuter 回放同一套 fixture，verdict 必然与原始相同 → 无有效攻击；真实对抗需 --refuters 接真实 provider',
  };
}

function renderHuman(res: ArenaResult): void {
  const lines = [
    '',
    '  FAR-Chain · far arena（对抗科学竞技场）',
    '  ─────────────────────────────────────────────────',
    `  hypothesis : ${res.hypothesis}`,
    `  original   : ${res.originalVerdict ?? '<无裁决>'}${res.originalRule === null ? '' : `（${res.originalRule}）`}`,
    '  ─────────────────────────────────────────────────',
  ];
  for (const a of res.attempts) {
    const mark = a.attackLanded ? '✗ LANDED' : '✓ held';
    const vd = a.verdict ?? `<错误>`;
    const err = a.error === null ? '' : `  ⚠ ${a.error}`;
    lines.push(`  ${a.refuter.padEnd(22)} → ${vd}  ${mark}${err}`);
  }
  lines.push('  ─────────────────────────────────────────────────');
  lines.push(`  verdict : ${res.robust ? 'ROBUST（无有效攻击）' : `BREACHED（${res.landedCount} 次有效攻击）`}`);
  lines.push(`  arena   : ${res.arenaId}`);
  lines.push('');
  lines.push(`  ⚠ honest : ${res.honestNote}`);
  lines.push('  红线：arbiter 是确定性规则（verdict 分歧检测），非 LLM 仲裁');
  lines.push('');
  process.stdout.write(lines.join('\n'));
}

export async function runArena(argv: readonly string[]): Promise<number> {
  const args = parseArenaArgs(argv);

  if (args.hypothesis.trim().length === 0) {
    process.stderr.write(
      'far arena: 缺少 hypothesis。\n  用法: far arena "<hypothesis>" [--refuters a,b,c] [--json]\n',
    );
    return 2;
  }

  const res = await executeArenaSession(args, resolveGitCommitSha());

  if (args.json) {
    process.stdout.write(`${JSON.stringify(res, null, 2)}\n`);
  } else {
    renderHuman(res);
  }
  return 0;
}
