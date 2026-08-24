import type { RawSourceRecord } from '../shared/ports.js';

/**
 * Retraction/correction status derivation (RU-6 GO1 + RU-R frontier candidate 1).
 * Deterministic and conservative: only known signals classify, first-classified
 * type wins, absent metadata stays undefined — status is never fabricated.
 * Two signal families, richest first:
 *   1. Crossref `update-to` entries (distinguish retracted/corrected/EoC/reinstated;
 *      Retraction Watch data rides the same field) — authoritative shape.
 *   2. OpenAlex `is_retracted` boolean (present on work objects mapWork preserves
 *      whole in `normalized`) — retracted-only fallback, HINT semantics: the flag
 *      has a documented false-positive window (Hauschke & Nazarovets 2025) so it
 *      never overrides an update-to classification and resolve-time verification
 *      remains the authority.
 * Lives in sources/ so BOTH stages use one derivation:
 *   - retrieve: best-effort from SEARCH-response metadata (retracted documents
 *     are demoted out of cap competition — a retracted paper must not take a
 *     seat a valid document could occupy).
 *   - verify: authoritative from the RESOLVED Crossref record (claim demotion,
 *     GRADE floor). Resolve-time status overwrites the retrieve-time hint.
 */
export const retractionStatusFrom = (
  record: RawSourceRecord | undefined,
): 'retracted' | 'corrected' | 'expression_of_concern' | 'reinstated' | undefined => {
  if (record === undefined) return undefined;
  const normalized = record.normalized as { 'update-to'?: unknown; is_retracted?: unknown } | undefined;
  const updates = normalized?.['update-to'];
  if (Array.isArray(updates)) {
    let status: 'retracted' | 'corrected' | 'expression_of_concern' | 'reinstated' | undefined;
    for (const u of updates) {
      const t = String((u as { type?: unknown })?.type ?? '').toLowerCase();
      if (t.includes('reinstatement') || t.includes('reinstated')) status ??= 'reinstated';
      else if (t.includes('retraction')) status ??= 'retracted';
      else if (t.includes('expression of concern')) status ??= 'expression_of_concern';
      else if (t.includes('correction') || t.includes('corrected')) status ??= 'corrected';
    }
    if (status !== undefined) return status;
  }
  if (normalized?.['is_retracted'] === true) return 'retracted'; // strict boolean: never coerced
  return undefined;
};
