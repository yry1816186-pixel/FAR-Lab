/**
 * research/adversarial_review — independent critique pass (directive §9.7).
 *
 * The critique is an INDEPENDENT pass (separate model call from generation) —
 * it does not reuse the generator's output token-for-token and is asked to
 * attack the hypothesis, not defend it. When the critique uses the same model
 * as the generator, that is honestly labeled (sameModelAsGenerator=true) —
 * never claimed as statistically independent.
 *
 * The critique also produces the SUBJECTIVE scorecard dimensions
 * (ScientificPlausibility / NoveltyRelativeToCorpus / MethodologicalSoundness /
 * ExpectedInformationGain / DataAvailability / ExecutionCost) with
 * source='model'. The deterministic dimensions are computed separately by
 * scorecard.ts and merged — the model never emits a single total score.
 */

import { z } from 'zod';
import type { CorpusSnapshot } from '../retrieval/corpus.ts';
import { sanitizeExternalContent } from '../llm_gateway/sanitizer.ts';
import type { LlmGateway } from '../llm_gateway/gateway.ts';
import type { ProviderProfile } from '../llm_gateway/types.ts';
import { callStructuredJson, type CallMeta } from './llm.ts';
import type {
  CritiqueDimension,
  CritiqueReport,
  HypothesisCandidate,
  ScorecardDimension,
  ScoreGrade,
} from './types.ts';

const CRITIQUE_DIMENSIONS = [
  'falsifiability',
  'novelty',
  'counter_evidence',
  'causation',
  'selective_reporting',
  'data_availability',
  'confounding',
  'citation_mismatch',
  'overreach',
  'ethics',
] as const;

const MODEL_DIMENSION_NAMES = [
  'ScientificPlausibility',
  'NoveltyRelativeToCorpus',
  'MethodologicalSoundness',
  'ExpectedInformationGain',
  'DataAvailability',
  'ExecutionCost',
] as const;

const GRADE_VALUES = ['A', 'B', 'C', 'D', 'F'] as const;

const CritiqueZod = z.object({
  findings: z.array(
    z.object({
      dimension: z.enum(CRITIQUE_DIMENSIONS),
      finding: z.string(),
      severity: z.enum(['critical', 'major', 'minor']),
    }),
  ),
  modelDimensions: z.array(
    z.object({
      name: z.enum(MODEL_DIMENSION_NAMES),
      grade: z.enum(GRADE_VALUES),
      rationale: z.string(),
    }),
  ),
  keyEvidenceToChangeConclusion: z.string(),
});

/** Options for the critique pass. */
export interface CritiqueOptions {
  /** The scientific question. */
  readonly question: string;
  /** The grounding corpus (for citation-mismatch checking context). */
  readonly corpus: CorpusSnapshot;
  /** Whether the critique uses the same model as the generator (honesty label). */
  readonly sameModelAsGenerator: boolean;
}

/**
 * Critique one hypothesis independently.
 *
 * Returns the CritiqueReport (findings + model-graded dimensions) plus the
 * provider CallMeta for the stage receipt. The model dimension grades are
 * returned separately from the report so the caller can merge them into the
 * scorecard without coupling critique → scorecard types.
 */
export async function critiqueHypothesis(
  gateway: LlmGateway,
  profile: ProviderProfile,
  candidate: HypothesisCandidate,
  opts: CritiqueOptions,
): Promise<{
  report: CritiqueReport;
  modelDimensions: readonly ScorecardDimension[];
  meta: CallMeta;
}> {
  const corpusSummary = opts.corpus.documentCount === 0
    ? '(empty corpus)'
    : sanitizeExternalContent(
        opts.corpus.documents.map((d) => `${d.documentId} :: ${d.title}`).join('\n'),
      ).text;

  const system = [
    'You are an adversarial scientific reviewer. Your job is to ATTACK the given',
    'hypothesis, not defend it. Find the strongest reasons it could be wrong,',
    'unfalsifiable, unsupported, or overclaimed.',
    '',
    'Check: falsifiability · novelty vs known work · missing counter-evidence ·',
    'correlation-vs-causation · selective reporting · data availability · confounding ·',
    'citation mismatch · scope overreach · ethics.',
    '',
    'Also grade the SUBJECTIVE dimensions (ScientificPlausibility,',
    'NoveltyRelativeToCorpus, MethodologicalSoundness, ExpectedInformationGain,',
    'DataAvailability, ExecutionCost) as A/B/C/D/F with a one-line rationale each.',
    '',
    'Do NOT produce a single total score. Output JSON only, no markdown fences.',
  ].join('\n');

  const user = [
    `Research question: ${opts.question}`,
    '',
    'Hypothesis under review:',
    `statement: ${candidate.statement}`,
    `mechanism: ${candidate.mechanism}`,
    `falsificationMethod: ${JSON.stringify(candidate.falsificationMethod)}`,
    `supportingCitations: ${JSON.stringify(candidate.supportingCitations)}`,
    `counterEvidenceCitations: ${JSON.stringify(candidate.counterEvidenceCitations)}`,
    '',
    'Corpus allowlist (for citation-mismatch checking):',
    corpusSummary,
  ].join('\n');

  const { data: parsed, meta } = await callStructuredJson(
    gateway,
    profile,
    'research_critique',
    CritiqueZod,
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  );

  const modelDimensions: ScorecardDimension[] = parsed.modelDimensions.map((d) => ({
    name: d.name,
    grade: d.grade as ScoreGrade,
    rationale: d.rationale,
    source: 'model',
  }));

  return {
    report: {
      hypothesisId: candidate.id,
      findings: parsed.findings.map((f) => ({
        dimension: f.dimension as CritiqueDimension,
        finding: f.finding,
        severity: f.severity,
      })),
      sameModelAsGenerator: opts.sameModelAsGenerator,
    },
    modelDimensions,
    meta,
  };
}
