#!/usr/bin/env node
/**
 * Slice-4 fix (root causes 11 + 12): the bump-7 full-suite verdict was RED on
 * exactly two assertions, both test-side, not implementation-side:
 *
 *  11. tests/api.test.ts pins body.checks at 14, but verify grew a 15th check
 *      (protocol_evidence_resolvable, this slice's feature). The count is a
 *      contract update, not an expectation loosening: the 15th check PASSES
 *      empty on protocol-less fixtures, so the neighboring assertions (first
 *      check name, every-passed) are unaffected.
 *  12. tests/protocol-export.test.ts asserts 'Human-attested ledger' (capital
 *      H) while the paper renderer emits 'human-attested ledger(s)' mid-
 *      sentence — assertion/copy case mismatch in the test I wrote.
 *
 * Whole-line replacement with unique anchors, idempotent, fail-loud.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const fail = (msg) => {
  console.error(`[surgery:protocol-export-tests] ${msg}`);
  process.exit(1);
};
const countOf = (src, needle) => src.split(needle).length - 1;

// ---- fix 1: api verify check count 14 -> 15 ----
{
  const TEST = 'tests/api.test.ts';
  let src = readFileSync(TEST, 'utf8');
  const OLD = 'expect(body.checks).toHaveLength(14)';
  const NEW = 'expect(body.checks).toHaveLength(15)';
  if (countOf(src, NEW) === 1 && countOf(src, OLD) === 0) {
    console.log('[surgery:protocol-export-tests] api count assertion already 15 — nothing to do');
  } else {
    if (countOf(src, OLD) !== 1) fail(`api anchor matched ${countOf(src, OLD)} times (need exactly 1)`);
    const lines = src.split('\n');
    const i = lines.findIndex((l) => l.includes(OLD));
    lines[i] = "    expect(body.checks).toHaveLength(15); // slice-4: +protocol_evidence_resolvable (protocol-less fixture passes the check empty)";
    writeFileSync(TEST, lines.join('\n'));
    console.log(`[surgery:protocol-export-tests] api.test.ts replaced: ${lines[i]}`);
  }
}

// ---- fix 2: paper markdown assertion case ----
{
  const TEST = 'tests/protocol-export.test.ts';
  let src = readFileSync(TEST, 'utf8');
  const OLD = "expect(paperMd).toContain('Human-attested ledger')";
  const NEW = "expect(paperMd).toContain('human-attested ledger')";
  if (countOf(src, NEW) === 1 && countOf(src, OLD) === 0) {
    console.log('[surgery:protocol-export-tests] paper assertion already lowercase — nothing to do');
  } else {
    if (countOf(src, OLD) !== 1) fail(`paper anchor matched ${countOf(src, OLD)} times (need exactly 1)`);
    const lines = src.split('\n');
    const i = lines.findIndex((l) => l.includes(OLD));
    lines[i] = "    expect(paperMd).toContain('human-attested ledger');";
    writeFileSync(TEST, lines.join('\n'));
    console.log(`[surgery:protocol-export-tests] protocol-export.test.ts replaced: ${lines[i]}`);
  }
}
