// src/cli/commands/judge_pairwise.ts
// far research judge <runId> — LLM-as-judge pairwise comparison of a run's
// hypotheses with position-bias mitigation (directive 2.md §2.2 R10, T0).
//
// What this command is: the explicitly NON-deterministic model-critique layer
// (b3) — every pair of hypotheses is judged TWICE (both presentation orders,
// order assignment randomized by a seed derived from the runId and RECORDED in
// the report), and the bidirectional inconsistency rate is reported honestly.
//
// Honesty rules:
//   - REFERENCE SIGNAL ONLY: judge output never feeds verdicts, scorecards,
//     or the registry ladder — ranking authority stays with the deterministic
//     tournament and the R0-R9 kernel.
//   - Fail-closed (R9 zero-tolerance): without a usable live profile/key this
//     command prints a `judge_live_profile_unavailable` error (the
//     `*_live_profile_unavailable` family used by ask/research LIVE paths) and
//     exits non-zero. There is NO offline judge mode — a fixture "judge" would
//     be a fabricated winner. Test wiring uses an explicitly injected judge
//     double, never a fixture profile.
//   - A judge reply that does not parse, or names a winner outside the pair,
//     is a hard error (exit 1) — never guessed, never silently dropped.

import { readFileSync } from 'node:fs';

import { z } from 'zod';

import {
  buildJudgePairs,
  buildJudgePrompts,
  computePositionConsistency,
  deriveJudgeOrderSeed,
  POSITION_BIAS_WARNING_THRESHOLD,
  type JudgeCaller,
  type JudgeConsistencyReport,
  type JudgeDirection,
  type JudgeResponse,
  type JudgeTokenUsage,
} from '../../discovery/judge_pairwise.ts';
import { createCompetitionQwenGateway } from '../../llm_gateway/competition_gateway.ts';
import { parseResearchRunJson } from '../../research/schemas.ts';
import type { ResearchRun } from '../../research/types.ts';
import type { RunStore } from '../../research/run_lifecycle.ts';
import { resolveRunStore, liveApiKey } from './research.ts';

/** Parsed options for the judge command argv (wired by the coordinator in far.ts). */
export interface JudgePairwiseArgs {
  readonly runId: string;
  readonly profile: 'auto' | 'competition_aliyun_qwen';
  readonly json: boolean;
}

/** Parse `far research judge <runId> [--profile ...] [--json]` argv. */
export function parseJudgePairwiseArgs(argv: readonly string[]): JudgePairwiseArgs {
  let runId = '';
  let profile: 'auto' | 'competition_aliyun_qwen' = 'auto';
  let json = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a === '--profile') {
      const v = argv[++i];
      if (v !== 'auto' && v !== 'competition_aliyun_qwen') {
        throw new Error(
          `far research judge: --profile must be auto|competition_aliyun_qwen (got: ${v ?? '<missing>'}) — there is no offline judge (fabricated winners are forbidden)`,
        );
      }
      profile = v;
      continue;
    }
    if (a === '--json') {
      json = true;
      continue;
    }
    if (a.startsWith('--')) {
      throw new Error(`far research judge: unknown argument "${a}"`);
    }
    runId = runId === '' ? a : `${runId} ${a}`;
  }
  return { runId, profile, json };
}

/** Options for runJudgePairwise. store/apiKey/judge/stdout/stderr are DI seams for tests. */
export interface JudgePairwiseOptions {
  readonly runId: string;
  readonly profile?: 'auto' | 'competition_aliyun_qwen';
  readonly json?: boolean;
  /** Run store override (default: resolveRunStore() — FAR_RESEARCH_RUNS_DIR aware). */
  readonly store?: RunStore;
  /**
   * Live API key override (default: the shared liveApiKey() read used by
   * `far ask` / `far research`; empty string treated as absent). Ignored when
   * `judge` is injected.
   */
  readonly apiKey?: string;
  /**
   * Injected judge double (tests only — the production path always builds the
   * LIVE gateway judge). Injected judges must still answer within the pair.
   */
  readonly judge?: JudgeCaller;
  /** stdout/stderr sinks (default: process streams) — injected by tests. */
  readonly stdout?: (text: string) => void;
  readonly stderr?: (text: string) => void;
}

/** Strict winner payload contract (structured output; no fallback parsing). */
const JudgeWinnerZod = z.object({ winnerId: z.string().min(1) });

/** R9-style fail-closed guidance for the missing live profile (ask/research family). */
function writeLiveProfileUnavailable(out: (text: string) => void): void {
  out(
    'far research judge: judge_live_profile_unavailable — no model API key found.\n' +
      '  LLM-as-judge comparison needs a live model; there is NO offline judge mode because a\n' +
      '  fixture "judge" would fabricate winners (R9 zero-tolerance on fabricated model output).\n\n' +
      '  get a key  : https://bailian.console.aliyun.com/  then set the live key in the environment (see far doctor)\n' +
      '  free, now  : far research status <runId>          → deterministic tournament board, no key\n' +
      '  real kernel: far demo                            → deterministic 15/15 golden vectors, no key\n',
  );
}

/** Load and validate the run file (fail loud on absence/corruption — never a partial judge). */
function loadRun(store: RunStore, runId: string):
  { readonly ok: true; readonly run: ResearchRun } | { readonly ok: false; readonly error: string } {
  const path = store.runPath(runId);
  try {
    return { ok: true, run: parseResearchRunJson(readFileSync(path, 'utf8')) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `cannot load run ${runId} (${path}): ${message}` };
  }
}

/** Build the LIVE judge caller: gateway + structured output + zod parse (fail-closed). */
function createGatewayJudge(apiKey: string): JudgeCaller {
  const gateway = createCompetitionQwenGateway({ apiKey });
  // G1 wiring guard (same defensive check as far ask): a gateway that failed to
  // register the live adapter must fail loudly here, not on the first call.
  if (!gateway.registeredProfiles().includes('competition_aliyun_qwen')) {
    throw new Error(
      'far research judge: competition gateway failed to register competition_aliyun_qwen adapter (G1 wiring broken)',
    );
  }
  return async ({ pair, prompts }) => {
    const response = await gateway.callLlm('competition_aliyun_qwen', {
      messages: [
        { role: 'system', content: prompts.systemPrompt },
        { role: 'user', content: prompts.userPrompt },
      ],
      temperature: 0,
      maxTokens: 256,
      responseFormat: 'json_schema',
      jsonSchema: {
        name: 'far_judge_pairwise_winner',
        schema: {
          type: 'object',
          properties: { winnerId: { type: 'string', enum: [pair.aId, pair.bId] } },
          required: ['winnerId'],
          additionalProperties: false,
        },
        strict: true,
      },
      purposeTag: 'research_judge_pairwise',
    });
    let raw: unknown;
    try {
      raw = JSON.parse(response.content);
    } catch (error) {
      throw new Error(
        `judge reply is not valid JSON (pair ${pair.pairIndex}): ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    const parsed = JudgeWinnerZod.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `judge reply failed the winner contract (pair ${pair.pairIndex}): ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      );
    }
    const usage = response.credential.tokenUsage;
    return {
      winnerId: parsed.data.winnerId,
      tokenUsage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        ...(usage.measured !== undefined ? { measured: usage.measured } : {}),
      },
    };
  };
}

/** Accumulated token usage over all judge calls (measured=false poisons the total honestly). */
interface AccumulatedUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly measured: boolean;
}

/** JSON output envelope (schema-stable; the report inside is the pure-module artifact). */
export interface JudgePairwiseJsonOutput {
  readonly schemaVersion: 'far.judge_pairwise.report.v1';
  readonly runId: string;
  readonly judgedAt: string;
  readonly judgeSource: 'live_gateway' | 'injected_test_double';
  readonly judgeCalls: number;
  readonly tokenUsage: AccumulatedUsage;
  readonly report: JudgeConsistencyReport;
  readonly honesty: {
    readonly referenceSignalOnly: true;
    readonly note: string;
    readonly cannotProve: string;
  };
}

/**
 * Run `far research judge`. Returns a process exit code:
 * 0 judged (warning, if any, is REPORTED — it is a signal, not a failure);
 * 1 data/judge errors (run missing, <2 hypotheses, unparseable/out-of-pair winner);
 * 2 usage errors and the fail-closed live-profile-unavailable path.
 */
export async function runJudgePairwise(options: JudgePairwiseOptions): Promise<number> {
  const out = options.stdout ?? ((text: string) => process.stdout.write(text));
  const err = options.stderr ?? ((text: string) => process.stderr.write(text));

  if (options.runId === '') {
    err('far research judge: missing runId.\n  usage: far research judge <runId> [--profile auto|competition_aliyun_qwen] [--json]\n');
    return 2;
  }
  // NOTE: both 'auto' and 'competition_aliyun_qwen' mean LIVE here — there is
  // no offline judge (a fixture "judge" would fabricate winners). The profile
  // flag is accepted for family consistency; argv validation lives in
  // parseJudgePairwiseArgs.

  const store = options.store ?? resolveRunStore();
  const loaded = loadRun(store, options.runId);
  if (!loaded.ok) {
    err(`far research judge: ${loaded.error}\n`);
    return 1;
  }

  const hypotheses = loaded.run.hypotheses;
  if (hypotheses.length < 2) {
    err(
      `far research judge: run ${options.runId} has ${hypotheses.length} registered hypothesis(ies) — pairwise judging needs at least 2.\n`,
    );
    return 1;
  }

  // Fail-closed LIVE gate: without an injected judge (tests) a live key is
  // mandatory — no fixture fallback, ever.
  let judge: JudgeCaller;
  let judgeSource: JudgePairwiseJsonOutput['judgeSource'];
  if (options.judge !== undefined) {
    judge = options.judge;
    judgeSource = 'injected_test_double';
  } else {
    const key = options.apiKey !== undefined ? options.apiKey : liveApiKey() ?? '';
    if (key === '') {
      writeLiveProfileUnavailable(err);
      return 2;
    }
    judge = createGatewayJudge(key);
    judgeSource = 'live_gateway';
  }

  const seed = deriveJudgeOrderSeed(options.runId);
  const pairs = buildJudgePairs(hypotheses.map((h) => h.id), seed);
  const summaries: Record<string, { id: string; statement: string; mechanism: string; prediction?: string }> = {};
  for (const h of hypotheses) {
    summaries[h.id] = {
      id: h.id,
      statement: h.statement,
      mechanism: h.mechanism,
      ...(h.falsificationMethod.prediction !== undefined ? { prediction: h.falsificationMethod.prediction } : {}),
    };
  }

  // Sequential in fixed (pairIndex asc, ab→ba) order: audit-friendly call
  // ordering and gentle on rate limits. Any single failure fails the whole
  // command — no partial reports, no salvaged pairs.
  const responses: JudgeResponse[] = [];
  const usages: JudgeTokenUsage[] = [];
  const directions: readonly JudgeDirection[] = ['ab', 'ba'];
  for (const pair of pairs) {
    for (const direction of directions) {
      const prompts = buildJudgePrompts(pair, direction, summaries);
      let winnerId: string;
      let tokenUsage: JudgeTokenUsage;
      try {
        const verdict = await judge({ pair, direction, prompts });
        winnerId = verdict.winnerId.trim();
        tokenUsage = verdict.tokenUsage;
      } catch (error) {
        err(
          `far research judge: judge call failed (pair ${pair.pairIndex} direction ${direction}): ${error instanceof Error ? error.message : String(error)}\n`,
        );
        return 1;
      }
      if (winnerId !== pair.aId && winnerId !== pair.bId) {
        err(
          `far research judge: judge winner "${winnerId}" is not a member of pair ${pair.pairIndex} (${pair.aId}, ${pair.bId}) — refusing to fabricate a verdict.\n`,
        );
        return 1;
      }
      responses.push({ pairIndex: pair.pairIndex, direction, winnerId });
      usages.push(tokenUsage);
    }
  }

  const report = computePositionConsistency(responses, { pairs, orderRandomizationSeed: seed });
  const tokenUsage: AccumulatedUsage = {
    inputTokens: usages.reduce((sum, u) => sum + u.inputTokens, 0),
    outputTokens: usages.reduce((sum, u) => sum + u.outputTokens, 0),
    totalTokens: usages.reduce((sum, u) => sum + u.totalTokens, 0),
    measured: usages.every((u) => u.measured !== false),
  };

  const payload: JudgePairwiseJsonOutput = {
    schemaVersion: 'far.judge_pairwise.report.v1',
    runId: options.runId,
    judgedAt: new Date().toISOString(),
    judgeSource,
    judgeCalls: responses.length,
    tokenUsage,
    report,
    honesty: {
      referenceSignalOnly: true,
      note: 'LLM judging is a REFERENCE signal; ranking authority stays with the deterministic tournament/kernel and never feeds verdicts.',
      cannotProve: 'consistency does not prove absence of other judge biases (verbosity/self-similarity bias unmeasured here)',
    },
  };

  if (options.json === true) {
    out(`${JSON.stringify(payload, null, 2)}\n`);
    return 0;
  }
  renderHuman(payload, out);
  return 0;
}

/** Human rendering: numbers first, the position-bias warning unmissable, honesty note last. */
function renderHuman(payload: JudgePairwiseJsonOutput, out: (text: string) => void): void {
  const r = payload.report;
  const lines: string[] = [
    '',
    '  FAR-Lab · far research judge (LLM-as-judge · reference signal only)',
    '  ─────────────────────────────────────────────────',
    `  run          : ${payload.runId}`,
    `  hypotheses   : ${new Set(r.pairs.flatMap((p) => [p.aId, p.bId])).size} → ${r.totalPairs} pairs (bidirectional: ${payload.judgeCalls} judge calls)`,
    `  order seed   : ${r.orderRandomizationSeed.slice(0, 16)}…  (recorded — explains every A/B order)`,
    '  ─────────────────────────────────────────────────',
    `  consistent   : ${r.consistentPairs} / ${r.totalPairs}`,
    `  inconsistent : ${r.inconsistentPairs}`,
    `  inconsistency rate : ${r.inconsistencyRate.toFixed(2)} (${(r.inconsistencyRate * 100).toFixed(0)}%)`,
  ];
  if (r.positionBiasWarning) {
    lines.push(
      `  ⚠ POSITION BIAS WARNING: inconsistency rate exceeds ${POSITION_BIAS_WARNING_THRESHOLD} — presentation`,
      '    order flipped more than a third of decisions; treat this judging session as unreliable.',
    );
  }
  lines.push(
    `  tokens       : ${payload.tokenUsage.totalTokens} total (${payload.tokenUsage.inputTokens} in / ${payload.tokenUsage.outputTokens} out${payload.tokenUsage.measured ? '' : ' · pseudo-metered'})`,
    '',
    '  ⚠ honest : non-deterministic LLM layer (mitigated: recorded seed + bidirectional check).',
    '  red line : reference signal only — never feeds verdicts; ranking authority stays with the',
    '             deterministic tournament / R0-R9 kernel. Consistency does not prove absence of',
    '             other judge biases (verbosity/self-similarity unmeasured).',
    '',
  );
  out(lines.join('\n'));
}
