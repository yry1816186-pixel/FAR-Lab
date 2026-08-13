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

import { z } from 'zod';
import { rawSha256Hex } from '../retrieval/hash.ts';
import type { CorpusSnapshot } from '../retrieval/corpus.ts';
import { sanitizeExternalContent } from '../llm_gateway/sanitizer.ts';
import type { LlmGateway } from '../llm_gateway/gateway.ts';
import type { ProviderProfile } from '../llm_gateway/types.ts';
import type { FalsificationMethod } from '../agent_loop/types.ts';
import { callStructuredJson } from './llm.ts';
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

/** zod schema for the model's falsification method (mirrors the shared type). */
const FalsificationMethodZod = z.object({
  prediction: z.string(),
  metric: z.string(),
  comparator: z.enum(['gt', 'lt', 'range']),
  value: z.number().optional(),
  lower: z.number().optional(),
  upper: z.number().optional(),
});

/** zod schema for one generated hypothesis candidate (no id — computed locally). */
const CandidateZod = z.object({
  statement: z.string(),
  mechanism: z.string(),
  falsificationMethod: FalsificationMethodZod,
  supportingCitations: z.array(z.string()),
  counterEvidenceCitations: z.array(z.string()),
  relationToExistingTheory: z.string(),
  alternativeExplanations: z.array(z.string()),
  observablePredictions: z.array(z.string()),
  distinguishingObservations: z.array(z.string()),
  noveltyRelativeToCorpus: z.string(),
  assumptions: z.array(z.string()),
  risks: z.array(z.string()),
});

/** zod schema for the whole generation response. */
const GenerationZod = z.object({
  hypotheses: z.array(CandidateZod).min(3).max(5),
});

/** Compute the deterministic content-addressed id for a candidate. */
export function computeHypothesisId(statement: string, mechanism: string): string {
  return rawSha256Hex(`${statement}\n${mechanism}`).slice(0, 32);
}

/** Render the corpus as a citation allowlist for the model context (sanitized). */
function renderCorpusAllowlist(corpus: CorpusSnapshot): string {
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
 */
export async function generateHypotheses(
  gateway: LlmGateway,
  profile: ProviderProfile,
  opts: GenerateHypothesesOptions,
): Promise<readonly HypothesisCandidate[]> {
  const targetCount = opts.targetCount ?? 3;
  const allowlist = renderCorpusAllowlist(opts.corpus);

  const system = [
    'You are a scientific hypothesis generator for a research system.',
    `Generate EXACTLY ${targetCount} candidate hypotheses that are MECHANISTICALLY DISTINCT`,
    '(different causal mechanisms / key predictions — NOT paraphrases of each other).',
    '',
    'Each hypothesis MUST include a falsificationMethod with prediction, metric,',
    'comparator ("gt" | "lt" | "range"), and the threshold fields the comparator needs.',
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

  const parsed = await callStructuredJson(gateway, profile, 'research_hypotheses', GenerationZod, [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);

  return parsed.hypotheses.map((c) => {
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
}
