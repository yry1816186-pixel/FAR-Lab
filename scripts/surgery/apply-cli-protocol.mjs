#!/usr/bin/env node
/**
 * Slice 3 anchored patch (2026-08-29): wire `far protocol` into the main.ts
 * router. main.ts (~68KB / 1283 lines) is too large to rewrite whole over the
 * GitHub API; the insertion is a self-contained if-block spliced BEFORE the
 * unique `  if (cmd === 'campaign') {` route, mirroring the experiment block
 * verbatim (dynamic import, args recomputed from process.argv, standard
 * result printing). Idempotent via the done-marker `if (cmd === 'protocol')`.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const MAIN = 'src/cli/main.ts';
const fail = (msg) => {
  console.error(`[surgery:cli-protocol] ${msg}`);
  process.exit(1);
};

const src = readFileSync(MAIN, 'utf8');
if (src.includes("if (cmd === 'protocol')")) {
  console.log('[surgery:cli-protocol] main.ts already routes protocol — nothing to do');
  process.exit(0);
}
const L = src.split('\n');
const hits = L.map((l, i) => (l === "  if (cmd === 'campaign') {" ? i : -1)).filter((i) => i >= 0);
if (hits.length !== 1) {
  fail(`anchor '  if (cmd === 'campaign') {' matched ${hits.length} lines (need exactly 1)`);
}
const BLOCK = [
  "  if (cmd === 'protocol') {",
  '    // Paradigm-honest execution ledger (slice 3): the human-attested protocol',
  '    // surface (show/record). Own module so this router stays a one-line hook.',
  "    const { protocolCommand } = await import('./protocol.js');",
  "    const args = process.argv.slice(4).filter((x) => !x.startsWith('--') && x !== sub);",
  '    const result = await protocolCommand(sub, {',
  "      dataDir: arg('--data-dir') ?? '.far-run',",
  '      positional: args[0],',
  '      flag,',
  '      arg,',
  '    });',
  '    if (json() && result.json !== undefined) jsonOutput(result.json);',
  '    else if (result.text !== undefined) out(result.text);',
  '    if (result.code !== 0) process.exitCode = result.code;',
  '    return;',
  '  }',
  '',
];
L.splice(hits[0], 0, ...BLOCK);
writeFileSync(MAIN, L.join('\n'));
console.log(`[surgery:cli-protocol] protocol route inserted before the campaign route (was line ${hits[0] + 1})`);
