/**
 * V2 External Reference Snapshots — availability state classification + content drift detection.
 *
 * Authority: docs/far-lab-reboot/17_FORMAL_PROTOCOL_REPRODUCIBILITY_AND_LONGEVITY.md §5 (IRG-005).
 *
 * Implements:
 *   - buildExternalReferenceSnapshot: classify HTTP status into availability states
 *   - classifyContentDrift: detect content hash changes
 */

import { createHash } from 'node:crypto';
import { canonicalJson } from '../evidence_log/hasher.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** External reference snapshot with availability state and digest. */
export interface ExternalReferenceSnapshot {
  /** The URL that was resolved. */
  readonly url: string;
  /** Availability state derived from HTTP status. */
  readonly availabilityState: string;
  /** Content hash (sha256) of the fetched content (empty if not fetched). */
  readonly contentHash: string;
  /** ISO 8601 timestamp of when the snapshot was taken. */
  readonly fetchedAt: string;
  /** Chain of redirect URLs (empty if no redirects). */
  readonly redirectChain: readonly string[];
  /** sha256(canonical_json of all other fields) — integrity digest. */
  readonly snapshotDigest: string;
}

// ---------------------------------------------------------------------------
// HTTP status → availability state mapping (IRG-005)
// ---------------------------------------------------------------------------

const STATUS_TO_STATE: ReadonlyMap<number, string> = new Map([
  [200, 'RESOLVED'],
  [302, 'REDIRECTED'],
  [401, 'AUTH_REQUIRED'],
  [403, 'FORBIDDEN'],
  [404, 'NOT_FOUND'],
]);

// ---------------------------------------------------------------------------
// buildExternalReferenceSnapshot
// ---------------------------------------------------------------------------

/**
 * Build an external reference snapshot from fetch metadata.
 *
 * The availability state is derived from the HTTP status code, following
 * IRG-005 mapping. Unknown statuses fall back to NOT_FOUND (fail-closed).
 *
 * @param url - The resolved URL.
 * @param httpStatus - HTTP status code from the fetch.
 * @param contentHash - SHA-256 hash of the fetched content.
 * @param fetchedAt - ISO 8601 timestamp of the fetch.
 * @param redirectChain - URLs traversed during redirects (including initial).
 * @returns Frozen ExternalReferenceSnapshot.
 */
export function buildExternalReferenceSnapshot(
  url: string,
  httpStatus: number,
  contentHash: string,
  fetchedAt: string,
  redirectChain: readonly string[],
): ExternalReferenceSnapshot {
  const availabilityState = STATUS_TO_STATE.get(httpStatus) ?? 'NOT_FOUND';

  // Build the payload (everything except snapshotDigest) for canonical hashing
  const payload = {
    url,
    availabilityState,
    contentHash,
    fetchedAt,
    redirectChain: [...redirectChain],
  };

  const canonical = canonicalJson(payload, 'buildExternalReferenceSnapshot');
  const snapshotDigest = createHash('sha256').update(canonical, 'utf8').digest('hex');

  return Object.freeze({
    ...payload,
    redirectChain: Object.freeze([...redirectChain]),
    snapshotDigest,
  });
}

// ---------------------------------------------------------------------------
// classifyContentDrift
// ---------------------------------------------------------------------------

/**
 * Compare expected and actual content hashes to detect drift.
 *
 * @param expectedHash - Previously recorded content hash.
 * @param actualHash - Current content hash from a fresh fetch.
 * @returns 'CONTENT_DRIFT' if hashes differ, 'STABLE' if they match.
 */
export function classifyContentDrift(
  expectedHash: string,
  actualHash: string,
): 'CONTENT_DRIFT' | 'STABLE' {
  return expectedHash === actualHash ? 'STABLE' : 'CONTENT_DRIFT';
}
