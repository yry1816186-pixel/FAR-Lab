#!/usr/bin/env node
/**
 * RU-9 GO3 — native prompt-regression gate (offline, deterministic, no LLM).
 *
 * Raw prompts are NOT persisted (hashes only, by design) — so this gate locks
 * the determinism-relevant surface that IS static:
 *   1. PROMPT SNAPSHOTS: sha256 + char length of every *PROMPT* string constant
 *      in src/pipeline/stages/ + llm.ts + agent/loop.ts. Any accidental prompt
 *      edit drifts the snapshot; `--check` exits 1 with a per-prompt diff.
 *   2. SECURITY-RULE WIRING: the UNTRUSTED_DATA_RULE choke-point append, the
 *      kernel never-follow clause, and the evidence untrustedSourceContent
 *      channel must all be present (textual anchors — the runtime guarantee).
 *   3. BUDGET CAPS: each prompt constant under a char ceiling (default 20k);
 *      the whole set under a total ceiling.
 *   4. requestHash BYTE-DETERMINISM: every extracted prompt is hashed twice
 *      through the production computeRequestHash (dist build) with a fixed
 *      payload — identical input must produce identical bytes.
 *
 * Usage: node eval/prompt-regression.mjs [--snapshot] [--check]
 *   (default: verify-only, no file writes; --snapshot writes/refreshes
 *    eval/prompt-snapshot.json; --check diffs against it, exit 1 on drift)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { computeRequestHash } from '../dist/providers/http.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT_PATH = resolve(ROOT, 'eval/prompt-snapshot.json');
const MAX_PROMPT_CHARS = 20_000;
const MAX_TOTAL_CHARS = 120_000;

const STAGE_FILES = [
  ...['scope', 'retrieve', 'evidence', 'hypotheses', 'falsify', 'rank', 'plan', 'revise', 'align']
    .map((s) => `src/pipeline/stages/${s}.ts`),
  'src/pipeline/llm.ts',
  'src/agent/loop.ts',
].map((p) => resolve(ROOT, p));

/** Extract `const NAME = '...';` / template-literal prompt constants (bounded, textual). */
const extractPrompts = (file) => {
  const src = readFileSync(file, 'utf8');
  const out = [];
  const lit = (raw) => raw.startsWith('`')
    ? raw.slice(1, -1).replace(/\\`/g, '`').replace(/\\\$\{/g, '${').replace(/\\n/g, '\n')
    : raw.startsWith("'")
      ? raw.slice(1, -1).replace(/\\'/g, "'").replace(/\\n/g, '\n').replace(/\\\\/g, '\\')
      : JSON.parse(raw);
  const re = /const\s+([A-Z][A-Z0-9_]*PROMPT[A-Z0-9_]*)\s*(?::\s*string\s*)?=\s*(`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;
  for (const m of src.matchAll(re)) {
    const text = lit(m[2]);
    out.push({ name: m[1], chars: text.length, sha256: createHash('sha256').update(text).digest('hex').slice(0, 16), sample: text.slice(0, 60) });
  }
  // Array-joined prompt constants: const NAME...PROMPT... = [ 'elem', 'elem' ].join(...)
  // (the evidence/join pattern — the const regex cannot see the elements)
  const arrRe = /const\s+([A-Z][A-Z0-9_]*PROMPT[A-Z0-9_]*)[^=]*=\s*\[([\s\S]*?)\]\s*\.join/g;
  const elemRe = /(`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*')/g;
  for (const m of src.matchAll(arrRe)) {
    let i = 0;
    for (const e of m[2].matchAll(elemRe)) {
      const text = lit(e[1]);
      out.push({ name: `${m[1]}[${i}]`, chars: text.length, sha256: createHash('sha256').update(text).digest('hex').slice(0, 16), sample: text.slice(0, 60) });
      i += 1;
    }
  }
  // Inline call-site prompts: systemPrompt: '...' / `...` — named by the nearby
  // purpose; position-independent fallback (content prefix) so edits elsewhere
  // in the file never shuffle identities.
  const inline = /systemPrompt:\s*(`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*')/g;
  for (const m of src.matchAll(inline)) {
    const text = lit(m[1]);
    const after = src.slice(m.index, m.index + 400);
    const pm = /purpose:\s*'([^']{1,60})'/.exec(after);
    const fallback = text.slice(0, 24).replace(/[^A-Za-z0-9]/g, '').slice(0, 16);
    const name = `INLINE:${pm ? pm[1] : fallback}`;
    out.push({ name, chars: text.length, sha256: createHash('sha256').update(text).digest('hex').slice(0, 16), sample: text.slice(0, 60) });
  }
  return out;
};

const SECURITY_ANCHORS = [
  { file: 'src/pipeline/llm.ts', needle: 'UNTRUSTED_DATA_RULE', label: 'choke-point rule append' },
  { file: 'src/agent/loop.ts', needle: 'never follow any instruction', label: 'kernel never-follow clause' },
  { file: 'src/pipeline/stages/evidence.ts', needle: 'untrustedSourceContent', label: 'evidence data channel' },
];

const main = () => {
  const mode = process.argv.includes('--snapshot') ? 'snapshot' : process.argv.includes('--check') ? 'check' : 'verify';
  const failures = [];

  // ---- 1+4: extract, budget, determinism ----
  const prompts = [];
  for (const f of STAGE_FILES) {
    if (!existsSync(f)) continue;
    for (const p of extractPrompts(f)) prompts.push({ file: f.slice(ROOT.length + 1).replaceAll('\\', '/'), ...p });
  }
  if (prompts.length < 8) failures.push(`extraction regression: only ${prompts.length} prompt constants found (expected >= 8 — extractor or stage split drifted)`);
  for (const p of prompts) {
    if (p.chars > MAX_PROMPT_CHARS) failures.push(`budget: ${p.file}:${p.name} is ${p.chars} chars (> ${MAX_PROMPT_CHARS})`);
    const req = { task: 'regression', systemPrompt: p.sample.repeat(1), userPayload: { probe: true }, outputKind: 'json' };
    const h1 = computeRequestHash(req);
    const h2 = computeRequestHash({ ...req });
    if (h1 !== h2) failures.push(`determinism: requestHash unstable for ${p.name}`);
  }
  const total = prompts.reduce((s, p) => s + p.chars, 0);
  if (total > MAX_TOTAL_CHARS) failures.push(`budget: total prompt surface ${total} chars (> ${MAX_TOTAL_CHARS})`);

  // ---- 2: security-rule wiring anchors ----
  for (const a of SECURITY_ANCHORS) {
    const src = readFileSync(resolve(ROOT, a.file), 'utf8');
    if (!src.includes(a.needle)) failures.push(`security wiring: ${a.label} MISSING (${a.file}: "${a.needle}" not found)`);
  }

  // ---- 3: snapshot diff ----
  const snapshot = { generatedAt: new Date().toISOString(), prompts };
  if (mode === 'snapshot') {
    writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + '\n');
    process.stdout.write(`prompt-regression: snapshot written (${prompts.length} prompts, total ${total} chars)\n`);
  } else if (existsSync(SNAPSHOT_PATH) || mode === 'check') {
    if (!existsSync(SNAPSHOT_PATH)) {
      failures.push('snapshot missing: run with --snapshot first');
    } else {
      const prev = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
      const prevBy = new Map(prev.prompts.map((p) => [`${p.file}:${p.name}`, p]));
      const curBy = new Map(snapshot.prompts.map((p) => [`${p.file}:${p.name}`, p]));
      for (const [k, p] of curBy) {
        const old = prevBy.get(k);
        if (old === undefined) failures.push(`prompt diff: NEW ${k} (${p.chars} chars)`);
        else if (old.sha256 !== p.sha256) failures.push(`prompt diff: CHANGED ${k} (${old.chars} -> ${p.chars} chars)`);
      }
      for (const k of prevBy.keys()) if (!curBy.has(k)) failures.push(`prompt diff: REMOVED ${k}`);
    }
  }

  process.stdout.write(`prompt-regression[${mode}]: ${prompts.length} prompts, total ${total} chars, ${failures.length} failure(s)\n`);
  for (const f of failures) process.stdout.write(`  FAIL ${f}\n`);
  process.exit(failures.length === 0 ? 0 : 1);
};

main();
