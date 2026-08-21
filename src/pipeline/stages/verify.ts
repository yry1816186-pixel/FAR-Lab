import type { SourceDocument, SourceIdentifier, SourceFamily } from '../../domain/source.js';
import { isSourceAdapterError } from '../../sources/error.js';
import { snapshotHash } from '../../sources/snapshot.js';
import type { StageContext, StageHandler, StageOutcome } from '../types.js';
import { throwIfCancelled } from './guard.js';
import { TITLE_MATCH_THRESHOLD, titleJaccard } from './title-normalize.js';

type Verification = NonNullable<SourceDocument['verification']>;
type VerifyOutcome = 'resolved' | 'not_found' | 'error';

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
  method: 'crossref_doi' | 'arxiv_id',
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
      writeVerification(ctx, doc, {
        method,
        resolved: true,
        titleMatch: similarity >= TITLE_MATCH_THRESHOLD,
        detail: `resolved via ${family}; title jaccard=${similarity.toFixed(2)} (threshold ${TITLE_MATCH_THRESHOLD})`,
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

    for (const doc of pending) {
      throwIfCancelled(ctx);
      const doi = doc.identifiers.find((i) => i.kind === 'doi');
      const arxivId = doc.identifiers.find((i) => i.kind === 'arxiv');
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
    }

    const parts = [
      `verified ${pending.length} document(s): ${resolvedCount} resolved, ${notFoundCount} not found, ${noIdCount} without persistent identifier`,
    ];
    if (errorCount > 0) parts.push(`${errorCount} resolve error(s) left unverified for retry`);
    return { kind: 'done', summary: parts.join('; ') };
  },
};
