#!/usr/bin/env node
/**
 * Slice-4 fix (root cause 9 + 10): the v1 patch inserted the protocolEvidence
 * declarations BEFORE `const bundleId` — which sits AFTER the limitations
 * array literal, so `...protocolLimitationLines` used the variable before its
 * declaration (tsc TS2448/TS2454; ci `Build backend dist` red in ~40s).
 * The first version of THIS script never moved anything: its idempotence
 * guard compared offsets backwards (`i > k` skips exactly when the block sits
 * BELOW the limitations array — the broken state — while "fixing" trees that
 * were already fine). This version inverts the guard and asserts the final
 * declaration-before-use order before writing.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const EXPORT = 'src/pipeline/stages/export.ts';
const fail = (msg) => {
  console.error(`[surgery:protocol-export-fix] ${msg}`);
  process.exit(1);
};
const countOf = (src, needle) => src.split(needle).length - 1;

let ex = readFileSync(EXPORT, 'utf8');
const START = '    // Slice-4 protocol evidence: content-address the frozen spec and the ledger; the';
const END = "    const bundleId = newId('bnd');";
const LIM = '    const limitations = [';

if (countOf(ex, START) !== 1) fail(`block start marker matched ${countOf(ex, START)} times (need exactly 1)`);
if (countOf(ex, END) !== 1) fail(`bundleId anchor matched ${countOf(ex, END)} times (need exactly 1)`);
if (countOf(ex, LIM) !== 1) fail(`limitations anchor matched ${countOf(ex, LIM)} times (need exactly 1)`);

const i = ex.indexOf(START);
const j = ex.indexOf(END);
const k = ex.indexOf(LIM);

// block start offset BELOW the limitations offset in the file == declaration
// after use == broken. Already-fixed means block ABOVE limitations (i < k).
if (i < k) {
  console.log('[surgery:protocol-export-fix] declaration block already sits above the limitations array — nothing to do');
  process.exit(0);
}
if (j < i) fail('bundleId anchor found before the block start — unexpected file shape, refusing to patch');
if (k > i) fail('limitations anchor found inside the to-be-moved block — refusing to patch');

const block = ex.slice(i, j);
ex = ex.slice(0, i) + ex.slice(j);
const k2 = ex.indexOf(LIM);
if (k2 === -1) fail('limitations anchor vanished after removal — refusing to write');
ex = ex.slice(0, k2) + block + ex.slice(k2);

const i2 = ex.indexOf(START);
const j2 = ex.indexOf(END);
const k2b = ex.indexOf(LIM);
if (!(i2 < k2b && k2b < j2)) fail(`post-move order assertion failed (block=${i2}, limitations=${k2b}, bundleId=${j2}) — refusing to write`);
if (countOf(ex, START) !== 1 || countOf(ex, block.slice(0, 80)) !== 1) fail('post-move uniqueness assertion failed — refusing to write');

writeFileSync(EXPORT, ex);
console.log('[surgery:protocol-export-fix] declaration block moved above the limitations array (root cause 9 fixed; guard inversion root cause 10 fixed)');
