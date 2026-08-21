import { z } from 'zod';
import {
  newId,
  type EvidenceRelation,
  type EvidenceRelationType,
  type ScientificClaim,
  type SourceDocument,
} from '../../domain/index.js';
import { callStructured } from '../llm.js';
import type { StageContext, StageHandler, StageOutcome } from '../types.js';
import { checkQuoteAlignment } from './align.js';
import { toDocument } from './retrieve.js';
import { snapshotHash } from '../../sources/snapshot.js';
import type { CorpusSnapshot, SourceFamily } from '../../domain/source.js';

/** Hard admission cap per source. Model output beyond the cap is dropped, never stored. */
export const MAX_CLAIMS_PER_SOURCE = 4;

/** Sanity ceiling on a single model response; beyond it the schema rejects (fail-closed). */
const MAX_MODEL_CLAIMS = 16;

const SYSTEM_PROMPT = [
  'You extract scientific claims from one research source for evidence binding.',
  'Strict rules:',
  '- Extract at most 4 claims; only scientific propositions relevant to the research question.',
  "- Each claim carries a quote that MUST be copied verbatim (character-for-character) from the abstract. Never paraphrase, merge, or shorten sentences in the quote.",
  '- stance describes the claim\'s relation to the research question: supports | contradicts | neutral | unknown.',
  '- note (optional): one short honest caveat or uncertainty about the claim.',
  '- If the abstract contains nothing relevant to the question, return {"claims":[]}.',
].join('\n');

/**
 * Bounded adaptive information-seeking (mission §30): when the first extraction pass
 * yields a barren evidence base, ONE follow-up round of targeted retrieval may run.
 * Hard bounds: max 1 round, max 2 queries, max 3 docs per query — never an open loop.
 */
export const GAP_SEEK_MIN_VERIFIED = 3;
export const GAP_SEEK_MAX_QUERIES = 2;
export const GAP_SEEK_MAX_DOCS_PER_QUERY = 3;

const GapSeekSchema = z.object({
  enoughEvidence: z.boolean(),
  gapDescription: z.string().min(1),
  queries: z.array(z.string().min(8)).max(GAP_SEEK_MAX_QUERIES).default([]),
});
type GapSeek = z.infer<typeof GapSeekSchema>;

const ClaimStanceSchema = z.enum(['supports', 'contradicts', 'neutral', 'unknown']);
export type ClaimStance = z.infer<typeof ClaimStanceSchema>;

const ExtractionSchema = z.object({
  claims: z
    .array(
      z.object({
        text: z.string().min(1),
        quote: z.string().min(1), // must be a verbatim excerpt of the abstract
        stance: ClaimStanceSchema,
        note: z.string().optional(),
      }),
    )
    .max(MAX_MODEL_CLAIMS)
    .default([]),
});
type ClaimExtraction = z.infer<typeof ExtractionSchema>;

const STANCE_TO_RELATION: Record<ClaimStance, EvidenceRelationType> = {
  supports: 'supports',
  contradicts: 'contradicts',
  neutral: 'qualifies',
  unknown: 'unknown',
};

const STANCE_RATIONALE: Record<ClaimStance, string> = {
  supports: 'model stance: content supports the research question',
  contradicts: 'model stance: content contradicts the research question',
  neutral: 'model stance: content qualifies or contextualizes the research question',
  unknown: 'model stance: relation to the research question is unclear',
};

interface CorpusPlan {
  /** Abstract-bearing, verification-passing sources of the latest snapshot, in snapshot order. */
  usable: SourceDocument[];
  skippedNoAbstract: number;
  skippedUnresolved: number;
}

/**
 * Sources of the LATEST corpus snapshot of the run, classified by extractability.
 * Only abstract-bearing sources whose identifier verification did not fail are
 * eligible (verification absent = not yet verified, still eligible per spec).
 */
const corpusPlan = (ctx: StageContext): CorpusPlan => {
  const plan: CorpusPlan = { usable: [], skippedNoAbstract: 0, skippedUnresolved: 0 };
  const snapshots = ctx.store.listObjects('corpus_snapshot', ctx.run.id);
  if (snapshots.length === 0) return plan;
  const latest = snapshots.reduce((acc, s) => (s.createdAt >= acc.createdAt ? s : acc));
  const seen = new Set<string>();
  for (const id of latest.documentIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const doc = ctx.store.getObject('source_document', id);
    if (!doc) continue; // dangling id stays invisible here; retrieve/verify own that failure
    const hasAbstract = Boolean(doc.abstractText && doc.abstractText.trim().length > 0);
    if (!hasAbstract) {
      plan.skippedNoAbstract += 1;
      continue;
    }
    if (doc.verification?.resolved === false) {
      plan.skippedUnresolved += 1;
      continue;
    }
    plan.usable.push(doc);
  }
  return plan;
};

const claimedSourceIds = (ctx: StageContext): Set<string> => {
  const ids = new Set<string>();
  for (const claim of ctx.store.listObjects('claim', ctx.run.id)) {
    for (const locator of claim.locators) ids.add(locator.sourceDocumentId);
  }
  return ids;
};

/**
 * build_evidence (D-006 / R-03): claims bind ONLY to actually-retrieved abstracts.
 * Each admitted claim gets a deterministic quote-alignment gate — verbatim substring
 * or word-Jaccard >= 0.8 against the abstract; anything else is stored as
 * `resolved_unaligned` and can never act as verified support (fail-closed).
 */
export const buildEvidenceStage: StageHandler = {
  stage: 'build_evidence',

  /** Applicable while at least one usable source has no claims yet (spec: 无 claim = 未处理). */
  async applicable(ctx) {
    const plan = corpusPlan(ctx);
    if (plan.usable.length === 0) return false;
    const claimed = claimedSourceIds(ctx);
    return plan.usable.some((doc) => !claimed.has(doc.id));
  },

  async execute(ctx): Promise<StageOutcome> {
    const question = ctx.store.getObject('question', ctx.run.questionId);
    if (!question) {
      throw new Error(
        `build_evidence: research question ${ctx.run.questionId} not found — cannot judge claim relevance (fail-closed)`,
      );
    }
    const plan = corpusPlan(ctx);
    const claimed = claimedSourceIds(ctx);
    const pending = plan.usable.filter((doc) => !claimed.has(doc.id));

    let claimsTotal = 0;
    let verifiedCount = 0;
    let unalignedCount = 0;
    let truncatedCount = 0;
    const relationCounts: Record<EvidenceRelationType, number> = {
      supports: 0,
      contradicts: 0,
      weakens: 0,
      qualifies: 0,
      depends_on: 0,
      derived_from: 0,
      replicates: 0,
      fails_to_replicate: 0,
      alternative_explanation: 0,
      methodological_limitation: 0,
      unknown: 0,
    };

    const processDocument = async (doc: SourceDocument): Promise<void> => {
      {
      if (ctx.cancelled()) {
        throw new Error(`cancelled by user in build_evidence before extracting ${doc.id}`);
      }
      const abstractText = doc.abstractText ?? ''; // corpusPlan guarantees non-empty here
      ctx.log(`extracting claims from ${doc.id} "${doc.title.slice(0, 60)}"`);
      const result = await callStructured<ClaimExtraction>(ctx, {
        stage: 'build_evidence',
        purpose: 'claim-extraction',
        systemPrompt: SYSTEM_PROMPT,
        payload: {
          question: question.text,
          source: { id: doc.id, title: doc.title, abstract: abstractText },
        },
        schema: ExtractionSchema,
        temperature: 0,
        maxTokens: 1500,
      });
      const extracted = result.data.claims;
      const admitted = extracted.slice(0, MAX_CLAIMS_PER_SOURCE);
      truncatedCount += extracted.length - admitted.length;

      for (const candidate of admitted) {
        if (ctx.cancelled()) {
          throw new Error(`cancelled by user in build_evidence while binding claims of ${doc.id}`);
        }
        // Deterministic gate — never delegated to the model (D-006/R-03).
        const alignment = checkQuoteAlignment(candidate.quote, abstractText);
        const aligned = alignment.verdict !== 'unaligned';

        const claim: ScientificClaim = {
          id: newId('clm'),
          runId: ctx.run.id,
          text: candidate.text,
          locators: [{ sourceDocumentId: doc.id, quote: candidate.quote }],
          bindingStatus: aligned ? 'verified' : 'resolved_unaligned',
          alignmentChecked: aligned, // true iff the deterministic check passed
          extractionModelRef: `${result.provider}/${result.modelId}`,
          uncertainties:
            candidate.note && candidate.note.trim().length > 0 ? [candidate.note.trim()] : [],
        };
        ctx.store.putObject('claim', claim);
        claimsTotal += 1;
        if (aligned) verifiedCount += 1;
        else unalignedCount += 1;

        let relation: EvidenceRelationType = STANCE_TO_RELATION[candidate.stance];
        let rationale = claim.uncertainties[0] ?? STANCE_RATIONALE[candidate.stance];
        if (!aligned) {
          // Fail-closed: an ungrounded claim never carries a supporting/counter relation,
          // and the degradation is stated in the rationale, not hidden.
          rationale = `unaligned-claim (quote not grounded in the retrieved abstract, jaccard=${alignment.jaccard.toFixed(3)}): ${rationale}`;
          if (candidate.stance === 'supports' || candidate.stance === 'contradicts') {
            relation = 'unknown';
          }
        }
        const relationRecord: EvidenceRelation = {
          id: newId('ev'),
          runId: ctx.run.id,
          relation,
          claimId: claim.id, // hypothesis-targeting relations are added later by critique_falsify
          rationale,
          strength: 'unrated',
          uncertainties: claim.uncertainties,
          createdAt: new Date().toISOString(),
        };
        ctx.store.putObject('evidence_relation', relationRecord);
        relationCounts[relation] += 1;
      }
      }
    };

    for (const doc of pending) {
      await processDocument(doc);
    }

    // ---- bounded adaptive gap-seek round (mission §30) ----
    let gapSeekNote = 'not triggered (enough verified evidence)';
    if (verifiedCount < GAP_SEEK_MIN_VERIFIED) {
      ctx.log(`verified claims ${verifiedCount} < ${GAP_SEEK_MIN_VERIFIED} — evaluating evidence gap`);
      const gap = await callStructured<GapSeek>(ctx, {
        stage: 'build_evidence',
        purpose: 'evidence-gap-assessment',
        systemPrompt:
          'You assess whether the current verified evidence base is too barren to support ' +
          'hypothesis generation for the research question, and if so, propose AT MOST 2 targeted ' +
          'scholarly search queries that could close the most important gap. If the evidence is ' +
          'adequate, or no retrieval could realistically improve it, set enoughEvidence=true and ' +
          'return empty queries. Never invent facts to fill gaps.',
        payload: {
          question: question.text,
          verifiedClaimCount: verifiedCount,
          sourceTitles: plan.usable.map((d) => d.title),
        },
        schema: GapSeekSchema,
        temperature: 0,
      });
      if (!gap.data.enoughEvidence && gap.data.queries.length > 0) {
        gapSeekNote = `triggered: ${gap.data.gapDescription.slice(0, 120)}`;
        const adapter = ctx.sourceFor('openalex' as SourceFamily);
        const newDocIds: string[] = [];
        const corpus = ctx.store.listObjects('corpus_snapshot' as never, ctx.run.id).at(-1) as CorpusSnapshot | undefined;
        for (const q of gap.data.queries.slice(0, GAP_SEEK_MAX_QUERIES)) {
          if (ctx.cancelled()) throw new Error('cancelled by user in build_evidence gap-seek');
          const search = await adapter.search(q, { limit: GAP_SEEK_MAX_DOCS_PER_QUERY });
          ctx.recordReceipt({
            kind: 'source_retrieval',
            executionMode: 'live',
            stage: 'build_evidence',
            redactionNote: 'query text and result count only',
            sourceRetrieval: {
              family: 'openalex',
              query: q,
              httpStatus: search.httpStatus,
              resultCount: search.records.length,
              contentHashes: search.records.map((r) => snapshotHash('openalex', r)),
            },
          });
          for (const rec of search.records) {
            if (!rec.abstractText || rec.abstractText.length < 100) continue; // gap docs must be claim-capable
            const doc = await toDocument(ctx, 'openalex', rec);
            doc.verification = {
              method: 'openalex_id',
              resolved: true,
              detail: 'gap-seek: record obtained directly from the OpenAlex API (primary source); no secondary DOI cross-check',
              checkedAt: new Date().toISOString(),
            };
            ctx.store.putObject('source_document', doc);
            if (!newDocIds.includes(doc.id)) newDocIds.push(doc.id);
          }
        }
        if (corpus && newDocIds.length > 0) {
          const updated: CorpusSnapshot = {
            ...corpus,
            queries: [
              ...corpus.queries,
              ...gap.data.queries.slice(0, GAP_SEEK_MAX_QUERIES).map((q) => ({ purpose: 'gap_followup' as const, text: `[gap-seek] ${q}` })),
            ],
            documentIds: [...corpus.documentIds, ...newDocIds.filter((id) => !corpus.documentIds.includes(id))],
          };
          ctx.store.putObject('corpus_snapshot', updated);
        }
        for (const id of newDocIds) {
          const doc = ctx.store.getObject('source_document', id);
          if (doc && doc.abstractText) await processDocument(doc);
        }
        gapSeekNote += `; +${newDocIds.length} docs retrieved, claims now verified=${verifiedCount}`;
      } else {
        gapSeekNote = gap.data.enoughEvidence
          ? `not triggered (model judged evidence adequate: ${gap.data.gapDescription.slice(0, 80)})`
          : 'triggered but no actionable queries returned';
      }
    }

    const summary =
      `build_evidence: sources usable=${plan.usable.length} processed=${pending.length}` +
      ` skipped_no_abstract=${plan.skippedNoAbstract} skipped_unresolved=${plan.skippedUnresolved}` +
      `; claims=${claimsTotal} verified=${verifiedCount} unaligned=${unalignedCount}` +
      `; relations supports=${relationCounts.supports} contradicts=${relationCounts.contradicts}` +
      ` qualifies=${relationCounts.qualifies} unknown=${relationCounts.unknown}` +
      `; truncated_to_cap=${truncatedCount}` +
      `; gap_seek=${gapSeekNote}`;
    return { kind: 'done', summary };
  },
};
