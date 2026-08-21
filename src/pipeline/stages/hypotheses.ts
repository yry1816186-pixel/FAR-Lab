import { z } from 'zod';
import type { StageContext, StageHandler, StageOutcome } from '../types.js';
import { callStructured } from '../llm.js';
import {
  GenerationStrategy,
  HypothesisCandidate,
  NoveltyLabel,
  newId,
} from '../../domain/index.js';
import type { ClaimId, EvidenceRelation, HypothesisCandidate as Hypothesis } from '../../domain/index.js';
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
  candidates: z.array(CandidateOut).min(2).max(4), // prompt asks for 2; slight overshoot is kept (diversity never hurts)
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
  candidates: z.array(CandidateOut).max(4).default([]), // empty allowed: honest "nothing more to add"
});

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

      const res = await callStructured<z.infer<typeof StrategyOut>>(ctx, {
        stage: 'generate_hypotheses',
        purpose: def.purpose,
        systemPrompt: `${def.instruction} ${DIVERSITY_DISCIPLINE}`,
        payload,
        schema: StrategyOut,
      });
      const modelRef = `${res.provider}/${res.modelId}`;
      const inputIds = (payload.supportingClaims ?? payload.counterDirectionClaims ?? payload.claims ?? []) as {
        id: string;
      }[];
      const fallbackInput = inputIds.map((c) => c.id as ClaimId);
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
          'The current hypothesis candidate set is too homogeneous. Generate additional candidates that are ' +
          'REQUIRED to differ from every existing candidate in mechanism or core premise — perturb the existing ' +
          'assumptions, invert them, or import a mechanism from an adjacent domain. Paraphrases are useless here. ' +
          'If genuinely no additional distinct hypothesis is defensible from the evidence, return an empty list. ' +
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
    return { kind: 'done', summary: parts.join(' ') };
  },
};
