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

/** Input parameters for operations involving arena args. */
export interface ArenaArgs {
  readonly hypothesis: string;
  readonly refuters: readonly string[];
  readonly json: boolean;
}

const DEFAULT_REFUTERS = ['scope-launderer', 'post-hoc-threshold', 'dataset-drift'];

/**
 * parse arena args.
 */
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
        throw new Error('far arena: --refuters must be a comma-separated non-empty list');
      }
      refuters = parts;
      continue;
    }
    if (a === '--json') {
      json = true;
      continue;
    }
    if (a.startsWith('--')) {
      throw new Error(`far arena: unknown argument "${a}"`);
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
    '  FAR-Lab · far arena (adversarial science arena)',
    '  ─────────────────────────────────────────────────',
    `  hypothesis : ${res.hypothesis}`,
    `  original   : ${res.originalVerdict ?? '<no verdict>'}${res.originalRule === null ? '' : `(${res.originalRule})`}`,
    '  ─────────────────────────────────────────────────',
  ];
  for (const a of res.attempts) {
    const mark = a.attackLanded ? '✗ LANDED' : '✓ held';
    const vd = a.verdict ?? '<error>';
    const err = a.error === null ? '' : `  ⚠ ${a.error}`;
    lines.push(`  ${a.refuter.padEnd(22)} → ${vd}  ${mark}${err}`);
  }
  lines.push('  ─────────────────────────────────────────────────');
  lines.push(`  verdict : ${res.robust ? 'ROBUST (no effective attacks)' : `BREACHED (${res.landedCount} effective attacks)`}`);
  lines.push(`  arena   : ${res.arenaId}`);
  lines.push('');
  lines.push(`  ⚠ honest : ${res.honestNote}`);
  lines.push('  red line: the arbiter is a deterministic rule (verdict-divergence detection), not LLM arbitration');
  lines.push('');
  process.stdout.write(lines.join('\n'));
}

/**
 * run arena.
 */
export async function runArena(argv: readonly string[]): Promise<number> {
  const args = parseArenaArgs(argv);

  if (args.hypothesis.trim().length === 0) {
    process.stderr.write(
      'far arena: missing hypothesis.\n  usage: far arena "<hypothesis>" [--refuters a,b,c] [--json]\n',
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
