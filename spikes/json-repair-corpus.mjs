#!/usr/bin/env node
/**
 * Wave-7 W7-F1 oracle harness: run the LOCAL extracted upstream jsonrepair 3.15.0
 * (.cache/repos/jsonrepair, ISC) over the FAR-Lab repair corpus and record its
 * outputs as ground truth for the TS port equivalence check. The upstream package
 * is executed here for VERIFICATION ONLY — it is not a dependency of far-lab.
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require_ = createRequire(import.meta.url);
const { jsonrepair } = require_('../.cache/repos/jsonrepair/lib/cjs/index.js');

// Corpus: corruption classes from research/wave7-reports/jsonrepair.md rule table
// (R1-R38) + FAR-Lab live-observed classes. Each entry: [name, input].
const corpus = [
  // R1 markdown fences
  ['fence-basic', '```json\n{"a":1}\n```'],
  ['fence-no-lang', '```\n{"a":1}\n```'],
  ['fence-array', '[```json\n[1,2]\n```'],
  ['fence-object', '{```json\n{"a":1}\n```'],
  // R1 + leading whitespace (audit P1 class, upstream skipMarkdownCodeBlock :171)
  ['fence-leading-space', '  ```json\n{"a":1}\n```'],
  ['fence-leading-tab', '\t```\n{"a":1}\n```'],
  ['fence-leading-newline', '\n```json\n{"a":1}\n```'],
  // R2 NDJSON
  ['ndjson-two-objects', '{"a":1}\n{"b":2}'],
  ['ndjson-missing-comma', '{"a":1}\n{"b":2},\n{"c":3}'],
  // R3 root trailing comma
  ['root-trailing-comma', '{"a":1},'],
  // R4 redundant closers
  ['redundant-closers', '{"a":1}}]'],
  // R5/R12 leading commas
  ['obj-leading-comma', '{, "a":1}'],
  ['arr-leading-comma', '[, 1, 2]'],
  // R6/R13 missing commas
  ['obj-missing-comma', '{"a":1 "b":2}'],
  ['arr-missing-comma', '[1 2 3]'],
  // R7/R14 trailing commas
  ['obj-trailing-comma', '{"a":1,}'],
  ['arr-trailing-comma', '[1,2,]'],
  ['obj-trailing-comma-multiline', '{\n  "a": 1,\n}'],
  // R8 missing colon
  ['missing-colon', '{"a" 1}'],
  // R9 missing value
  ['missing-value', '{"a":}'],
  ['missing-value-truncated', '{"a":'],
  // R10/R15 missing closers (truncation completion)
  ['missing-obj-close', '{"a":1'],
  ['missing-arr-close', '[1,2'],
  ['missing-nested-close', '{"a":{"b":[1,2 {"c":3}'],
  ['missing-close-in-string-value', '{"a":"hello'],
  ['truncated-in-string-array', '{"items": ["one', ],
  // R11/R16 ellipsis
  ['ellipsis-array', '[1,2,3,...]'],
  ['ellipsis-array-mid', '[1,2,3,...,9]'],
  ['ellipsis-array-leading', '[...,7,8,9]'],
  ['ellipsis-object', '{"a":1,...}'],
  // R17 single/smart quotes
  ['single-quoted', "{'a':1}"],
  ['single-quoted-values', "{'a':'hello'}"],
  ['smart-double-quotes', '{"a": \u201chello\u201d}'],
  ['smart-single-quotes', "{'a': \u2018hello\u2019}"],
  ['backtick-quotes', "{'a': `hello`}"],
  // R18 escaped string prefix
  ['escaped-string', '\\"hello world\\"'],
  // R19 unescaped inner quotes (FAR-Lab live class)
  ['inner-quote-basic', '{"a":"say "hello" now"}'],
  ['inner-quote-live-shape', '{"note":"damage could..."expected morphology" large H3" }'],
  ['inner-quote-no-space', '{"a":"he said "hi"}'],
  ['inner-quote-digit-after', '{"a":"size 72"5"}'],
  ['inner-quote-unclosed-bracket', '{"a":"a (b" ) c"}'],
  // R20 missing end quote two-stage
  ['missing-end-quote-delimiter-tail', '["hello,'],
  ['missing-end-quote-comma-tail', '{"a":"b,c,"d":"e"}'],
  ['missing-end-quote-stop-at-delim', '{"a":"hello world, "b": 2}'],
  // R22 truncated unicode
  ['truncated-unicode', '{"a":"\\u26"]'],
  ['truncated-unicode-eof', '{"a":"\\u26'],
  // R23 invalid escape
  ['invalid-escape', '{"a":"x\\qy"}'],
  // R24 backslash newline
  ['backslash-newline', '{"a":"x\\\ny"}'],
  // R25 control characters
  ['raw-newline-in-string', '{"a":"line1\nline2"}'],
  ['raw-tab-in-string', '{"a":"x\ty"}'],
  // R26 concatenated strings
  ['concatenated', '{"a":"hello" + "world"}'],
  // R29-R32 numbers
  ['leading-zeros', '{"a":00123}'],
  ['missing-leading-zero', '{"a":.5}'],
  ['missing-leading-zero-neg', '{"a":-.5}'],
  ['truncated-dot-number', '{"a":2.'],
  ['truncated-exp-number', '{"a":2e}'],
  ['lone-minus', '{"a":-}'],
  ['multi-dot-fallback-string', '{"a":1.2.3}'],
  // R33 keywords
  ['python-true', '{"a":True}'],
  ['python-false', '{"a":False}'],
  ['python-none', '{"a":None}'],
  ['js-undefined', '{"a":undefined}'],
  // R34 unquoted keys/values
  ['unquoted-key', '{a:1}'],
  ['unquoted-value', '{"a":hello}'],
  ['unquoted-multiword-value', '{status: ok fine}'],
  // R35 JSONP / MongoDB
  ['jsonp-callback', 'callback({"a":1});'],
  ['mongodb-numberlong', '{"a":NumberLong("2")}'],
  // R36 regex literal
  ['regex-literal', '{"a":/ab+c/}'],
  // R37 comments
  ['block-comment', '{/* c */"a":1}'],
  ['line-comment', '{\n// note\n"a":1}'],
  // R38 special whitespace
  ['special-whitespace', '{\u00a0"a":1}'],
  // valid documents must pass through unchanged
  ['valid-object', '{"a":1,"b":[1,2,{"c":"x"}]}'],
  ['valid-array', '[1,2.5,-3,"s",true,false,null]'],
  ['valid-unicode-escape', '{"a":"\\u00e9t\\u00e9"}'],
  ['valid-escaped-quotes', '{"a":"say \\"hello\\" now"}'],
  // compound: fence + trailing comma + single quotes (realistic model output)
  ['compound-fence-singleq-comma', '```json\n{\'a\': \'x\', \'b\': [1,2,],}\n```'],
  ['compound-truncation', '{"candidates": [{"t": "a"}, {"t": "b"'],
  // R19/R27 HTML entities as quotes and content
  ['entity-quoted-string', '&quot;hello&quot;'],
  ['entity-inside-string', '{"a":"x &quot;inner&quot; y"}'],
  ['entity-numeric-quote', '{"a":&#34;v&#34;}'],
  ['entity-amp-content', '{"a":"A &amp; B"}'],
  // R28 URL repair inside strings/unquoted values
  ['url-in-unquoted-value', '{"a":https://example.com/x}'],
  ['url-in-quoted-string-stop-mode', '{"a":"see https://example.com/x, plus notes"'],
];

const results = [];
for (const [name, input] of corpus) {
  let output;
  let error = null;
  try {
    output = jsonrepair(input);
    JSON.parse(output); // engine output must itself be parseable
  } catch (e) {
    error = String(e.message ?? e);
    output = null;
  }
  results.push({ name, input, output, error });
}
writeFileSync(new URL('./output/json-repair-oracle.json', import.meta.url), JSON.stringify(results, null, 1));
const ok = results.filter((r) => !r.error).length;
console.log(`corpus=${results.length} repaired=${ok} errors=${results.length - ok}`);
for (const r of results.filter((x) => x.error)) console.log('  ERR', r.name, '|', r.error.slice(0, 60));
