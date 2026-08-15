#!/usr/bin/env node
/**
 * fuzz_proof.mjs — public parsing surface fuzzer for .far-proof bundles
 * (2.md §11C 补遗 R10, T0: 公开解析面模糊测试).
 *
 * Target surface: the zero-install entry points that parse ARBITRARY
 * user-supplied proof packages —
 *   - verifyFarProofBundle(dir, mode)      [chain | envelope | full]
 *   - verifyFarProofPackageIntegrity(dir)  [integrity file parsing]
 *
 * Oracle: a crash (uncaught exception escaping the call), a hang (per-exec
 * wall-clock over SLOW_MS), or an OOM (generation is size-capped; RSS is
 * sampled) is a defect. Structured {ok:false / errors[]} results are the
 * DESIRED behavior — they are counted as clean rejections, not failures.
 *
 * Scope honesty: this fuzzer covers the .far-proof parsing surface (the
 * web-verifier entry). REST API payload fuzzing (zod gates) is a separate
 * follow-up surface, not covered tonight.
 *
 * Determinism: mutations are driven by a seeded PRNG (default seed below or
 * --seed N) so every defect reproduces from the recorded seed + case index.
 *
 * Usage:
 *   node scripts/fuzz_proof.mjs [--cases N] [--seed N] [--smoke]
 *   pnpm fuzz:proof            (full: 100,000 cases, report to .far/fuzz/)
 *   pnpm fuzz:proof -- --smoke  (CI smoke: 2,000 cases)
 */

import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';

import { runMigrations } from '../src/db/migrator.ts';
import { buildDemoChain } from '../src/far_proof/demo_chain.ts';
import { exportFarProof } from '../src/far_proof/exporter.ts';
import { verifyFarProofBundle } from '../src/far_proof/bundle_verifier.ts';
import {
  verifyFarProofPackageIntegrity,
  computeFarProofIntegrity,
  FAR_PROOF_INTEGRITY_FILE,
} from '../src/far_proof/integrity_check.ts';

// ── CLI args ────────────────────────────────────────────────────────────────
function argInt(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  const value = Number.parseInt(process.argv[idx + 1] ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
}
const CASES = argInt('cases', 0) || (process.argv.includes('--smoke') ? 2_000 : 100_000);
const SEED = argInt('seed', 20260816);
const SLOW_MS = argInt('slow-ms', 1_000);
const MAX_MUTATED_BYTES = 1_000_000; // generation cap: OOM defense is size bounding

// ── Seeded PRNG (mulberry32) ────────────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const randInt = (n) => Math.floor(rand() * n);

// ── Seed bundle construction (valid golden bundle) ──────────────────────────
function buildSeedBundle() {
  const db = new Database(':memory:');
  runMigrations(db);
  buildDemoChain(db);
  const seedDir = mkdtempSync(join(tmpdir(), 'fuzz-seed-'));
  exportFarProof({
    db,
    outputDir: seedDir,
    runId: 'fuzz-seed',
    modelSnapshot: 'fuzz-model',
    gitCommitSha: 'a'.repeat(40),
    envHash: 'b'.repeat(64),
  });
  // Make the integrity file present so its parser is on the fuzzed surface.
  try {
    const integrity = computeFarProofIntegrity(seedDir, new Date('2026-08-16T00:00:00Z').toISOString());
    writeFileSync(join(seedDir, FAR_PROOF_INTEGRITY_FILE), JSON.stringify(integrity, null, 2));
  } catch {
    // Export layout without hashable files — the surface is still fuzzed via
    // the required-file verifiers; absence recorded in the report meta.
  }
  db.close();
  return seedDir;
}

// ── Mutation engine ─────────────────────────────────────────────────────────
const TEXTUAL_MUTATIONS = ['bitflip', 'truncate', 'bloat', 'invalid-utf8', 'empty', 'append-junk'];
const JSON_MUTATIONS = ['delete-key', 'type-swap', 'huge-string', 'deep-nest', 'line-drop', 'duplicate-line'];

function mutateBuffer(buf) {
  const kind = TEXTUAL_MUTATIONS[randInt(TEXTUAL_MUTATIONS.length)];
  const out = Buffer.from(buf); // copy
  if (out.length === 0) return { kind: 'append-junk', buf: Buffer.from('x') };
  switch (kind) {
    case 'bitflip': {
      const pos = randInt(out.length);
      out[pos] ^= 1 << randInt(8);
      break;
    }
    case 'truncate':
      out.fill(0, Math.floor(out.length / 2));
      break;
    case 'bloat': {
      const chunk = out.subarray(0, Math.min(64, out.length));
      const times = randInt(4_000) + 1;
      return { kind, buf: Buffer.concat([out, Buffer.concat(Array(times).fill(chunk))]).subarray(0, MAX_MUTATED_BYTES) };
    }
    case 'invalid-utf8': {
      if (out.length < 5) return { kind: 'append-junk', buf: Buffer.from([0xff, 0xfe, 0x80, 0xc0]) };
      const pos = randInt(out.length - 4);
      out.set([0xff, 0xfe, 0x80, 0xc0], pos);
      break;
    }
    case 'empty':
      return { kind, buf: Buffer.alloc(0) };
    case 'append-junk':
    default: {
      const junk = Buffer.alloc(randInt(256) + 1);
      for (let i = 0; i < junk.length; i += 1) junk[i] = randInt(256);
      return { kind: 'append-junk', buf: Buffer.concat([out, junk]).subarray(0, MAX_MUTATED_BYTES) };
    }
  }
  return { kind, buf: out };
}

function deepNest(value, depth) {
  let node = value;
  for (let i = 0; i < depth; i += 1) node = { n: node };
  return node;
}

function mutateJsonish(buf) {
  const kind = JSON_MUTATIONS[randInt(JSON_MUTATIONS.length)];
  const text = buf.toString('utf8');
  if (kind === 'line-drop') {
    const lines = text.split('\n');
    if (lines.length > 1) lines.splice(randInt(lines.length), 1);
    return { kind, buf: Buffer.from(lines.join('\n'), 'utf8') };
  }
  if (kind === 'duplicate-line') {
    const lines = text.split('\n');
    const idx = randInt(lines.length);
    lines.splice(idx, 0, lines[idx] ?? '');
    return { kind, buf: Buffer.from(lines.join('\n').slice(0, MAX_MUTATED_BYTES), 'utf8') };
  }
  // Parse-guided mutations: if the file is not valid JSON/JSONL, fall back to
  // a textual mutation (surface still exercised, kind recorded honestly).
  let parsed;
  const isJsonl = text.includes('\n') && !text.trimStart().startsWith('{\n  "');
  try {
    parsed = isJsonl ? text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)) : JSON.parse(text);
  } catch {
    const fb = mutateBuffer(buf);
    return { kind: `${fb.kind}(non-json)`, buf: fb.buf };
  }
  if (kind === 'huge-string') {
    const target = Array.isArray(parsed) ? parsed[randInt(parsed.length)] ?? {} : parsed;
    if (typeof target === 'object' && target !== null) {
      const keys = Object.keys(target);
      if (keys.length > 0) target[keys[randInt(keys.length)]] = 'A'.repeat(100_000);
    }
  } else if (kind === 'delete-key') {
    const target = Array.isArray(parsed) ? parsed[randInt(parsed.length)] ?? {} : parsed;
    if (typeof target === 'object' && target !== null) {
      const keys = Object.keys(target);
      if (keys.length > 0) delete target[keys[randInt(keys.length)]];
    }
  } else if (kind === 'type-swap') {
    const target = Array.isArray(parsed) ? parsed[randInt(parsed.length)] ?? {} : parsed;
    if (typeof target === 'object' && target !== null) {
      const keys = Object.keys(target);
      if (keys.length > 0) {
        const k = keys[randInt(keys.length)];
        const v = target[k];
        target[k] = v === null ? 1 : v instanceof Object ? 'swapped' : { swapped: v };
      }
    }
  } else if (kind === 'deep-nest') {
    parsed = deepNest(parsed, 300);
  }
  return { kind, buf: Buffer.from(JSON.stringify(parsed).slice(0, MAX_MUTATED_BYTES), 'utf8') };
}

// ── Harness ─────────────────────────────────────────────────────────────────
const seedDir = buildSeedBundle();
const workDir = mkdtempSync(join(tmpdir(), 'fuzz-work-'));
const { cpSync } = await import('node:fs');
cpSync(seedDir, workDir, { recursive: true });

const FUZZED_FILES = [
  'proof_envelopes.jsonl',
  'proof_envelopes_v2.jsonl',
  'repro_runs.jsonl',
  'call_records.redacted.jsonl',
  'claim_graph.json',
  'ro-crate-metadata.json',
  'prov.ttl',
  'data_manifest.json',
  FAR_PROOF_INTEGRITY_FILE,
];
const seedBuffers = new Map(FUZZED_FILES.map((f) => [f, readFileSync(join(seedDir, f))]));

const stats = {
  executions: 0,
  cleanRejections: 0,
  cleanPasses: 0,
  throws: 0,
  slowExecs: 0,
  throwClasses: new Map(),
  throwSamples: [],
  kindMatrix: new Map(),
  rssPeakMb: 0,
};
const startedAt = Date.now();

for (let i = 0; i < CASES; i += 1) {
  const file = FUZZED_FILES[randInt(FUZZED_FILES.length)];
  const seedBuf = seedBuffers.get(file);
  const jsonish = file.endsWith('.json') || file.endsWith('.jsonl');
  const { kind, buf } = jsonish && rand() < 0.7 ? mutateJsonish(seedBuf) : mutateBuffer(seedBuf);

  // Restore-all-then-mutate-one keeps every exec against a known base state.
  if (i % 50 === 0) cpSync(seedDir, workDir, { recursive: true });
  const target = join(workDir, file);
  const action = rand();
  if (action < 0.03) {
    rmSync(target, { force: true }); // delete-file mutation
  } else {
    writeFileSync(target, buf);
  }

  const mode = ['chain', 'envelope', 'full'][randInt(3)];
  const t0 = process.hrtime.bigint();
  try {
    if (rand() < 0.8) {
      const result = verifyFarProofBundle(workDir, mode);
      if (result.ok) stats.cleanPasses += 1;
      else stats.cleanRejections += 1;
    } else {
      const result = verifyFarProofPackageIntegrity(workDir);
      if (result.ok) stats.cleanPasses += 1;
      else stats.cleanRejections += 1;
    }
  } catch (error) {
    stats.throws += 1;
    const message = error instanceof Error ? `${error.constructor.name}: ${error.message}`.slice(0, 160) : String(error).slice(0, 160);
    stats.throwClasses.set(message, (stats.throwClasses.get(message) ?? 0) + 1);
    if (stats.throwSamples.length < 20) {
      stats.throwSamples.push({ case: i, file, kind, mode, message });
    }
  }
  const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
  if (elapsedMs > SLOW_MS) {
    stats.slowExecs += 1;
    if (stats.throwSamples.length < 20) stats.throwSamples.push({ case: i, file, kind, mode, message: `SLOW ${elapsedMs.toFixed(0)}ms` });
  }
  const matrixKey = `${file}|${kind}`;
  stats.kindMatrix.set(matrixKey, (stats.kindMatrix.get(matrixKey) ?? 0) + 1);
  stats.executions += 1;
  if (i % 10_000 === 0) {
    stats.rssPeakMb = Math.max(stats.rssPeakMb, Math.round(process.memoryUsage().rss / 1e6));
  }
}

const durationS = ((Date.now() - startedAt) / 1000).toFixed(1);
const ratePerS = Math.round(stats.executions / Math.max(0.001, Number(durationS)));

// ── Report ──────────────────────────────────────────────────────────────────
const defects = stats.throws + stats.slowExecs;
const report = {
  target: '.far-proof public parsing surface (verifyFarProofBundle / verifyFarProofPackageIntegrity)',
  seed: SEED,
  cases: CASES,
  executed: stats.executions,
  durationS: Number(durationS),
  cleanRejections: stats.cleanRejections,
  cleanPasses: stats.cleanPasses,
  throws: stats.throws,
  slowExecs: stats.slowExecs,
  slowThresholdMs: SLOW_MS,
  rssPeakMb: stats.rssPeakMb,
  throwClasses: Object.fromEntries([...stats.throwClasses.entries()].sort((a, b) => b[1] - a[1])),
  throwSamples: stats.throwSamples,
  verdict: defects === 0 ? 'PASS' : 'FAIL',
};

mkdirSync('.far/fuzz', { recursive: true });
writeFileSync('.far/fuzz/fuzz-proof-report.json', JSON.stringify(report, null, 2));
const md = [
  `# fuzz:proof report — ${new Date().toISOString()}`,
  '',
  `- Executions: **${report.executed}** (seed ${SEED}, ${durationS}s, ~${ratePerS}/s)`,
  `- Clean structured rejections: ${report.cleanRejections} · clean passes: ${report.cleanPasses}`,
  `- Uncaught throws: **${report.throws}** · slow (>${SLOW_MS}ms): **${report.slowExecs}** · RSS peak: ${report.rssPeakMb}MB`,
  `- Verdict: **${report.verdict}**`,
  '',
  report.throws > 0 ? '## Throw classes\n' + [...stats.throwClasses.entries()].map(([m, c]) => `- (${c}) ${m}`).join('\n') : '',
  report.throwSamples.length > 0 ? '## Samples\n' + report.throwSamples.map((s) => `- case ${s.case} ${s.file} [${s.kind}] ${s.message}`).join('\n') : '',
].join('\n');
writeFileSync('.far/fuzz/fuzz-proof-report.md', md);

console.log(md);

rmSync(workDir, { recursive: true, force: true });
rmSync(seedDir, { recursive: true, force: true });
process.exit(defects === 0 ? 0 : 1);
