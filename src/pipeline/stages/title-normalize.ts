/**
 * Title comparison for verify_sources: lowercase, strip punctuation, tokenize,
 * then Jaccard set similarity against the contract threshold (>= 0.6 = match).
 * Shared so the rule has exactly one owner (constitution §5).
 */
export const TITLE_MATCH_THRESHOLD = 0.6;

export const normalizeTitleTokens = (title: string): string[] =>
  title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);

/** Jaccard similarity over normalized token sets: |A∩B| / |A∪B|. */
export const titleJaccard = (a: string, b: string): number => {
  const sa = new Set(normalizeTitleTokens(a));
  const sb = new Set(normalizeTitleTokens(b));
  if (sa.size === 0 && sb.size === 0) return 1; // both empty -> vacuously identical
  if (sa.size === 0 || sb.size === 0) return 0;
  let intersection = 0;
  for (const token of sa) if (sb.has(token)) intersection += 1;
  return intersection / (sa.size + sb.size - intersection);
};
