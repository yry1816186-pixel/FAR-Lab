/**
 * Long-run resource soak (FA-PRF-06: 6h -> 24h -> 72h staged soaks).
 *
 * Keeps ONE app process alive for SOAK_HOURS (default 6) in an ISOLATED workspace,
 * samples process (RSS/handles — the leak signature) + storage every SOAK_SAMPLE_S
 * (default 60s), and exercises the real machinery (orchestrator + full offline
 * research runs) every SOAK_WORK_MIN minutes. The workload runs on the in-process
 * test double (FARLAB_TEST_DOUBLE=1): this is a RESOURCE soak (RSS/handles/DB
 * growth are the metric), not a science-quality run — the load generator choice is
 * disclosed in every artifact.
 *
 * Verdict (written at the end): RSS/handle growth bound checks + DB growth rate +
 * workload outcomes. A monotone handle growth or >LEAK_RSS_PCT% RSS growth fails.
 *
 * Usage: node scripts/soak.mjs   (env: SOAK_HOURS=6 SOAK_SAMPLE_S=60 SOAK_WORK_MIN=20)
 */
import { mkdirSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HOURS = Number(process.env.SOAK_HOURS ?? 6);
const SAMPLE_S = Number(process.env.SOAK_SAMPLE_S ?? 60);
const WORK_MIN = Number(process.env.SOAK_WORK_MIN ?? 20);
const LEAK_RSS_PCT = Number(process.env.SOAK_LEAK_RSS_PCT ?? 50);
const DATA_DIR = resolve(process.env.SOAK_DATA_DIR ?? 'eval/results/soak-ws');

// Must precede the dist imports: provider resolution + data dir read env at build.
process.env.FARLAB_DATA_DIR = DATA_DIR;
process.env.FARLAB_TEST_DOUBLE = '1';

const OUT = `eval/results/soak-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}-${HOURS}h.jsonl`;
mkdirSync(DATA_DIR, { recursive: true });
appendFileSync(OUT, `${JSON.stringify({ kind: 'soak-config', hours: HOURS, sampleS: SAMPLE_S, workMin: WORK_MIN, dataDir: DATA_DIR, loadGenerator: 'test-double (offline wire) — resource soak, not a science-quality run', at: new Date().toISOString() })}\n`);

const { createApp } = await import('../dist/app/composition.js');
const { sampleProcess, sampleStorage } = await import('../dist/app/observability.js');
const { ResearchQuestion, newId } = await import('../dist/domain/index.js');

const app = await createApp();
const QUESTIONS = [
  'What mechanisms drive acquired resistance to EGFR tyrosine kinase inhibitors in non-small cell lung cancer?',
  'Why does antibiotic treatment predispose patients to Clostridioides difficile infection?',
  'What mechanism causes CRISPR-Cas9 off-target genome editing?',
  'Why does immune checkpoint blockade benefit only a minority of colorectal cancer patients?',
  'What mechanisms drive the horizontal transfer of antibiotic resistance genes in hospital environments?',
];

let runIndex = 0;
let busy = false;
const workloads = [];
const runWorkload = async () => {
  if (busy) return;
  busy = true;
  const t0 = Date.now();
  try {
    const q = ResearchQuestion.parse({
      id: newId('q'), text: QUESTIONS[runIndex % QUESTIONS.length], background: '',
      goalType: 'explanatory', scope: { domain: 'soak', phenomena: ['resource stability'] },
      constraints: {}, createdAt: new Date().toISOString(),
    });
    const run = app.store.createRun(q);
    runIndex += 1;
    const after = await app.orchestrator.execute(run.id);
    appendFileSync(OUT, `${JSON.stringify({ kind: 'workload', n: runIndex, runId: run.id, status: after.status, stages: after.stages.filter((s) => s.state !== 'done').map((s) => `${s.stage}:${s.state}`), wallMs: Date.now() - t0, at: new Date().toISOString() })}\n`);
  } catch (e) {
    appendFileSync(OUT, `${JSON.stringify({ kind: 'workload-error', n: runIndex + 1, error: String(e instanceof Error ? e.message : e).slice(0, 400), at: new Date().toISOString() })}\n`);
  } finally {
    busy = false;
  }
};

const samples = [];
const deadline = Date.now() + HOURS * 3_600_000;
let nextWork = Date.now(); // first workload immediately
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

while (Date.now() < deadline) {
  const proc = sampleProcess();
  const storage = sampleStorage(app.store, app.dataDir);
  const line = { kind: 'sample', t: Date.now(), ...proc, ...storage };
  samples.push(line);
  appendFileSync(OUT, `${JSON.stringify(line)}\n`);
  if (Date.now() >= nextWork) {
    nextWork = Date.now() + WORK_MIN * 60_000;
    workloads.push(runWorkload());
  }
  await sleep(Math.min(SAMPLE_S * 1000, Math.max(0, deadline - Date.now())));
}
await Promise.allSettled(workloads);

const first = samples.slice(0, Math.max(1, Math.floor(samples.length * 0.1)));
const last = samples.slice(-Math.max(1, Math.floor(samples.length * 0.1)));
const mean = (xs, f) => xs.reduce((s, x) => s + f(x), 0) / xs.length;
const rssGrowthPct = ((mean(last, (s) => s.rssMb) - mean(first, (s) => s.rssMb)) / mean(first, (s) => s.rssMb)) * 100;
const handleFirst = mean(first, (s) => s.activeHandles);
const handleLast = mean(last, (s) => s.activeHandles);
const dbGrowthPerHour = (samples.at(-1).dbBytes - samples[0].dbBytes) / HOURS;
const verdict = {
  kind: 'soak-verdict',
  hours: HOURS,
  samples: samples.length,
  rssMbFirst: Math.round(mean(first, (s) => s.rssMb) * 10) / 10,
  rssMbLast: Math.round(mean(last, (s) => s.rssMb) * 10) / 10,
  rssGrowthPct: Math.round(rssGrowthPct * 10) / 10,
  activeHandlesFirst: Math.round(handleFirst * 10) / 10,
  activeHandlesLast: Math.round(handleLast * 10) / 10,
  dbGrowthBytesPerHour: dbGrowthPerHour,
  runsLaunched: runIndex,
  leakRssPctBound: LEAK_RSS_PCT,
  pass: rssGrowthPct < LEAK_RSS_PCT && handleLast <= Math.max(handleFirst * 1.5, handleFirst + 10),
  at: new Date().toISOString(),
};
appendFileSync(OUT, `${JSON.stringify(verdict)}\n`);
console.log(JSON.stringify(verdict, null, 2));
app.close();
process.exit(verdict.pass ? 0 : 1);
