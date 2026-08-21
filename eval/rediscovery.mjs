/**
 * Rediscovery evaluation slice (W-EV2/Wave-3 #3) — FIRE-Bench DESIGN adaptation.
 *
 * Mechanism extracted from the FIRE-Bench paper (arXiv 2602.02905, ICML 2026):
 * ground an agent's output against a PUBLISHED/ESTABLISHED finding via atomic-claim
 * decomposition + set matching (P/R/F1) — objective ground truth, no quality-judge
 * circularity. The official repo has NO LICENSE (code unusable; we implement our own
 * harness) and the HF dataset (Apache-2.0) is unreachable from this environment, so
 * this seed set is AUTHORED IN-REPO from textbook-established findings (disclosed);
 * importing the HF task set is a documented extension once network allows.
 *
 * Scope honesty: FAR-Lab is Direction-A (hypothesis + plan, no experiment execution).
 * The scored artifact is the TOP HYPOTHESIS (statement + mechanism + predictions +
 * falsification expectation) of a real research start run — rediscovery at hypothesis
 * level. NOT comparable to official FIRE-Bench agent scores (full-cycle, executed).
 * Claim decomposition and claim matching are uncalibrated DeepSeek steps; only the
 * ground-truth CONTENT is objective.
 *
 * Usage: node eval/rediscovery.mjs [--skip-runs] [--sample N]
 * Env: DEEPSEEK_API_KEY. Writes eval/results/rediscovery.jsonl (+ -runs.jsonl).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { makeProvider } from './lib.mjs';
import { isRepresentative } from '../dist/pipeline/stages/shared.js';

const RESULTS_DIR = resolve(process.cwd(), 'eval/results');
const OUT = join(RESULTS_DIR, 'rediscovery.jsonl');
const RUNS_FILE = join(RESULTS_DIR, 'rediscovery-runs.jsonl');
const SKIP_RUNS = process.argv.includes('--skip-runs');
const SAMPLE_N = Number(process.env.REDISCOVERY_N ?? 5);

// ---------------------------------------------------------------------------
// seed task set — established findings, authored 2026-08-22 (main agent, from
// textbook-level established science; each rationale states why it is established)
// ---------------------------------------------------------------------------

const TASKS = [
  {
    id: 'egfr-tki-resistance',
    question: 'What mechanisms drive acquired resistance to EGFR tyrosine kinase inhibitors in non-small cell lung cancer?',
    domain: 'oncology', goal: 'explanatory',
    establishedFinding:
      'The dominant acquired-resistance mechanism is the EGFR T790M gatekeeper mutation in the kinase domain, which sterically reduces inhibitor binding while preserving ATP affinity. A secondary mechanism is MET/HER3 pathway amplification that bypasses EGFR signaling blockade without a second EGFR mutation. Resistance emerges under the selective pressure of inhibitor treatment, expanding pre-existing resistant clones.',
    rationale: 'Textbook oncology; Jackman & Engelman reviews; established since ~2005.',
  },
  {
    id: 'antibiotic-cdiff',
    question: 'Why does antibiotic treatment predispose patients to Clostridioides difficile infection?',
    domain: 'microbiology', goal: 'explanatory',
    establishedFinding:
      'Antibiotics disrupt the gut microbiota, depleting bacteria that convert primary bile acids to secondary bile acids. Loss of secondary bile acids (which inhibit C. difficile germination and growth) together with accumulation of taurocholate-like germinants enables C. difficile spore germination and outgrowth. The infection is therefore a dysbiosis-driven loss of colonization resistance rather than a direct antibiotic effect on the pathogen.',
    rationale: 'Established mechanistic model (Buffie/Young & Abt reviews); bile-acid axis.',
  },
  {
    id: 'arg-plasmid-transfer',
    question: 'What mechanisms drive the horizontal transfer of antibiotic resistance genes in hospital environments?',
    domain: 'microbiology', goal: 'explanatory',
    establishedFinding:
      'Conjugative plasmids are the dominant horizontal-transfer vector for resistance genes in hospital settings; integrons and transposons capture and mobilize resistance cassettes onto those plasmids; and sustained antibiotic selective pressure enriches resistant strains, maintaining and spreading the plasmid pool. Patient-to-patient transmission via hands and equipment amplifies spread but is not the gene-transfer mechanism itself.',
    rationale: 'Textbook medical microbiology (plasmid conjugation, integrons, selection).',
  },
  {
    id: 'crispr-offtarget',
    question: 'What mechanism causes CRISPR-Cas9 off-target genome editing?',
    domain: 'molecular biology', goal: 'explanatory',
    establishedFinding:
      'Off-target editing arises because the Cas9-guide RNA complex tolerates sequence mismatches between the guide and off-target genomic sites. Mismatch tolerance is highest distal to the PAM and lowest in the PAM-proximal seed region; off-target activity therefore correlates with genome-wide guide-sequence similarity and cannot be fully eliminated by requiring a perfect match in design.',
    rationale: 'Established since Doudna/Charpentier-era characterization; seed-region model.',
  },
  {
    id: 'crc-ici-failure',
    question: 'Why does immune checkpoint blockade benefit only a minority of colorectal cancer patients?',
    domain: 'oncology', goal: 'explanatory',
    establishedFinding:
      'Most colorectal tumors are microsatellite-stable (MSS) with functioning mismatch repair, yielding low tumor mutational burden and few neoantigens, so there is insufficient T-cell priming for checkpoint blockade to amplify. The microsatellite-instable (MSI-high/dMMR) subset carries high mutational/neoantigen burden and is the minority that responds. Response failure is thus primarily an antigenicity/immunogenicity deficit, not a drug-delivery issue.',
    rationale: 'Established since 2015 (Le/Overman); MSI-TMB-neoantigen axis is textbook.',
  },
];

// ---------------------------------------------------------------------------
// FAR-Lab run + top-hypothesis conclusion rendering (deterministic)
// ---------------------------------------------------------------------------

const farRun = (t) => {
  const stdout = execFileSync('node', [
    'dist/cli/main.js', 'research', 'start', t.question,
    '--domain', t.domain, '--goal', t.goal, '--json',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30 * 60_000 });
  const line = stdout.split('\n').find((l) => l.trim().startsWith('{'));
  return JSON.parse(line ?? '{}');
};

const DB_PATH = resolve(process.cwd(), '.far-run/far.db');

const renderTopHypothesis = (runId) => {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  const objs = (kind) => db.prepare('SELECT json FROM objects WHERE kind=? AND run_id=?').all(kind, runId).map((r) => JSON.parse(r.json));
  const hyps = objs('hypothesis').filter(isRepresentative);
  const tournament = objs('tournament').at(-1);
  const plan = objs('plan').at(-1);
  db.close();
  if (hyps.length === 0) return { text: null, reason: 'no representative hypotheses' };
  let top = hyps[0];
  if (tournament && hyps.length > 1) {
    const order = tournament.standings.map((s) => s.hypothesisId ?? s.id).filter(Boolean);
    top = order.map((id) => hyps.find((h) => h.id === id)).find(Boolean) ?? hyps[0];
  }
  const f = top.falsification ?? {};
  const text =
    `Hypothesis: ${top.statement}\n` +
    `Mechanism: ${top.mechanism ?? ''}\n` +
    `Predictions: ${(top.predictions ?? []).join(' | ')}\n` +
    `Expected relation: ${f.expectedRelation ?? ''} (observable: ${f.observable ?? ''}).`;
  return { text, hypId: top.id, planObjective: plan?.objective ?? null };
};

// ---------------------------------------------------------------------------
// judge: atomic-claim decomposition + matching (uncalibrated steps, objective GT)
// ---------------------------------------------------------------------------

const DecomposeOut = {
  type: 'object',
  properties: {
    agentClaims: { type: 'array', items: { type: 'string' } },
    gtClaims: { type: 'array', items: { type: 'string' } },
  },
  required: ['agentClaims', 'gtClaims'],
  additionalProperties: false,
};
const MatchOut = {
  type: 'object',
  properties: {
    agentMatch: { type: 'array', items: { type: 'integer' } }, // per agent claim: matching gt index or -1
    gtMatch: { type: 'array', items: { type: 'integer' } }, // per gt claim: matching agent index or -1
  },
  required: ['agentMatch', 'gtMatch'],
  additionalProperties: false,
};

const die = (msg) => { console.error('FATAL: ' + msg); process.exit(1); };
const provider = makeProvider();
if (!provider.liveReady) die('DEEPSEEK_API_KEY not set');

const structuredJson = async (task, payload, schema) => {
  const res = await provider.structuredCall(
    { task, systemPrompt: 'You are a precise scientific evaluation engine. Follow the requested JSON shape exactly.', userPayload: payload, outputKind: 'json', temperature: 0, maxTokens: 4000, purpose: task, jsonSchema: schema },
    (raw) => {
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return new Error('not an object');
      return raw;
    },
  );
  if (!res.ok) throw new Error(`${task} failed: ${res.error?.message}`);
  return res.data;
};

const sample = TASKS.slice(0, SAMPLE_N);
mkdirSync(RESULTS_DIR, { recursive: true });

const waitForTerminal = (runId, maxMs = 20 * 60_000) => {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  const deadline = Date.now() + maxMs;
  let status;
  for (;;) {
    // each .get() is a fresh read transaction on the WAL — engine commits become visible
    const row = db.prepare('SELECT status FROM runs WHERE id=?').get(runId);
    status = row === undefined ? 'missing' : row.status;
    if (status !== 'running' && status !== 'created') break;
    if (Date.now() > deadline) break;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10_000);
  }
  db.close();
  return status;
};

// phase 1: runs (the CLI may return at creation while a detached engine keeps
// executing — each run waits for its terminal state before being recorded)
if (!SKIP_RUNS) {
  const prior = existsSync(RUNS_FILE) ? readFileSync(RUNS_FILE, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const done = new Set(prior.filter((r) => r.runId).map((r) => r.task));
  for (const t of sample) {
    if (done.has(t.id)) { console.log(`[rediscovery] ${t.id}: run exists, skipping`); continue; }
    console.log(`[rediscovery] starting run for ${t.id}`);
    try {
      const r = farRun(t);
      const finalStatus = waitForTerminal(r.runId);
      writeFileSync(RUNS_FILE, readFileSync(RUNS_FILE, 'utf8') + JSON.stringify({ task: t.id, runId: r.runId, status: finalStatus }) + '\n');
      console.log(`[rediscovery] ${t.id} -> ${r.runId} (${finalStatus})`);
    } catch (e) {
      writeFileSync(RUNS_FILE, (existsSync(RUNS_FILE) ? readFileSync(RUNS_FILE, 'utf8') : '') + JSON.stringify({ task: t.id, error: String(e.message).slice(0, 300), stderr: String(e.stderr ?? '').slice(0, 500) }) + '\n');
      console.error(`[rediscovery] ${t.id} RUN FAILED: ${e.message}`);
    }
  }
}

// phase 2: score (each run waits for its terminal state before rendering — the CLI
// returns at creation while a detached engine keeps executing; judging an unfinished
// run would render a mid-pipeline hypothesis)
const runs = existsSync(RUNS_FILE) ? readFileSync(RUNS_FILE, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const byTask = new Map(TASKS.map((t) => [t.id, t]));
const records = [];
for (const r of runs) {
  const t = byTask.get(r.task);
  if (!t || !r.runId) continue;
  const status = waitForTerminal(r.runId);
  if (status !== 'completed') { records.push({ task: r.task, runId: r.runId, skipped: true, reason: `run terminal status: ${status}` }); console.log(`[rediscovery] ${r.task}: skipped (status ${status})`); continue; }
  const { text } = renderTopHypothesis(r.runId);
  if (text === null) { records.push({ task: r.task, skipped: true, reason: 'no top hypothesis' }); continue; }
  try {
    const dec = await structuredJson('rediscovery:decompose', { agentOutput: text, establishedFinding: t.establishedFinding, instruction: 'Decompose BOTH texts into atomic, verifiable scientific claims (subject-mechanism-direction units; 2-12 claims each; no overlap).' }, DecomposeOut);
    const agentClaims = dec.agentClaims ?? [];
    const gtClaims = dec.gtClaims ?? [];
    if (agentClaims.length === 0 || gtClaims.length === 0) throw new Error('decomposition empty');
    const m = await structuredJson('rediscovery:match', {
      agentClaims, gtClaims,
      instruction: 'For EACH agent claim give the index of the ground-truth claim asserting substantially the same scientific finding (same entity/mechanism/direction), else -1. For EACH ground-truth claim likewise against agent claims. Match content, not wording; a vaguer version covering the same finding still matches; a fabricated/unrelated claim does not.',
    }, MatchOut);
    const agentMatched = (m.agentMatch ?? []).filter((i) => i >= 0 && i < gtClaims.length).length;
    const gtMatched = (m.gtMatch ?? []).filter((i) => i >= 0 && i < agentClaims.length).length;
    const precision = agentMatched / agentClaims.length;
    const recall = gtMatched / gtClaims.length;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    records.push({
      task: r.task, runId: r.runId, judge: 'deepseek-chat', temperature: 0,
      agentClaims: agentClaims.length, gtClaims: gtClaims.length,
      agentMatched, gtMatched,
      precision: Math.round(precision * 1000) / 1000,
      recall: Math.round(recall * 1000) / 1000,
      f1: Math.round(f1 * 1000) / 1000,
      claims: { agent: agentClaims, gt: gtClaims, agentMatch: m.agentMatch, gtMatch: m.gtMatch },
      topHypothesis: text,
    });
    console.log(`[rediscovery] ${r.task}: P=${precision.toFixed(2)} R=${recall.toFixed(2)} F1=${f1.toFixed(2)} (${agentMatched}/${agentClaims.length} agent, ${gtMatched}/${gtClaims.length} gt)`);
  } catch (e) {
    records.push({ task: r.task, runId: r.runId, error: String(e.message).slice(0, 300) });
    console.error(`[rediscovery] judge error ${r.task}: ${e.message}`);
  }
}
writeFileSync(OUT, records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');

const scored = records.filter((r) => r.f1 !== undefined);
if (scored.length > 0) {
  const mean = (f) => scored.reduce((a, r) => a + r[f], 0) / scored.length;
  console.log(`\n[rediscovery] means over ${scored.length} tasks: P=${mean('precision').toFixed(2)} R=${mean('recall').toFixed(2)} F1=${mean('f1').toFixed(2)}`);
}
console.log(`DONE -> ${OUT}`);
