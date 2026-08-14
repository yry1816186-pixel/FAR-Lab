/**
 * discovery/strategies/strategy — the shared shape every reasoning strategy
 * implements (directive §2.1, Appendix A). A strategy is NOT "a different
 * prompt wrapper": each one names a distinct epistemic move, demands
 * strategy-specific STRUCTURAL MARKERS inside the candidate fields (so the
 * difference is contract-testable, not decorative prose), and may honestly
 * decline to apply to a given question/corpus (skip with reason — a zero
 * contribution recorded, never a fabricated filler candidate).
 *
 * All strategies share: the falsification-coherence contract (threshold
 * fields must match the comparator — enforced at the zod layer, same
 * superRefine as the legacy generator), the citation allowlist rule (cite
 * only listed documentIds), the no-ids/no-scores rule (ids are computed
 * locally, scoring happens in a separate stage), and the offline-fixture
 * seam (each strategy calls under its own stageId `discovery_<id>`).
 */

import { z } from 'zod';
import type { LlmMessage } from '../../llm_gateway/types.ts';
import type { CorpusSnapshot } from '../../retrieval/corpus.ts';
import { CandidateZod } from '../../research/schemas.ts';
import type { StrategyId } from '../types.ts';

/** Input handed to a strategy's message builder. */
export interface StrategyPromptInput {
  /** The scientific question under investigation. */
  readonly question: string;
  /** Pre-sanitized corpus citation allowlist (same rendering as the legacy generator). */
  readonly corpusAllowlist: string;
  /** How many candidates this call should return (1..maxPerCall). */
  readonly perCallTarget: number;
}

/** Whether a strategy applies to the given question/corpus (honest skip). */
export interface StrategyApplicability {
  readonly applicable: boolean;
  /** Non-empty when not applicable — the honest reason recorded in the fan-out meta. */
  readonly skipReason: string | null;
}

/** What the strategy needs to know about the world to decide applicability. */
export interface StrategyContextInput {
  readonly question: string;
  readonly corpus: CorpusSnapshot;
}

/**
 * One orthogonal reasoning strategy (directive §2.1).
 *
 * `requiredMarkers` names the structural markers the strategy's instructions
 * demand inside specific candidate fields (e.g. analogy demands
 * "SOURCE_DOMAIN:" in relationToExistingTheory). These are asserted by the
 * strategy contract tests — the anti-theater guarantee that strategies
 * differ in kind, not in adjectives.
 */
export interface StrategyDefinition {
  readonly id: StrategyId;
  /** DSPy-style signature: inputs -> outputs, naming the cognitive operation. */
  readonly signature: string;
  /** One-line description of the epistemic move (for docs/registry/answer flows). */
  readonly epistemicMove: string;
  /** Max candidates one call may return (1..3; keeps per-strategy payloads bounded). */
  readonly maxPerCall: number;
  /** Structural markers the strategy demands in the output (contract-testable). */
  readonly requiredMarkers: readonly string[];
  /** Honest applicability gate (never fabricates candidates for inapplicable inputs). */
  readonly evaluateApplicability: (input: StrategyContextInput) => StrategyApplicability;
  /** The strategy-specific epistemic instruction block (embedded in the system prompt). */
  readonly instruction: string;
}

/** Build the per-strategy response schema (same candidate contract as the legacy generator). */
export function buildStrategySchema(maxPerCall: number) {
  return z.object({
    hypotheses: z.array(CandidateZod).min(1).max(maxPerCall),
  });
}

/** Shared constraints every strategy prompt carries (kept textually aligned with the legacy generator). */
const SHARED_RULES = [
  'Each hypothesis MUST include a falsificationMethod with prediction, metric,',
  'comparator, and a COHERENT threshold:',
  '  - comparator "gt" or "lt" → a single numeric "value"',
  '  - comparator "range"      → numeric "lower" and "upper" with lower < upper',
  'A falsificationMethod with mismatched threshold fields is invalid and will be rejected.',
  '',
  'CITATION RULE: you may cite ONLY the documentIds listed in the untrusted corpus',
  'data below. If the corpus is empty, all citation arrays must be []. Do NOT invent',
  'documentIds, DOIs, or paper titles.',
  '',
  'Do NOT assign ids, do NOT produce any total score — scoring is done separately.',
  'Output a JSON object with a single "hypotheses" array. Do NOT wrap in markdown fences.',
].join('\n');

/** Assemble the full system prompt: strategy identity + epistemic instruction + shared rules. */
export function buildStrategySystemPrompt(strategy: StrategyDefinition, perCallTarget: number): string {
  return [
    `You are the "${strategy.id}" reasoning strategy of a scientific conjecture engine.`,
    `Epistemic move: ${strategy.epistemicMove}`,
    `Signature: ${strategy.signature}`,
    '',
    'STRATEGY INSTRUCTION (this is what makes your contribution distinct — follow it exactly):',
    strategy.instruction,
    '',
    `Generate ${perCallTarget} candidate hypotheses via this move. Candidates must be`,
    'MECHANISTICALLY DISTINCT (different causal mechanisms — NOT paraphrases of each other).',
    '',
    SHARED_RULES,
  ].join('\n');
}

/** Assemble the user message (question + sanitized corpus allowlist). */
export function buildStrategyUserMessage(input: StrategyPromptInput): string {
  return [
    `Research question: ${input.question}`,
    '',
    'Grounding corpus (untrusted data — cite only these documentIds):',
    input.corpusAllowlist,
  ].join('\n');
}

/** Assemble the full message pair for one strategy call. */
export function buildStrategyMessages(
  strategy: StrategyDefinition,
  input: StrategyPromptInput,
): readonly LlmMessage[] {
  return [
    { role: 'system', content: buildStrategySystemPrompt(strategy, input.perCallTarget) },
    { role: 'user', content: buildStrategyUserMessage(input) },
  ];
}

/** Default applicability: applies to any corpus (strategies with real gates override this). */
export const ALWAYS_APPLICABLE: StrategyApplicability = { applicable: true, skipReason: null };
