// src/cli/commands/arena.ts
// far arena "<hypothesis>" —— 对抗科学竞技场。
//
// 一个 hypothesis 由确定性内核裁决（原始 verdict），N 个 refuter 各自尝试从不同角度反驳，
// deterministic arbiter 判定每个 refuter 的裁决是否「着陆」（verdict 与原始分歧 = 有效攻击），
// 产出记分板。
// 诚实边界：offline_replay 下 refuter 回放同一套 fixture，verdict 必然与原始相同 → 无有效攻击
// （展示「稳健」是 fixture 一致的结果，非真实抗攻击）。真实对抗需 --refuters 接真实 provider。
// 红线：refuter 的 verdict 仍由 R0-R9 确定性内核给出（LLM 非裁决者）；arbiter 是确定性规则，非 LLM 仲裁。

import { resolveGitCommitSha } from '../git_commit_sha.ts';
import {
  runArenaSession,
  type ArenaResult,
} from '../../api/internal/arena_service.ts';

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

// detectRefuterAttack + ArenaResult + runArenaSession 已提取至 api/internal/arena_service.ts（CLI + API 共用）。
export { detectRefuterAttack } from '../../api/internal/arena_service.ts';
export type { ArenaResult } from '../../api/internal/arena_service.ts';

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

  const res = await runArenaSession(args.hypothesis, args.refuters, resolveGitCommitSha());

  if (args.json) {
    process.stdout.write(`${JSON.stringify(res, null, 2)}\n`);
  } else {
    renderHuman(res);
  }
  return 0;
}
