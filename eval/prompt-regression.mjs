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
 * Usage: node eval/prompt-regression.mjs [--snapshot [--note "rationale"]] [--check]
 *   (default: verify-only, no file writes; --check diffs against it, exit 1 on drift;
 *    --snapshot merges drift into the snapshot as VERSIONED bumps: a changed prompt
 *    gains version+1, the old hash is archived in entry.history, and a --note
 *    (provenance) is REQUIRED — silent overwrites are refused. FA-EVAL-03 target
 *    "version field" satisfied at the snapshot layer without relocating the 96
 *    inline prompt definitions.)
 */
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
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
  // Platform invariance (CI drift gate): a Windows checkout stores CRLF inside
  // multi-line template literals while Linux/macOS store LF — identical
  // committed prompts would hash differently. Normalize before hashing.
  const normalize = (text) => text.replace(/\r\n/g, '\n');
  const lit = (raw) => raw.startsWith('`')
    ? normalize(raw.slice(1, -1)).replace(/\\`/g, '`').replace(/\\\$\{/g, '${').replace(/\\n/g, '\n')
    : raw.startsWith("'")
      ? normalize(raw.slice(1, -1)).replace(/\\'/g, "'").replace(/\\n/g, '\n').replace(/\\\\/g, '\\')
      : normalize(JSON.parse(raw));
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
  const noteIdx = process.argv.indexOf('--note');
  const note = noteIdx >= 0 && noteIdx + 1 < process.argv.length ? process.argv[noteIdx + 1] : null;
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

  // ---- 3: snapshot diff / versioned merge ----
  /** Normalize pre-versioning entries: version 1, empty history, baseline provenance. */
  const norm = (p) => ({
    ...p,
    version: typeof p.version === 'number' && p.version >= 1 ? p.version : 1,
    provenance: typeof p.provenance === 'string' && p.provenance.length > 0 ? p.provenance : 'pre-versioning baseline (bfba1ee 2026-08-23 / re-anchored 2026-09-03)',
    history: Array.isArray(p.history) ? p.history : [],
  });
  const snapshot = { generatedAt: new Date().toISOString(), prompts };
  // TOCTOU-free snapshot IO: one ENOENT-tolerant read replaces existsSync+read,
  // and writes go temp-then-rename so a concurrent reader never sees a torn file.
  const readSnapshot = () => {
    try {
      return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  };
  const writeSnapshotAtomic = (obj) => {
    const tmp = `${SNAPSHOT_PATH}.tmp`;
    writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
    renameSync(tmp, SNAPSHOT_PATH);
  };
  if (mode === 'snapshot') {
    const prev = readSnapshot();
    if (prev === null) {
      writeSnapshotAtomic({ ...snapshot, prompts: prompts.map((p) => ({ ...p, version: 1, provenance: note ?? 'initial snapshot', history: [] })) });
      process.stdout.write(`prompt-regression: snapshot written (${prompts.length} prompts, total ${total} chars, all v1)\n`);
    } else {
      const prevBy = new Map(prev.prompts.map((p) => [`${p.file}:${p.name}`, norm(p)]));
      const merged = [];
      const removed = Array.isArray(prev.removed) ? [...prev.removed] : [];
      const bumps = [];
      for (const p of prompts) {
        const k = `${p.file}:${p.name}`;
        const old = prevBy.get(k);
        if (old === undefined) {
          merged.push({ ...p, version: 1, provenance: note ?? 'new prompt (unannotated)', history: [] });
          bumps.push(`NEW  ${k} v1`);
        } else if (old.sha256 === p.sha256) {
          merged.push(old); // untouched: version, provenance, history carry forward verbatim
        } else {
          if (note === null) {
            failures.push(`CHANGED ${k} requires --note "<rationale>" for provenance — refusing to overwrite without an auditable version bump`);
            continue;
          }
          merged.push({
            ...p,
            version: old.version + 1,
            provenance: note,
            history: [...old.history, { sha256: old.sha256, chars: old.chars, version: old.version, at: prev.generatedAt ?? null }],
          });
          bumps.push(`BUMP ${k} v${old.version} -> v${old.version + 1}`);
        }
      }
      for (const [k, old] of prevBy) {
        if (!prompts.some((p) => `${p.file}:${p.name}` === k)) {
          removed.push({ ...old, removedAt: snapshot.generatedAt });
          bumps.push(`GONE ${k} (archived to snapshot.removed, v${old.version})`);
        }
      }
      if (failures.length === 0) {
        writeSnapshotAtomic({ ...snapshot, prompts: merged, ...(removed.length > 0 ? { removed } : {}) });
        process.stdout.write(`prompt-regression: snapshot written (${prompts.length} prompts, total ${total} chars)\n`);
        for (const b of bumps) process.stdout.write(`  ${b}\n`);
        if (bumps.length > 0 && note === null) process.stdout.write('  (note: new prompts without --note were annotated as unannotated — rerun with --note to give them provenance)\n');
      }
    }
  } else {
    // original guard was existsSync(...) || mode === 'check': diff whenever the
    // snapshot exists; only --check treats a missing snapshot as a failure.
    const prev = readSnapshot();
    if (prev === null && mode === 'check') {
      failures.push('snapshot missing: run with --snapshot first');
    } else if (prev !== null) {
      const prevBy = new Map(prev.prompts.map((p) => [`${p.file}:${p.name}`, p]));
      const curBy = new Map(snapshot.prompts.map((p) => [`${p.file}:${p.name}`, p]));
      for (const [k, p] of curBy) {
        const old = prevBy.get(k);
        if (old === undefined) failures.push(`prompt diff: NEW ${k} (${p.chars} chars)`);
        else if (old.sha256 !== p.sha256) failures.push(`prompt diff: CHANGED ${k} v${old.version} (${old.chars} -> ${p.chars} chars) — if intentional: --snapshot --note "<rationale>"`);
      }
      for (const k of prevBy.keys()) if (!curBy.has(k)) failures.push(`prompt diff: REMOVED ${k}`);
    }
  }

  process.stdout.write(`prompt-regression[${mode}]: ${prompts.length} prompts, total ${total} chars, ${failures.length} failure(s)\n`);
  for (const f of failures) process.stdout.write(`  FAIL ${f}\n`);
  process.exit(failures.length === 0 ? 0 : 1);
};

main();
