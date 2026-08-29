#!/usr/bin/env node
/**
 * One-shot anchored fix (slice 2 iteration, 2026-08-29): the committed
 * dict.ts carries 'map.protocol.ethicsApprovalBody' in the EN object only —
 * zh lacks it, so DictKey (= keyof typeof zh) misses the key and
 * `web npm run build` fails with TS2353 (dict.ts en literal, line ~1777) +
 * TS2345 (ProtocolPanel.tsx t() call, line ~168). Root typecheck/lint/
 * vitest never compile web sources, which is why the base diagnose stayed
 * green while ci failed. Adds the missing zh key and asserts the zh/en key
 * sets are otherwise identical (fail-loud on any further drift).
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

if (zhKeys.has(KEY)) {
  console.log('[surgery:dict-fix] zh already has the key — nothing to do');
} else {
  if (missingInZh.length !== 1 || missingInZh[0] !== KEY) {
    console.error(`[surgery:dict-fix] unexpected drift: en-minus-zh = ${JSON.stringify(missingInZh)}, zh-minus-en = ${JSON.stringify(missingInEn)}`);
    process.exit(1);
  }
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
if (missingInEn.length !== 0) {
  console.error(`[surgery:dict-fix] zh has keys missing from en: ${JSON.stringify(missingInEn)}`);
  process.exit(1);
}
console.log('[surgery:dict-fix] zh/en key sets verified identical (post-fix)');
