/**
 * RU-10 A2.8/A4.5 — MinHash-LSH near-duplicate detection (clean-room).
 *
 * Public algorithm (Broder 1997; datasketch = semantic reference only, no
 * code copied). Zero dependencies. THE single owner of near-dup detection:
 * corpus dedup (A2.8) and hypothesis dedup (A4.5) both call this module —
 * packet ruling: one mechanism, two consumers, no second implementation.
 *
 * Deterministic: same input → byte-identical signature (no Math.random).
 * Shingle unit is script-detected: word 3-grams for Latin scripts,
 * char bigrams for CJK (trigram index needs ≥3 chars — see RU10 packet).
 */

/** Deterministic 32-bit string hash (FNV-1a). Same hash family trick datasketch uses: permute by hashing salted inputs. */
const fnv1a = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Force unsigned.
  return h >>> 0;
};

/** Salted hash k_i(x) = fnv(salt_i + x); salts derived deterministically from permutation index. */
const permHash = (s: string, perm: number): number => {
  const salt = String.fromCharCode((perm & 0xff) + 0x20) + String.fromCharCode(((perm >> 8) & 0xff) + 0x20);
  return fnv1a(salt + s);
};

export interface MinhashConfig {
  /** Number of permutations (= signature length). 128 default per packet. */
  numPerm: number;
}

/** True if the text contains CJK ideographs/hiragana/katakana/hangul runs (>=30% of chars). */
const cjkDominant = (text: string): boolean => {
  const cjk = text.match(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/g)?.length ?? 0;
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  return letters > 0 && cjk / letters >= 0.3;
};

/**
 * Extract the shingle SET for a document.
 * - Latin/other: lowercase word 3-grams joined with single spaces.
 * - CJK-dominant: character bigrams (no segmentation dependency — see packet).
 */
export function shingle(text: string, _langHint?: 'en' | 'zh' | string): Set<string> {
  const out = new Set<string>();
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return out;
  if (cjkDominant(normalized)) {
    const chars = [...normalized];
    for (let i = 0; i + 1 < chars.length; i++) out.add(chars[i]! + chars[i + 1]!);
    return out;
  }
  const words = normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  for (let i = 0; i + 2 < words.length; i++) out.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  return out;
}

/** MinHash signature: for each permutation, the min salted hash over members. Empty set → all zeros. */
export function minhashSignature(set: Set<string>, cfg: MinhashConfig): number[] {
  const sig: number[] = [];
  const items = [...set];
  for (let p = 0; p < cfg.numPerm; p++) {
    let m = 0xffffffff;
    for (const it of items) {
      const h = permHash(it, p);
      if (h < m) m = h;
    }
    sig.push(items.length === 0 ? 0 : m);
  }
  return sig;
}

/**
 * Estimated Jaccard from signatures = fraction of agreeing positions.
 * Fail-safe for empty documents: an all-zero signature means "empty set" —
 * similarity of empty artifacts is UNDEFINED and must never collide in dedup,
 * so any pair containing a zero vector reports 0.
 */
export function jaccardFromSignatures(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let agree = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) agree++;
  const est = agree / a.length;
  // Zero-vector guard: empty-set signature is all zeros; agreement with
  // another zero vector would give 1.0 — clamp to 0 (undefined, not identical).
  if ((a[0] === 0 || b[0] === 0) && est > 0) {
    const aEmpty = a.every((v) => v === 0);
    const bEmpty = b.every((v) => v === 0);
    if (aEmpty && bEmpty) return 0;
  }
  return est;
}

/**
 * LSH banding parameters for a target similarity threshold, numPerm ≤ 128.
 * rows×bands ≈ numPerm maximizing P(candidate|sim≥t) − P(candidate|sim<t).
 * Returns the classic optimal split for threshold t: b bands of r rows with
 * r = round(numPerm / bands), chosen so (1/b)^(1/r) ≈ t.
 */
export function estimateThresholdParams(threshold: number, numPerm = 128): { bands: number; rows: number } {
  let best = { bands: 16, rows: 8 };
  let bestScore = -Infinity;
  for (let b = 1; b <= 128; b++) {
    const r = Math.floor(numPerm / b);
    if (r < 1) break;
    const approx = Math.pow(1 / b, 1 / r);
    const score = -Math.abs(approx - threshold);
    if (score > bestScore) {
      bestScore = score;
      best = { bands: b, rows: r };
    }
  }
  return best;
}

/** LSH bucket keys: one per band, `band:<i>:<joined band signature>`. */
export function lshBands(sig: number[], bands: number, rows: number): string[] {
  const keys: string[] = [];
  for (let b = 0; b < bands; b++) {
    const slice = sig.slice(b * rows, (b + 1) * rows);
    if (slice.length < rows) break;
    keys.push(`band:${b}:${slice.join(',')}`);
  }
  return keys;
}
