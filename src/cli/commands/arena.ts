// src/cli/commands/arena.ts
// `far arena` runs a credential-gated live adversarial session.
//
// There is no public offline profile. Engineering fixtures belong in tests; an
// arbitrary user hypothesis must never receive a canned robustness result.

import { resolveGitCommitSha } from '../git_commit_sha.ts';
import {
  runArenaSession,
  type ArenaResult,
} from '../../api/internal/arena_service.ts';
import { createCompetitionQwenGateway } from '../../llm_gateway/competition_gateway.ts';
import { COMPETITION_MODEL_SNAPSHOT } from '../../llm_gateway/adapters/aliyun_qwen/snapshot.ts';

/** Parsed arena arguments. */
export interface ArenaArgs {
  readonly hypothesis: string;
  readonly refuters: readonly string[];
  readonly json: boolean;
  readonly profile: 'auto' | 'competition_aliyun_qwen';
}

const DEFAULT_REFUTERS = ['scope-launderer', 'post-hoc-threshold', 'dataset-drift'];

export function parseArenaArgs(argv: readonly string[]): ArenaArgs {
  let hypothesis = '';
  let refuters: readonly string[] = DEFAULT_REFUTERS;
  let json = false;
  let profile: ArenaArgs['profile'] = 'auto';

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined) continue;
    if (argument === '--refuters') {
      const raw = argv[++index] ?? '';
      const parts = raw.split(',').map((item) => item.trim()).filter((item) => item.length > 0);
      if (parts.length === 0) {
        throw new Error('far arena: --refuters must be a comma-separated non-empty list');
      }
      refuters = parts;
      continue;
    }
    if (argument === '--profile') {
      const value = argv[++index];
      if (value !== 'auto' && value !== 'competition_aliyun_qwen') {
        throw new Error(
          `far arena: --profile must be auto|competition_aliyun_qwen (got: ${value ?? '<missing>'})`,
        );
      }
      profile = value;
      continue;
    }
    if (argument === '--json') {
      json = true;
      continue;
    }
    if (argument.startsWith('--')) {
      throw new Error(`far arena: unknown argument "${argument}"`);
    }
    hypothesis = hypothesis === '' ? argument : `${hypothesis} ${argument}`;
  }

  return { hypothesis, refuters, json, profile };
}

export { detectRefuterAttack } from '../../api/internal/arena_service.ts';
export type { ArenaResult } from '../../api/internal/arena_service.ts';

function renderHuman(result: ArenaResult): void {
  const lines = [
    '',
    '  FAR-Lab · far arena (live adversarial science arena)',
    '  ─────────────────────────────────────────────────',
    `  hypothesis : ${result.hypothesis}`,
    `  original   : ${result.originalVerdict ?? '<no verdict>'}${result.originalRule === null ? '' : ` (${result.originalRule})`}`,
  ];
  if (result.originalError !== null) {
    lines.push(`  original error: ${result.originalError}`);
  }
  lines.push('  ─────────────────────────────────────────────────');
  for (const attempt of result.attempts) {
    const mark = attempt.attackLanded ? 'LANDED' : attempt.error === null ? 'held' : 'INCONCLUSIVE';
    const verdict = attempt.verdict ?? '<no verdict>';
    const error = attempt.error === null ? '' : `  error=${attempt.error}`;
    lines.push(`  ${attempt.refuter.padEnd(22)} → ${verdict}  ${mark}${error}`);
  }
  lines.push('  ─────────────────────────────────────────────────');
  lines.push(`  assessment : ${result.assessment}`);
  lines.push(`  landed     : ${result.landedCount}`);
  lines.push(`  arena      : ${result.arenaId}`);
  lines.push('');
  lines.push(`  honest: ${result.honestNote}`);
  lines.push('  boundary: deterministic verdict-divergence detection is not universal robustness or scientific truth.');
  lines.push('');
  process.stdout.write(lines.join('\n'));
}

export async function runArena(argv: readonly string[]): Promise<number> {
  const args = parseArenaArgs(argv);
  if (args.hypothesis.trim().length === 0) {
    process.stderr.write(
      'far arena: missing hypothesis.\n' +
        '  usage: far arena "<hypothesis>" [--refuters a,b,c] [--profile auto|competition_aliyun_qwen] [--json]\n',
    );
    return 2;
  }

  const apiKey = process.env.FAR_DASHSCOPE_API_KEY ?? process.env.DASHSCOPE_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) {
    process.stderr.write(
      'far arena: REQUIRES_CONFIGURATION — a live adversarial session needs a model API key.\n' +
        '  set FAR_DASHSCOPE_API_KEY or DASHSCOPE_API_KEY and retry.\n' +
        '  offline fixtures are test-only and cannot produce an arena assessment for an arbitrary hypothesis.\n',
    );
    return 2;
  }

  const result = await runArenaSession(
    args.hypothesis,
    args.refuters,
    resolveGitCommitSha(),
    {
      gateway: createCompetitionQwenGateway({ apiKey }),
      modelSnapshot: COMPETITION_MODEL_SNAPSHOT,
      providerProfile: 'competition_aliyun_qwen',
      providerLabel: 'competition_aliyun_qwen',
    },
  );

  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    renderHuman(result);
  }
  return result.assessment === 'INCONCLUSIVE' ? 3 : 0;
}
