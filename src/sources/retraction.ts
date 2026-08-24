import type { RawSourceRecord } from '../shared/ports.js';

/**
 * Retraction/correction status derivation from Crossref `update-to` metadata
 * (RU-6 GO1). Deterministic and conservative: only known update types classify,
 * first-classified type wins, absent metadata stays undefined — status is never
 * fabricated. Lives in sources/ so BOTH stages use one derivation:
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
  const updates = (record.normalized as { 'update-to'?: unknown } | undefined)?.['update-to'];
  if (!Array.isArray(updates)) return undefined;
  let status: 'retracted' | 'corrected' | 'expression_of_concern' | 'reinstated' | undefined;
  for (const u of updates) {
    const t = String((u as { type?: unknown })?.type ?? '').toLowerCase();
    if (t.includes('reinstatement') || t.includes('reinstated')) status ??= 'reinstated';
    else if (t.includes('retraction')) status ??= 'retracted';
    else if (t.includes('expression of concern')) status ??= 'expression_of_concern';
    else if (t.includes('correction') || t.includes('corrected')) status ??= 'corrected';
  }
  return status;
};
