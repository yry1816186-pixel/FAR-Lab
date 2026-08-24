import type { RawSourceRecord } from '../shared/ports.js';
import { classifyRetractionReasons, retractionStatusOfNature, type RetractionWatchTable } from './retraction-watch.js';

/**
 * Retraction/correction status derivation (RU-6 GO1 + RU-R frontier candidates 1 & 2).
 * Deterministic and conservative: only known signals classify, richest-signal
 * first, absent metadata stays undefined — status is never fabricated.
 * Three signal families, in precedence order:
 *   1. Crossref `update-to` entries (distinguish retracted/corrected/EoC/reinstated;
 *      Retraction Watch data rides the same field in resolved records) — richest
 *      authoritative shape.
 *   2. The offline Retraction Watch table (frontier cand.2), looked up by DOI —
 *      curated retraction record WITH REASONS; covers records whose surfacing
 *      family carried no retraction metadata at all (e.g. bare arXiv/DOI rows).
 *   3. OpenAlex `is_retracted` boolean (present on work objects mapWork preserves
 *      whole in `normalized`) — retracted-only fallback, HINT semantics: the flag
 *      has a documented false-positive window (Hauschke & Nazarovets 2025) so it
 *      never outranks the curated table or update-to, and resolve-time
 *      verification remains the authority.
 * Lives in sources/ so BOTH stages use one derivation:
 *   - retrieve: best-effort from SEARCH-response metadata + offline table
 *     (retracted documents are demoted out of cap competition — a retracted
 *     paper must not take a seat a valid document could occupy).
 *   - verify: authoritative from the RESOLVED Crossref record (claim demotion,
 *     GRADE floor). Resolve-time status overwrites the retrieve-time hint.
 */
export type RetractionStatus =
  | 'retracted'
  | 'corrected'
  | 'expression_of_concern'
  | 'reinstated';

/** Which signal family produced the classification (receipted downstream). */
export type RetractionBasis = 'update_to' | 'retraction_watch' | 'is_retracted';

export interface RetractionFacts {
  readonly status: RetractionStatus;
  readonly basis: RetractionBasis;
  /** Retraction Watch reasons (basis='retraction_watch' only). */
  readonly reasons?: readonly string[];
}

const fromUpdateTo = (record: RawSourceRecord): RetractionFacts | undefined => {
  const normalized = record.normalized as { 'update-to'?: unknown } | undefined;
  const updates = normalized?.['update-to'];
  if (!Array.isArray(updates)) return undefined;
  let status: RetractionStatus | undefined;
  for (const u of updates) {
    const t = String((u as { type?: unknown })?.type ?? '').toLowerCase();
    if (t.includes('reinstatement') || t.includes('reinstated')) status ??= 'reinstated';
    else if (t.includes('retraction')) status ??= 'retracted';
    else if (t.includes('expression of concern')) status ??= 'expression_of_concern';
    else if (t.includes('correction') || t.includes('corrected')) status ??= 'corrected';
  }
  return status === undefined ? undefined : { status, basis: 'update_to' };
};

const fromRetractionWatch = (record: RawSourceRecord, table: RetractionWatchTable): RetractionFacts | undefined => {
  const doi = record.identifiers.find((i) => i.kind === 'doi')?.value;
  if (doi === undefined) return undefined;
  const entry = table.get(doi);
  if (entry === null) return undefined;
  const status = retractionStatusOfNature(entry.nature);
  if (status === undefined) return undefined;
  return {
    status,
    basis: 'retraction_watch',
    ...(entry.reasons.length > 0 ? { reasons: entry.reasons } : {}),
  };
};

const fromOpenAlexFlag = (record: RawSourceRecord): RetractionFacts | undefined => {
  const normalized = record.normalized as { is_retracted?: unknown } | undefined;
  if (normalized?.['is_retracted'] !== true) return undefined; // strict boolean: never coerced
  return { status: 'retracted', basis: 'is_retracted' };
};

/** Full derivation with basis + reasons (retrieve-time hint tier). */
export const retractionInfo = (
  record: RawSourceRecord | undefined,
  table?: RetractionWatchTable,
): RetractionFacts | undefined => {
  if (record === undefined) return undefined;
  return (
    fromUpdateTo(record) ??
    (table !== undefined ? fromRetractionWatch(record, table) : undefined) ??
    fromOpenAlexFlag(record)
  );
};

/** Status-only view (existing callers; verify.ts re-exports this). */
export const retractionStatusFrom = (
  record: RawSourceRecord | undefined,
  table?: RetractionWatchTable,
): RetractionStatus | undefined => retractionInfo(record, table)?.status;

export { classifyRetractionReasons };
