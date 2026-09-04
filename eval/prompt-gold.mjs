#!/usr/bin/env node
/**
 * FA-EVAL-03 — per-prompt SEMANTIC gold corpus gate (offline, no LLM).
 *
 * prompt-regression.mjs pins prompt IDENTITY (sha256 drift = alarm). Identity
 * says nothing about MEANING: a version-bumped rewrite can silently drop the
 * instruction that made the call safe or effective. This gate pins, for every
 * extracted prompt, a hand-authored semantic contract:
 *
 *   intent   — one line: what this prompt must accomplish (human-authored)
 *   anchors  — 1..6 substrings that MUST appear verbatim in the prompt text:
 *              the load-bearing phrases (refusals, schema demands, security
 *              clauses, scoring rules). An anchor disappearing = semantic
 *              drift = FAIL, even if --snapshot was invoked with a note.
 *              (Fragments of array-joined prompts may legitimately carry a
 *              single marker — the joined identity is hash-pinned upstream.)
 *
 * Extraction grammar is owned by prompt-regression.mjs (extractPromptsRaw) —
 * this module never re-implements it.
 *
 * Usage:
 *   node eval/prompt-gold.mjs                 # audit: coverage report (exit 0)
 *   node eval/prompt-gold.mjs --check         # CI gate: full coverage + all
 *                                             # anchors present, exit 1 on gap
 *   node eval/prompt-gold.mjs --skeleton      # write missing empty entries to
 *                                             # eval/prompt-gold.json for authoring
 *
 * Gold entries live in eval/prompt-gold.json keyed `<file>::<name>`.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractPromptsRaw, STAGE_FILES } from './prompt-regression.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GOLD_PATH = resolve(ROOT, 'eval/prompt-gold.json');
const CHECK = process.argv.includes('--check');

const prompts = [];
for (const f of STAGE_FILES) {
  if (!existsSync(f)) continue;
  const file = f.slice(ROOT.length + 1).replaceAll('\\', '/');
  for (const p of extractPromptsRaw(f)) prompts.push({ file, name: p.name, text: p.text });
}

const gold = existsSync(GOLD_PATH) ? JSON.parse(readFileSync(GOLD_PATH, 'utf8')) : {};
const failures = [];
let covered = 0;

for (const p of prompts) {
  const key = `${p.file}::${p.name}`;
  const g = gold[key];
  if (g === undefined) { failures.push(`gold MISSING: ${key}`); continue; }
  if (typeof g.intent !== 'string' || g.intent.trim().length < 10) { failures.push(`gold intent too thin: ${key}`); continue; }
  if (!Array.isArray(g.anchors) || g.anchors.length < 1) { failures.push(`gold needs >=1 anchor: ${key}`); continue; }
  covered += 1;
  for (const a of g.anchors) {
    if (!p.text.includes(a)) failures.push(`ANCHOR LOST: ${key} — "${a}" no longer in prompt text (semantic drift)`);
  }
}
// gold entries for prompts that no longer exist = stale entries
const live = new Set(prompts.map((p) => `${p.file}::${p.name}`));
for (const k of Object.keys(gold)) if (!live.has(k)) failures.push(`gold STALE: ${k} has no extracted prompt`);

const mode = CHECK ? 'check' : 'audit';
process.stdout.write(`prompt-gold[${mode}]: ${covered}/${prompts.length} prompts covered, ${failures.length} failure(s)\n`);
for (const f of failures.slice(0, 40)) process.stdout.write(`  FAIL ${f}\n`);
if (failures.length > 40) process.stdout.write(`  … ${failures.length - 40} more\n`);

if (process.argv.includes('--skeleton')) {
  const skeleton = { ...gold };
  for (const p of prompts) {
    const key = `${p.file}::${p.name}`;
    if (skeleton[key] === undefined) skeleton[key] = { intent: '', anchors: [], sample: p.text.slice(0, 60) };
  }
  writeFileSync(GOLD_PATH, JSON.stringify(skeleton, null, 2) + '\n');
  process.stdout.write(`skeleton written: ${GOLD_PATH} (fill intent + anchors)\n`);
}
process.exit(CHECK ? (failures.length === 0 ? 0 : 1) : 0);
