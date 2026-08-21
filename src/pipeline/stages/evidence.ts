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
import { defaultFetchFullText } from '../../sources/fulltext.js';
import type { CorpusSnapshot, SourceFamily } from '../../domain/source.js';

/** Hard admission cap per source. Model output beyond the cap is dropped, never stored. */
export const MAX_CLAIMS_PER_SOURCE = 4;

/** Sanity ceiling on a single model response; beyond it the schema rejects (fail-closed). */
const MAX_MODEL_CLAIMS = 16;

/**
 * Fulltext deepening bounds (phase A): at most this many documents per stage run,
 * each capped to this many characters of extracted text for the extraction prompt.
 * The full artifact always holds the complete extracted text (nothing is silently lost);
 * the cap applies only to what the model sees in one call.
 */
export const FULLTEXT_MAX_DOCS = 3;
export const FULLTEXT_EXCERPT_CHARS = 16_000;

const SYSTEM_PROMPT = [
  'You extract scientific claims from one research source for evidence binding.',
  'Strict rules:',
  '- Extract at most 4 claims; only scientific propositions relevant to the research question.',
  "- Each claim carries a quote that MUST be copied verbatim (character-for-character) from the provided source text (abstract, or full-text excerpt when one is present). Never paraphrase, merge, or shorten sentences in the quote.",
  '- stance describes the claim\'s relation to the research question: supports | contradicts | neutral | unknown.',
  '- note (optional): one short honest caveat or uncertainty about the claim.',
  '- If the source text contains nothing relevant to the question, return {"claims":[]}.',
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

// ---- D-018 claim-claim cross relations ----
const CrossRelationOut = z.object({
  verdicts: z
    .array(
      z.object({
        pairId: z.number().int().nonnegative(),
        verdict: z.enum(['contradicts', 'supports', 'qualifies', 'unrelated', 'not_comparable']),
        sharedSubject: z.string().min(5),
        conflictPoint: z.string().min(5).optional(),
        confidence: z.enum(['low', 'moderate', 'high']),
      }),
    )
    .min(1),
});

/** Hard bound on judged pairs per run (LLM budget + attention guard). */
export const CROSS_RELATION_MAX_PAIRS = 60;

const CROSS_STOPWORDS = new Set([
  'that', 'this', 'with', 'from', 'have', 'been', 'were', 'their', 'which', 'about', 'would', 'could',
  'between', 'because', 'while', 'these', 'those', 'such', 'than', 'then', 'also', 'into', 'over',
  'after', 'under', 'other', 'more', 'most', 'less', 'least', 'some', 'both', 'each', 'only', 'very',
  'much', 'many', 'when', 'where', 'what', 'whose', 'being', 'does', 'doing', 'done', 'having',
  'study', 'studies', 'paper', 'papers', 'results', 'result', 'using', 'used', 'show', 'shown',
]);

const contentTokens = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 3 && !CROSS_STOPWORDS.has(t)),
  );

export interface CrossPairCandidate {
  a: ScientificClaim;
  b: ScientificClaim;
}

/**
 * Deterministic prefilter: pairs of VERIFIED claims from different source documents
 * with real topical overlap (containment >= 0.25 or >= 4 shared content tokens).
 * Claims without shared referents are never sent to judgment (false-contradiction guard).
 */
export const crossRelationPairs = (claims: readonly ScientificClaim[]): CrossPairCandidate[] => {
  const tokens = new Map<string, Set<string>>();
  const docOf = new Map<string, string>();
  for (const c of claims) {
    tokens.set(c.id, contentTokens(c.text));
    docOf.set(c.id, c.locators[0]?.sourceDocumentId ?? c.id);
  }
  const scored: { a: ScientificClaim; b: ScientificClaim; overlap: number; shared: number }[] = [];
  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      const a = claims[i]!;
      const b = claims[j]!;
      if (docOf.get(a.id) === docOf.get(b.id)) continue; // cross-paper relations only
      const ta = tokens.get(a.id) ?? new Set<string>();
      const tb = tokens.get(b.id) ?? new Set<string>();
      let shared = 0;
      for (const t of ta) if (tb.has(t)) shared += 1;
      if (shared === 0) continue;
      const containment = shared / Math.min(ta.size, tb.size);
      if (containment >= 0.25 || shared >= 4) {
        scored.push({ a, b, overlap: containment * shared, shared });
      }
    }
  }
  scored.sort((x, y) => y.overlap - x.overlap || (x.a.id < x.b.id ? -1 : 1));
  return scored.slice(0, CROSS_RELATION_MAX_PAIRS).map(({ a, b }) => ({ a, b }));
};

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

    // ---- fulltext deepening (phase A): abstract -> full text for the most
    // relevant routable docs, bounded and fail-visible. The artifact stores the
    // COMPLETE extracted text; the excerpt cap applies only to the model view. ----
    const excerptOf = (text: string): string => {
      if (text.length <= FULLTEXT_EXCERPT_CHARS) return text;
      const cut = text.slice(0, FULLTEXT_EXCERPT_CHARS);
      const boundary = cut.lastIndexOf(' ');
      return `${cut.slice(0, boundary > 0 ? boundary : FULLTEXT_EXCERPT_CHARS)}\n[full-text excerpt: first ${FULLTEXT_EXCERPT_CHARS} of ${text.length} chars]`;
    };
    const fetchFullText = ctx.fetchFullText ?? defaultFetchFullText;
    const fullTextExcerpts = new Map<string, string>();
    const deepenNotes: string[] = [];
    const deepenCandidates = pending.filter((d) => d.contentDepth !== 'full_text').slice(0, FULLTEXT_MAX_DOCS);
    for (const doc of deepenCandidates) {
      if (ctx.cancelled()) throw new Error('cancelled by user in build_evidence fulltext deepening');
      const res = await fetchFullText(doc);
      if (res.status === 'fetched') {
        const put = await ctx.artifacts.put(res.fetch.text);
        const updated: SourceDocument = {
          ...doc,
          contentDepth: 'full_text',
          fullTextRef: put.ref,
          ...(res.fetch.license !== undefined ? { license: res.fetch.license } : {}),
        };
        ctx.store.putObject('source_document', updated);
        fullTextExcerpts.set(doc.id, excerptOf(res.fetch.text));
        deepenNotes.push(`${doc.id}:${res.fetch.variant}`);
        ctx.recordReceipt({
          kind: 'source_retrieval',
          executionMode: 'live',
          stage: 'build_evidence',
          redactionNote: 'fulltext fetch: variant, url id, char count, artifact hash only',
          sourceRetrieval: {
            family: res.fetch.variant,
            query: `fulltext:${res.fetch.sourceUrl}`,
            httpStatus: res.fetch.httpStatus,
            resultCount: 1,
            contentHashes: [put.hash],
          },
        });
      } else if (res.status === 'error') {
        deepenNotes.push(`${doc.id}:error(${res.message.slice(0, 80)})`);
      }
      // not_available is the common case (no HTML rendering / no OA deposit) — silent.
    }

    // Resume/idempotency path: a previously deepened doc re-loads its excerpt
    // from the artifact store so re-extraction still sees the full text.
    for (const doc of pending) {
      if (doc.contentDepth === 'full_text' && doc.fullTextRef && !fullTextExcerpts.has(doc.id)) {
        const stored = await ctx.artifacts.get(doc.fullTextRef);
        if (stored !== null) fullTextExcerpts.set(doc.id, excerptOf(stored));
      }
    }

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
      const fullTextExcerpt = fullTextExcerpts.get(doc.id);
      // Quotes must ground in exactly the text the model was shown.
      const sourceText =
        fullTextExcerpt !== undefined ? `${abstractText}\n\n${fullTextExcerpt}` : abstractText;
      ctx.log(`extracting claims from ${doc.id} "${doc.title.slice(0, 60)}"${fullTextExcerpt !== undefined ? ' (full-text)' : ''}`);
      const result = await callStructured<ClaimExtraction>(ctx, {
        stage: 'build_evidence',
        purpose: 'claim-extraction',
        systemPrompt: SYSTEM_PROMPT,
        payload: {
          question: question.text,
          source: {
            id: doc.id,
            title: doc.title,
            abstract: abstractText,
            ...(fullTextExcerpt !== undefined ? { fullTextExcerpt } : {}),
          },
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
        const alignment = checkQuoteAlignment(candidate.quote, sourceText);
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
          rationale = `unaligned-claim (quote not grounded in the retrieved source text, jaccard=${alignment.jaccard.toFixed(3)}): ${rationale}`;
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

    // ---- D-018 claim-claim cross relations (populate the unused targetClaimId channel) ----
    // Deterministic prefilter first: NAACL-2025 reference-indeterminacy work shows
    // pairwise contradiction judgments on claims without shared referents produce
    // >80% false contradictions, so only topical-overlapping pairs are judged, and
    // 'not_comparable' is a first-class verdict.
    let crossNote: string;
    const existingCross = ctx.store.listObjects('evidence_relation', ctx.run.id)
      .filter((r) => r.targetClaimId !== undefined);
    if (existingCross.length > 0) {
      crossNote = `already present (${existingCross.length})`;
    } else {
      const verifiedClaims = ctx.store
        .listObjects('claim', ctx.run.id)
        .filter((c) => c.bindingStatus === 'verified');
      const candidates = crossRelationPairs(verifiedClaims);
      if (candidates.length > 0) {
        try {
          const crossRes = await callStructured<z.infer<typeof CrossRelationOut>>(ctx, {
            stage: 'build_evidence',
            purpose: 'claim-cross-relations',
            systemPrompt:
              'You adjudicate pairs of evidence claims extracted from DIFFERENT retrieved papers. ' +
              'For each pair decide: "contradicts" if they assert incompatible findings about the same subject ' +
              '(different papers, same quantity/relationship); "supports" if they corroborate each other; ' +
              '"qualifies" if one restricts the conditions of the other; "unrelated" if they are about different ' +
              'subjects; "not_comparable" if they cannot be compared on the given text (missing referents, ' +
              'different measures, insufficient context) — when in doubt choose not_comparable, never invent a ' +
              'conflict. Name the shared subject for every pair.',
            payload: {
              question: question.text,
              pairs: candidates.map((p, i) => ({
                pairId: i,
                claimA: { id: p.a.id, text: p.a.text },
                claimB: { id: p.b.id, text: p.b.text },
              })),
            },
            schema: CrossRelationOut,
            temperature: 0,
          });
          const persistable = new Set(['contradicts', 'supports', 'qualifies']);
          const byIdA = new Map(verifiedClaims.map((c) => [c.id, c] as const));
          const byIdB = new Map(verifiedClaims.map((c) => [c.id, c] as const));
          let persisted = 0;
          let notComparable = 0;
          const seenPairs = new Set<string>();
          for (const v of crossRes.data.verdicts) {
            const pair = candidates[v.pairId];
            if (!pair || persistable.has(v.verdict) === false) {
              if (v.verdict === 'not_comparable') notComparable += 1;
              continue;
            }
            const a = byIdA.get(pair.a.id);
            const b = byIdB.get(pair.b.id);
            if (!a || !b) continue;
            const dedupKey = [pair.a.id, pair.b.id].sort().join('|');
            if (seenPairs.has(dedupKey)) continue;
            seenPairs.add(dedupKey);
            const crossRelation: EvidenceRelation = {
              id: newId('ev'),
              runId: ctx.run.id,
              relation: v.verdict as EvidenceRelationType,
              claimId: a.id,
              targetClaimId: b.id,
              rationale:
                `claim-claim ${v.verdict} (shared subject: ${v.sharedSubject}` +
                (v.conflictPoint !== undefined ? `; conflict point: ${v.conflictPoint}` : '') +
                `; confidence: ${v.confidence}; direction A->B as extracted, pair judged as a whole)`,
              strength: 'unrated',
              uncertainties: [],
              createdAt: new Date().toISOString(),
            };
            ctx.store.putObject('evidence_relation', crossRelation);
            relationCounts[v.verdict as keyof typeof relationCounts] += 1;
            persisted += 1;
          }
          crossNote = `${persisted} persisted (${notComparable} not_comparable) of ${candidates.length} prefiltered pairs`;
        } catch (e) {
          // Enrichment only: a failure degrades to no cross-relations (visible), never blocks.
          crossNote = `skipped: ${e instanceof Error ? e.message : String(e)}`;
        }
      } else {
        crossNote = 'no topical-overlap pairs among verified claims';
      }
    }

    const summary =
      `build_evidence: sources usable=${plan.usable.length} processed=${pending.length}` +
      ` skipped_no_abstract=${plan.skippedNoAbstract} skipped_unresolved=${plan.skippedUnresolved}` +
      `; claims=${claimsTotal} verified=${verifiedCount} unaligned=${unalignedCount}` +
      `; relations supports=${relationCounts.supports} contradicts=${relationCounts.contradicts}` +
      ` qualifies=${relationCounts.qualifies} unknown=${relationCounts.unknown}` +
      `; truncated_to_cap=${truncatedCount}` +
      `; fulltext=${deepenNotes.length > 0 ? deepenNotes.join(',') : 'none'}` +
      `; gap_seek=${gapSeekNote}` +
      `; cross_relations=${crossNote}`;
    return { kind: 'done', summary };
  },
};
