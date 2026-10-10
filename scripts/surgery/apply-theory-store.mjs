#!/usr/bin/env node
// Slice-5 store registration patch: register the theory_spec kind (KIND_SCHEMAS
// + import). apply-theory-executor.mjs edit 7 failed twice on a wrong assumption
// (protocol_execution as the LAST map entry — the map continues with feedback,
// revision, receipt, ...). This patch inserts WITHOUT the last-entry assertion:
// placement inside the object literal is all the registration needs.
// Fail-loud unique anchors + natural idempotence + post-write invariants.
import { readFileSync, writeFileSync } from 'node:fs';

const p = 'src/persistence/store.ts';
const fail = (m) => {
  console.error(`APPLY-THEORY-STORE-FAILED: ${m}`);
  process.exit(1);
};
const src = readFileSync(p, 'utf8');

if (src.includes('theory_spec: TheorySpec,')) {
  console.log(`SKIP ${p}: theory_spec registered`);
  process.exit(0);
}

const hasCr = src.includes('\r\n');
const hasLfOnly = /(^|[^\r])\n/.test(src);
if (hasCr && hasLfOnly) fail(`${p}: mixed EOLs — refusing to touch`);
const eol = hasCr ? '\r\n' : '\n';
const lines = src.split(/\r?\n/);

const findOne = (exact) => {
  const hits = lines.map((l, i) => (l === exact ? i : -1)).filter((i) => i >= 0);
  if (hits.length === 0) fail(`anchor not found: ${JSON.stringify(exact.slice(0, 80))}`);
  if (hits.length > 1) fail(`anchor not unique (${hits.length}): ${JSON.stringify(exact.slice(0, 80))}`);
  return hits[0];
};

const importIdx = findOne('  ProtocolSpec, ProtocolExecution,');
lines.splice(importIdx + 1, 0, '  TheorySpec,');

const entryIdx = findOne('  protocol_execution: ProtocolExecution,');
// No last-entry assertion (slice-5 lesson: the map continues past protocol_execution).
lines.splice(entryIdx + 1, 0, '  theory_spec: TheorySpec,');

const next = lines.join(eol);
if (next === src) fail('no change produced — refusing to write nothing');
writeFileSync(p, next);

const after = readFileSync(p, 'utf8');
if (after.split('theory_spec: TheorySpec,').length - 1 !== 1) fail('post-write invariant: KIND_SCHEMAS entry count != 1');
if (!after.includes('  TheorySpec,')) fail('post-write invariant: import missing');
console.log(`EDITED ${p}: theory_spec registered (${after.length} bytes)`);
