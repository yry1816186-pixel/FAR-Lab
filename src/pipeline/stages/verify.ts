import type { SourceDocument, SourceIdentifier, SourceFamily } from '../../domain/source.js';
import type { RawSourceRecord } from '../../shared/ports.js';
import { isSourceAdapterError } from '../../sources/error.js';
import { snapshotHash } from '../../sources/snapshot.js';
import type { StageContext, StageHandler, StageOutcome } from '../types.js';
import { throwIfCancelled } from './guard.js';
import { TITLE_MATCH_THRESHOLD, titleJaccard } from './title-normalize.js';

type Verification = NonNullable<SourceDocument['verification']>;
type VerifyOutcome = 'resolved' | 'not_found' | 'error';

/**
 * W6/F3 (refchecker EXTRACT, enhanced_hybrid_checker.py:687-870): conservative
 * multi-signal wrong-paper risk grade. Only applies when the title gate already
 * FAILED; flags zero-surname-overlap AND (year gap >= 2 or unknown year) AND
 * venue-incompatible. The identifier stays authoritative (refchecker never
 * rejects DOI/arXiv/PMID-anchored matches) — we surface, never flip, resolved.
 */
const asciiFold = (s: string): string => s.normalize('NFD').replace(/\p{Diacritic}/gu, '');

/** Surname token set: fold case/diacritics, keep trailing name tokens of length >= 3. */
const surnameSet = (names: readonly string[]): Set<string> => {
  const out = new Set<string>();
  for (const n of names) {
    const toks = asciiFold(n.trim().toLowerCase()).replace(/,/g, ' ').split(/\s+/).filter(Boolean);
    while (toks.length > 1 && toks[toks.length - 1]!.replace(/\./g, '').length <= 3) toks.pop();
    if (toks.length === 0) continue;
    const last = toks[toks.length - 1]!.replace(/\./g, '');
    if (last.length >= 3) out.add(last);
  }
  return out;
};

const venueCompatible = (a: string | undefined, b: string | undefined): boolean => {
  if (!a || !b) return true; // missing data — never reject on absent signals
  const norm = (v: string) => v.toLowerCase().replace(/[.,;:()[\]"'`]/g, ' ').replace(/\s+/g, ' ').trim();
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return true;
  return na === nb || na.includes(nb) || nb.includes(na);
};

export const wrongPaperRisk = (
  doc: SourceDocument,
  record: RawSourceRecord,
): { suspect: boolean; note: string } => {
  const overlap = surnameSet(doc.authors ?? []);
  const recOverlap = surnameSet(record.authors ?? []);
  const shared = [...overlap].filter((s) => recOverlap.has(s));
  const yearGap =
    typeof doc.publicationYear === 'number' && typeof record.publicationYear === 'number'
      ? Math.abs(doc.publicationYear - record.publicationYear)
      : null;
  const venueOk = venueCompatible(doc.venue, record.venue);
  const authorSignal = overlap.size === 0 || recOverlap.size === 0 ? 'unknown' : `${shared.length}/${Math.min(overlap.size, recOverlap.size)} shared surnames`;
  const yearSignal = yearGap === null ? 'year unknown' : `year gap ${yearGap}`;
  const suspect =
    (overlap.size > 0 && recOverlap.size > 0 && shared.length === 0) &&
    (yearGap === null || yearGap >= 2) &&
    !venueOk;
  return {
    suspect,
    note: `wrong-paper signals: ${authorSignal}, ${yearSignal}, venue ${venueOk ? 'compatible' : 'mismatch'}`,
  };
};

const writeVerification = (ctx: StageContext, doc: SourceDocument, verification: Verification): void => {
  ctx.store.putObject('source_document', { ...doc, verification });
};

/**
 * Resolve one persistent identifier and write the verification back to the
 * document. Every resolve attempt records a source_retrieval receipt (success,
 * 404 and thrown error alike — attempts are provenance facts).
 */
const verifyByIdentifier = async (
  ctx: StageContext,
  doc: SourceDocument,
  family: SourceFamily,
  method: 'crossref_doi' | 'arxiv_id' | 'europepmc_id',
  identifier: SourceIdentifier,
): Promise<VerifyOutcome> => {
  const checkedAt = new Date().toISOString();
  try {
    const res = await ctx.sourceFor(family).resolve(identifier);
    ctx.recordReceipt({
      kind: 'source_retrieval',
      executionMode: 'live',
      stage: 'verify_sources',
      redactionNote: 'identifier and resolved-record content hash retained; payloads archived content-addressed',
      sourceRetrieval: {
        family,
        query: `${identifier.kind}:${identifier.value}`,
        httpStatus: res.httpStatus,
        resultCount: res.found && res.record ? 1 : 0,
        contentHashes: res.record ? [snapshotHash(family, res.record)] : [],
      },
    });
    if (res.found && res.record) {
      const similarity = titleJaccard(doc.title, res.record.title);
      const titleMatch = similarity >= TITLE_MATCH_THRESHOLD;
      // W6/F3: only grade wrong-paper risk when the title gate failed — a passed
      // title with shared identifier needs no second opinion.
      const risk = titleMatch ? undefined : wrongPaperRisk(doc, res.record);
      writeVerification(ctx, doc, {
        method,
        resolved: true,
        titleMatch,
        ...(risk?.suspect ? { wrongPaperSuspect: true } : {}),
        detail:
          `resolved via ${family}; title jaccard=${similarity.toFixed(2)} (threshold ${TITLE_MATCH_THRESHOLD})` +
          (risk ? `; ${risk.note}` : ''),
        checkedAt,
      });
      return 'resolved';
    }
    // 404-style miss: found=false carries the httpStatus — an honest unresolved,
    // not a silent pass.
    writeVerification(ctx, doc, {
      method,
      resolved: false,
      detail: `identifier not found via ${family} (httpStatus=${res.httpStatus})`,
      checkedAt,
    });
    return 'not_found';
  } catch (e) {
    // Transport/upstream error: record the attempt, leave the document
    // UNVERIFIED (no fabricated verification), retriable on the next run.
    const msg = e instanceof Error ? e.message : String(e);
    ctx.recordReceipt({
      kind: 'source_retrieval',
      executionMode: 'live',
      stage: 'verify_sources',
      redactionNote: 'identifier and resolved-record content hash retained; payloads archived content-addressed',
      sourceRetrieval: {
        family,
        query: `${identifier.kind}:${identifier.value}`,
        httpStatus: isSourceAdapterError(e) ? e.httpStatus : 0,
        resultCount: 0,
        contentHashes: [],
      },
    });
    ctx.log(
      `verify_sources: resolve failed for ${doc.id} (${identifier.kind}:${identifier.value}): ${msg} — left unverified for retry`,
    );
    return 'error';
  }
};

export const verifyStage: StageHandler = {
  stage: 'verify_sources',

  /** Applicable exactly while at least one source document is still unverified. */
  async applicable(ctx) {
    return ctx.store
      .listObjects('source_document', ctx.run.id)
      .some((d) => d.verification === undefined);
  },

  async execute(ctx: StageContext): Promise<StageOutcome> {
    const pending = ctx.store
      .listObjects('source_document', ctx.run.id)
      .filter((d) => d.verification === undefined);

    let resolvedCount = 0;
    let notFoundCount = 0;
    let noIdCount = 0;
    let errorCount = 0;

    for (const [idx, doc] of pending.entries()) {
      throwIfCancelled(ctx);
      if (idx === 0) ctx.progress?.(0, pending.length);
      const doi = doc.identifiers.find((i) => i.kind === 'doi');
      const arxivId = doc.identifiers.find((i) => i.kind === 'arxiv');
      const pubmedId = doc.identifiers.find((i) => i.kind === 'pubmed');
      if (doi) {
        const outcome = await verifyByIdentifier(ctx, doc, 'crossref', 'crossref_doi', {
          kind: 'doi',
          value: doi.value,
        });
        if (outcome === 'resolved') resolvedCount += 1;
        else if (outcome === 'not_found') notFoundCount += 1;
        else errorCount += 1;
      } else if (arxivId) {
        const outcome = await verifyByIdentifier(ctx, doc, 'arxiv', 'arxiv_id', {
          kind: 'arxiv',
          value: arxivId.value,
        });
        if (outcome === 'resolved') resolvedCount += 1;
        else if (outcome === 'not_found') notFoundCount += 1;
        else errorCount += 1;
      } else if (pubmedId) {
        // PMID/PMCID-anchored docs (Europe PMC family) resolve against their own
        // source of record — previously they fell into "no persistent identifier".
        const outcome = await verifyByIdentifier(ctx, doc, 'europepmc', 'europepmc_id', {
          kind: 'pubmed',
          value: pubmedId.value,
        });
        if (outcome === 'resolved') resolvedCount += 1;
        else if (outcome === 'not_found') notFoundCount += 1;
        else errorCount += 1;
      } else {
        // No resolvable persistent identifier — recorded honestly, never guessed.
        noIdCount += 1;
        writeVerification(ctx, doc, {
          method: 'url',
          resolved: false,
          detail: 'no persistent identifier',
          checkedAt: new Date().toISOString(),
        });
        ctx.log(`verify_sources: ${doc.id} has no persistent identifier — marked unresolved`);
      }
      ctx.progress?.(idx + 1, pending.length);
    }

    const parts = [
      `verified ${pending.length} document(s): ${resolvedCount} resolved, ${notFoundCount} not found, ${noIdCount} without persistent identifier`,
    ];
    if (errorCount > 0) parts.push(`${errorCount} resolve error(s) left unverified for retry`);
    return { kind: 'done', summary: parts.join('; ') };
  },
};
