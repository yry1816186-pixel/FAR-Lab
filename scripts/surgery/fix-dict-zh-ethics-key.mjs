#!/usr/bin/env node
/**
 * One-shot anchored fix, v2 (slice 2 iteration, 2026-08-29). v1 required
 * en-minus-zh to be exactly [map.protocol.ethicsApprovalBody]; #20's
 * apply-log proved the extractor sees a second key, feedback.intro, that
 * tsc does NOT flag (exactly one TS2353 on the f54316a tree) — zh carries
 * it in a form the two-space-quoted-key regex cannot see. v2 inserts the
 * missing protocol key whenever it appears in missingInZh, dumps every
 * zh-segment line mentioning 'feedback' verbatim (JSON-escaped) into the
 * log for the record, still fails loudly on zh-minus-en drift (the
 * type-breaking direction), and never touches the en block.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const DICT = 'web/src/i18n/dict.ts';
const KEY = 'map.protocol.ethicsApprovalBody';
const src = readFileSync(DICT, 'utf8');

const zhOpenAt = src.search(/^export const zh\b.*\{\s*$/m);
const enOpenAt = src.search(/^export const en\b.*\{\s*$/m);
if (zhOpenAt < 0 || enOpenAt < 0 || enOpenAt <= zhOpenAt) {
  console.error('[surgery:dict-fix] zh/en object openers not found in expected order');
  process.exit(1);
}
const enCloseAt = src.indexOf('\n};', enOpenAt);
if (enCloseAt < 0) {
  console.error('[surgery:dict-fix] en object closer not found');
  process.exit(1);
}
const zhSeg = src.slice(zhOpenAt, enOpenAt);
const enSeg = src.slice(enOpenAt, enCloseAt);
const keysOf = (seg) => {
  const set = new Set();
  for (const m of seg.matchAll(/^ {2}'([a-zA-Z0-9_.]+)':/gm)) set.add(m[1]);
  return set;
};
const zhKeys = keysOf(zhSeg);
const enKeys = keysOf(enSeg);
const missingInZh = [...enKeys].filter((k) => !zhKeys.has(k));
const missingInEn = [...zhKeys].filter((k) => !enKeys.has(k));

// Evidence: dump every zh-segment line mentioning 'feedback' verbatim so
// the tree record shows how zh carries keys the extractor cannot parse
// (tsc is the semantic authority; this closes the extractor-vs-compiler gap).
for (const l of zhSeg.split('\n')) {
  if (/feedback/i.test(l)) console.log('[surgery:dict-fix] zh feedback line: ' + JSON.stringify(l));
}

if (missingInEn.length !== 0) {
  console.error(`[surgery:dict-fix] zh has keys missing from en: ${JSON.stringify(missingInEn)}`);
  process.exit(1);
}
if (missingInZh.length > 0 && !missingInZh.includes(KEY)) {
  console.error(`[surgery:dict-fix] unexpected drift: en-minus-zh = ${JSON.stringify(missingInZh)} and the protocol key is not among it`);
  process.exit(1);
}
if (zhKeys.has(KEY)) {
  console.log('[surgery:dict-fix] zh already has the key — nothing to do');
} else {
  const L = zhSeg.split('\n');
  const hits = L.map((l, i) => (/^ {2}'map\.protocol\./.test(l) ? i : -1)).filter((i) => i >= 0);
  if (hits.length < 1) {
    console.error('[surgery:dict-fix] no map.protocol.* key line found in the zh block');
    process.exit(1);
  }
  L.splice(hits[0] + 1, 0, `  '${KEY}': '审批机构',`);
  writeFileSync(DICT, src.slice(0, zhOpenAt) + L.join('\n') + src.slice(enOpenAt));
  console.log('[surgery:dict-fix] added zh key map.protocol.ethicsApprovalBody (审批机构)');
}
const residual = missingInZh.filter((k) => k !== KEY);
if (residual.length > 0) {
  console.log(`[surgery:dict-fix] residual extractor-visible drift (logged, not fatal — tsc reports no error for it): ${JSON.stringify(residual)}`);
}
console.log('[surgery:dict-fix] done');
