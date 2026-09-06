import { z } from 'zod';
import { RunId, ScientificWorldModelId, ClaimId, HypothesisId, RevisionId } from './ids.js';
import type { ScientificClaim } from './claim.js';
import type { HypothesisCandidate } from './hypothesis.js';
import type { EvidenceRelation } from './evidence.js';
import type { Revision } from './feedback.js';
import type { ExperimentRun, StatReport } from './experiment.js';

export const WorldModelFact = z.object({
  claimId: ClaimId,
  text: z.string().min(1),
  status: z.enum(['verified', 'unverified', 'contested', 'unknown']),
});

export const WorldModelHypothesis = z.object({
  hypothesisId: HypothesisId,
  statement: z.string().min(1),
  belief: z.enum(['leading', 'competing', 'falsified', 'unresolved']),
  supportCount: z.number().int().nonnegative(),
  counterCount: z.number().int().nonnegative(),
});

const WorldModelExperiment = z.object({
  experimentId: z.string().min(1),
  status: z.string().min(1),
  verdict: z.string().optional(),
});

const WorldModelCausalRelation = z.object({
  relation: z.string().min(1),
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  rationale: z.string().min(1),
});

const CAUSAL_VERBS = /\b(?:increases?|decreases?|predicts?|causes?|affects?|influences?|mediates?|drives?|reduces?|improves?|worsens?)\b/i;
const VARIABLE_STOPWORDS = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'effect', 'impact',
  'level', 'rate', 'change', 'result', 'outcome', 'study', 'evidence', 'data',
]);

/** Extract only causal noun phrases, keeping the source object ids that support
 * each phrase. This is deliberately conservative: an unknown variable is safer
 * than a sentence-wide bag of pseudo-variables. */
const extractVariables = (texts: readonly { text: string; sourceObjectId: string }[]): Array<{ name: string; sourceObjectIds: string[] }> => {
  const sources = new Map<string, Set<string>>();
  for (const item of texts) {
    const sentenceParts = item.text.split(/[.!?;\n]+/).map((s) => s.trim()).filter(Boolean);
    for (const sentence of sentenceParts) {
      if (!CAUSAL_VERBS.test(sentence)) continue;
      const match = /^.*?([A-Za-z][A-Za-z0-9 _-]{1,48}?)\s+(?:increases?|decreases?|predicts?|causes?|affects?|influences?|mediates?|drives?|reduces?|improves?|worsens?)\s+([A-Za-z][A-Za-z0-9 _-]{1,48}?)(?:$|\s+(?:by|through|via|under|when|if|and|but)\b)/i.exec(sentence);
      if (match === null) continue;
      for (const raw of [match[1], match[2]]) {
        const name = raw!.trim().replace(/\s+/g, ' ').replace(/^[^A-Za-z]+|[^A-Za-z0-9]+$/g, '');
        if (name.length < 2 || name.length > 48) continue;
        const words = name.toLowerCase().split(' ');
        if (words.every((word) => VARIABLE_STOPWORDS.has(word))) continue;
        const key = name.toLowerCase();
        const prior = sources.get(key);
        if (prior === undefined) sources.set(key, new Set([item.sourceObjectId]));
        else prior.add(item.sourceObjectId);
      }
    }
  }
  return [...sources.entries()].slice(0, 64).map(([key, ids]) => ({
    name: key.replace(/\b\w/g, (c) => c.toUpperCase()),
    sourceObjectIds: [...ids].sort(),
  }));
};

export const ScientificWorldModel = z.object({
  id: ScientificWorldModelId,
  runId: RunId,
  version: z.number().int().positive(),
  computedAt: z.string().datetime(),
  facts: z.array(WorldModelFact),
  hypotheses: z.array(WorldModelHypothesis),
  variables: z.array(z.object({ name: z.string().min(1), unit: z.string().optional(), sourceObjectIds: z.array(z.string().min(1)) })),
  mechanisms: z.array(z.string().min(1)),
  causalRelations: z.array(WorldModelCausalRelation),
  assumptions: z.array(z.string().min(1)),
  competingExplanations: z.array(z.string().min(1)),
  predictions: z.array(z.string().min(1)),
  falsifiers: z.array(z.string().min(1)),
  experiments: z.array(WorldModelExperiment),
  negativeResults: z.array(z.string().min(1)),
  beliefRevisions: z.array(RevisionId),
  contradictions: z.array(z.string().min(1)),
  revisions: z.array(RevisionId),
  unknowns: z.array(z.string().min(1)),
  nextActions: z.array(z.string().min(1)),
  provenance: z.object({
    sourceObjectIds: z.array(z.string().min(1)),
    sourceEventCount: z.number().int().nonnegative(),
  }),
});

export type ScientificWorldModel = z.infer<typeof ScientificWorldModel>;
export type WorldModelFact = z.infer<typeof WorldModelFact>;
export type WorldModelHypothesis = z.infer<typeof WorldModelHypothesis>;

/** Deterministic fold over the persisted scientific objects. No model call or
 * inferred probability is introduced; every field is traceable to SQLite rows. */
export const deriveScientificWorldModel = (input: {
  id: ScientificWorldModelId;
  runId: RunId;
  version: number;
  computedAt: string;
  claims: readonly ScientificClaim[];
  hypotheses: readonly HypothesisCandidate[];
  relations: readonly EvidenceRelation[];
  revisions: readonly Revision[];
  experiments?: readonly ExperimentRun[];
  statReports?: readonly StatReport[];
  sourceEventCount: number;
}): ScientificWorldModel => {
  const counterClaims = new Set(input.relations
    .filter((r) => ['contradicts', 'weakens', 'fails_to_replicate', 'alternative_explanation'].includes(r.relation))
    .map((r) => r.claimId)
    .filter((id): id is ClaimId => id !== undefined));
  const supportByHyp = new Map<string, number>();
  const counterByHyp = new Map<string, number>();
  for (const rel of input.relations) {
    if (rel.targetHypothesisId === undefined) continue;
    const target = rel.relation === 'supports' || rel.relation === 'replicates' ? supportByHyp :
      ['contradicts', 'weakens', 'fails_to_replicate', 'alternative_explanation'].includes(rel.relation) ? counterByHyp : undefined;
    if (target !== undefined) target.set(rel.targetHypothesisId, (target.get(rel.targetHypothesisId) ?? 0) + 1);
  }
  const ranked = [...input.hypotheses].sort((a, b) =>
    ((supportByHyp.get(b.id) ?? 0) - (counterByHyp.get(b.id) ?? 0)) -
    ((supportByHyp.get(a.id) ?? 0) - (counterByHyp.get(a.id) ?? 0)) || a.id.localeCompare(b.id));
  const leading = ranked.find((h) => h.status !== 'rejected');
  const facts = input.claims.map((claim) => ({
    claimId: claim.id,
    text: claim.text,
    status: counterClaims.has(claim.id) ? 'contested' as const : claim.bindingStatus === 'verified' ? 'verified' as const : 'unverified' as const,
  }));
  const hypotheses = ranked.map((hypothesis, index) => ({
    hypothesisId: hypothesis.id,
    statement: hypothesis.statement,
    belief: hypothesis.status === 'rejected' ? 'falsified' as const : hypothesis.id === leading?.id ? 'leading' as const : index < 5 ? 'competing' as const : 'unresolved' as const,
    supportCount: supportByHyp.get(hypothesis.id) ?? 0,
    counterCount: counterByHyp.get(hypothesis.id) ?? 0,
  }));
  const mechanisms = [...new Set(input.hypotheses.map((h) => h.mechanism.trim()).filter(Boolean))].slice(0, 64);
  const assumptions = [...new Set(input.hypotheses.flatMap((h) => h.assumptions.map((a) => a.statement)))].slice(0, 128);
  const predictions = [...new Set(input.hypotheses.flatMap((h) => h.predictions))].slice(0, 128);
  const falsifiers = [...new Set(input.hypotheses.flatMap((h) => h.falsification === undefined ? [] : [h.falsification.falsificationCondition]))].slice(0, 128);
  const competingExplanations = [...new Set(input.hypotheses.filter((h) => h.status !== 'rejected').map((h) => h.statement))].slice(0, 32);
  const causalRelations = input.relations
    .filter((r) => ['supports', 'contradicts', 'weakens', 'replicates', 'fails_to_replicate', 'alternative_explanation', 'depends_on', 'derived_from'].includes(r.relation))
    .map((r) => ({ relation: r.relation, ...(r.claimId !== undefined ? { from: r.claimId } : {}), ...(r.targetHypothesisId !== undefined ? { to: r.targetHypothesisId } : {}), rationale: r.rationale }));
  const variables = extractVariables([
    ...input.claims.map((c) => ({ text: c.text, sourceObjectId: c.id })),
    ...input.hypotheses.flatMap((h) => [
      { text: h.statement, sourceObjectId: h.id },
      { text: h.mechanism, sourceObjectId: h.id },
      ...h.predictions.map((text) => ({ text, sourceObjectId: h.id })),
    ]),
  ]);
  const experiments = (input.experiments ?? []).map((e) => {
    const report = (input.statReports ?? []).find((r) => r.experimentRunId === e.id);
    return { experimentId: e.id, status: e.status, ...(report?.verdict !== undefined ? { verdict: report.verdict } : {}) };
  });
  const negativeResults = (input.statReports ?? [])
    .filter((r) => r.verdict !== undefined && ['falsifies', 'insufficient_data', 'inconclusive'].includes(r.verdict))
    .map((r) => `${r.id}: ${r.verdict!}`);
  const contradictions = input.relations.filter((r) => ['contradicts', 'weakens', 'fails_to_replicate'].includes(r.relation)).map((r) => r.rationale).slice(0, 128);
  const unknowns = [...new Set([
    ...input.claims.flatMap((c) => c.uncertainties),
    ...input.hypotheses.flatMap((h) => h.uncertainties),
    ...(input.claims.length === 0 ? ['no grounded claims have been admitted'] : []),
    ...(input.hypotheses.length === 0 ? ['no competing hypotheses have been generated'] : []),
  ])].slice(0, 64);
  const nextActions = [
    ...(counterClaims.size === 0 && input.claims.length > 0 ? ['retrieve and verify counter-evidence within the declared scope'] : []),
    ...(input.hypotheses.length > 1 ? ['design an observation that discriminates the leading competing explanations'] : []),
    ...(unknowns.length > 0 ? ['resolve the highest-impact recorded uncertainty'] : []),
  ];
  const sourceObjectIds = [
    ...input.claims.map((c) => c.id),
    ...input.hypotheses.map((h) => h.id),
    ...input.relations.map((r) => r.id),
    ...input.revisions.map((r) => r.id),
    ...(input.experiments ?? []).map((e) => e.id),
    ...(input.statReports ?? []).map((r) => r.id),
  ];
  return ScientificWorldModel.parse({
    id: input.id,
    runId: input.runId,
    version: input.version,
    computedAt: input.computedAt,
    facts,
    hypotheses,
    variables,
    mechanisms,
    causalRelations,
    assumptions,
    competingExplanations,
    predictions,
    falsifiers,
    experiments,
    negativeResults,
    beliefRevisions: input.revisions.map((r) => r.id),
    contradictions,
    revisions: input.revisions.map((r) => r.id),
    unknowns,
    nextActions,
    provenance: { sourceObjectIds, sourceEventCount: input.sourceEventCount },
  });
};
