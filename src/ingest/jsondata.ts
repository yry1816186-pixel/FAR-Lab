/**
 * JSON → dataset routing (MULTIMODAL lane extension, 2026-08-25). Scientists
 * export and share record arrays ("rows") and columnar objects ("columns")
 * as JSON; both shapes profile into the SAME dsdp-1 pipeline as CSV/xlsx.
 * Anything else (nested structures, mixed shapes, top-level scalars) is
 * REFUSED with a precise reason — flattening nested JSON into pseudo-cells
 * would fabricate a table that the source never was.
 */

export type JsonRowsResult =
  | { ok: true; rows: string[][] }
  | { ok: false; reason: string };

const scalarToString = (v: string | number | boolean | null): string => {
  if (v === null) return '';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return v;
};

const isScalar = (v: unknown): v is string | number | boolean | null =>
  v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

export const jsonToRows = (text: string): JsonRowsResult => {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: `not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }

  // shape 1: array of flat records
  if (Array.isArray(json)) {
    if (json.length === 0) return { ok: false, reason: 'JSON array is empty — nothing to profile' };
    if (!json.every((r) => typeof r === 'object' && r !== null && !Array.isArray(r))) {
      return { ok: false, reason: 'JSON array elements are not all objects — not a record table' };
    }
    const header: string[] = [];
    const seen = new Set<string>();
    let nested: string | null = null;
    for (const rec of json as Array<Record<string, unknown>>) {
      for (const [k, v] of Object.entries(rec)) {
        if (!seen.has(k)) { seen.add(k); header.push(k); }
        if (nested === null && !isScalar(v)) nested = k;
      }
    }
    if (nested !== null) {
      return { ok: false, reason: `record field "${nested}" holds nested objects/arrays — nested JSON is not flattened into pseudo-cells (export CSV for tabular use)` };
    }
    const rows: string[][] = [header];
    for (const rec of json as Array<Record<string, unknown>>) {
      rows.push(header.map((h) => {
        const v = rec[h];
        return v === undefined ? '' : scalarToString(v as string | number | boolean | null);
      }));
    }
    return { ok: true, rows };
  }

  // shape 2: columnar object (keys → equal-length scalar arrays)
  if (typeof json === 'object' && json !== null) {
    const entries = Object.entries(json as Record<string, unknown>);
    if (entries.length === 0) return { ok: false, reason: 'JSON object has no keys — nothing to profile' };
    const nonArray = entries.find(([, v]) => !Array.isArray(v));
    if (nonArray !== undefined) {
      return { ok: false, reason: `not a columnar table: field "${nonArray[0]}" is not an array (and not a record array either)` };
    }
    const arrays = entries as Array<[string, unknown[]]>;
    const bad = arrays.find(([, arr]) => !arr.every(isScalar));
    if (bad !== undefined) {
      return { ok: false, reason: `column "${bad[0]}" contains nested values — not a flat columnar table` };
    }
    const length = (arrays[0] as [string, unknown[]])[1].length;
    if (!arrays.every(([, arr]) => arr.length === length)) {
      return { ok: false, reason: 'columnar arrays have unequal lengths — ragged columns are not a table' };
    }
    if (length === 0) return { ok: false, reason: 'columnar arrays are empty — nothing to profile' };
    const header = arrays.map(([k]) => k);
    const rows: string[][] = [header];
    for (let i = 0; i < length; i += 1) {
      rows.push(arrays.map(([, arr]) => scalarToString(arr[i] as string | number | boolean | null)));
    }
    return { ok: true, rows };
  }

  return { ok: false, reason: 'top-level JSON is a scalar — not tabular data' };
};
