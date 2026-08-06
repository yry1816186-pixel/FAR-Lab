// src/cli/commands/arena.ts
// far arena "<hypothesis>" —— 对抗科学竞技场。
//
// 一个 hypothesis 由确定性内核裁决（原始 verdict），N 个 refuter 各自尝试从不同角度反驳，
// deterministic arbiter 判定每个 refuter 的裁决是否「着陆」（verdict 与原始分歧 = 有效攻击），
// 产出记分板。
// 诚实边界（2026-08-06 修正）：默认 offline_replay fixture 回放——refuter 回放同一套 fixture，
// verdict 必然与原始相同 → 无有效攻击（展示「竞技场框架 + deterministic arbiter + 记分板」，
// 非真实抗攻击）。真实对抗：`--profile competition_aliyun_qwen`（凭据门：FAR_DASHSCOPE_API_KEY
// 或 DASHSCOPE_API_KEY·真实 HTTP 计费·G3 环境锚 2026-08-06 已闭合）。
// 红线：refuter 的 verdict 仍由 R0-R9 确定性内核给出（LLM 非裁决者）；arbiter 是确定性规则，非 LLM 仲裁。

import { resolveGitCommitSha } from '../git_commit_sha.ts';
import {
  runArenaSession,
  type ArenaResult,
  type ArenaSessionOptions,
} from '../../api/internal/arena_service.ts';
import { createCompetitionQwenGateway } from '../../llm_gateway/competition_gateway.ts';
import { COMPETITION_MODEL_SNAPSHOT } from '../../llm_gateway/adapters/aliyun_qwen/snapshot.ts';

/** Input parameters for operations involving arena args. */
export interface ArenaArgs {
  readonly hypothesis: string;
  readonly refuters: readonly string[];
  readonly json: boolean;
  /** 真实 provider profile（默认 offline_replay·competition_aliyun_qwen 走真实 HTTP 计费）。 */
  readonly profile: string;
}

const DEFAULT_REFUTERS = ['scope-launderer', 'post-hoc-threshold', 'dataset-drift'];

/**
 * parse arena args.
 */
export function parseArenaArgs(argv: readonly string[]): ArenaArgs {
  let hypothesis = '';
  let refuters: readonly string[] = DEFAULT_REFUTERS;
  let json = false;
  let profile = 'offline_replay';

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
    if (a === '--profile') {
      profile = argv[++i] ?? profile;
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

  return { hypothesis, refuters, json, profile };
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
      'far arena: missing hypothesis.\n  usage: far arena "<hypothesis>" [--refuters a,b,c] [--profile offline_replay|competition_aliyun_qwen] [--json]\n',
    );
    return 2;
  }

  // 真实 provider 路径（2026-08-06·G3 环境锚闭合后接线）：凭据门 + competition gateway
  let sessionOptions: ArenaSessionOptions = {};
  if (args.profile !== 'offline_replay') {
    const apiKey = process.env.FAR_DASHSCOPE_API_KEY ?? process.env.DASHSCOPE_API_KEY;
    if (apiKey === undefined || apiKey === '') {
      process.stderr.write(
        `far arena: profile "${args.profile}" needs real LLM credentials.\n` +
          '  set FAR_DASHSCOPE_API_KEY=sk-xxx or DASHSCOPE_API_KEY=sk-xxx and retry (real adversarial arena·billing applies).\n' +
          '  default offline_replay needs no credentials (fixture replay).\n',
      );
      return 2;
    }
    sessionOptions = {
      gateway: createCompetitionQwenGateway({ apiKey }),
      modelSnapshot: COMPETITION_MODEL_SNAPSHOT,
      providerProfile: args.profile,
      providerLabel: args.profile,
    };
  }

  const res = await runArenaSession(
    args.hypothesis,
    args.refuters,
    resolveGitCommitSha(),
    sessionOptions,
  );

  if (args.json) {
    process.stdout.write(`${JSON.stringify(res, null, 2)}\n`);
  } else {
    renderHuman(res);
  }
  return 0;
}
