/**
 * FA-SCI-07: AstaBench literature-understanding subset adapter (LitQA2).
 *
 * Upstream chain (all judged data, never executed):
 * - Question pool: futurehouse/lab-bench LitQA2 config (HF, CC-BY-SA-4.0), 199 public
 *   questions cached at .cache/asta/litqa2-public.jsonl (converted from the upstream
 *   parquet once; see the summary artifact's data note).
 * - Task/scorer semantics: allenai/asta-bench astabench/evals/labbench/litqa2/task.py
 *   (Apache-2.0): MCQ with LAB-bench "Insufficient information" unsure choice injected;
 *   deterministic letter-match scoring; metrics accuracy / precision (correct among
 *   sure) / coverage (sure fraction). The MCQ answer template mirrors AstaBench's
 *   DEFAULT_MULTICHOICE_TEMPLATE verbatim.
 *
 * Protocol deviations from AstaBench Standard interface (disclosed per artifact, never
 * silently narrowed):
 * - AstaBench's dev/test split mapping (tasks/labbench/litqa2_mapping.json) lives in the
 *   GATED HF dataset repo allenai/asta-bench (401 anonymous, 2026-09-06 probe) — we
 *   deterministically sample N from the full 199-question public pool instead, so the
 *   split differs from the leaderboard partition.
 * - Retrieval interface: FAR-Lab's EuropePMC adapter (same dist/ code path as the
 *   pipeline retrieve stage) over LLM-planned plain keyword queries (simplified mirror
 *   of the pipeline's planned-queries discipline) — not Asta MCP search tools.
 * - Date discipline: AstaBench restricts to INSERTED_BEFORE 2024-10-17 (day precision).
 *   EuropePMC exposes year-precision filtering that actually bounds results
 *   (PUB_YEAR:[2010 TO 2024], live-probed 2026-09-06: honored; PUB_DATE ranges return
 *   0 hits, PUB_YEAR:<= ignores the bound) — our cutoff is effectively 2024-12-31.
 *
 * Usage (CLI only — importing this module for its pure functions must NOT trigger any
 * I/O; guarded by the import.meta.url main guard):
 *   node eval/asta-litqa2.mjs --render-only   # offline: sample+prompt shapes, no API
 *   node eval/asta-litqa2.mjs                 # live: needs provider env (dashscope)
 *   node eval/asta-litqa2.mjs --skip-runs     # recompute summary from frozen rows
 * Env: ASTA_LITQA_DATA, ASTA_LITQA_N (default 20), ASTA_LITQA_SEED (default 20260906),
 *      ASTA_LITQA_TOPK (default 4 per planned query), provider via makeProvider.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeProvider } from './lib.mjs';
import { createEuropePmcAdapter } from '../dist/sources/europepmc.js';

const LETTERS = 'ABCDEFGH';
const UNSURE_CHOICE = 'Insufficient information to answer the question';
// AstaBench astabench/evals/utils.py DEFAULT_MULTICHOICE_TEMPLATE, verbatim.
const ASTA_MCQ_TEMPLATE = '{question}\n\n{choices}\n\nAnswer with the letter of the chosen answer in JSON: {{"answer": "<letter>"}}.';
const DATE_CLAUSE = 'AND (PUB_YEAR:[2010 TO 2024])';
const N = Number(process.env.ASTA_LITQA_N ?? 20);
const SEED = Number(process.env.ASTA_LITQA_SEED ?? 20260906);
const TOPK = Number(process.env.ASTA_LITQA_TOPK ?? 4);

const die = (msg) => { console.error('FATAL: ' + msg); process.exit(1); };

// deterministic PRNG (mulberry32) — same family as mlr-bench/llm-judge
export const rng = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** FNV-1a 32-bit string hash — per-question seed derivation. (Length-based seeds were
 * rejected by the render-only smoke: LitQA2 ids are all 36-char UUIDs, so id.length
 * gives every question the SAME choice permutation — a position-bias leak.) */
export const hashString = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};
const seedFor = (qid) => (SEED ^ hashString(qid)) | 0;

/** Deterministic sample of n rows from the public pool (index-stable for a fixed seed+data). */
export const sampleQuestions = (rows, n, seed) => {
  const r = rng(seed);
  const idx = rows.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, n).sort((a, b) => a - b).map((i) => rows[i]);
};

/** LAB-bench choice construction: ideal + distractors + injected unsure choice, seeded shuffle.
 * Mirrors LabbenchQuestion.full_choices: choices = [ideal]+distractors+[UNSURE]; the unsure
 * index is tracked so scoring can distinguish "wrong" from "abstained". */
export const buildChoices = (q, seed) => {
  const r = rng(seed);
  const raw = [q.ideal, ...q.distractors, UNSURE_CHOICE];
  const perm = raw.map((_, i) => i);
  for (let i = perm.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const choices = perm.map((i) => raw[i]);
  return {
    choices,
    letters: choices.map((_, i) => LETTERS[i]),
    targetLetter: LETTERS[perm.indexOf(0)],
    unsureLetter: LETTERS[perm.indexOf(raw.length - 1)],
    permutation: perm,
  };
};

/** Retrieval query: planned keyword phrase with wildcard chars stripped (OpenAlex/EuropePMC
 * 400 discipline, same as baseline-rag) + the year-precision date clause. */
export const buildSearchQuery = (phrase) =>
  `${phrase.replace(/[*?]+/g, ' ').replace(/\s+/g, ' ').trim()} ${DATE_CLAUSE}`;

/** Query-planning prompt: simplified mirror of the pipeline retrieve stage's planned-query
 * discipline (plain keyword phrases for academic search, no boolean operators). Raw MCQ
 * questions as queries hit 11/20 zero-recall in the 2026-09-06 retrieval probe — planning
 * is the pipeline's own discipline, not an adapter embellishment. */
export const queryPlanningTask = (question) => `You are preparing literature searches for a multiple-choice scientific question.

QUESTION: ${question}

Write exactly 3 DIFFERENT English search queries for academic search engines (Europe PMC):
- plain keyword phrases, no boolean operators, no quotes
- 2 aimed at the factual substance the question asks about (entities + the measured relation)
- 1 aimed at the comparison dimension that would discriminate between candidate answers
- reuse the question's own key entities/terms; never invent specific papers, authors or results

Output a single JSON object: {"queries": ["...", "...", "..."]}`;

export const parseQueries = (raw) => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'top level not an object' };
  if (!Array.isArray(raw.queries) || raw.queries.length < 1) return { ok: false, reason: 'queries missing/empty' };
  const qs = raw.queries.filter((x) => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim());
  if (qs.length === 0) return { ok: false, reason: 'no usable query strings' };
  return { ok: true, queries: qs.slice(0, 5) };
};

/** AstaBench-template MCQ task text: retrieved literature block + verbatim template. */
export const answerTask = (question, choices, corpus) => {
  const litBlock = corpus.length > 0
    ? 'Provided literature (retrieved via the FAR-Lab EuropePMC source adapter over planned keyword queries, year-restricted):\n' +
      corpus.map((c, i) => `[S${i + 1}] title: ${c.title}\n    year: ${c.publicationYear ?? 'n/a'} doi: ${c.doi ?? 'n/a'}\n    abstract: ${(c.abstractText ?? '(no abstract in record)').slice(0, 1200)}`).join('\n')
    : 'Provided literature: (retrieval returned no usable records — answer from knowledge and pick the insufficient-information letter if unsupported)';
  const choicesBlock = choices.map((c, i) => `${LETTERS[i]}) ${c}`).join('\n');
  const tmpl = ASTA_MCQ_TEMPLATE
    .replace('{question}', question)
    .replace('{choices}', choicesBlock)
    .replace('{{"answer": "<letter>"}}', '{"answer": "<letter>", "evidence": "<one line: which [S#] supports the choice, or why insufficient>' + '"}');
  return litBlock + '\n\n' + tmpl;
};

/** Parse/validate the model answer against the offered letters (deterministic). */
export const parseAnswer = (raw, letters) => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'top level not an object' };
  const a = typeof raw.answer === 'string' ? raw.answer.trim().toUpperCase() : raw.answer;
  if (typeof a !== 'string' || !letters.includes(a)) {
    return { ok: false, reason: `answer must be one of ${letters.join('|')} (got ${JSON.stringify(raw.answer)})` };
  }
  return { ok: true, answer: a, evidence: typeof raw.evidence === 'string' ? raw.evidence.slice(0, 400) : '' };
};

/** AstaBench scorer semantics: is_correct = letter match; is_sure = did not pick unsure. */
export const scoreAnswer = (answer, targetLetter, unsureLetter) => ({
  is_correct: answer === targetLetter,
  is_sure: answer !== unsureLetter,
});

/** AstaBench metrics: accuracy (mean correct), precision (correct among sure, 0 when no
 * sure answers — mirrors their max(1, denominator)), coverage (mean sure). */
export const aggregate = (rows) => {
  const scored = rows.filter((x) => x.is_correct !== undefined);
  const n = scored.length;
  const correct = scored.filter((x) => x.is_correct).length;
  const sure = scored.filter((x) => x.is_sure).length;
  const acc = n > 0 ? correct / n : 0;
  return {
    n,
    accuracy: acc,
    accuracyStderr: n > 0 ? Math.sqrt(acc * (1 - acc) / n) : 0,
    precision: sure > 0 ? scored.filter((x) => x.is_correct && x.is_sure).length / sure : 0,
    coverage: n > 0 ? sure / n : 0,
    correct,
    sure,
  };
};

/** Merge per-query result lists into one DOI-deduped pool (stable order: query order,
 * then rank). Mirrors the retrieve stage's multi-list pool shape. */
export const mergePools = (pools) => {
  const seen = new Set();
  const merged = [];
  for (const records of pools) {
    for (const r of records) {
      const key = r.doi ?? r.title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(r);
    }
  }
  return merged;
};

const loadPool = (dataPath) => {
  if (!existsSync(dataPath)) die(`question pool not found at ${dataPath} (fetch futurehouse/lab-bench LitQA2 via an HF mirror and convert; see file header)`);
  return readFileSync(dataPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
};

const readLatest = (runsFile) => {
  if (!existsSync(runsFile)) return new Map();
  const latest = new Map();
  for (const line of readFileSync(runsFile, 'utf8').trim().split('\n').filter(Boolean)) {
    try {
      const row = JSON.parse(line);
      latest.set(row.qid, row); // last row for a qid wins (failed rows are retried)
    } catch { /* torn tail line: ignore, resume rewrites it */ }
  }
  return latest;
};

const toCorpusRecord = (r) => ({
  doi: r.identifiers.find((i) => i.kind === 'doi')?.value ?? null,
  title: r.title,
  publicationYear: r.publicationYear ?? null,
  abstractText: r.abstractText ?? null,
});

const searchWithRetry = async (adapter, query, attempts = 3) => {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await adapter.search(query, { limit: TOPK });
      return { ok: true, httpStatus: res.httpStatus, records: res.records.map(toCorpusRecord) };
    } catch (e) {
      lastErr = e;
      const transient = /http_status (httpStatus=5\d\d|httpStatus=429)/.test(String(e?.message));
      if (!transient) break;
      await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
    }
  }
  return { ok: false, error: String(lastErr?.message ?? lastErr) };
};

/** Fail-closed row scoring for metrics (2026-09-06): a RECORDED row whose provider
 * call failed or whose answer did not parse is a capability failure, not a
 * measurement exclusion — it scores incorrect (and sure: it is not the unsure
 * letter). The pre-2026-09-06 behavior dropped such rows from the denominator,
 * biasing accuracy upward exactly when the model output garbage. Rows never
 * attempted (absent from the runs file) are not scored at all. */
export const scoreRowsForMetrics = (rows) => rows.map((x) =>
  (x.ok && x.answer && x.score !== undefined ? x.score : { is_correct: false, is_sure: true, failed: true }));

const writeSummary = (summaryFile, rows, extra = {}) => {
  const metrics = aggregate(scoreRowsForMetrics(rows));
  writeFileSync(summaryFile, JSON.stringify({
    at: new Date().toISOString(),
    instrument: 'eval/asta-litqa2.mjs',
    protocol: {
      task: 'AstaBench LitQA2 (allenai/asta-bench labbench/litqa2 semantics, Apache-2.0)',
      pool: 'futurehouse/lab-bench LitQA2 public train (CC-BY-SA-4.0), 199 questions',
      sample: { n: N, seed: SEED, note: 'AstaBench dev/test mapping gated (HF 401) — sampled from full public pool, not the leaderboard partition' },
      retrieval: {
        adapter: 'europepmc (FAR-Lab dist code path)', perQueryTopk: TOPK,
        queryPlanning: 'LLM-planned plain keyword queries (simplified mirror of the pipeline retrieve-stage discipline; raw-question queries probed 11/20 zero-recall 2026-09-06)',
        dateDiscipline: DATE_CLAUSE + ' — year precision; AstaBench uses day precision 2024-10-17, ours is effectively 2024-12-31',
      },
      answerTemplate: 'AstaBench DEFAULT_MULTICHOICE_TEMPLATE verbatim + evidence field (additive, disclosed)',
      failedRowScoring: 'fail-closed (2026-09-06): recorded rows with provider/parse failures score incorrect+sure, never excluded from the denominator; unattempted questions are absent (n reports the attempted count)',
    },
    metrics,
    rows: rows.map((x) => ({
      qid: x.qid, answer: x.answer ?? null, target: x.targetLetter, unsure: x.unsureLetter,
      score: x.score ?? null, ok: x.ok, error: x.error ?? null,
      plannedQueries: x.plannedQueries ?? [], retrievalN: x.retrieval?.corpus?.length ?? 0,
      evidence: x.evidence ?? null, wallMs: x.wallMs ?? null,
    })),
    ...extra,
  }, null, 1), 'utf8');
  return metrics;
};

// ---------------------------------------------------------------------------
// main (guarded: importing this module runs NO I/O — pure functions only)
// ---------------------------------------------------------------------------
async function main() {
  const RENDER_ONLY = process.argv.includes('--render-only');
  const SKIP_RUNS = process.argv.includes('--skip-runs');
  const DATA = resolve(process.cwd(), process.env.ASTA_LITQA_DATA ?? '.cache/asta/litqa2-public.jsonl');
  const RESULTS_DIR = resolve(process.cwd(), 'eval/results');
  const RUNS_FILE = resolve(process.cwd(), process.env.ASTA_LITQA_RUNS ?? join(RESULTS_DIR, 'asta-litqa2-runs.jsonl'));
  const SUMMARY_FILE = resolve(process.cwd(), process.env.ASTA_LITQA_SUMMARY ?? join(RESULTS_DIR, 'asta-litqa2.json'));

  const pool = loadPool(DATA);
  const sample = sampleQuestions(pool, N, SEED);
  if (sample.length < N) die(`pool has ${pool.length} rows, cannot sample N=${N}`);

  if (RENDER_ONLY) {
    console.log(`pool=${pool.length} sample=${sample.length} seed=${SEED} dateClause="${DATE_CLAUSE}"`);
    for (const q of sample.slice(0, 3)) {
      const ch = buildChoices(q, seedFor(q.id));
      console.log(`\n--- ${q.id} (target=${ch.targetLetter} unsure=${ch.unsureLetter}) ---`);
      console.log(queryPlanningTask(q.question).slice(0, 220) + '…');
      console.log('query suffix: …' + buildSearchQuery('example planned phrase').slice(-52));
      console.log(ch.choices.map((c, i) => `${ch.letters[i]}) ${c.slice(0, 70)}`).join('\n'));
    }
    const corpusStub = [{ title: 'stub', publicationYear: 2023, doi: '10.0/stub', abstractText: 'stub abstract' }];
    const t = answerTask(sample[0].question, buildChoices(sample[0], 1).choices, corpusStub);
    if (!t.includes('Answer with the letter of the chosen answer in JSON')) die('template drift: AstaBench MCQ tail missing');
    console.log('\nrender-only OK (template tail verified, no API calls made)');
    return;
  }

  mkdirSync(RESULTS_DIR, { recursive: true });
  const latest = readLatest(RUNS_FILE);

  if (SKIP_RUNS) {
    // frozen-row rescore: no live calls, summary recomputed from the runs file only
    const rowsForSummary = sample.map((q) => latest.get(q.id)).filter(Boolean);
    if (rowsForSummary.length === 0) die(`no frozen rows for the current sample in ${RUNS_FILE}`);
    const metrics = writeSummary(SUMMARY_FILE, rowsForSummary, { processedThisRun: 0, mode: 'skip-runs' });
    console.log(`DONE asta-litqa2 --skip-runs -> ${SUMMARY_FILE} (${rowsForSummary.length} frozen rows)`);
    console.log(JSON.stringify(metrics));
    return;
  }

  const provider = await makeProvider();
  const adapter = createEuropePmcAdapter();
  console.log(`provider=${provider.name} model=${provider.modelId} retrieval=europepmc(perQuery top${TOPK}) sample=${sample.length} done=${[...latest.values()].filter((r) => r.ok).length}`);

  let processed = 0;
  for (const q of sample) {
    const prev = latest.get(q.id);
    if (prev?.ok) continue;
    const ch = buildChoices(q, seedFor(q.id));

    // 1) planned keyword queries (pipeline retrieve-stage discipline, simplified)
    const planRes = await provider.structuredCall(
      {
        task: queryPlanningTask(q.question),
        systemPrompt: 'You write precise academic search queries. Never invent specific papers, authors or results.',
        userPayload: { question: q.question },
        outputKind: 'json',
        temperature: 0,
        maxTokens: 512,
        purpose: 'asta-litqa2-queryplan',
      },
      (raw) => {
        const p = parseQueries(raw);
        return p.ok ? raw : new Error(p.reason);
      },
    );
    const plan = planRes.ok ? parseQueries(planRes.data) : null;
    const plannedQueries = plan?.ok ? plan.queries : [q.question.replace(/[*?]+/g, ' ').replace(/\s+/g, ' ').trim()];

    // 2) multi-list retrieval + DOI-deduped pool
    const pools = [];
    const perQuery = [];
    for (const phrase of plannedQueries) {
      const s = await searchWithRetry(adapter, buildSearchQuery(phrase));
      perQuery.push({ phrase, ok: s.ok, httpStatus: s.httpStatus ?? null, n: s.records?.length ?? 0, error: s.error ?? null });
      if (s.ok) pools.push(s.records);
      await new Promise((res) => setTimeout(res, 350));
    }
    const corpus = mergePools(pools);
    console.log(`${q.id.slice(0, 8)} queries=${plannedQueries.length} pool=${corpus.length} (${perQuery.map((p) => p.n).join('/')})`);

    // 3) AstaBench-protocol MCQ answer call
    const task = answerTask(q.question, ch.choices, corpus);
    const t0 = Date.now();
    const res = await provider.structuredCall(
      {
        task,
        systemPrompt: 'You are a careful scientific literature reader. Answer the multiple-choice question strictly from the provided literature when it supports an answer; otherwise choose the insufficient-information option. Never fabricate support.',
        userPayload: { question: q.question, choices: ch.choices.length, corpusSize: corpus.length },
        outputKind: 'json',
        temperature: 0,
        maxTokens: 1024,
        purpose: 'asta-litqa2',
      },
      (raw) => {
        const p = parseAnswer(raw, ch.letters);
        return p.ok ? raw : new Error(p.reason);
      },
    );
    const parsed = res.ok ? parseAnswer(res.data, ch.letters) : null;
    const score = parsed?.ok ? scoreAnswer(parsed.answer, ch.targetLetter, ch.unsureLetter) : undefined;
    const row = {
      qid: q.id, question: q.question,
      choices: ch.choices, letters: ch.letters, targetLetter: ch.targetLetter, unsureLetter: ch.unsureLetter,
      plannedQueries,
      retrieval: { perQuery, corpus },
      ok: res.ok && parsed?.ok === true,
      error: !res.ok
        ? { kind: res.error?.kind, message: res.error?.message }
        : (parsed?.ok ? null : { kind: 'parse', message: parsed?.reason, queryPlanOk: plan?.ok === true }),
      answer: parsed?.ok ? parsed.answer : null,
      evidence: parsed?.ok ? parsed.evidence : null,
      score,
      receipt: res.receipt,
      wallMs: Date.now() - t0,
      at: new Date().toISOString(),
    };
    appendFileSync(RUNS_FILE, JSON.stringify(row) + '\n', 'utf8');
    processed += 1;
    console.log(`${q.id.slice(0, 8)} ok=${row.ok} answer=${row.answer} target=${ch.targetLetter} ${score ? `correct=${score.is_correct} sure=${score.is_sure}` : ''} wall=${row.wallMs}ms`);
  }

  const finalLatest = readLatest(RUNS_FILE);
  const rowsForSummary = sample.map((q) => finalLatest.get(q.id)).filter(Boolean);
  const metrics = writeSummary(SUMMARY_FILE, rowsForSummary, { processedThisRun: processed });
  console.log(`DONE asta-litqa2 -> ${SUMMARY_FILE}`);
  console.log(JSON.stringify(metrics));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
