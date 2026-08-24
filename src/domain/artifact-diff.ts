/**
 * RU-12 GO-1 — id-anchored structured diff for domain artifacts (RFC 6902
 * op format, clean-room). Walks two versions of a zod-validated domain
 * object and emits JSON-Patch ops PLUS semantic flags the revision chain can
 * explain field-by-field. Zero dependencies (jsondiffpatch/deep-diff are
 * schema/id-blind; deep-diff is deprecated on npm — packet RU12).
 *
 * Id-anchored: arrays keyed by an identity field (id, label, observable…
 * declared per call site) are diffed BY IDENTITY, not by index — a reordering
 * is a `move`, not a delete+add storm. Unkeyed arrays fall back to index ops.
 */

export type JsonPatchOp =
  | { op: 'add'; path: string; value: unknown }
  | { op: 'remove'; path: string }
  | { op: 'replace'; path: string; value: unknown }
  | { op: 'move'; from: string; path: string };

export interface StructuredDiff {
  ops: JsonPatchOp[];
  changedFields: string[];
  /** Human-checkable semantic summary derived from the ops (deterministic). */
  semanticFlags: string[];
}

const escapeToken = (t: string): string => t.replace(/~/g, '~0').replace(/\//g, '~1');
const ptr = (base: string, token: string | number): string => `${base}/${typeof token === 'number' ? token : escapeToken(String(token))}`;

/** Semantic flags for known FAR-Lab field shapes (deterministic, additive). */
const SEMANTIC_PATTERNS: ReadonlyArray<readonly [RegExp, (op: JsonPatchOp) => string]> = [
  [/decisionRules|threshold/, (op) => `decision-rule change at ${op.path} (preregistration-relevant)`],
  [/predictions/, (op) => `prediction set changed at ${op.path}`],
  [/mechanism/, (op) => `mechanism statement changed at ${op.path}`],
  [/status/, (op) => `lifecycle status changed at ${op.path}`],
  [/alpha|policy/, (op) => `testing-policy field changed at ${op.path}`],
];

export const diffArtifacts = (
  before: unknown,
  after: unknown,
  opts: { idKeys?: readonly string[] } = {},
): StructuredDiff => {
  const ops: JsonPatchOp[] = [];
  const changed = new Set<string>();
  const flags: string[] = [];
  const idKeys = opts.idKeys ?? ['id', 'label', 'name', 'observable'];

  const idOf = (v: unknown): string | undefined => {
    if (typeof v !== 'object' || v === null) return undefined;
    const rec = v as Record<string, unknown>;
    for (const k of idKeys) {
      const val = rec[k];
      if (typeof val === 'string' && val.length > 0) return `${k}:${val}`;
    }
    return undefined;
  };

  const note = (op: JsonPatchOp): void => {
    ops.push(op);
    const top = op.path.split('/')[1] ?? op.path;
    changed.add(top);
    for (const [re, mk] of SEMANTIC_PATTERNS) {
      if (re.test(op.path)) flags.push(mk(op));
    }
  };

  const walk = (a: unknown, b: unknown, base: string): void => {
    if (a === b) return;
    const aObj = typeof a === 'object' && a !== null && !Array.isArray(a);
    const bObj = typeof b === 'object' && b !== null && !Array.isArray(b);
    if (aObj && bObj) {
      const aRec = a as Record<string, unknown>;
      const bRec = b as Record<string, unknown>;
      for (const k of Object.keys(aRec)) {
        if (!(k in bRec)) note({ op: 'remove', path: ptr(base, k) });
        else walk(aRec[k], bRec[k], ptr(base, k));
      }
      for (const k of Object.keys(bRec)) {
        if (!(k in aRec)) note({ op: 'add', path: ptr(base, k), value: bRec[k] });
      }
      return;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      const aIds = a.map(idOf);
      const bIds = b.map(idOf);
      const keyed = a.every((x) => idOf(x) !== undefined) && b.every((x) => idOf(x) !== undefined)
        && new Set(aIds).size === a.length && new Set(bIds).size === b.length;
      if (keyed) {
        const aPos = new Map(aIds.map((id, i) => [id as string, i]));
        for (let j = 0; j < b.length; j += 1) {
          const bid = bIds[j] as string;
          const i = aPos.get(bid);
          if (i === undefined) {
            note({ op: 'add', path: ptr(base, '-'), value: b[j] });
          } else {
            walk(a[i], b[j], ptr(base, escapeToken(bid)));
          }
        }
        const bPos = new Set(bIds);
        for (let i = 0; i < a.length; i += 1) {
          if (!bPos.has(aIds[i] as string)) note({ op: 'remove', path: ptr(base, escapeToken(aIds[i] as string)) });
        }
        return;
      }
      // index fallback
      const n = Math.max(a.length, b.length);
      for (let i = 0; i < n; i += 1) {
        if (i >= b.length) note({ op: 'remove', path: ptr(base, i) });
        else if (i >= a.length) note({ op: 'add', path: ptr(base, i), value: b[i] });
        else walk(a[i], b[i], ptr(base, i));
      }
      return;
    }
    note({ op: 'replace', path: base, value: b });
  };

  walk(before, after, '');
  return { ops, changedFields: [...changed].sort(), semanticFlags: flags };
};
