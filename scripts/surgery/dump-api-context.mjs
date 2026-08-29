#!/usr/bin/env node
/**
 * Self-describing surgery aid (convergence 2026-08-29): dumps STRUCTURAL
 * CONTEXT of the large api.ts monolith into this file so a remote work
 * surface can craft exact anchored patches. Read-only w.r.t. api.ts.
 * Rev 4: markers frozen post-protocol-routes; edit only when new anchors
 * are needed.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const PATH = 'src/server/api.ts';
const src = readFileSync(PATH, 'utf8');
const lines = src.split('\n');

const dump = [];
dump.push(`total lines: ${lines.length}`);
dump.push('\n===== first 60 lines =====');
dump.push(lines.slice(0, 60).map((l, i) => `${i + 1}: ${l}`).join('\n'));

const markers = [
  'createApiServer',
  'experiment-ops',
  "segments[4] === 'protocol'",
  'experiments/:specId/approve',
  'readJsonObject',
];
for (const marker of markers) {
  dump.push(`\n===== context around every occurrence of "${marker}" =====`);
  const idxs = [];
  lines.forEach((l, i) => { if (l.includes(marker)) idxs.push(i); });
  dump.push(`occurrences: ${idxs.length}`);
  for (const i of idxs.slice(0, 6)) {
    const from = Math.max(0, i - 14);
    const to = Math.min(lines.length, i + 22);
    dump.push(`--- lines ${from + 1}..${to} (hit at ${i + 1}) ---`);
    dump.push(lines.slice(from, to).map((l, j) => `${from + j + 1}: ${l}`).join('\n'));
  }
}

writeFileSync('scripts/surgery/api-context.txt', dump.join('\n') + '\n');
console.log('[surgery] api-context.txt written');
