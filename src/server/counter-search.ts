import { z } from 'zod';
import type { App } from '../app/composition.js';
import { CorpusSnapshot, ProvenanceReceipt, SourceDocument, newId } from '../domain/index.js';
import type { SourceFamily } from '../domain/source.js';
import type { RawRetrievalResult, RawSourceRecord, SourceAdapter } from '../shared/ports.js';
import { snapshotHash } from '../sources/snapshot.js';
import { sourceAdapterFor } from '../sources/index.js';
import { toDocument } from '../pipeline/stages/retrieve.js';

/**
 * Researcher-directed counter-evidence retrieval (goal §5.2): the `counter_evidence`
 * research action names MISSING counter-evidence searches over the run's own claim
 * base; this capability EXECUTES one of those searches against the live source
 * plane and grows the run's corpus — the loop the v1 action scope left open.
 *
 * Truth rules (inherit the §5.5 plane):
 *  - one source_retrieval receipt per family, executionMode live, content hashes
 *    of the records the search returned (the truth-profile counts them);
 *  - new documents are UNVERIFIED sources (parseStatus/verification per document);
 *    extracting claims from them still requires the verify/build_evidence stages
 *    — this endpoint never fabricates claims;
 *  - corpus growth is APPEND-ONLY versioning: a NEW corpus snapshot (latest wins,
 *    the established consumer contract) carrying the prior fusion record verbatim
 *    (that record describes how the ORIGINAL corpus was fused and stays true) and
 *    the counter query with purpose counter_evidence;
 *  - refuses while a live executor holds the run lease (corpus mutation must
 *    never race the pipeline).
 */

export const CounterSearchRequest = z.object({
  query: z.string().trim().min(4).max(400),
});
export type CounterSearchRequest = z.infer<typeof CounterSearchRequest>;

/** Mirrors the pipeline's own counter-evidence targeting (retrieve stage query plan). */
const COUNTER_FAMILIES: readonly SourceFamily[] = ['openalex', 'europepmc', 'crossref'];

/** Bounded per-family result intake (a targeted probe, not a corpus rebuild). */
const PER_FAMILY_LIMIT = 5;
/** Total docs a single counter-search may add (bounded by contract). */
export const COUNTER_SEARCH_MAX_ADD = 8;

export type CounterSearchErrorCode = 'invalid_counter_search' | 'not_found' | 'run_active';

export class CounterSearchError extends Error {
  constructor(readonly status: number, readonly code: CounterSearchErrorCode, message: string) {
    super(message);
  }
}

export interface CounterSearchOutcome {
  runId: string;
  query: string;
  corpusSnapshotId: string;
  added: Array<{ id: string; title: string; family: SourceFamily; identifiers: Array<{ kind: string; value: string }> }>;
  duplicatesSkipped: number;
  familyFailures: Array<{ family: SourceFamily; reason: string }>;
  receiptsRecorded: number;
  note: string;
}

const identifierKey = (ids: readonly { kind: string; value: string }[]): string => {
  const id = ids.find((i) => i.kind === 'doi') ?? ids.find((i) => i.kind === 'arxiv') ?? ids[0];
  if (id === undefined) return '';
  return `${id.kind}:${id.kind === 'doi' ? id.value.toLowerCase() : id.value}`;
};

export async function runCounterSearch(
  app: Pick<App, 'store' | 'artifacts'>,
  runId: string,
  rawBody: unknown,
  sourceFor: (family: SourceFamily) => SourceAdapter = sourceAdapterFor,
): Promise<CounterSearchOutcome> {
  const parsed = CounterSearchRequest.safeParse(rawBody);
  if (!parsed.success) {
    throw new CounterSearchError(400, 'invalid_counter_search', `invalid counter-search request: ${parsed.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; ')}`);
  }
  const { query } = parsed.data;
  const run = app.store.getRun(runId);
  if (run === null) throw new CounterSearchError(404, 'not_found', `run ${runId} not found`);

  const lease = app.store.getRunLease(runId);
  if (lease.holder !== null && (lease.expiresAt ?? '') > new Date().toISOString()) {
    throw new CounterSearchError(409, 'run_active', `run ${runId} has a live executor (${lease.holder}) — cancel or wait before growing the corpus`);
  }

  const latest = app.store.listObjects('corpus_snapshot', runId).at(-1) ?? null;
  const existingKeys = new Set(
    (app.store.listObjects('source_document', runId) as SourceDocument[])
      .flatMap((d) => d.identifiers.filter((i) => i.kind === 'doi' || i.kind === 'arxiv').map((i) => identifierKey([i])))
      .filter((k) => k !== ''),
  );

  const familyFailures: Array<{ family: SourceFamily; reason: string }> = [];
  const candidates = new Map<string, { family: SourceFamily; record: RawSourceRecord }>();
  let duplicatesSkipped = 0;
  let receiptsRecorded = 0;
  const receipts: ProvenanceReceipt[] = [];

  for (const family of COUNTER_FAMILIES) {
    let result: RawRetrievalResult;
    try {
      result = await sourceFor(family).search(query, { limit: PER_FAMILY_LIMIT });
    } catch (e) {
      familyFailures.push({ family, reason: e instanceof Error ? e.message : String(e) });
      continue;
    }
    const hashes: string[] = [];
    for (const record of result.records) {
      hashes.push(snapshotHash(family, record));
      const key = identifierKey(record.identifiers);
      if (key !== '' && existingKeys.has(key)) { duplicatesSkipped += 1; continue; }
      if (key !== '' && candidates.has(key)) continue;
      if (candidates.size >= COUNTER_SEARCH_MAX_ADD) continue;
      candidates.set(key === '' ? `hash:${snapshotHash(family, record)}` : key, { family, record });
    }
    receipts.push(ProvenanceReceipt.parse({
      id: newId('rcp'), runId, kind: 'source_retrieval', executionMode: 'live', at: new Date().toISOString(),
      stage: 'counter-search',
      redactionNote: 'researcher-directed counter-evidence search; query text and per-record content hashes retained',
      sourceRetrieval: { family, query, httpStatus: result.httpStatus, resultCount: result.records.length, contentHashes: hashes },
    }));
    receiptsRecorded += 1;
  }

  const docs: SourceDocument[] = [];
  for (const { family, record } of candidates.values()) {
    docs.push(await toDocument({ run, artifacts: app.artifacts }, family, record));
  }

  for (const doc of docs) app.store.putObject('source_document', doc);
  for (const receipt of receipts) app.store.putObject('receipt', receipt);

  const corpus = CorpusSnapshot.parse({
    id: newId('corp'),
    runId,
    queries: [...(latest?.queries ?? []), ...COUNTER_FAMILIES.filter((f) => !familyFailures.some((ff) => ff.family === f)).map((family) => ({ purpose: 'counter_evidence' as const, text: query, family }))],
    documentIds: [...(latest?.documentIds ?? []), ...docs.map((d) => d.id)],
    createdAt: new Date().toISOString(),
    familyFailures: [...(latest?.familyFailures ?? []), ...familyFailures],
    ...(latest?.fusion !== undefined ? { fusion: latest.fusion } : {}),
  });
  app.store.putObject('corpus_snapshot', corpus);

  app.store.appendEvent(runId, {
    type: 'note',
    detail: {
      reason: 'counter_search_added',
      query,
      added: docs.length,
      duplicatesSkipped,
      familyFailures: familyFailures.map((f) => f.family),
      corpusSnapshotId: corpus.id,
      unverified: 'new sources require verify_sources/build_evidence re-run before claims can bind',
    },
  });

  return {
    runId,
    query,
    corpusSnapshotId: corpus.id,
    added: docs.map((d) => ({ id: d.id, title: d.title, family: d.family, identifiers: d.identifiers })),
    duplicatesSkipped,
    familyFailures,
    receiptsRecorded,
    note: docs.length === 0
      ? '未新增文档：检索结果为空或全部与现有语料重复。'
      : `新增 ${docs.length} 个来源（未核验）——运行 far research resume ${runId}（或 API resume）会自动重开 verify_sources/build_evidence 处理新证据；语料快照已版本化为 ${corpus.id}。`,
  };
}
