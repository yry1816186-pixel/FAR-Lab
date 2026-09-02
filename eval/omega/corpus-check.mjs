#!/usr/bin/env node
/**
 * Ω-ULTRA benchmark corpus integrity checker (OMEGA-ULTRA-CONTRACT.md P9).
 *
 * Companion to threeway.mjs (leg driver, owned separately): this file validates the
 * 18-dimension corpus + Golden Journeys + deterministic gold, offline, zero network.
 *
 *   node eval/omega/corpus-check.mjs check               full integrity check (exit 1 on any error)
 *   node eval/omega/corpus-check.mjs list [--dimension d] [--status s]
 *
 * Deterministic gold is re-derived from eval/omega/reference/*.mjs at check time —
 * gold must be reproducible from code, never merely asserted (W4 anti-inflation rule).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

const argv = process.argv.slice(2);
const cmd = argv[0] ?? 'check';
const arg = (name) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : undefined; };

const loadJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

// Canonical dimension list = the 18 categories verbatim from OMEGA-ULTRA-CONTRACT.md P9.
const DIMENSIONS = ['known-answer', 'open-ended', 'conflicting-literature', 'scarce-evidence', 'false-premise', 'causal-inference', 'mathematical-reasoning', 'hypothesis-novelty', 'falsification', 'experiment-design', 'dataset-analysis', 'code-execution', 'replication', 'cross-domain-transfer', 'negative-results', 'scientific-traps', 'tool-failures', 'long-horizon'];
const DIFFICULTIES = new Set(['easy', 'normal', 'hard', 'adversarial']);
const STATUSES = new Set(['ready', 'draft', 'sealed']);
const KINDS = new Set(['research_question', 'math', 'code', 'design', 'dataset', 'trap', 'system_probe', 'protocol']);
const METHODS = new Set(['w4-protocol', 'honesty-gate', 'rediscovery-gt', 'sealed-unseal', 'judge-rubric', 'behavioral-gate', 'deterministic-gold', 'reference-impl', 'scenario-driver', 'protocol-spec']);
const NAKED_LEGS = new Set(['supported', 'declared', false]);
const CURRENT_LEGS = new Set(['research-start', 'probe-suite', 'declared', false]);

const validate = () => {
  const errors = [];
  let corpus;
  try {
    corpus = loadJson(resolve(HERE, 'corpus.json'));
  } catch (e) {
    return { errors: [`corpus.json unparseable: ${e.message}`], corpus: null };
  }
  const dimSet = new Set(corpus.dimensions ?? []);
  for (const d of DIMENSIONS) if (!dimSet.has(d)) errors.push(`dimensions list missing canonical category '${d}'`);
  for (const d of corpus.dimensions ?? []) if (!DIMENSIONS.includes(d)) errors.push(`dimensions list has non-canonical category '${d}'`);

  const seen = new Set();
  const byDim = {};
  for (const e of corpus.entries ?? []) {
    const where = e.id ?? '<no id>';
    if (!e.id || !/^OM-[A-Z0-9]+-[0-9]{2}$/.test(e.id)) errors.push(`${where}: id must match OM-<DIM>-<NN>`);
    if (seen.has(e.id)) errors.push(`${e.id}: duplicate id`);
    seen.add(e.id);
    if (!dimSet.has(e.dimension)) errors.push(`${where}: unknown dimension '${e.dimension}'`);
    if (!DIFFICULTIES.has(e.difficulty)) errors.push(`${where}: difficulty must be easy|normal|hard|adversarial`);
    if (!STATUSES.has(e.status)) errors.push(`${where}: status must be ready|draft|sealed`);
    if (!e.origin) errors.push(`${where}: origin missing`);
    if (!KINDS.has(e.task?.kind)) errors.push(`${where}: task.kind invalid`);
    if (!METHODS.has(e.evaluation?.method)) errors.push(`${where}: evaluation.method invalid`);
    if (typeof e.evaluation?.protocol !== 'string' || e.evaluation.protocol.length < 10) errors.push(`${where}: evaluation.protocol must describe the protocol`);
    const legs = e.legs ?? {};
    if (!NAKED_LEGS.has(legs.naked)) errors.push(`${where}: legs.naked must be supported|declared|false`);
    if (!CURRENT_LEGS.has(legs.current)) errors.push(`${where}: legs.current must be research-start|probe-suite|declared|false`);
    if (legs.rebuilt !== 'reserved') errors.push(`${where}: legs.rebuilt must be 'reserved'`);
    if (e.status === 'ready' && e.evaluation?.method === 'judge-rubric') errors.push(`${where}: judge-rubric cannot be 'ready' before judge calibration`);
    // non-research_question kinds must carry their own prompt or declared inputs
    if (e.task?.kind !== 'research_question' && !e.task?.prompt && !(e.task?.inputs?.length)) errors.push(`${where}: non-research_question kinds need a prompt or inputs`);
    byDim[e.dimension] = (byDim[e.dimension] ?? 0) + 1;

    if (typeof e.origin === 'string' && e.origin.startsWith('import:')) {
      const rest = e.origin.slice('import:'.length);
      const hash = rest.indexOf('#');
      const head = hash >= 0 ? rest.slice(0, hash) : rest; // "path prose..." | "path"
      const rel = head.trim().split(/\s+/)[0]; // machine target = first whitespace-delimited token
      const id = hash >= 0 ? rest.slice(hash + 1).split(' ')[0] : null;
      const path = resolve(ROOT, rel);
      if (!existsSync(path)) errors.push(`${where}: import target missing on disk: ${rel}`);
      else if (id && rel.endsWith('.json')) {
        try {
          const list = loadJson(path).problems;
          if (!Array.isArray(list) || !list.some((p) => p.id === id)) errors.push(`${where}: import id '${id}' not found in ${rel}`);
        } catch {
          errors.push(`${where}: import target unparseable: ${rel}`);
        }
      }
      // .mjs task-file imports (rediscovery): verify the task id string appears in the file
      if (id && rel.endsWith('.mjs') && existsSync(path)) {
        if (!readFileSync(path, 'utf8').includes(`id: '${id}'`)) errors.push(`${where}: task id '${id}' not found in ${rel}`);
      }
    }
    for (const inp of e.task?.inputs ?? []) {
      if (inp.ref && !existsSync(resolve(ROOT, inp.ref.split('#')[0]))) errors.push(`${where}: input ref missing: ${inp.ref}`);
    }
  }
  for (const d of DIMENSIONS) if (!byDim[d]) errors.push(`coverage: dimension '${d}' has no entry`);
  return { errors, corpus, byDim };
};

const near = (a, b, t) => Math.abs(a - b) <= t;

const verifyGold = (corpus, errors) => {
  // OM-CE-01: re-execute the reference implementation and compare to frozen gold.
  const ce = corpus.entries.find((e) => e.id === 'OM-CE-01');
  if (!ce) { errors.push('gold: OM-CE-01 missing'); return; }
  const ref = resolve(HERE, 'reference/permutation-exact.mjs');
  if (!existsSync(ref)) { errors.push('gold: reference/permutation-exact.mjs missing'); return; }
  const res = spawnSync(process.execPath, [ref], { encoding: 'utf8' });
  if (res.status !== 0) { errors.push(`gold: reference impl exited ${res.status}: ${(res.stderr || '').slice(0, 300)}`); return; }
  let out;
  try { out = JSON.parse(res.stdout); } catch { errors.push('gold: reference impl stdout is not JSON'); return; }
  const g = ce.evaluation.gold;
  if (!near(out.meanA, g.meanA, g.tolerance.means)) errors.push(`gold: meanA ${out.meanA} != ${g.meanA}`);
  if (!near(out.meanB, g.meanB, g.tolerance.means)) errors.push(`gold: meanB ${out.meanB} != ${g.meanB}`);
  if (!near(out.sdA, g.sdA, g.tolerance.sds)) errors.push(`gold: sdA ${out.sdA} != ${g.sdA}`);
  if (!near(out.sdB, g.sdB, g.tolerance.sds)) errors.push(`gold: sdB ${out.sdB} != ${g.sdB}`);
  if (!near(out.obsDiff, g.obsDiff, g.tolerance.means)) errors.push(`gold: obsDiff ${out.obsDiff} != ${g.obsDiff}`);
  if (out.permutations !== g.permutations) errors.push(`gold: permutations ${out.permutations} != ${g.permutations}`);
  if (!(out.pExact >= g.pExactRange[0] && out.pExact <= g.pExactRange[1])) errors.push(`gold: pExact ${out.pExact} outside ${g.pExactRange}`);
  if (out.ge < 1) errors.push('gold: ge < 1 (observed arrangement must count itself)');

  // OM-MR-01: independent arithmetic re-derivation.
  const mr = corpus.entries.find((e) => e.id === 'OM-MR-01');
  if (!mr) errors.push('gold: OM-MR-01 missing');
  else {
    const mg = mr.evaluation.gold;
    const aVal = Math.exp(-2.8);
    const relSe = (Math.SQRT2 * 0.05 / 7) / 0.35 * 100;
    if (!near(aVal, mg.a_value_3sf, mg.tolerance.a_value_3sf)) errors.push(`gold: OM-MR-01 exp(-2.8)=${aVal.toFixed(6)} vs frozen ${mg.a_value_3sf}`);
    if (!near(relSe, mg.b_relative_se_pct, mg.tolerance.b_relative_se_pct)) errors.push(`gold: OM-MR-01 relSE=${relSe.toFixed(3)}% vs frozen ${mg.b_relative_se_pct}%`);
  }
};

const verifyJourneys = (errors) => {
  let j;
  try { j = loadJson(resolve(HERE, 'journeys.json')); } catch (e) { errors.push(`journeys.json unparseable: ${e.message}`); return; }
  const ids = new Set();
  for (const t of j.journeys ?? []) {
    ids.add(t.id);
    if (!['automated', 'partial', 'planned'].includes(t.status)) errors.push(`journey ${t.id}: bad status '${t.status}'`);
    if (!t.definition || !t.name) errors.push(`journey ${t.id}: name/definition missing`);
    for (const m of t.mapping ?? []) {
      if (!existsSync(resolve(ROOT, m.asset.split('#')[0]))) errors.push(`journey ${t.id}: asset missing: ${m.asset}`);
    }
    for (const c of t.commands ?? []) {
      if (!c.cmd || !Array.isArray(c.args) || !Array.isArray(c.args)) errors.push(`journey ${t.id}: malformed command`);
      else if (!existsSync(resolve(ROOT, c.cwd))) errors.push(`journey ${t.id}: cwd missing: ${c.cwd}`);
    }
    if (t.status !== 'automated' && !t.gap) errors.push(`journey ${t.id}: non-automated journey must declare gap`);
    if (t.status === 'automated' && t.gap) errors.push(`journey ${t.id}: automated journey should not declare a blocking gap`);
  }
  for (const need of ['A', 'B', 'C', 'D']) if (!ids.has(need)) errors.push(`journeys: Golden Journey ${need} missing`);
};

if (cmd === 'list') {
  const { errors, corpus } = validate();
  if (errors.length) { console.error('corpus invalid:\n' + errors.map((e) => '  - ' + e).join('\n')); process.exit(1); }
  const dimF = arg('--dimension');
  const stF = arg('--status');
  const rows = corpus.entries.filter((e) => (!dimF || e.dimension === dimF) && (!stF || e.status === stF));
  for (const e of rows) {
    console.log(`${e.id}  ${e.dimension.padEnd(22)} ${e.difficulty.padEnd(12)} ${e.status.padEnd(7)} naked=${String(e.legs.naked).padEnd(9)} current=${String(e.legs.current).padEnd(13)} ${e.origin.slice(0, 72)}`);
  }
  console.log(`-- ${rows.length}/${corpus.entries.length} entries`);
  process.exit(0);
}

if (cmd === 'check') {
  const { errors, corpus, byDim } = validate();
  if (corpus) verifyGold(corpus, errors);
  verifyJourneys(errors);
  if (errors.length) {
    console.error(`CORPUS CHECK FAILED (${errors.length}):`);
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }
  const counts = {};
  for (const e of corpus.entries) counts[e.status] = (counts[e.status] ?? 0) + 1;
  const dimLine = DIMENSIONS.map((d) => `${d}:${byDim[d] ?? 0}`).join(' ');
  console.log('CORPUS CHECK PASS');
  console.log(`  corpus: ${corpus.entries.length} entries / 18/18 dimensions / status ${JSON.stringify(counts)}`);
  console.log(`  per-dimension: ${dimLine}`);
  console.log('  deterministic gold: OM-CE-01 reference impl re-executed & matches frozen gold; OM-MR-01 arithmetic re-derived');
  console.log('  journeys: A-D present, every mapped asset exists on disk, gaps declared honestly');
  process.exit(0);
}

console.error('usage: corpus-check.mjs check | list [--dimension d] [--status s]');
process.exit(2);
