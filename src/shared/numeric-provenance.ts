/**
 * Wave-S/s5 (g11-lite) — numeric provenance utilities, adapted from AutoResearchClaw's
 * VerifiedRegistry semantics (aiming-lab, MIT; mechanism-level port): numbers that a
 * document asserts must trace to a whitelist of recorded values. Pure and deterministic.
 *
 * Honest scope note: FAR-Lab's export report is built deterministically from persisted
 * objects (no LLM narrative numbers), so the full paper-side registry is deferred until
 * an LLM narrative surface exists (trigger recorded). What needs checking TODAY: free-text
 * plan fields carrying numbers that must stay consistent with the structured
 * preregistration layer (decisionRules "precision@5 >= 0.6" vs TestSpec.threshold=0.6).
 */

export interface NumericToken {
  value: number;
  raw: string;
  /** ±40 chars of surrounding text for disclosure. */
  context: string;
}

const NUMERIC_RE = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

/**
 * Extract assertion-worthy numeric tokens: every decimal number, plus integers that are
 * neither small structural counts (0–31: indices, section numbers, day-of-month) nor
 * year-like (1900–2100). Id/hash bodies and ISO dates are skipped by context.
 */
export const extractNumericTokens = (text: string): NumericToken[] => {
  const out: NumericToken[] = [];
  for (const match of text.matchAll(NUMERIC_RE)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const before = text.slice(Math.max(0, start - 12), start);
    if (/(?:task_|clm_|hyp_|src_|run_|pln_|xsp_|xrun_|evb_|ach_|prd_|fbk_|rev_|rcp_|bnd_|sc_|trn_)[0-9a-z]{0,4}$/i.test(before)) continue;
    if (/^\d{4}-\d{2}-\d{2}/.test(text.slice(start, start + 10))) continue; // ISO date
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    const isInteger = !raw.includes('.');
    if (isInteger && value >= 0 && value <= 31) continue; // structural counts
    if (isInteger && value >= 1900 && value <= 2100) continue; // year-like
    out.push({ value, raw, context: text.slice(Math.max(0, start - 40), start + raw.length + 40) });
  }
  return out;
};

/** Match a token value against a whitelist: exact equality, 2–4 decimal roundings
 * (rendered strings legitimately round: 0.65283 → 0.653/0.65), plus a percentage ↔
 * fraction bridge. NOTE: no 0/1-decimal rounding — coarse rounding would equate every
 * nearby threshold pair (0.75 ≈ 0.8 ≈ 0.82), destroying the check's discrimination. */
export const whitelistMatches = (value: number, whitelist: readonly number[]): boolean => {
  for (const allowed of whitelist) {
    if (value === allowed) return true;
    for (const decimals of [2, 3, 4]) {
      if (Number(value.toFixed(decimals)) === Number(allowed.toFixed(decimals))) return true;
    }
    if (Math.abs(value - allowed * 100) < 1e-9 || Math.abs(value * 100 - allowed) < 1e-9) return true;
  }
  return false;
};

export interface NumericProvenanceAudit {
  checked: number;
  unverified: NumericToken[];
}

/** Every assertion-worthy numeric token in `text` must match a whitelisted recorded value. */
export const numericProvenanceAudit = (
  text: string,
  whitelist: readonly number[],
): NumericProvenanceAudit => {
  const tokens = extractNumericTokens(text);
  const unverified = tokens.filter((t) => !whitelistMatches(t.value, whitelist));
  return { checked: tokens.length, unverified };
};
