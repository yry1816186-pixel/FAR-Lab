// src/api/internal/arena_service.ts
// Adversarial scientific arena shared by CLI and API.
//
// Every run requires an explicitly configured live model gateway, provider
// profile, and model snapshot. There is no offline fixture fallback. The
// deterministic arbiter compares kernel verdicts and never claims robustness
// when a required execution failed.

import { ulid } from 'ulid';

import { openFarDb } from '../../db/open.ts';
import { executeAskRun } from './ask_runner.ts';
import type { LlmGateway } from '../../llm_gateway/gateway.ts';
import type { ProviderProfile } from '../../llm_gateway/types.ts';

export interface RefuteAttempt {
  readonly refuter: string;
  readonly verdict: string | null;
  readonly attackLanded: boolean;
  readonly error: string | null;
}

export interface ArenaSessionOptions {
  readonly gateway: LlmGateway;
  readonly modelSnapshot: string;
  readonly providerProfile: ProviderProfile;
  readonly providerLabel?: string;
}

export interface ArenaResult {
  readonly arenaId: string;
  readonly hypothesis: string;
  readonly originalVerdict: string | null;
  readonly originalRule: string | null;
  readonly originalError: string | null;
  readonly attempts: readonly RefuteAttempt[];
  readonly landedCount: number;
  readonly robust: boolean;
  readonly assessment: 'ROBUST' | 'BREACHED' | 'INCONCLUSIVE';
  readonly honestNote: string;
  readonly datasetSource: 'real';
}

export function detectRefuterAttack(
  originalVerdict: string | null,
  refuterVerdict: string | null,
): boolean {
  return originalVerdict !== null && refuterVerdict !== null && refuterVerdict !== originalVerdict;
}

function assertSessionOptions(options: ArenaSessionOptions): void {
  const profile = String(options.providerProfile).trim();
  if (options.modelSnapshot.trim().length === 0) {
    throw new Error('arena: modelSnapshot must be non-empty');
  }
  if (profile.length === 0) {
    throw new Error('arena: providerProfile must be non-empty');
  }
  if (profile === 'offline_replay') {
    throw new Error('arena: offline_replay is test-only and cannot produce a served assessment');
  }
}

async function runOne(
  question: string,
  gitCommitSha: string,
  options: ArenaSessionOptions,
): Promise<{ verdict: string | null; rule: string | null; error: string | null }> {
  const db = openFarDb(':memory:');
  try {
    const result = await executeAskRun(
      db,
      question,
      'quick',
      gitCommitSha,
      undefined,
      undefined,
      options.gateway,
      undefined,
      undefined,
      options.modelSnapshot,
      options.providerProfile,
    );
    const node = result.loopState.verdictNode;
    return {
      verdict: node === null ? null : node.verdict,
      rule: node === null ? null : node.verdictTrace.decisiveRuleId,
      error: result.loopState.error === null ? null : result.loopState.error.message,
    };
  } catch (error: unknown) {
    return {
      verdict: null,
      rule: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    db.close();
  }
}

export async function runArenaSession(
  hypothesis: string,
  refuters: readonly string[],
  gitCommitSha: string,
  options: ArenaSessionOptions,
): Promise<ArenaResult> {
  if (hypothesis.trim().length === 0) {
    throw new Error('arena: hypothesis must be non-empty');
  }
  if (refuters.length === 0 || refuters.some((refuter) => refuter.trim().length === 0)) {
    throw new Error('arena: at least one non-empty refuter is required');
  }
  assertSessionOptions(options);

  const original = await runOne(hypothesis, gitCommitSha, options);
  const attempts: RefuteAttempt[] = [];
  for (const refuter of refuters) {
    const result = await runOne(
      `${hypothesis} [adversarial review objective: ${refuter}]`,
      gitCommitSha,
      options,
    );
    attempts.push({
      refuter,
      verdict: result.verdict,
      attackLanded: detectRefuterAttack(original.verdict, result.verdict),
      error: result.error,
    });
  }

  const landedCount = attempts.filter((attempt) => attempt.attackLanded).length;
  const complete =
    original.error === null &&
    original.verdict !== null &&
    attempts.every((attempt) => attempt.error === null && attempt.verdict !== null);
  const assessment: ArenaResult['assessment'] = !complete
    ? 'INCONCLUSIVE'
    : landedCount > 0
      ? 'BREACHED'
      : 'ROBUST';

  return {
    arenaId: ulid(),
    hypothesis,
    originalVerdict: original.verdict,
    originalRule: original.rule,
    originalError: original.error,
    attempts,
    landedCount,
    robust: assessment === 'ROBUST',
    assessment,
    datasetSource: 'real',
    honestNote:
      assessment === 'INCONCLUSIVE'
        ? 'The adversarial assessment is INCONCLUSIVE because at least one required live execution or kernel verdict failed. Missing results are not counted as defenses.'
        : `Live provider adversarial session (${options.providerLabel ?? String(options.providerProfile)}). ` +
          'ROBUST means only that none of the configured adversarial objectives changed the deterministic kernel verdict in this session; it is not universal robustness or scientific truth.',
  };
}
