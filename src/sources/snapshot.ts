import type { SourceFamily } from '../domain/source.js';
import type { RawSourceRecord } from '../shared/ports.js';
import { canonicalSha256 } from '../shared/crypto.js';

/**
 * Snapshot hashing (W0 spike conclusion — evidence/W0/source-spike-report.md §4):
 * raw API bytes are unstable (key-order drift); the content hash is therefore
 * canonicalSha256 over the normalized payload AFTER volatile-field exclusion.
 * Extracted fields (title/abstract/...) are projections and never enter the hash.
 */

/** One exclusion path segment: a string matches an object key, '*' matches any array index. */
type PathSegment = string | '*';

/**
 * Contract exclusion list (W0 spike). Do not extend casually: changing this list
 * changes every snapshot hash. Paths are relative to the record's `normalized` root —
 * i.e. the OpenAlex work object, the Crossref message object, the parsed arXiv entry.
 */
const VOLATILE_PATHS: Record<SourceFamily, readonly (readonly PathSegment[])[]> = {
  openalex: [
    ['cited_by_count'],
    ['counts_by_year'],
    ['referenced_works_count'],
    ['updated_date'],
    ['open_access'], // whole object — is_oa/oa_status/oa_date drift with upstream reharvests
    ['best_oa_location'],
    ['topics'],
    ['authorships', '*', 'cited_by_count'],
  ],
  crossref: [
    ['is-referenced-by-count'],
    ['references-count'],
    ['deposited'],
    ['indexed'],
    ['score'],
    ['reference', '*', 'deposited'],
  ],
  arxiv: [['updated']], // new author versions flip this; version itself stays in the snapshot
  // User-provided seeds never enter the search-normalization path (they are
  // SourceDocuments at creation, not RawSourceRecords), but the Record must
  // stay exhaustive: an empty list is the honest no-op.
  user_provided: [],
};

const pathMatches = (path: readonly (string | number)[], pattern: readonly PathSegment[]): boolean => {
  if (path.length !== pattern.length) return false;
  for (let i = 0; i < pattern.length; i += 1) {
    const seg = pattern[i];
    const concrete = path[i];
    if (seg === '*') {
      if (typeof concrete !== 'number') return false; // '*' = array index only
    } else if (seg !== concrete) {
      return false;
    }
  }
  return true;
};

const prune = (
  node: unknown,
  path: readonly (string | number)[],
  patterns: readonly (readonly PathSegment[])[],
): unknown => {
  if (node === null || typeof node !== 'object') return node;
  if (Array.isArray(node)) {
    // Array structure is preserved element-for-element (no compaction): only matching
    // fields are dropped, so indices never shift.
    return node.map((el, i) => prune(el, [...path, i], patterns));
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const childPath: (string | number)[] = [...path, key];
    if (patterns.some((p) => pathMatches(childPath, p))) continue;
    out[key] = prune(value, childPath, patterns);
  }
  return out;
};

/** Pure: returns a fresh pruned copy; the input payload is never mutated. */
export const excludeVolatile = (family: SourceFamily, normalized: unknown): unknown => {
  // A family added to SourceFamily without a VOLATILE_PATHS entry would crash inside
  // prune (patterns.some on undefined) at hash time — fail loud at the boundary (WP2 F10).
  const patterns = VOLATILE_PATHS[family];
  if (patterns === undefined) throw new Error(`no volatile-exclusion list for source family '${family}'`);
  return prune(normalized, [], patterns);
};

/**
 * Content-addressed snapshot hash (64-char sha256 hex) over the volatile-excluded
 * canonical JSON of `record.normalized`.
 *
 * Signature note: the task contract said `snapshotHash(record)`, but RawSourceRecord
 * carries no `family` field, so the family must be passed explicitly to select the
 * exclusion list. Type-driven fix, no behavior change.
 */
export const snapshotHash = (family: SourceFamily, record: RawSourceRecord): string =>
  canonicalSha256(excludeVolatile(family, record.normalized));
