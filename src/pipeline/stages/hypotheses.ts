import { z } from 'zod';
import type { StageContext, StageHandler, StageOutcome } from '../types.js';
import { callStructured } from '../llm.js';
import {
  GenerationStrategy,
  HypothesisCandidate,
  NoveltyLabel,
  newId,
} from '../../domain/index.js';
import type {
  ClaimId,
  EvidenceRelation,
  HypothesisCandidate as Hypothesis,
  LiteratureNovelty,
  LiteratureNoveltyNeighbor,
} from '../../domain/index.js';
import type { RawSourceRecord } from '../../shared/ports.js';
import { isSourceAdapterError } from '../../sources/error.js';
import { snapshotHash } from '../../sources/snapshot.js';
import { canonicalSha256 } from '../../shared/crypto.js';
import {
  assertNotCancelled,
  bucketClaims,
  claimsForPrompt,
  DUPLICATE_MARKER,
  partitionClaimRefs,
  runClaimIds,
  verifiedClaims,
} from './shared.js';

/**
 * generate_hypotheses — multi-strategy hypothesis search (mission §26, R-06).
 *
 * Scientific discipline enforced here:
 * - three structurally different search strategies (evidence-conditioned,
 *   contradiction-driven, mechanism-driven) each contribute candidates, so a
 *   single hypothesis rephrased five times can never pass as a result set;
 * - paraphrase-equivalent candidates are clustered by one LLM grouping call,
 *   deterministically normalized (unmentioned candidates stay distinct —
 *   over-merging destroys diversity, the worse failure);
 * - if fewer than MIN_REPRESENTATIVES structurally distinct candidates survive,
 *   ONE supplementary explicitly-different generation is attempted; if diversity
 *   is still short, the shortfall is stored and reported honestly — never padded;
 * - evidence references are filtered against ids that actually exist in this run.
 */

/** Fewest distinct representatives acceptable without an explicit diversity shortfall note. */
export const MIN_REPRESENTATIVES = 3;

// ---------------------------------------------------------------------------
// model output schemas (fail-closed via callStructured)
// ---------------------------------------------------------------------------

const CandidateOut = z.object({
  statement: z.string().min(1),
  mechanism: z.string().min(1),
  assumptions: z.array(z.string().min(1)).min(2),
  predictions: z.array(z.string().min(1)).min(1),
  rationale: z.string().min(1),
  distinctnessRationale: z.string().min(1),
  /** Claim ids the model says conditioned the candidate; filtered against real ids. */
  evidenceClaimIds: z.array(z.string()).default([]),
});

const StrategyOut = z.object({
  candidates: z.array(CandidateOut).min(2), // prompt asks for 2; overflow is truncated deterministically post-parse (schema-level rejection wastes a retry)
});

const ClusterOut = z.object({
  clusters: z
    .array(
      z.object({
        memberIndices: z.array(z.number().int().nonnegative()).min(1),
        reason: z.string().min(1),
      }),
    )
    .min(1),
});

const NoveltyOut = z.object({
  labels: z
    .array(z.object({ index: z.number().int().nonnegative(), noveltyLabel: NoveltyLabel }))
    .min(1),
});

const SupplementOut = z.object({
  candidates: z.array(CandidateOut).default([]), // empty allowed: honest "nothing more to add"; overflow truncated post-parse
});

// ---- D-017 literature-grounded novelty (second layer) ----
const LitExpansionOut = z.object({
  hypotheses: z
    .array(z.object({
      hypothesisId: z.string().min(1),
      /** Exactly 2: one paraphrase of the hypothesis, one entity/mechanism vocabulary query. */
      queries: z.array(z.string().min(4)).length(2),
    }))
    .min(1),
});
const LitFacetOut = z.object({
  rankings: z
    .array(z.object({
      hypothesisId: z.string().min(1),
      rankedNeighborIndices: z.array(z.number().int().nonnegative()).default([]),
    }))
    .min(1),
});
const LitVerdictOut = z.object({
  verdicts: z
    .array(z.object({
      hypothesisId: z.string().min(1),
      verdict: z.enum(['novel', 'incremental', 'already_done', 'unclear']),
      nearestNeighborIndex: z.number().int().nonnegative().optional(),
      justification: z.string().min(30),
    }))
    .min(1),
});

/** D-017 bounds: literature novelty runs on representatives only, with hard caps. */
export const LIT_NOVELTY_MAX_HYPS = 4;
const LIT_QUERIES_PER_HYP = 2;
const LIT_SEARCH_LIMIT = 10;
const LIT_MAX_RANKED_NEIGHBORS = 5;

// ---------------------------------------------------------------------------
// strategy definitions
// ---------------------------------------------------------------------------

interface StrategyDef {
  strategy: GenerationStrategy;
  purpose: string;
  instruction: string;
}

const STRATEGY_DEFS: readonly StrategyDef[] = [
  {
    strategy: 'evidence_conditioned',
    purpose: 'hypothesis-search:evidence-conditioned',
    instruction:
      'Derive hypotheses strictly conditioned on the provided affirmative (uncontested) verified claims. ' +
      'Each hypothesis must state a mechanism, at least two assumptions it rests on, and at least one testable prediction.',
  },
  {
    strategy: 'contradiction_driven',
    purpose: 'hypothesis-search:contradiction-driven',
    instruction:
      'Derive hypotheses from the provided counter-evidence / contested / qualified claims: where the current ' +
      'evidence base conflicts or is unsettled, which alternative explanations resolve the tension?',
  },
  {
    strategy: 'mechanism_driven',
    purpose: 'hypothesis-search:mechanism-driven',
    instruction:
      'Propose mechanism-level hypotheses for the research question that explain the provided evidence ' +
      'through an explicit causal mechanism, not merely a restatement of the claims.',
  },
] as const;

const DIVERSITY_DISCIPLINE =
  'Scientific discipline: every hypothesis must differ from the others in mechanism, core assumptions, ' +
  'or the dimension of its predictions. Paraphrases of one idea are NOT distinct hypotheses. ' +
  'Respond only with JSON matching the required schema.';

/**
 * Cross-strategy negative conditioning (Wave-5 F4; mechanism learned from AI-Scientist-v2's
 * iterative ideation — full history visible + explicit differentiation demand — and Kaimen's
 * evolution-operator taxonomy, both clean-room paraphrased): strategy calls after the first
 * see every candidate already proposed in this run and must differ in mechanism or core
 * premise. Attacks the measured failure class: 136/455 (30%) of persisted candidates were
 * paraphrase duplicates pooled across recorded runs (spikes/wave5-diversity-probe.mjs).
 */
const antiRepetitionInstruction = (previouslyProposedCount: number): string =>
  previouslyProposedCount === 0
    ? ''
    : ` ${previouslyProposedCount} candidate hypothesis statement(s) already proposed in this run are ` +
      'listed under previouslyProposed. EVERY candidate you return must differ from each of them in ' +
      'mechanism or core premise — restating, inverting phrasing, or recombining the same core idea ' +
      'produces a duplicate that will be clustered away and discarded.';

// ---------------------------------------------------------------------------
// clustering helpers (deterministic post-processing of the LLM partition)
// ---------------------------------------------------------------------------

interface RawCandidate {
  strategy: GenerationStrategy;
  inputClaimIds: ClaimId[];
  out: z.infer<typeof CandidateOut>;
  modelRef: string;
  supplement: boolean;
}

interface NormalizedCluster {
  /** Indices into the flat candidate list, ascending; first member is the representative. */
  members: number[];
  reason: string;
}

const normalizeClusters = (clusters: z.infer<typeof ClusterOut>['clusters'], total: number): NormalizedCluster[] => {
  const claimed = new Set<number>();
  const out: NormalizedCluster[] = [];
  for (const cl of clusters) {
    const members = [...new Set(cl.memberIndices)]
      .filter((i) => i >= 0 && i < total)
      .sort((a, b) => a - b)
      .filter((i) => !claimed.has(i));
    if (members.length === 0) continue;
    for (const m of members) claimed.add(m);
    out.push({ members, reason: cl.reason });
  }
  // Unmentioned candidates default to distinct (singletons): over-merging loses
  // real diversity; under-merging only leaves visible duplicates in storage.
  for (let i = 0; i < total; i += 1) {
    if (!claimed.has(i)) out.push({ members: [i], reason: 'not grouped by clustering; treated as distinct' });
  }
  out.sort((a, b) => (a.members[0] ?? 0) - (b.members[0] ?? 0));
  return out;
};

const clusterCandidates = async (
  ctx: StageContext,
  raws: readonly RawCandidate[],
): Promise<NormalizedCluster[]> => {
  const res = await callStructured<z.infer<typeof ClusterOut>>(ctx, {
    stage: 'generate_hypotheses',
    purpose: 'hypothesis-search:cluster-dedup',
    systemPrompt:
      'You group paraphrase-equivalent scientific hypotheses. Candidates are numbered. ' +
      'Two candidates belong to the same cluster ONLY if they assert the same core idea with the same mechanism ' +
      '(restatements). Different mechanism, different core premise, or different prediction dimension means different cluster. ' +
      DIVERSITY_DISCIPLINE,
    payload: {
      numberedCandidates: raws.map((r, i) => ({
        index: i,
        strategy: r.strategy,
        statement: r.out.statement,
        mechanism: r.out.mechanism,
        predictions: r.out.predictions,
      })),
    },
    schema: ClusterOut,
  });
  return normalizeClusters(res.data.clusters, raws.length);
};

// ---------------------------------------------------------------------------
// candidate persistence
// ---------------------------------------------------------------------------

const buildHypothesis = (
  runId: string,
  hypId: string,
  raw: RawCandidate,
  clusterKey: string,
  noveltyLabel: z.infer<typeof NoveltyLabel>,
  duplicateOfRepId: string | undefined,
  now: string,
): Hypothesis => {
  const rationale =
    duplicateOfRepId === undefined
      ? raw.out.rationale + (raw.supplement ? ' [diversity supplement]' : '')
      : `${raw.out.rationale} | ${DUPLICATE_MARKER}${duplicateOfRepId}`;
  return HypothesisCandidate.parse({
    id: hypId,
    runId,
    version: 0,
    statement: raw.out.statement,
    mechanism: raw.out.mechanism,
    derivation: {
      strategy: raw.strategy,
      rationale,
      inputClaimIds: raw.inputClaimIds,
      modelRef: raw.modelRef,
    },
    assumptions: raw.out.assumptions.map((statement, i) => ({
      id: `asm-${hypId.slice(4, 12)}-${i}`,
      statement,
      kind: 'stipulated', // generator-asserted premises; not yet evidence-backed
      backingClaimIds: [],
    })),
    predictions: raw.out.predictions,
    supportingClaimIds: [],
    counterClaimIds: [],
    uncertainties: [],
    noveltyLabel,
    testability: 'testable_with_data', // provisional; critique_falsify refines
    clusterKey,
    distinctnessRationale: raw.out.distinctnessRationale,
    createdAt: now,
  });
};

// ---------------------------------------------------------------------------
// stage handler
// ---------------------------------------------------------------------------

export const generateHypothesesStage: StageHandler = {
  stage: 'generate_hypotheses',

  async applicable(ctx) {
    return ctx.store.listObjects('hypothesis', ctx.run.id).length === 0;
  },

  async execute(ctx: StageContext): Promise<StageOutcome> {
    const runId = ctx.run.id;
    const question = ctx.store.getObject('question', ctx.run.questionId);
    if (!question) throw new Error(`research question not found: ${ctx.run.questionId}`);

    const claims = verifiedClaims(ctx);
    if (claims.length === 0) {
      return {
        kind: 'skipped',
        reason:
          'no verified claims (bindingStatus=verified) for this run — hypothesis generation is evidence-constrained and refuses to run on an empty evidence base',
      };
    }
    const relations: EvidenceRelation[] = ctx.store.listObjects('evidence_relation', runId);
    const { supporting, counter } = bucketClaims(claims, relations);
    const existingClaimIds = runClaimIds(ctx);

    const warnings: string[] = [];
    const raws: RawCandidate[] = [];
    const questionForPrompt = {
      text: question.text,
      background: question.background,
      goalType: question.goalType,
      domain: question.scope.domain,
      phenomena: question.scope.phenomena,
    };

    // ---- three strategy searches, one structured call each ----
    for (const def of STRATEGY_DEFS) {
      assertNotCancelled(ctx, 'generate_hypotheses');
      let payload: Record<string, unknown>;
      if (def.strategy === 'evidence_conditioned') {
        const base = supporting.length > 0 ? supporting : claims;
        payload = {
          strategy: def.strategy,
          question: questionForPrompt,
          supportingClaims: claimsForPrompt(base),
          ...(supporting.length === 0 ? { note: 'no uncontested claims available; conditioning on the full verified base' } : {}),
        };
      } else if (def.strategy === 'contradiction_driven') {
        const hasCounter = counter.length > 0;
        payload = {
          strategy: def.strategy,
          question: questionForPrompt,
          counterDirectionClaims: claimsForPrompt(hasCounter ? counter : supporting),
          ...(hasCounter
            ? {}
            : {
                counterEvidenceAbsent: true,
                instruction:
                  'No counter-evidence claims exist for this run. Generate explicit alternative explanations ' +
                  'for where the current supporting evidence COULD be wrong (confounds, measurement limits, ' +
                  'scope limits) — do not simply extrapolate the supporting claims.',
              }),
        };
      } else {
        payload = {
          strategy: def.strategy,
          question: questionForPrompt,
          claims: claimsForPrompt(claims),
        };
      }

    // W8 S2: per-strategy step checkpoint (stable domain key, family 'strategies').
    // Strategies execute in fixed order and each prompt depends only on earlier
    // strategies' results, so a resume replays cached strategies first and rebuilds
    // `raws` identically — the next uncached strategy sees a byte-identical prompt.
    // The inputs fingerprint covers the conditioning base AND the instruction constants
    // (def.instruction + DIVERSITY_DISCIPLINE): a prompt upgrade invalidates the family's
    // cache instead of replaying stale generations (Wave-5 audit P3 / W8 audit P1-1).
    const strategyInputs = canonicalSha256({
      question: questionForPrompt,
      claims: claimsForPrompt(claims),
      relations: relations.map((r) => ({ id: r.id, relation: r.relation })),
      instructions: STRATEGY_DEFS.map((d) => d.instruction),
      discipline: DIVERSITY_DISCIPLINE,
    });
    const res = await ctx.checkpointed('generate_hypotheses', 'strategies', `strategy:${def.strategy}`, strategyInputs, () =>
        callStructured<z.infer<typeof StrategyOut>>(ctx, {
          stage: 'generate_hypotheses',
          purpose: def.purpose,
          systemPrompt: `${def.instruction}${antiRepetitionInstruction(raws.length)} ${DIVERSITY_DISCIPLINE}`,
          payload: {
            ...payload,
            ...(raws.length > 0
              ? {
                  previouslyProposed: raws.map((r) => ({
                    statement: r.out.statement,
                    mechanism: r.out.mechanism,
                  })),
                }
              : {}),
          },
          schema: StrategyOut,
        }).then((r) => ({ provider: r.provider, modelId: r.modelId, data: r.data })));
      const modelRef = `${res.provider}/${res.modelId}`;
      const inputIds = (payload.supportingClaims ?? payload.counterDirectionClaims ?? payload.claims ?? []) as {
        id: string;
      }[];
      const fallbackInput = inputIds.map((c) => c.id as ClaimId);
      if (res.data.candidates.length > 4) {
        warnings.push(`${def.strategy}: model returned ${res.data.candidates.length} candidates; keeping first 4 (deterministic truncation)`);
        res.data.candidates = res.data.candidates.slice(0, 4);
      }
      for (const cand of res.data.candidates) {
        const cited = partitionClaimRefs(cand.evidenceClaimIds, existingClaimIds);
        if (cited.invalid.length > 0) {
          warnings.push(
            `${def.strategy}: dropped ${cited.invalid.length} non-existent claim reference(s) from a candidate (${cited.invalid.join(', ')})`,
          );
        }
        raws.push({
          strategy: def.strategy,
          inputClaimIds: cited.valid.length > 0 ? cited.valid : fallbackInput,
          out: cand,
          modelRef,
          supplement: false,
        });
      }
    }

    // ---- paraphrase clustering / dedup ----
    assertNotCancelled(ctx, 'generate_hypotheses');
    let clusters = await clusterCandidates(ctx, raws);
    let supplementUsed = false;

    // ---- diversity verification: one explicit-difference supplement if short ----
    if (clusters.length < MIN_REPRESENTATIVES) {
      assertNotCancelled(ctx, 'generate_hypotheses');
      const res = await callStructured<z.infer<typeof SupplementOut>>(ctx, {
        stage: 'generate_hypotheses',
        purpose: 'hypothesis-search:diversity-supplement',
        systemPrompt:
          'The current hypothesis candidate set is too homogeneous. Generate additional candidates by ' +
          'applying ONE of these operators to the existing set: (a) integrate — merge the cores of two ' +
          'mechanistically distant candidates into one hypothesis neither supports alone; (b) reduce — ' +
          'strip one candidate to its single load-bearing causal claim under a sharper mechanism; ' +
          '(c) make-feasible — reshape the strongest candidate to be executable with current methods and ' +
          'measurements; (d) transplant — import a causal mechanism from an adjacent domain and apply it ' +
          'to this question. Every candidate must differ from ALL existing candidates in mechanism or ' +
          'core premise. Paraphrases are useless here. If genuinely no additional distinct hypothesis is ' +
          'defensible from the evidence, return an empty list. ' +
          DIVERSITY_DISCIPLINE,
        payload: {
          question: questionForPrompt,
          claims: claimsForPrompt(claims),
          existingCandidates: raws.map((r, i) => ({
            index: i,
            statement: r.out.statement,
            mechanism: r.out.mechanism,
            assumptions: r.out.assumptions,
          })),
        },
        schema: SupplementOut,
      });
      if (res.data.candidates.length > 4) {
        warnings.push(`diversity-supplement: model returned ${res.data.candidates.length}; keeping first 4`);
        res.data.candidates = res.data.candidates.slice(0, 4);
      }
      if (res.data.candidates.length > 0) {
        supplementUsed = true;
        for (const cand of res.data.candidates) {
          const cited = partitionClaimRefs(cand.evidenceClaimIds, existingClaimIds);
          if (cited.invalid.length > 0) {
            warnings.push(
              `diversity-supplement: dropped ${cited.invalid.length} non-existent claim reference(s) (${cited.invalid.join(', ')})`,
            );
          }
          raws.push({
            strategy: 'assumption_perturbation',
            inputClaimIds: cited.valid.length > 0 ? cited.valid : (claims.map((c) => c.id) as ClaimId[]),
            out: cand,
            modelRef: `${res.provider}/${res.modelId}`,
            supplement: true,
          });
        }
        // Re-cluster the combined set so the supplement is held to the same
        // paraphrase-equivalence standard as the primary candidates.
        clusters = await clusterCandidates(ctx, raws);
      }
    }

    // ---- novelty labels: one batched judgment call ----
    assertNotCancelled(ctx, 'generate_hypotheses');
    const noveltyRes = await callStructured<z.infer<typeof NoveltyOut>>(ctx, {
      stage: 'generate_hypotheses',
      purpose: 'hypothesis-search:novelty-labels',
      systemPrompt:
        'Classify each hypothesis candidate against the provided verified claims: "evidence_grounded" if it ' +
        'follows mainly from those claims, "novel_speculation" if it introduces substantially new mechanism or ' +
        'premises beyond the claims, "mixed" if both. Judge only from the provided evidence.',
      payload: {
        claims: claimsForPrompt(claims),
        numberedCandidates: raws.map((r, i) => ({ index: i, statement: r.out.statement, mechanism: r.out.mechanism })),
      },
      schema: NoveltyOut,
    });
    const noveltyByIndex = new Map<number, z.infer<typeof NoveltyLabel>>();
    for (const l of noveltyRes.data.labels) {
      if (l.index >= 0 && l.index < raws.length && !noveltyByIndex.has(l.index)) noveltyByIndex.set(l.index, l.noveltyLabel);
    }
    const noveltyOf = (i: number): z.infer<typeof NoveltyLabel> => noveltyByIndex.get(i) ?? 'mixed'; // unmentioned => honest default

    // ---- persist: representatives first (dup marker references a real id) ----
    const now = new Date().toISOString();
    const ids = raws.map(() => newId('hyp')); // pre-allocate so duplicates can cite their representative
    const idOfIndex = (i: number): string => ids[i] as string;
    let duplicates = 0;
    const noveltyCounts: Record<string, number> = { evidence_grounded: 0, novel_speculation: 0, mixed: 0 };
    clusters.forEach((cl, ci) => {
      const clusterKey = `cluster-${ci + 1}`;
      const repIndex = cl.members[0] ?? 0;
      cl.members.forEach((mi, position) => {
        const raw = raws[mi];
        if (!raw) return;
        const repId = position === 0 ? undefined : idOfIndex(repIndex);
        if (repId !== undefined) duplicates += 1;
        const label = noveltyOf(mi);
        noveltyCounts[label] = (noveltyCounts[label] ?? 0) + 1;
        const hyp = buildHypothesis(runId, idOfIndex(mi), raw, clusterKey, label, repId, now);
        ctx.store.putObject('hypothesis', hyp);
      });
    });

    // ---- D-017 literature-grounded novelty: second layer, representatives only ----
    // The corpus-relative noveltyLabel above stays; this judges each representative
    // against LIVE literature neighbors (expansion -> retrieve -> facet rerank ->
    // adjudication). 'unclear' is the honest default; no neighbors -> no fabrication.
    const litNotes: string[] = [];
    const litVerdictCounts: Record<string, number> = { novel: 0, incremental: 0, already_done: 0, unclear: 0 };
    const litTargets = clusters
      .map((cl) => cl.members[0] ?? 0)
      .slice(0, LIT_NOVELTY_MAX_HYPS)
      .map((i) => ({ id: idOfIndex(i), raw: raws[i] }))
      .filter((t): t is { id: string; raw: RawCandidate } => t.raw !== undefined);
    const persistLitNovelty = (hypId: string, layer: LiteratureNovelty): void => {
      const stored = ctx.store.getObject('hypothesis', hypId);
      if (!stored) return;
      litVerdictCounts[layer.verdict] = (litVerdictCounts[layer.verdict] ?? 0) + 1;
      ctx.store.putObject('hypothesis', { ...stored, literatureNovelty: layer });
    };
    if (litTargets.length > 0) {
      const litProducer = 'literature-novelty pipeline (retrieved neighbors, facet rerank, LLM adjudication)';
      try {
        assertNotCancelled(ctx, 'generate_hypotheses');
        // (1) query expansion — dual vocabulary against the known AI-Scientist failure
        //     mode of missing the nearest prior work (Beel et al. 2025).
        const expRes = await callStructured<z.infer<typeof LitExpansionOut>>(ctx, {
          stage: 'generate_hypotheses',
          purpose: 'novelty-check:query-expansion',
          systemPrompt:
            'For each hypothesis, write exactly 2 English scholarly search queries to find the CLOSEST prior work: ' +
            '(a) a natural-language paraphrase of the hypothesis itself, and (b) a keyword query built from its key ' +
            'entities and mechanism terms. The goal is to retrieve the nearest neighbors that already exist in the ' +
            'literature, so novelty can be judged against real prior work — not to support the hypothesis.',
          payload: {
            hypotheses: litTargets.map((t) => ({ hypothesisId: t.id, statement: t.raw.out.statement, mechanism: t.raw.out.mechanism })),
          },
          schema: LitExpansionOut,
          temperature: 0.2,
        });
        const queriesByHyp = new Map(
          expRes.data.hypotheses
            .filter((h) => litTargets.some((t) => t.id === h.hypothesisId))
            .map((h) => [h.hypothesisId, h.queries.slice(0, LIT_QUERIES_PER_HYP)] as const),
        );
        // (2) neighbor retrieval on OpenAlex (bounded, receipted, deduped vs corpus and across hypotheses)
        const corpusKeys = new Set<string>();
        for (const doc of ctx.store.listObjects('source_document', runId)) {
          for (const id of doc.identifiers) corpusKeys.add(`${id.kind}:${id.value.toLowerCase()}`);
        }
        const neighborKey = (rec: RawSourceRecord): string | null => {
          const id = rec.identifiers.find((i) => i.kind === 'doi') ?? rec.identifiers.find((i) => i.kind === 'openalex') ?? rec.identifiers[0];
          return id ? `${id.kind}:${id.value.toLowerCase()}` : null;
        };
        const neighborsByHyp = new Map<string, LiteratureNoveltyNeighbor[]>();
        const seenNeighborKeys = new Set<string>(corpusKeys);
        let searchFailures = 0;
        for (const t of litTargets) {
          const queries = queriesByHyp.get(t.id) ?? [];
          const found: LiteratureNoveltyNeighbor[] = [];
          for (const q of queries) {
            assertNotCancelled(ctx, 'generate_hypotheses');
            try {
              const res = await ctx.sourceFor('openalex').search(q, { limit: LIT_SEARCH_LIMIT });
              ctx.recordReceipt({
                kind: 'source_retrieval',
                executionMode: 'live',
                stage: 'generate_hypotheses',
                redactionNote: 'novelty-neighbor search; per-record content hashes retained',
                sourceRetrieval: {
                  family: 'openalex',
                  query: q,
                  httpStatus: res.httpStatus,
                  resultCount: res.records.length,
                  contentHashes: res.records.map((r) => snapshotHash('openalex', r)),
                },
              });
              for (const rec of res.records) {
                const key = neighborKey(rec);
                if (key === null || seenNeighborKeys.has(key)) continue;
                seenNeighborKeys.add(key);
                found.push({
                  title: rec.title,
                  ...(rec.publicationYear !== undefined ? { year: rec.publicationYear } : {}),
                  ...(rec.identifiers.find((i) => i.kind === 'doi') !== undefined
                    ? { doi: rec.identifiers.find((i) => i.kind === 'doi')?.value }
                    : {}),
                  ...(rec.identifiers.find((i) => i.kind === 'openalex') !== undefined
                    ? { openalexId: rec.identifiers.find((i) => i.kind === 'openalex')?.value }
                    : {}),
                  ...(rec.venue !== undefined ? { venue: rec.venue } : {}),
                  contentHash: snapshotHash('openalex', rec),
                  query: q,
                });
              }
            } catch (e) {
              searchFailures += 1;
              // Failed novelty searches keep the source-retrieval receipt invariant
              // (same shape as retrieve-stage failures); without this, a 429 burst
              // zeroed the neighbor layer with no receipt trail at all.
              ctx.recordReceipt({
                kind: 'source_retrieval',
                executionMode: 'live',
                stage: 'generate_hypotheses',
                redactionNote: 'novelty-neighbor search FAILED (rate limit/network); affected hypotheses judged unclear when no neighbors',
                sourceRetrieval: {
                  family: 'openalex',
                  query: q,
                  httpStatus: isSourceAdapterError(e) ? e.httpStatus : 0,
                  resultCount: 0,
                  contentHashes: [],
                },
              });
              ctx.log(`generate_hypotheses: novelty neighbor search failed for "${q}": ${e instanceof Error ? e.message : String(e)}`);
            }
          }
          neighborsByHyp.set(t.id, found);
        }
        if (searchFailures > 0) litNotes.push(`${searchFailures} novelty-neighbor search(es) failed (receipted; affected hypotheses judged 'unclear' when no neighbors)`);
        // hypotheses with no neighbors get the deterministic honest 'unclear' — no empty-grounding LLM calls
        const withNeighbors = litTargets.filter((t) => (neighborsByHyp.get(t.id) ?? []).length > 0);
        for (const t of litTargets) {
          if ((neighborsByHyp.get(t.id) ?? []).length === 0) {
            persistLitNovelty(t.id, {
              verdict: 'unclear',
              neighbors: [],
              justification: 'no literature neighbors retrieved (search failed or empty) — novelty remains corpus-relative only',
              producer: litProducer,
              calibration: 'uncalibrated_llm_judgment',
              assessedAt: new Date().toISOString(),
            });
          }
        }
        // (3) facet rerank — the decisive step per arXiv 2506.22026
        let rankedByHyp = new Map<string, LiteratureNoveltyNeighbor[]>(
          withNeighbors.map((t) => {
            const all = neighborsByHyp.get(t.id) ?? [];
            return [t.id, all.slice(0, LIT_MAX_RANKED_NEIGHBORS)] as const;
          }),
        );
        if (withNeighbors.length > 0) {
          try {
            const facetRes = await callStructured<z.infer<typeof LitFacetOut>>(ctx, {
              stage: 'generate_hypotheses',
              purpose: 'novelty-check:facet-rerank',
              systemPrompt:
                'Rerank the retrieved papers by how close each is to the hypothesis across facets: question overlap, ' +
                'method overlap, mechanism overlap, and finding overlap. A paper is a NEAR neighbor if it addresses ' +
                'substantially the same question/mechanism, even with different methods. Rank the closest first. ' +
                'Return rankedNeighborIndices with at most the 5 closest indices per hypothesis.',
              payload: {
                hypotheses: withNeighbors.map((t) => ({
                  hypothesisId: t.id,
                  statement: t.raw.out.statement,
                  mechanism: t.raw.out.mechanism,
                  neighbors: (neighborsByHyp.get(t.id) ?? []).map((nb, i) => ({
                    index: i,
                    title: nb.title,
                    ...(nb.year !== undefined ? { year: nb.year } : {}),
                    ...(nb.venue !== undefined ? { venue: nb.venue } : {}),
                  })),
                })),
              },
              schema: LitFacetOut,
              temperature: 0.1,
            });
            const next = new Map<string, LiteratureNoveltyNeighbor[]>();
            for (const t of withNeighbors) {
              const all = neighborsByHyp.get(t.id) ?? [];
              const rank = facetRes.data.rankings.find((r) => r.hypothesisId === t.id);
              if (!rank) {
                next.set(t.id, all.slice(0, LIT_MAX_RANKED_NEIGHBORS));
                continue;
              }
              const seen = new Set<number>();
              const picked: LiteratureNoveltyNeighbor[] = [];
              for (const i of rank.rankedNeighborIndices) {
                if (i >= 0 && i < all.length && !seen.has(i) && picked.length < LIT_MAX_RANKED_NEIGHBORS) {
                  seen.add(i);
                  picked.push(all[i]!);
                }
              }
              // incomplete permutations fall back to retrieval order for the missing tail
              for (let i = 0; i < all.length && picked.length < LIT_MAX_RANKED_NEIGHBORS; i++) {
                if (!seen.has(i)) { seen.add(i); picked.push(all[i]!); }
              }
              next.set(t.id, picked);
            }
            rankedByHyp = next;
          } catch (e) {
            litNotes.push(`facet rerank failed — retrieval order used (${e instanceof Error ? e.message : String(e)})`);
          }
        }
        // (4) adjudication against the ranked neighbors
        const toJudge = withNeighbors.filter((t) => (rankedByHyp.get(t.id) ?? []).length > 0);
        const verdictByHyp = new Map<string, z.infer<typeof LitVerdictOut>['verdicts'][number]>();
        if (toJudge.length > 0) {
          try {
            const verdictRes = await callStructured<z.infer<typeof LitVerdictOut>>(ctx, {
              stage: 'generate_hypotheses',
              purpose: 'novelty-check:adjudication',
              systemPrompt:
                'Judge the literature novelty of each hypothesis STRICTLY against its retrieved nearest-neighbor papers. ' +
                'Verdicts: "already_done" if a neighbor substantially states or proves the same hypothesis; ' +
                '"incremental" if neighbors address the same question/mechanism and the hypothesis only varies a ' +
                'detail; "novel" only if no neighbor comes close on question AND mechanism; "unclear" when retrieval ' +
                'looks insufficient to decide. Cite the decisive neighbor in the justification. Never inflate novelty.',
              payload: {
                hypotheses: toJudge.map((t) => ({
                  hypothesisId: t.id,
                  statement: t.raw.out.statement,
                  mechanism: t.raw.out.mechanism,
                  rankedNeighbors: (rankedByHyp.get(t.id) ?? []).map((nb, i) => ({
                    index: i,
                    title: nb.title,
                    ...(nb.year !== undefined ? { year: nb.year } : {}),
                    ...(nb.venue !== undefined ? { venue: nb.venue } : {}),
                  })),
                })),
              },
              schema: LitVerdictOut,
              temperature: 0.1,
            });
            for (const v of verdictRes.data.verdicts) {
              if (toJudge.some((t) => t.id === v.hypothesisId) && !verdictByHyp.has(v.hypothesisId)) {
                verdictByHyp.set(v.hypothesisId, v);
              }
            }
          } catch (e) {
            litNotes.push(`novelty adjudication failed (${e instanceof Error ? e.message : String(e)})`);
          }
        }
        for (const t of toJudge) {
          const ranked = rankedByHyp.get(t.id) ?? [];
          const v = verdictByHyp.get(t.id);
          persistLitNovelty(t.id, v
            ? {
                verdict: v.verdict,
                neighbors: ranked,
                justification: v.justification,
                producer: litProducer,
                calibration: 'uncalibrated_llm_judgment',
                assessedAt: new Date().toISOString(),
              }
            : {
                verdict: 'unclear',
                neighbors: ranked,
                justification: `adjudication unavailable for this hypothesis — neighbors retrieved and ranked, verdict honestly unclear`,
                producer: litProducer,
                calibration: 'uncalibrated_llm_judgment',
                assessedAt: new Date().toISOString(),
              });
        }
      } catch (e) {
        // The whole literature layer is best-effort on top of the core loop: a failure
        // here degrades novelty back to corpus-relative (disclosed), never blocks the run.
        const msg = e instanceof Error ? e.message : String(e);
        litNotes.push(`literature novelty layer skipped: ${msg}`);
      }
    }

    const representatives = clusters.length;
    const parts = [
      `generated ${raws.length} candidates via 3 strategies (${STRATEGY_DEFS.map((d) => d.strategy).join(', ')});`,
      `clustered into ${representatives} paraphrase-distinct representatives (${duplicates} duplicate(s) marked '${DUPLICATE_MARKER}<id>', stored with shared clusterKey);`,
      `novelty: ${noveltyCounts.evidence_grounded} evidence_grounded / ${noveltyCounts.novel_speculation} novel_speculation / ${noveltyCounts.mixed} mixed.`,
    ];
    if (supplementUsed) {
      parts.push(
        representatives >= MIN_REPRESENTATIVES
          ? `diversity supplement (assumption_perturbation) added after initial clustering fell below ${MIN_REPRESENTATIVES} representatives.`
          : `diversity shortfall: even after one explicit-difference supplement only ${representatives} structurally distinct representatives exist — stored as-is, NOT padded with paraphrases (R-06).`,
      );
    } else if (representatives < MIN_REPRESENTATIVES) {
      parts.push(
        `diversity shortfall: only ${representatives} structurally distinct representatives and no supplement produced more — stored as-is, NOT padded with paraphrases (R-06).`,
      );
    }
    if (warnings.length > 0) parts.push(`warnings: ${warnings.join(' | ')}`);
    if (litTargets.length > 0) {
      parts.push(
        `literature novelty (D-017): ${Object.values(litVerdictCounts).reduce((a, b) => a + b, 0)}/${litTargets.length} representatives assessed against retrieved neighbors ` +
          `(${litVerdictCounts.novel} novel / ${litVerdictCounts.incremental} incremental / ${litVerdictCounts.already_done} already_done / ${litVerdictCounts.unclear} unclear).`,
      );
    }
    if (litNotes.length > 0) parts.push(`literature-novelty notes: ${litNotes.join(' | ')}`);
    return { kind: 'done', summary: parts.join(' ') };
  },
};
