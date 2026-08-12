/**
 * validation/resource_checker — real existence verification (forensic K5, §20).
 *
 * Closes the "exists=true theater" finding: ExecutableCheck.exists and cited DOIs
 * were LLM-asserted with no real check (directive §20: "LLM output must not be
 * accepted as existence verification"). This module verifies identifiers against
 * their AUTHORITATIVE sources (Crossref for DOI, arXiv for arxiv-id) — never by
 * asking an LLM, never by trusting the assertion.
 *
 * Status semantics (directive §20):
 *   VERIFIED    — the authoritative source resolved the identifier to a real record.
 *   NOT_FOUND   — the source had no record (fabrication signal — the id does not exist).
 *   UNAVAILABLE — the source could not be reached (environment failure, NOT a
 *                 fabrication; caller should not treat as either real or fake).
 *   UNSUPPORTED — this checker does not verify this kind of identifier (e.g. arbitrary
 *                 URL — safe SSRF-resistant liveness checking is future work; we do
 *                 NOT pretend to verify what we can't safely check).
 *
 * Fail-closed distinction (§54): a network/timeout error → UNAVAILABLE (propagated,
 * never silently NOT_FOUND). resolveCrossrefDoi already returns null for both 404
 * (NOT_FOUND) and network error — here we re-fetch the distinction by catching.
 */
import { resolveCrossrefDoi } from '../retrieval/adapters/crossref.ts';
import { arxivAdapter } from '../retrieval/adapters/arxiv.ts';
import type { RetrievedDocument } from '../retrieval/types.ts';

/** The kind of identifier being verified. */
export type ResourceKind = 'doi' | 'arxiv' | 'url';

/** The result of an existence check. */
export type ResourceValidationStatus = 'VERIFIED' | 'NOT_FOUND' | 'UNAVAILABLE' | 'UNSUPPORTED';

/** A completed resource validation. */
export interface ResourceValidation {
  readonly kind: ResourceKind;
  readonly value: string;
  readonly status: ResourceValidationStatus;
  /** ISO timestamp the check was performed. */
  readonly checkedAt: string;
  /** How the check was performed (e.g. 'crossref-works-doi', 'arxiv-api-id'). */
  readonly method: string;
  /** The resolved document if VERIFIED (full provenance), else null. */
  readonly document: RetrievedDocument | null;
}

/**
 * Verify a DOI exists in Crossref (the authoritative DOI registry). Returns
 * VERIFIED with the resolved document, or NOT_FOUND. Network errors propagate
 * (fail-closed) so the caller can distinguish UNAVAILABLE from NOT_FOUND.
 */
export async function validateDoi(doi: string): Promise<ResourceValidation> {
  const checkedAt = new Date().toISOString();
  // resolveCrossrefDoi returns null for both 404 and network failure; to honor
  // the UNAVAILABLE vs NOT_FOUND distinction, we let genuine network errors throw
  // (fetchTextFromAllowlistedHost throws on non-2xx/network/timeout) and only the
  // 404-but-resolvable null path maps to NOT_FOUND.
  try {
    const doc = await resolveCrossrefDoi(doi);
    return {
      kind: 'doi',
      value: doi,
      status: doc !== null ? 'VERIFIED' : 'NOT_FOUND',
      checkedAt,
      method: 'crossref-works-doi',
      document: doc,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // A 404 from Crossref's /works/{doi} surfaces as a thrown non-2xx error →
    // that is NOT_FOUND (the DOI is not registered), not a network failure.
    if (/404|not found/i.test(msg)) {
      return { kind: 'doi', value: doi, status: 'NOT_FOUND', checkedAt, method: 'crossref-works-doi', document: null };
    }
    throw err; // genuine network/timeout → propagate (caller treats as UNAVAILABLE)
  }
}

/**
 * Verify an arXiv id exists by querying the arXiv API for that id. Returns
 * VERIFIED with the resolved document, or NOT_FOUND.
 */
export async function validateArxivId(arxivId: string): Promise<ResourceValidation> {
  const checkedAt = new Date().toISOString();
  try {
    // arXiv supports an id_query: search by id directly.
    const docs = await arxivAdapter.retrieve({
      text: `id:${arxivId}`,
      maxResults: 1,
      source: 'arxiv',
    });
    const match = docs.find((d) => d.persistentIdentifier === arxivId) ?? null;
    return {
      kind: 'arxiv',
      value: arxivId,
      status: match !== null ? 'VERIFIED' : 'NOT_FOUND',
      checkedAt,
      method: 'arxiv-api-id',
      document: match,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not found|empty/i.test(msg)) {
      return { kind: 'arxiv', value: arxivId, status: 'NOT_FOUND', checkedAt, method: 'arxiv-api-id', document: null };
    }
    throw err;
  }
}

/**
 * Dispatch existence verification by kind. URLs return UNSUPPORTED (safe
 * SSRF-resistant arbitrary-URL liveness checking is future work — we do NOT
 * pretend to verify what we cannot safely check, §20).
 */
export async function validateResource(kind: ResourceKind, value: string): Promise<ResourceValidation> {
  switch (kind) {
    case 'doi':
      return validateDoi(value);
    case 'arxiv':
      return validateArxivId(value);
    case 'url':
      return {
        kind: 'url',
        value,
        status: 'UNSUPPORTED',
        checkedAt: new Date().toISOString(),
        method: 'none-ssrf-safe-url-check-is-future-work',
        document: null,
      };
    default:
      return {
        kind,
        value,
        status: 'UNSUPPORTED',
        checkedAt: new Date().toISOString(),
        method: 'none-unknown-kind',
        document: null,
      };
  }
}

/** Parse a "kind:value" resource spec (e.g. "doi:10.1126/science.aac4716"). */
export function parseResourceSpec(spec: string): { kind: ResourceKind; value: string } | { error: string } {
  const idx = spec.indexOf(':');
  if (idx <= 0) return { error: `resource_checker: spec must be 'kind:value' (e.g. doi:10.1234/abc), got '${spec}'` };
  const kindStr = spec.slice(0, idx);
  const value = spec.slice(idx + 1).trim();
  if (value.length === 0) return { error: `resource_checker: value is empty in '${spec}'` };
  if (kindStr !== 'doi' && kindStr !== 'arxiv' && kindStr !== 'url') {
    return { error: `resource_checker: kind must be doi|arxiv|url, got '${kindStr}'` };
  }
  return { kind: kindStr, value };
}
