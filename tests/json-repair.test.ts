/**
 * W7-F1 repair-engine tests (D-044). Two evidence sources:
 *  1. ORACLE EQUIVALENCE: the upstream jsonrepair 3.15.0 package was executed locally
 *     (verification only, not a dependency) over the 80-entry corpus in
 *     spikes/json-repair-corpus.mjs; its recorded outputs
 *     (spikes/output/json-repair-oracle.json) are ground truth this TS port must
 *     reproduce byte-for-byte — including the two entries upstream throws on.
 *  2. LIVE CORPUS: the real corrupted strict-FC tool arguments captured 2026-08-22
 *     (spikes/output/strict-fc-corrupted-args.json, argsFull) — the corruption class
 *     that killed run_8n37 mid-flight (D-029/D-030).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { JsonRepairError, repairJson } from '../src/providers/json-repair.js';
import { extractJsonText } from '../src/providers/http.js';

interface OracleEntry {
  name: string;
  input: string;
  output: string | null;
  error: string | null;
}

const loadOracle = (): OracleEntry[] =>
  JSON.parse(readFileSync(new URL('../spikes/output/json-repair-oracle.json', import.meta.url), 'utf8')) as OracleEntry[];

describe('repairJson oracle equivalence (upstream jsonrepair 3.15.0, 80-entry corpus)', () => {
  const oracle = loadOracle();
  it('fixture loaded with the full corpus', () => {
    expect(oracle.length).toBe(83);
  });
  for (const entry of oracle) {
    it(entry.error === null ? `matches upstream output: ${entry.name}` : `throws like upstream: ${entry.name}`, () => {
      if (entry.error === null && entry.output !== null) {
        expect(repairJson(entry.input)).toBe(entry.output);
        JSON.parse(repairJson(entry.input)); // engine output is itself valid JSON
      } else {
        expect(() => repairJson(entry.input)).toThrow(JsonRepairError);
      }
    });
  }
});

describe('repairJson content-preservation invariants', () => {
  it('never changes content characters, only structural ones (live inner-quote class)', () => {
    const corrupted = '{"note":"damage could..."expected morphology" large H3"}';
    const repaired = repairJson(corrupted);
    const parsed = JSON.parse(repaired) as { note: string };
    // every content character survives, the inner quotes are escaped in place
    expect(parsed.note).toBe('damage could..."expected morphology" large H3');
  });

  it('valid documents round-trip identically (repair only runs after direct parse fails at the caller)', () => {
    const valid = '{"text": "ends with quote\\" then comma", "n": 1, "arr": [1, 2, {"k": "v"}]}';
    expect(repairJson(valid)).toBe(valid);
  });

  it('truncation completion appends only closing structure (content untouched)', () => {
    const repaired = repairJson('{"candidates": [{"t": "a"}, {"t": "b"');
    expect(JSON.parse(repaired)).toEqual({ candidates: [{ t: 'a' }, { t: 'b' }] });
  });

  it('leading-zero numbers become strings, not fabricated numbers (content over type guessing)', () => {
    expect(JSON.parse(repairJson('{"a":00123}'))).toEqual({ a: '00123' });
  });
});

describe('live corrupted strict-FC tool arguments (spikes/output/strict-fc-corrupted-args.json)', () => {
  const captured = JSON.parse(
    readFileSync(new URL('../spikes/output/strict-fc-corrupted-args.json', import.meta.url), 'utf8'),
  ) as { argsFull: string; errPos: number };

  it('the captured sample is genuinely invalid JSON (fixture sanity)', () => {
    expect(() => JSON.parse(captured.argsFull)).toThrow();
  });

  it('an inner-quote excerpt (single pair, the 056e931 class) repairs with content preserved', () => {
    const excerpt = '{"candidates": [{"statement": "Fibroblast co-culture models", "mechanism": "methylation model in ex-secreasing + epithelial damage could"expected morphology in culture absent" large H3 lysine repositions"}]}';
    const parsed = extractJsonText(excerpt);
    expect(parsed).not.toBeNull();
    const mechanism = (parsed?.value as { candidates: Array<{ mechanism: string }> }).candidates[0]!.mechanism;
    expect(mechanism).toContain('could"expected morphology in culture absent');
  });

  it('the FULL 24k capture stays null — the colon-after-inner-quote ambiguity is unrepairable by design', () => {
    // The model emitted prose quoting a key-like phrase (`...tracing by "distinguish": P(...)`):
    // the quote before the colon is indistinguishable from a structural close. Both the local
    // scan and upstream jsonrepair 3.15.0 itself throw on this sample (spikes/json-repair-
    // live-sample.mjs: "Object key expected" / position ~5501). Guessing here could silently
    // move string boundaries (D-029 rejected exactly that), so the layer fails visibly into
    // the bounded corrective re-ask (live-observed ~99% cumulative recovery, 0d1706e).
    expect(extractJsonText(captured.argsFull)).toBeNull();
    expect(() => repairJson(captured.argsFull)).toThrow(JsonRepairError);
  });
});

describe('repair layer composition (fuzz-supported, spikes/json-repair-fuzz{,2}.mjs)', () => {
  it('adjacent-quote shape (c""lonal): local scan fixes what the engine throws on', () => {
    const doc = '{"a":"tumor clon"al axis c""lonal cohort"}';
    const intended = 'tumor clon"al axis c""lonal cohort';
    expect(() => repairJson(doc)).toThrow(JsonRepairError); // engine's two-stage heuristics bail
    const parsed = extractJsonText(doc);
    expect((parsed?.value as { a: string }).a).toBe(intended); // local scan layer covers it
  });

  it('engine-only classes still reach the engine (truncation completion through extractJsonText)', () => {
    expect(extractJsonText('{"candidates": [{"t": "a"}, {"t": "b"')?.value).toEqual({ candidates: [{ t: 'a' }, { t: 'b' }] });
  });
});

describe('extractJsonText allowRepair:false (W7-F2 truncation gate)', () => {
  it('direct and fence-stripped parses still work without the engine', () => {
    expect(extractJsonText('{"a":1}', { allowRepair: false })?.value).toEqual({ a: 1 });
    expect(extractJsonText('```json\n{"a":1}\n```', { allowRepair: false })?.value).toEqual({ a: 1 });
  });

  it('engine-repairable corruptions are NOT repaired when truncation was transport-confirmed', () => {
    const truncated = '{"items": ["one'; // engine would close the string+array+object
    expect(extractJsonText(truncated, { allowRepair: false })).toBeNull();
    expect(extractJsonText(truncated, { allowRepair: true })).not.toBeNull();
  });
});
