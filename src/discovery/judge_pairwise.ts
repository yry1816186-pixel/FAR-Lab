/**
 * discovery/judge_pairwise — LLM-as-judge pairwise comparison with position-
 * bias mitigation (directive 2.md §2.2 R10 clause, T0).
 *
 * The deterministic tournament (orchestration/tournament.ts) ranks hypotheses
 * on deterministic scorecard dimensions only. This module is the deliberately
 * NON-deterministic counterpart (b3 decision): model-critique pairwise judging
 * — "which of these two hypotheses is more promising?" — asked of an LLM in
 * BOTH presentation orders per pair, with the order assignment randomized by a
 * RECORDED seed derived from the runId (replay-compatible judging: the seed
 * explains every A/B order choice).
 *
 * Honesty rules (must never be hidden):
 *   - LLM judging is a REFERENCE SIGNAL ONLY. Ranking authority stays with the
 *     deterministic tournament / R0-R9 verdict kernel; judge output NEVER
 *     feeds verdicts, scorecards, or the registry ladder.
 *   - This module is non-deterministic BY NATURE (the judge is an LLM). The
 *     mitigations are: (1) a recorded orderRandomizationSeed so presentation
 *     order is explainable, (2) bidirectional judging (every pair is asked
 *     twice, once as (A,B) and once as (B,A)) so order-flips become VISIBLE
 *     instead of silent.
 *   - Fail-closed on malformed responses: a half-judged pair, a duplicated
 *     direction, or a winner id outside the pair is an error — never silently
 *     dropped and never guessed.
 *
 * Cannot-prove: position CONSISTENCY does not prove absence of other judge
 * biases — verbosity bias and self-similarity bias are NOT measured here, and
 * a 0% inconsistency rate is only evidence that presentation order did not
 * flip outcomes, not that the judge is unbiased or correct.
 *
 * Zero-entropy discipline (the pure functions in this file): no Date.now /
 * Math.random / process.env — the ONLY non-determinism is the judge itself,
 * which lives behind the injected JudgeCaller, never inside this file.
 */

import { createHash } from 'node:crypto';

/**
 * Position-bias warning threshold on the inconsistency rate (strictly greater
 * than triggers the warning; exactly 0.3 does not).
 *
 * Rationale: at >30% inconsistency, presentation position is flipping roughly
 * a third or more of pairwise decisions — position noise, not hypothesis
 * quality, is dominating the reference signal. This is a CALIBRATION-DEFAULT,
 * not an empirical constant: it must be recalibrated once ≥5 real LIVE judge
 * runs accumulate field data (directive §8.9 duty), and the number is recorded
 * in every report so downstream consumers can re-evaluate against their own
 * threshold.
 */
export const POSITION_BIAS_WARNING_THRESHOLD = 0.3;

/** Direction of one judging pass over a pair. 'ab' presents aId then bId; 'ba' reverses. */
export type JudgeDirection = 'ab' | 'ba';

/** One pairwise judging unit. Which id is 'a' is decided by the recorded seed. */
export interface JudgePair {
  readonly pairIndex: number;
  /** Presented first under direction 'ab' (second under 'ba'). */
  readonly aId: string;
  /** Presented second under direction 'ab' (first under 'ba'). */
  readonly bId: string;
}

/** The hypothesis content a judge sees (intrinsic promise — no run-question context by design). */
export interface JudgedHypothesisSummary {
  readonly id: string;
  readonly statement: string;
  readonly mechanism: string;
  /** The falsifiable prediction (operational content) when available. */
  readonly prediction?: string;
}

/** The two prompts for one judging pass (system + user), presentation-ordered. */
export interface JudgePromptPair {
  readonly systemPrompt: string;
  readonly userPrompt: string;
}

/** One judge verdict: which id won, for which pair, under which presentation order. */
export interface JudgeResponse {
  readonly pairIndex: number;
  readonly direction: JudgeDirection;
  readonly winnerId: string;
}

/** Per-pair consistency detail (auditable: both directions' winners + the verdict). */
export interface JudgePairConsistencyDetail {
  readonly pairIndex: number;
  readonly aId: string;
  readonly bId: string;
  readonly abWinnerId: string;
  readonly baWinnerId: string;
  /** True iff both directions picked the SAME winner (order did not flip the outcome). */
  readonly consistent: boolean;
}

/** The full position-consistency report (reference signal — never feeds verdicts). */
export interface JudgeConsistencyReport {
  /** sha256(runId) — explains every A/B order choice; replay-compatible judging. */
  readonly orderRandomizationSeed: string;
  readonly totalPairs: number;
  readonly consistentPairs: number;
  readonly inconsistentPairs: number;
  /** inconsistentPairs / totalPairs ∈ [0,1]; 0 when nothing was judged inconsistent. */
  readonly inconsistencyRate: number;
  /** True when inconsistencyRate > POSITION_BIAS_WARNING_THRESHOLD (0.3, calibration-default). */
  readonly positionBiasWarning: boolean;
  readonly pairs: readonly JudgePairConsistencyDetail[];
}

/**
 * Token accounting for one judge invocation. Mirrors the gateway's TokenUsage
 * shape without coupling discovery to the llm_gateway module (type-only echo).
 */
export interface JudgeTokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  /**
   * Metering provenance (echoes the gateway's TokenUsage semantics):
   * true = provider-metered tokens; false = character-based pseudo tokens.
   * Absent = not reported (treated as metered).
   */
  readonly measured?: boolean;
}

/**
 * One judge invocation over a built prompt pair. Production: a LIVE gateway
 * call (never offline fixtures — fabricated winners are forbidden, R9).
 * Tests: a deterministic fake. Never implemented inside this pure module.
 */
export type JudgeCaller = (input: {
  readonly pair: JudgePair;
  readonly direction: JudgeDirection;
  readonly prompts: JudgePromptPair;
}) => Promise<{ readonly winnerId: string; readonly tokenUsage: JudgeTokenUsage }>;

/**
 * Derive the per-run order-randomization seed: sha256 hex of the runId.
 * Deterministic — the same run ALWAYS gets the same presentation-order
 * randomization, so a re-judge of the same run faces the same A/B assignments
 * (the seed is recorded in every report for exactly this replay property).
 */
export function deriveJudgeOrderSeed(runId: string): string {
  return createHash('sha256').update(runId, 'utf8').digest('hex');
}

/**
 * Small deterministic PRNG seeded by an arbitrary string: the i-th draw is
 * sha256(`${seed}#${i}`) mapped onto [0,1) via its first 48 bits. No
 * Math.random anywhere — draws are a pure function of (seed, call index).
 */
function createSeededRandom(seed: string): () => number {
  let counter = 0;
  return () => {
    const bytes = createHash('sha256').update(`${seed}#${counter}`, 'utf8').digest();
    counter += 1;
    const value =
      bytes[0]! * 2 ** 40 + bytes[1]! * 2 ** 32 + bytes[2]! * 2 ** 24 +
      bytes[3]! * 2 ** 16 + bytes[4]! * 2 ** 8 + bytes[5]!;
    return value / 2 ** 48;
  };
}

/**
 * Build the full pairwise judging plan: round-robin pairing over the
 * id-sorted hypotheses (input-order independent — the same SET of ids always
 * yields the same pair set), with each pair's (aId, bId) assignment drawn
 * from the seed so a systematic first-presented bias cannot concentrate on
 * input-order-early candidates. Every pair is later judged in BOTH directions
 * (bidirectional check — see buildJudgePrompts / computePositionConsistency).
 *
 * @throws when fewer than 2 hypothesis ids are given, ids are duplicated,
 *         or an id is empty.
 */
export function buildJudgePairs(hypothesisIds: readonly string[], seed: string): readonly JudgePair[] {
  if (hypothesisIds.length < 2) {
    throw new Error(`judge_pairwise requires at least 2 hypotheses to pair, got ${hypothesisIds.length}`);
  }
  const seen = new Set<string>();
  for (const id of hypothesisIds) {
    if (id === '') throw new Error('judge_pairwise hypothesis ids must be non-empty');
    if (seen.has(id)) throw new Error(`judge_pairwise duplicate hypothesis id: ${id}`);
    seen.add(id);
  }

  const ordered = [...hypothesisIds].sort();
  const random = createSeededRandom(seed);
  const pairs: JudgePair[] = [];
  let pairIndex = 0;
  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      const first = ordered[i]!;
      const second = ordered[j]!;
      // Seed-driven coin: which id is labeled 'a' (first-presented in the
      // 'ab' arm). Recorded via the seed in the report — explainable, replayable.
      const keepOrder = random() < 0.5;
      pairs.push({
        pairIndex,
        aId: keepOrder ? first : second,
        bId: keepOrder ? second : first,
      });
      pairIndex += 1;
    }
  }
  return pairs;
}

/**
 * Build the system+user prompt pair for one judging pass. Direction decides
 * presentation order: 'ab' presents aId first; 'ba' presents bId first. The
 * prompt instructs the judge to pick exactly one of the two ids as a JSON
 * object {"winnerId": "<id>"} and states explicitly that presentation order
 * is NOT evidence.
 *
 * @throws when either pair id is missing from hypothesesById.
 */
export function buildJudgePrompts(
  pair: JudgePair,
  direction: JudgeDirection,
  hypothesesById: Readonly<Record<string, JudgedHypothesisSummary>>,
): JudgePromptPair {
  const a = hypothesesById[pair.aId];
  const b = hypothesesById[pair.bId];
  if (a === undefined || b === undefined) {
    throw new Error(
      `judge_pairwise prompts need content for both pair members (missing: ${a === undefined ? pair.aId : pair.bId})`,
    );
  }

  const first = direction === 'ab' ? a : b;
  const second = direction === 'ab' ? b : a;

  const systemPrompt = [
    'You are a careful scientific research reviewer serving as a pairwise judge.',
    'Compare exactly two hypotheses and decide which is MORE PROMISING as a research direction.',
    'Hard constraints:',
    '- Presentation order in the prompt is NOT evidence. Judge the content only.',
    '- You MUST pick exactly one of the two hypothesis ids. No ties, no scores, no new ids.',
    '- Respond with a single JSON object: {"winnerId": "<one of the two ids>"}.',
  ].join('\n');

  const render = (h: JudgedHypothesisSummary): readonly string[] => [
    `Hypothesis ${h.id}:`,
    `  statement : ${h.statement}`,
    `  mechanism : ${h.mechanism}`,
    ...(h.prediction !== undefined ? [`  falsifiable prediction: ${h.prediction}`] : []),
  ];

  const userPrompt = [
    ...render(first),
    '',
    ...render(second),
    '',
    'Which hypothesis is more promising as a research direction?',
    `Answer with JSON {"winnerId": "<id>"} where <id> is exactly one of: [${first.id}, ${second.id}].`,
  ].join('\n');

  return { systemPrompt, userPrompt };
}

/**
 * Compute the position-consistency report from per-direction judge responses.
 *
 * A pair is CONSISTENT iff both directions picked the same winner id. The
 * inconsistency rate is the share of pairs where flipping the presentation
 * order flipped the outcome — the direct, honest measure of position bias in
 * this judging session. positionBiasWarning fires when the rate exceeds
 * POSITION_BIAS_WARNING_THRESHOLD (0.3, calibration-default — see above).
 *
 * Fail-closed (R9 — no fabricated or salvaged data):
 *   - every pair must have BOTH directions present (a half-judged pair is not data);
 *   - no duplicate (pairIndex, direction);
 *   - no responses for pairIndexes outside the given pair set;
 *   - every winnerId must be one of its pair's two ids.
 *
 * @throws on any of the fail-closed conditions above, or on an empty pair set.
 */
export function computePositionConsistency(
  responses: readonly JudgeResponse[],
  context: { readonly pairs: readonly JudgePair[]; readonly orderRandomizationSeed: string },
): JudgeConsistencyReport {
  const { pairs, orderRandomizationSeed } = context;
  if (pairs.length === 0) {
    throw new Error('judge_pairwise consistency needs at least one pair');
  }

  const byPair = new Map<number, JudgePair>(pairs.map((p) => [p.pairIndex, p]));
  const collected = new Map<string, JudgeResponse>();
  for (const response of responses) {
    const pair = byPair.get(response.pairIndex);
    if (pair === undefined) {
      throw new Error(`judge response references unknown pairIndex ${response.pairIndex}`);
    }
    const key = `${response.pairIndex}:${response.direction}`;
    if (collected.has(key)) {
      throw new Error(`duplicate judge response for pair ${response.pairIndex} direction ${response.direction}`);
    }
    if (response.winnerId !== pair.aId && response.winnerId !== pair.bId) {
      throw new Error(
        `judge winner "${response.winnerId}" is not a member of pair ${response.pairIndex} (${pair.aId}, ${pair.bId})`,
      );
    }
    collected.set(key, response);
  }

  const detail: JudgePairConsistencyDetail[] = [];
  let consistentPairs = 0;
  for (const pair of pairs) {
    const ab = collected.get(`${pair.pairIndex}:ab`);
    const ba = collected.get(`${pair.pairIndex}:ba`);
    if (ab === undefined || ba === undefined) {
      throw new Error(`pair ${pair.pairIndex} is missing direction ${ab === undefined ? 'ab' : 'ba'}`);
    }
    const consistent = ab.winnerId === ba.winnerId;
    if (consistent) consistentPairs += 1;
    detail.push({
      pairIndex: pair.pairIndex,
      aId: pair.aId,
      bId: pair.bId,
      abWinnerId: ab.winnerId,
      baWinnerId: ba.winnerId,
      consistent,
    });
  }

  const inconsistentPairs = pairs.length - consistentPairs;
  const inconsistencyRate = inconsistentPairs / pairs.length;
  return {
    orderRandomizationSeed,
    totalPairs: pairs.length,
    consistentPairs,
    inconsistentPairs,
    inconsistencyRate,
    positionBiasWarning: inconsistencyRate > POSITION_BIAS_WARNING_THRESHOLD,
    pairs: detail,
  };
}
