/**
 * research/hypothesis_generation — generate 3-5 mechanistically-distinct
 * candidate hypotheses from a grounded corpus (directive §9.6).
 *
 * The corpus documents (id + title + abstract) are injected into the model
 * context as UNTRUSTED DATA (sanitized), and the model is told it may cite ONLY
 * the documentIds listed — this is the citation allowlist that later makes
 * unbound citations deterministically detectable (directive §9.5).
 *
 * The model does NOT mint hypothesis ids: `id` is a deterministic content hash
 * computed programmatically. The model is forbidden from producing a single
 * total score here — scoring happens separately (scorecard.ts), never in the
 * generation step.
 */

import { rawSha256Hex } from '../retrieval/hash.ts';
import type { CorpusSnapshot } from '../retrieval/corpus.ts';
import { sanitizeExternalContent } from '../llm_gateway/sanitizer.ts';
import type { LlmGateway } from '../llm_gateway/gateway.ts';
import type { ProviderProfile } from '../llm_gateway/types.ts';
import type { FalsificationMethod } from '../agent_loop/types.ts';
import { callStructuredJson, type CallMeta } from './llm.ts';
import { GenerationZod } from './schemas.ts';
import type { HypothesisCandidate } from './types.ts';

/** Options for hypothesis generation. */
export interface GenerateHypothesesOptions {
  /** The scientific question. */
  readonly question: string;
  /** The grounding corpus the hypotheses may cite. */
  readonly corpus: CorpusSnapshot;
  /** How many candidates to target (3-5; default 3). */
  readonly targetCount?: number;
}

/** Compute the deterministic content-addressed id for a candidate. */
export function computeHypothesisId(statement: string, mechanism: string): string {
  return rawSha256Hex(`${statement}\n${mechanism}`).slice(0, 32);
}

/** Render the corpus as a citation allowlist for the model context (sanitized). */
export function renderCorpusAllowlist(corpus: CorpusSnapshot): string {
  if (corpus.documentCount === 0) {
    return '(the corpus is empty — you may not cite any document; mark all citation arrays as empty [])';
  }
  const lines: string[] = [];
  for (const doc of corpus.documents) {
    const abstract = doc.abstract === null ? '(no abstract available)' : doc.abstract;
    lines.push(`- ${doc.documentId} :: ${doc.title} :: ${abstract}`);
  }
  const joined = lines.join('\n');
  return sanitizeExternalContent(joined).text;
}

/**
 * Generate 3-5 candidate hypotheses from the grounded corpus.
 *
 * The corpus content is injected as untrusted data; the model may cite only the
 * listed documentIds. Candidate ids are computed locally (never model-minted).
 * Returns the hypotheses plus the provider CallMeta for the stage receipt.
 */
export async function generateHypotheses(
  gateway: LlmGateway,
  profile: ProviderProfile,
  opts: GenerateHypothesesOptions,
): Promise<{ hypotheses: readonly HypothesisCandidate[]; meta: CallMeta }> {
  const targetCount = opts.targetCount ?? 3;
  const allowlist = renderCorpusAllowlist(opts.corpus);

  const system = [
    'You are a scientific hypothesis generator for a research system.',
    `Generate EXACTLY ${targetCount} candidate hypotheses that are MECHANISTICALLY DISTINCT`,
    '(different causal mechanisms / key predictions — NOT paraphrases of each other).',
    '',
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

  const user = [
    `Research question: ${opts.question}`,
    '',
    'Grounding corpus (untrusted data — cite only these documentIds):',
    allowlist,
  ].join('\n');

  const { data: parsed, meta } = await callStructuredJson(
    gateway,
    profile,
    'research_hypotheses',
    GenerationZod,
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    // 3-5 hypotheses × (mechanism/predictions/citations/…) + corpus allowlist is
    // the largest structured payload in the slice — 2048 tokens truncates it.
    8192,
  );

  const hypotheses = parsed.hypotheses.map((c) => {
    const falsificationMethod: FalsificationMethod = {
      prediction: c.falsificationMethod.prediction,
      metric: c.falsificationMethod.metric,
      comparator: c.falsificationMethod.comparator,
      ...(c.falsificationMethod.value !== undefined
        ? { value: c.falsificationMethod.value }
        : {}),
      ...(c.falsificationMethod.lower !== undefined
        ? { lower: c.falsificationMethod.lower }
        : {}),
      ...(c.falsificationMethod.upper !== undefined
        ? { upper: c.falsificationMethod.upper }
        : {}),
    };
    return {
      id: computeHypothesisId(c.statement, c.mechanism),
      statement: c.statement,
      mechanism: c.mechanism,
      falsificationMethod,
      supportingCitations: c.supportingCitations,
      counterEvidenceCitations: c.counterEvidenceCitations,
      relationToExistingTheory: c.relationToExistingTheory,
      alternativeExplanations: c.alternativeExplanations,
      observablePredictions: c.observablePredictions,
      distinguishingObservations: c.distinguishingObservations,
      noveltyRelativeToCorpus: c.noveltyRelativeToCorpus,
      assumptions: c.assumptions,
      risks: c.risks,
    } satisfies HypothesisCandidate;
  });

  return { hypotheses, meta };
}
