import { createHash } from 'node:crypto';

/** sha256 hex of a string/buffer — the content-addressing primitive used across artifacts and receipts. */
export const sha256Hex = (data: string | Uint8Array): string =>
  createHash('sha256').update(data).digest('hex');

/**
 * Canonical JSON: recursively sorted object keys, no insignificant whitespace.
 * Content hashes MUST be computed over canonical form (source spike proved raw API bytes unstable due to key-order drift).
 */
export const canonicalJson = (value: unknown): string => {
  const sortDeep = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortDeep);
    if (v !== null && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([, val]) => val !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, val]) => [k, sortDeep(val)]),
      );
    }
    return v;
  };
  return JSON.stringify(sortDeep(value));
};

export const canonicalSha256 = (value: unknown): string => sha256Hex(canonicalJson(value));
