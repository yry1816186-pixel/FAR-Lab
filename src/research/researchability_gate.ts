/**
 * research/researchability_gate — the Researchability & Safety gate (directive §9.1)
 * plus problem decomposition (§9.2).
 *
 * The gate runs BEFORE any retrieval or generation. It is the honest first
 * step of the Track-1A slice: a question that is out of scope, unsafe, or not
 * researchable must surface as UNSUPPORTED / LIMITED — never as a fabricated
 * research pipeline (directive §9.1: "系统不得把非天文问题替换成固定 TESS 案例…"
 * — and more generally must not fake success for out-of-capability questions).
 *
 * Two layers:
 *   1. Deterministic screening (no LLM): length bounds, obvious non-question
 *      prompts, safety screening for high-risk research directions. Pure,
 *      offline, fully testable.
 *   2. Model-assisted decomposition (§9.2): known facts, unknown variables,
 *      definitions, observables, candidate mechanisms, mainstream/alternative
 *      theories, retrieval subquestions, confounders, data needs, falsifiability
 *      conditions, indistinguishable-outcome scenarios. Goes through the shared
 *      gateway (live Qwen or offline_replay fixture) — never trusted without
 *      local zod validation.
 */

import { z } from 'zod';
import type { LlmGateway } from '../llm_gateway/gateway.ts';
import type { ProviderProfile } from '../llm_gateway/types.ts';
import { callStructuredJson, type CallMeta } from './llm.ts';

/** The gate verdict (directive §9.1). */
export type ResearchabilityVerdict = 'RESEARCHABLE' | 'LIMITED' | 'UNSUPPORTED';

/** The research scope the gate derives from the question. */
export interface ResearchScope {
  /** Best-guess domain label (deterministic keyword matching; null = unknown). */
  readonly domain: string | null;
  /** The keyword hits that produced the domain label. */
  readonly domainHints: readonly string[];
  /** Question character length. */
  readonly questionLength: number;
}

/**
 * Problem decomposition (directive §9.2). Produced by the model pass, with the
 * retrievalSubquestions later re-used as extra grounding queries (§9.3).
 */
export interface ProblemDecomposition {
  readonly knownFacts: readonly string[];
  readonly unknownVariables: readonly string[];
  readonly keyDefinitions: readonly string[];
  readonly observables: readonly string[];
  readonly candidateMechanisms: readonly string[];
  readonly mainstreamTheories: readonly string[];
  readonly alternativeTheories: readonly string[];
  readonly retrievalSubquestions: readonly string[];
  readonly confounders: readonly string[];
  readonly dataRequirements: readonly string[];
  readonly falsifiabilityConditions: readonly string[];
  readonly indistinguishableScenarios: readonly string[];
}

/** The full gate report attached to a run (or returned on refusal). */
export interface ResearchabilityReport {
  /** The original question. */
  readonly question: string;
  /** Gate verdict. */
  readonly verdict: ResearchabilityVerdict;
  /** Deterministic reasons behind the verdict (empty for RESEARCHABLE). */
  readonly reasons: readonly string[];
  /** Safety / ethics flags (empty = none detected). */
  readonly safetyRisks: readonly string[];
  /** Derived scope. */
  readonly scope: ResearchScope;
  /** Model decomposition (null when the gate refused before the model pass). */
  readonly decomposition: ProblemDecomposition | null;
  /** Whether an ethics/safety gate should be required before execution. */
  readonly requiresEthicsGate: boolean;
  /** ISO timestamp of the assessment. */
  readonly assessedAt: string;
  /** Schema version. */
  readonly schemaVersion: number;
}

/** Error raised when the gate refuses a question (carries the report). */
export class ResearchabilityBlockedError extends Error {
  readonly report: ResearchabilityReport;
  constructor(report: ResearchabilityReport) {
    super(`researchability gate: ${report.verdict} — ${report.reasons.join('; ')}`);
    this.name = 'ResearchabilityBlockedError';
    this.report = report;
  }
}

/** High-risk directions that must be screened (never auto-executed, §13). */
const SAFETY_PATTERNS: ReadonlyArray<{ pattern: RegExp; risk: string }> = [
  { pattern: /\bgain[- ]of[- ]function\b/i, risk: 'high-risk biology (gain-of-function)' },
  { pattern: /\bweaponiz|bioterror|biological weapon/i, risk: 'dual-use biology' },
  {
    // Dangerous-chemistry direction: synthesis/manufacture of explosives or
    // chemical weapons. Disambiguated from legitimate research terms like
    // "explosive stellar transient" (no synthesis/making context).
    pattern: /\b(synthesi[sz]e|manufacture|prepare|produce|make) .{0,50}\b(high )?explosive/i,
    risk: 'dangerous chemistry',
  },
  {
    pattern: /\b(high )?explosive(s)? .{0,50}\b(synthesi[sz]e|manufactur(e|ing)|preparation|production|making)/i,
    risk: 'dangerous chemistry',
  },
  { pattern: /\bbomb[- ]making|detonator (synthesis|construction)|chemical weapon/i, risk: 'dangerous chemistry' },
  { pattern: /\bnerve agent (synthesis|production)/i, risk: 'dangerous chemistry' },
  { pattern: /\bclinical trial\b|\bhuman subjects?\b|in vivo human/i, risk: 'human-subject research' },
  { pattern: /\bdiagnos(e|is) (this patient|my|an individual)/i, risk: 'individual medical diagnosis' },
  { pattern: /\bpersonal (health|medical|genomic) (data|record)/i, risk: 'sensitive personal data' },
];

/** Obvious non-question / out-of-scope prompt patterns. */
const NON_QUESTION_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b(write|compose|draft) (a|an)? ?(poem|song|story|novel|joke)/i, reason: 'creative writing prompt, not a research question' },
  { pattern: /\b(translate|summarize) (this|the following)/i, reason: 'text-processing prompt, not a research question' },
  { pattern: /\b(what is (the|your) (name|purpose|favorite)|who (are|made) you)\b/i, reason: 'chit-chat prompt, not a research question' },
  { pattern: /^\s*(hi|hello|hey|ok|thanks?|please)\s*[.!]?\s*$/i, reason: 'greeting, not a research question' },
];

const MIN_QUESTION_LENGTH = 12;
const MAX_QUESTION_LENGTH = 2000;

const DOMAIN_KEYWORDS: ReadonlyArray<readonly [string, RegExp]> = [
  ['astronomy', /\b(exoplanet|stellar|galaxy|galaxies|cosmolog|dark matter|dark energy|supernova|star(s)?|planet(ary)?|telescope|transit|light ?curve|asteroid|quasar|black hole|redshift)\b/i],
  ['solar physics', /\b(solar|sunspot|coronal|heliosph|magnetohydro|CME|solar flare|sun\b)\b/i],
  ['biology', /\b(gene|protein|cell|organism|ecosystem|biodiversity|evolution|species|microbiome|dna|rna|enzyme|bacteri|virus|insect|plant|animal)\b/i],
  ['medicine', /\b(disease|cancer|clinical|patient|drug|therapy|vaccine|epidemio|tumor|cardiovas)\b/i],
  ['neuroscience', /\b(neuron|brain|cognit|synap|neural|consciousness|memory)\b/i],
  ['climate science', /\b(climate|greenhouse|temperature anomal|carbon dioxide|co2|global warming|sea[- ]level|ice sheet|glacier)\b/i],
  ['physics', /\b(quantum|particle|relativ|entangl|superconduct|electron|photon|material)\b/i],
  ['chemistry', /\b(molecul|cataly|reacti|synthesis|compound|polymer)\b/i],
  ['geoscience', /\b(geolog|earthquake|volcan|tectonic|magma|seismic|rock)\b/i],
];

/**
 * Deterministic screening (pure, offline): length bounds, obvious non-question
 * prompts, safety patterns, domain hint. Never uses the LLM.
 */
export function assessResearchabilityDeterministic(
  question: string,
): Pick<ResearchabilityReport, 'verdict' | 'reasons' | 'safetyRisks' | 'scope' | 'requiresEthicsGate'> {
  const trimmed = question.trim();
  const reasons: string[] = [];
  const safetyRisks: string[] = [];

  if (trimmed.length === 0) {
    return {
      verdict: 'UNSUPPORTED',
      reasons: ['question is empty'],
      safetyRisks: [],
      scope: { domain: null, domainHints: [], questionLength: 0 },
      requiresEthicsGate: false,
    };
  }

  if (trimmed.length < MIN_QUESTION_LENGTH) {
    reasons.push(`question is ${trimmed.length} characters — too short to scope a research plan`);
  }
  if (trimmed.length > MAX_QUESTION_LENGTH) {
    reasons.push(`question is ${trimmed.length} characters — exceeds ${MAX_QUESTION_LENGTH}`);
  }

  for (const { pattern, reason } of NON_QUESTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      reasons.push(reason);
      break;
    }
  }

  for (const { pattern, risk } of SAFETY_PATTERNS) {
    if (pattern.test(trimmed)) {
      safetyRisks.push(risk);
    }
  }

  const domainHits = DOMAIN_KEYWORDS.filter(([, re]) => re.test(trimmed)).map(([label]) => label);
  const scope: ResearchScope = {
    domain: domainHits.length > 0 ? domainHits[0]! : null,
    domainHints: domainHits,
    questionLength: trimmed.length,
  };

  let verdict: ResearchabilityVerdict = 'RESEARCHABLE';
  if (reasons.length > 0) verdict = 'LIMITED';
  const hardRefusal = reasons.some((r) => r.includes('not a research question') || r.includes('empty'));
  if (hardRefusal) verdict = 'UNSUPPORTED';
  // Dangerous chemistry / weaponization directions are out of scope entirely.
  if (safetyRisks.some((r) => r.includes('dangerous chemistry') || r.includes('dual-use biology'))) {
    verdict = 'UNSUPPORTED';
    reasons.push(`safety screen blocked this direction (${safetyRisks.join('; ')})`);
  }

  return {
    verdict,
    reasons,
    safetyRisks,
    scope,
    requiresEthicsGate:
      safetyRisks.some((r) => r.includes('human-subject') || r.includes('medical diagnosis') || r.includes('personal data')) ||
      safetyRisks.some((r) => r.includes('gain-of-function')),
  };
}

/** zod schema for the model's problem decomposition. */
const DecompositionZod = z.object({
  knownFacts: z.array(z.string()),
  unknownVariables: z.array(z.string()),
  keyDefinitions: z.array(z.string()),
  observables: z.array(z.string()),
  candidateMechanisms: z.array(z.string()),
  mainstreamTheories: z.array(z.string()),
  alternativeTheories: z.array(z.string()),
  retrievalSubquestions: z.array(z.string()).max(6),
  confounders: z.array(z.string()),
  dataRequirements: z.array(z.string()),
  falsifiabilityConditions: z.array(z.string()),
  indistinguishableScenarios: z.array(z.string()),
});

/**
 * Model-assisted problem decomposition (§9.2) through the shared gateway.
 * Retrieval subquestions are bounded (≤6) — they feed grounding queries later.
 * Returns the decomposition plus the provider CallMeta for the stage receipt.
 */
export async function decomposeResearchQuestion(
  gateway: LlmGateway,
  profile: ProviderProfile,
  question: string,
  scope: ResearchScope,
): Promise<{ decomposition: ProblemDecomposition; meta: CallMeta }> {
  const system = [
    'You are a scientific problem decomposer for a research system.',
    'Decompose the research question into the requested components. Be concrete',
    'and honest: state only what is reasonable to assert. retrievalSubquestions',
    'must be 1-6 short literature-search queries (no question marks) that would',
    'surface the key evidence for and against candidate answers.',
    '',
    'Output JSON only, no markdown fences.',
  ].join('\n');

  const user = [
    `Research question: ${question}`,
    `Detected domain hint: ${scope.domain ?? 'unknown'}`,
  ].join('\n');

  const { data: parsed, meta } = await callStructuredJson(
    gateway,
    profile,
    'research_decompose',
    DecompositionZod,
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  );
  return { decomposition: parsed, meta };
}
