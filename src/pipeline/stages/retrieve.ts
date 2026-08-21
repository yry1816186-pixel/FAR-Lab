import { z } from 'zod';
import { CorpusSnapshot, SourceDocument, newId } from '../../domain/index.js';
import type { RetrievalQuery, SourceFamily } from '../../domain/source.js';
import { canonicalJson } from '../../shared/crypto.js';
import type { RawSourceRecord } from '../../shared/ports.js';
import { isSourceAdapterError } from '../../sources/error.js';
import { snapshotHash, excludeVolatile } from '../../sources/snapshot.js';
import { callStructured } from '../llm.js';
import type { StageContext, StageHandler, StageOutcome } from '../types.js';
import { throwIfCancelled } from './guard.js';

/** Hard corpus cap (contract): excess documents are truncated, visibly noted in the summary. */
export const MAX_DOCUMENTS = 12;
const SEARCH_LIMIT = 4;

const QueryPlan = z.object({
  discovery: z.array(z.string().min(1)).length(2),
  supporting: z.array(z.string().min(1)).min(1).max(2),
  /**
   * R-05 (forced counter-evidence search): min(2) makes a zero- or single-counter-query
   * plan a schema failure, so the stage fails loudly instead of silently running a
   * counter-evidence-blind (or token) retrieval. W5/S1: BOTH planned counter queries
   * are executed — one per source family — so counter search is structural, not
   * decorative (the old code executed only counter[0] and dropped the second).
   */
  counter: z.array(z.string().min(1)).min(2).max(2),
});
type QueryPlan = z.infer<typeof QueryPlan>;

/**
 * Counter-evidence orientation screen (substring, case-insensitive). At least
 * one counter query must contain explicit counter-evidence vocabulary —
 * limitation / failed replication / contradiction / negative result / critique.
 */
const COUNTER_TERM_RE = new RegExp(
  [
    'limitation', 'limit(ed)?', 'fail(ed|ure)?', 'negative', 'null', 'replicat', 'contradict',
    'disput', 'inconsisten', 'critique', 'criticis', 'challeng', 'rebut', 'controvers', 'retract',
    'invalid', 'irreproduc', 'unreproduc', 'overstat', 'refut', 'caveat', 'shortcom', 'no[ -]?effect',
    'cannot', 'problem', 'concern', 'weakness', 'bias',
  ].join('|'),
  'i',
);

const SYSTEM_PROMPT = `You plan the evidence retrieval for one scientific research question.
Return ONE JSON object with exactly these fields:
- "discovery": exactly 2 English scholarly search queries that map the field broadly,
- "supporting": 1 or 2 English queries aimed at direct evidence about the question's expected relationship,
- "counter": exactly 2 DIFFERENT English queries aimed at COUNTER-EVIDENCE: limitations, failed replications, contradictory findings, negative results, or methodological critiques. Cover two distinct counter-evidence angles (e.g. one on failed/negative results, one on methodological critiques or limitations).
Rules:
- All queries in English, written as plain keyword phrases for academic search engines (no boolean operators, no quotes).
- Ground every query in the question's topic; never invent specific papers, authors, journals or results.
- Counter queries MUST carry explicit counter-evidence vocabulary (e.g. "failed replication", "limitations", "contradictory findings", "negative result").`;

interface SearchTarget {
  purpose: RetrievalQuery['purpose'];
  text: string;
  family: SourceFamily;
}

const firstQuery = (queries: readonly string[], label: string): string => {
  const q = queries[0];
  if (q === undefined || q.trim().length === 0) {
    throw new Error(`retrieve: no usable ${label} query in the plan — refusing to search blindly`);
  }
  return q;
};

/**
 * W5/S1: every planned counter query is executed (schema guarantees exactly 2) —
 * counter[0] on OpenAlex, counter[1] on arXiv. Returning fewer than 2 is a schema
 * violation, but the extraction stays total for TypeScript's noUncheckedIndexedAccess.
 */
const counterQueries = (queries: readonly string[]): readonly [string, string] => {
  const [a, b] = queries;
  if (a === undefined || a.trim().length === 0 || b === undefined || b.trim().length === 0) {
    throw new Error(
      `retrieve: expected 2 usable counter queries in the plan, got ${JSON.stringify(queries)} — refusing to run a one-sided counter-evidence search`,
    );
  }
  return [a, b];
};

/** R-05 enforcement: schema guarantees >=1 counter query; this guarantees orientation. */
const enforceCounterEvidence = (plan: QueryPlan): void => {
  if (!plan.counter.some((q) => COUNTER_TERM_RE.test(q))) {
    throw new Error(
      `retrieve/R-05: no counter-evidence-facing query in plan.counter=${JSON.stringify(plan.counter)} — ` +
        'refusing to run a counter-evidence-blind search (limitation/failed replication/contradiction/negative-result vocabulary required)',
    );
  }
};

/** Cross-query dedup key: DOI first (case-insensitive), then arXiv id, then first identifier. */
const primaryKey = (rec: RawSourceRecord): string | null => {
  const id =
    rec.identifiers.find((i) => i.kind === 'doi') ??
    rec.identifiers.find((i) => i.kind === 'arxiv') ??
    rec.identifiers[0];
  if (!id) return null;
  return `${id.kind}:${id.kind === 'doi' ? id.value.toLowerCase() : id.value}`;
};

/**
 * RawSourceRecord -> SourceDocument. The normalized payload is ALWAYS archived
 * content-addressed; the artifact is stored over canonicalJson, the same basis
 * as snapshotHash, so the artifact hash equals contentHash. fullTextRef is only
 * set for full_text-depth records (the deepest content the record carries).
 */
export const toDocument = async (
  ctx: StageContext,
  family: SourceFamily,
  rec: RawSourceRecord,
): Promise<SourceDocument> => {
  const contentHash = snapshotHash(family, rec);
  // Store the artifact over the SAME volatile-excluded canonical payload that contentHash
  // addresses, so a third party can retrieve the snapshot by the bundle's declared hash.
  const artifact = await ctx.artifacts.put(canonicalJson(excludeVolatile(family, rec.normalized)));
  return SourceDocument.parse({
    id: newId('src'),
    runId: ctx.run.id,
    family,
    identifiers: rec.identifiers,
    title: rec.title,
    ...(rec.publicationYear !== undefined ? { publicationYear: rec.publicationYear } : {}),
    authors: rec.authors,
    ...(rec.venue !== undefined ? { venue: rec.venue } : {}),
    contentDepth: rec.contentDepth,
    accessState: rec.accessState,
    contentHash,
    retrievedAt: new Date().toISOString(),
    parseStatus: rec.abstractText !== undefined && rec.abstractText.length > 0 ? 'ok' : 'partial',
    ...(rec.abstractText !== undefined ? { abstractText: rec.abstractText } : {}),
    ...(rec.contentDepth === 'full_text' ? { fullTextRef: artifact.ref } : {}),
    ...(rec.license !== undefined ? { license: rec.license } : {}),
    ...(rec.oaUrl !== undefined ? { oaUrl: rec.oaUrl } : {}),
  });
};

export const retrieveStage: StageHandler = {
  stage: 'retrieve',

  /** Idempotent skip: a run keeps its first corpus snapshot. */
  async applicable(ctx) {
    return ctx.store.listObjects('corpus_snapshot', ctx.run.id).length === 0;
  },

  async execute(ctx: StageContext): Promise<StageOutcome> {
    throwIfCancelled(ctx);
    const question = ctx.store.getObject('question', ctx.run.questionId);
    if (!question) {
      throw new Error(`retrieve: question ${ctx.run.questionId} not found in store`);
    }

    const planRes = await callStructured<QueryPlan>(ctx, {
      stage: 'retrieve',
      purpose: 'query-planning',
      systemPrompt: SYSTEM_PROMPT,
      payload: {
        questionText: question.text,
        scope: question.scope,
        goalType: question.goalType,
      },
      schema: QueryPlan,
      temperature: 0.2,
    });
    const plan = planRes.data;
    enforceCounterEvidence(plan);

    // Counter-evidence searches run FIRST so the corpus cap can never crowd them out.
    // W5/S1: BOTH counter queries execute, one per source family — the second planned
    // counter query is no longer silently dropped (structural, not decorative, R-05).
    const discoveryQ = firstQuery(plan.discovery, 'discovery');
    const supportingQ = firstQuery(plan.supporting, 'supporting');
    const [counterOpenalex, counterArxiv] = counterQueries(plan.counter);
    const targets: readonly SearchTarget[] = [
      { purpose: 'counter_evidence', text: counterOpenalex, family: 'openalex' },
      { purpose: 'counter_evidence', text: counterArxiv, family: 'arxiv' },
      { purpose: 'discovery', text: discoveryQ, family: 'openalex' },
      { purpose: 'discovery', text: discoveryQ, family: 'arxiv' },
      { purpose: 'supporting', text: supportingQ, family: 'openalex' },
      { purpose: 'supporting', text: supportingQ, family: 'arxiv' },
    ];

    const executedQueries: RetrievalQuery[] = [];
    const failuresByFamily = new Map<SourceFamily, string[]>();
    const documents: SourceDocument[] = [];
    const seenKeys = new Set<string>();
    let attempted = 0;
    let succeeded = 0;
    let duplicates = 0;
    let droppedNoIdentifier = 0;
    let truncated = false;

    for (const t of targets) {
      if (documents.length >= MAX_DOCUMENTS) {
        truncated = true;
        break;
      }
      throwIfCancelled(ctx);
      executedQueries.push({ purpose: t.purpose, text: t.text, family: t.family });
      attempted += 1;
      try {
        const res = await ctx.sourceFor(t.family).search(t.text, { limit: SEARCH_LIMIT });
        succeeded += 1;
        ctx.recordReceipt({
          kind: 'source_retrieval',
          executionMode: 'live',
          stage: 'retrieve',
          redactionNote: 'query text and per-record content hashes retained; payloads archived content-addressed',
          sourceRetrieval: {
            family: t.family,
            query: t.text,
            httpStatus: res.httpStatus,
            resultCount: res.records.length,
            contentHashes: res.records.map((r) => snapshotHash(t.family, r)),
          },
        });
        for (const rec of res.records) {
          const key = primaryKey(rec);
          if (key === null) {
            droppedNoIdentifier += 1;
            ctx.log(`retrieve: dropping record without identifiers: "${rec.title}"`);
            continue;
          }
          if (seenKeys.has(key)) {
            duplicates += 1;
            continue;
          }
          seenKeys.add(key);
          documents.push(await toDocument(ctx, t.family, rec));
        }
      } catch (e) {
        // Single-source failure stays visible (familyFailures + receipt) and the
        // stage continues; only total failure aborts (below).
        const msg = e instanceof Error ? e.message : String(e);
        const list = failuresByFamily.get(t.family) ?? [];
        list.push(`${t.purpose}: ${msg}`);
        failuresByFamily.set(t.family, list);
        ctx.recordReceipt({
          kind: 'source_retrieval',
          executionMode: 'live',
          stage: 'retrieve',
          redactionNote: 'query text and per-record content hashes retained; payloads archived content-addressed',
          sourceRetrieval: {
            family: t.family,
            query: t.text,
            httpStatus: isSourceAdapterError(e) ? e.httpStatus : 0,
            resultCount: 0,
            contentHashes: [],
          },
        });
        ctx.log(`retrieve: source ${t.family} failed for ${t.purpose} query: ${msg}`);
      }
    }

    if (succeeded === 0) {
      const reason = [...failuresByFamily.entries()]
        .map(([family, msgs]) => `${family}: ${[...new Set(msgs)].join(' | ')}`)
        .join('; ');
      throw new Error(
        `retrieve: all ${attempted} source searches failed — refusing to fabricate an empty-success corpus (${reason})`,
      );
    }

    for (const doc of documents) ctx.store.putObject('source_document', doc);
    const familyFailures = [...failuresByFamily.entries()].map(([family, msgs]) => ({
      family,
      reason: [...new Set(msgs)].join(' | '),
    }));
    const corpus = CorpusSnapshot.parse({
      id: newId('corp'),
      runId: ctx.run.id,
      queries: executedQueries,
      documentIds: documents.map((d) => d.id),
      createdAt: new Date().toISOString(),
      familyFailures,
    });
    ctx.store.putObject('corpus_snapshot', corpus);

    const parts = [
      `retrieved ${documents.length} documents from ${succeeded}/${attempted} searches (queries: ${executedQueries.length})`,
    ];
    if (duplicates > 0) parts.push(`${duplicates} duplicate record(s) dropped by identifier`);
    if (droppedNoIdentifier > 0) parts.push(`${droppedNoIdentifier} record(s) without identifiers dropped`);
    if (truncated) parts.push(`truncated at cap ${MAX_DOCUMENTS}`);
    if (familyFailures.length > 0) parts.push(`family failures: ${familyFailures.map((f) => f.family).join(', ')}`);
    return { kind: 'done', summary: parts.join('; ') };
  },
};
