import { readFileSync, writeFileSync } from 'node:fs';
const src = readFileSync('.cache/repos/jsonrepair-upstream-test.ts', 'utf8');
let out = src;

// Attribution header (upstream tests are part of the ISC-licensed repo)
out = `/**
 * UPSTREAM TEST SUITE of jsonrepair 3.15.0 (josdejong/jsonrepair, ISC License,
 * Copyright (c) 2020-2026 by Jos de Jong) — src/index.test.ts, fetched 2026-08-22,
 * with ONLY the imports retargeted to FAR-Lab's EXTRACT port (src/providers/json-repair.ts)
 * and the streaming-implementation sections removed (FAR-Lab ported the regular variant
 * only). Test bodies are UNCHANGED upstream text: this is the strongest oracle — the
 * upstream project's own suite must pass against the port (W7 audit P3-1/P3-4 follow-up).
 */
` + out;

// 1) retarget imports
out = out.replace(
  `import { jsonrepair as jsonRepairRegular } from './index'\nimport { jsonrepairCore } from './streaming/core'\nimport { JSONRepairError } from './utils/JSONRepairError'`,
  `import { describe, expect, test } from 'vitest'\nimport { repairJson as jsonRepairRegular, JsonRepairError as JSONRepairError } from '../src/providers/json-repair.js'`,
);
// the original first line imported vitest pieces; drop the now-duplicate original import
out = out.replace(`import { describe, expect, test } from 'vitest'\nimport { repairJson`, `import { repairJson`);

// 2) implementations: keep only the regular (ported) implementation
out = out.replace(/const implementations = \[[\s\S]*?\n\]/, `const implementations = [\n  { name: 'farlab-EXTRACT-port', jsonrepair: jsonRepairRegular },\n]`);

// 3) remove the streaming wrapper factory (createStreamingRepairWrapper ... up to the implementations const)
out = out.replace(/function createStreamingRepairWrapper\(\)[\s\S]*?\n}\n\n/, '');

// 4) remove the streaming describe block at the end (from 'describe(\'jsonrepair streaming\'' to EOF)
const idx = out.indexOf("describe('jsonrepair streaming'");
if (idx !== -1) out = out.slice(0, idx) + '\n';

writeFileSync('tests/json-repair-upstream.test.ts', out);
// sanity: no leftover streaming refs, no old imports
const bad = [...out.matchAll(/jsonrepairCore|createStreamingRepairWrapper|from '\.\/index'|streaming\/core/g)].map(m => m[0]);
console.log('written tests/json-repair-upstream.test.ts; leftover-refs:', bad.length ? bad.join(',') : 'none', '| lines:', out.split('\n').length);
