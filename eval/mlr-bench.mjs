/**
 * MLR-Bench evaluation slice (W-EV2, CP-EV4): run FAR-Lab on MLR-Bench tasks
 * (ideation + proposal = Track-1 Direction-A scope), judge with the OFFICIAL
 * MLR-Judge rubrics, and compare against published agent outputs on the SAME
 * task subset under the SAME judge (apples-to-apples), plus report the in-repo
 * published judge scores as context anchors.
 *
 * Upstream: github.com/chchenhui/mlrbench (MIT, Copyright (c) 2025 Hui Chen),
 * NeurIPS 2025 D&B, arXiv:2505.19955. Clone expected at MLRBENCH_REPO or
 * .cache/repos/mlrbench. Rubric texts are extracted VERBATIM from the upstream
 * source at runtime (zero drift); upstream content is judged data, never executed.
 *
 * Comparability discipline:
 * - published anchors in-repo were judged by claude-3-7-sonnet / gemini-2.5-pro;
 *   our judge is deepseek-chat (temperature 0). Cross-judge numbers are CONTEXT
 *   ONLY; the decision comparison is our-judge-on-same-tasks: farlab vs the
 *   published o4-mini / deepseek-r1 idea+proposal files.
 * - FAR-Lab outputs are rendered from persisted run objects by a deterministic
 *   mapping (top tournament representative -> idea; plan -> proposal). No manual
 *   editing, no embellishment.
 *
 * Usage: node eval/mlr-bench.mjs [--skip-runs]   (writes eval/results/mlr-bench.jsonl)
 * Env: MLRBENCH_REPO (default .cache/repos/mlrbench), DEEPSEEK_API_KEY.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { makeProvider } from './lib.mjs';
import { isRepresentative } from '../dist/pipeline/stages/shared.js';

const SEED = 20260822;
const SAMPLE_N = Number(process.env.MLR_SAMPLE_N ?? 5);
const REPO = resolve(process.cwd(), process.env.MLRBENCH_REPO ?? '.cache/repos/mlrbench');
const RESULTS_DIR = resolve(process.cwd(), 'eval/results/');
const OUT = RESULTS_DIR + 'mlr-bench.jsonl';
const RUNS_FILE = RESULTS_DIR + 'mlr-bench-runs.jsonl';
const SKIP_RUNS = process.argv.includes('--skip-runs');
const ANCHOR_AGENTS = ['o4-mini-2025-04-16', 'deepseek-r1'];

// deterministic PRNG (mulberry32) — same family as llm-judge.mjs
const rng = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const die = (msg) => { console.error('FATAL: ' + msg); process.exit(1); };

// ---------------------------------------------------------------------------
// upstream extraction (verbatim rubrics + task texts + published outputs)
// ---------------------------------------------------------------------------

const extractRubric = (pyPath, constName) => {
  const src = readFileSync(pyPath, 'utf8');
  const m = src.match(new RegExp(`${constName}\\s*=\\s*"""([\\s\\S]*?)"""`));
  if (m === null) die(`cannot extract ${constName} from ${pyPath}`);
  return m[1];
};

const IDEA_RUBRIC = extractRubric(join(REPO, 'mlrbench/evals/review_idea.py'), 'RESEARCH_IDEA_RUBRIC');
const PROPOSAL_RUBRIC = extractRubric(join(REPO, 'mlrbench/evals/review_proposal.py'), 'RESEARCH_PROPOSAL_RUBRIC');

const taskMd = (task) => readFileSync(join(REPO, 'tasks', task + '.md'), 'utf8');

/** MLR-Bench task -> FAR-Lab research question (deterministic mapping, recorded). */
const questionFor = (task) => {
  const md = taskMd(task);
  const title = md.match(/^#\s+(.+)$/m)?.[1] ?? task;
  let body = md;
  if (body.startsWith('# ')) body = body.slice(body.indexOf('\n') + 1); // heading dropped; title already prepended
  body = body.slice(0, 5_000);
  return `${title}. ${body.replace(/[#*`]/g, '').replace(/\s+/g, ' ').trim()}`;
};

const eligibleTasks = () => {
  const tasks = readdirSync(join(REPO, 'tasks')).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''));
  return tasks.filter((t) =>
    ANCHOR_AGENTS.every((a) => {
      const base = join(REPO, 'agent_results/ideas_and_proposals', t);
      return existsSync(join(base, 'idea', `idea_${a}.md`)) && existsSync(join(base, 'proposal', `proposal_${a}.md`));
    })
  ).sort();
};

// ---------------------------------------------------------------------------
// FAR-Lab run + deterministic idea/proposal rendering from persisted objects
// ---------------------------------------------------------------------------

const farRun = (task, question) => {
  const stdout = execFileSync('node', [
    'dist/cli/main.js', 'research', 'start', question,
    '--domain', 'machine learning', '--goal', 'exploratory', '--json',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 30 * 60_000 });
  const line = stdout.split('\n').find((l) => l.trim().startsWith('{'));
  return JSON.parse(line ?? '{}');
};

const DB_PATH = resolve(process.cwd(), '.far-run/far.db');

const renderIdea = (runId) => {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  const objs = (kind) => db.prepare('SELECT json FROM objects WHERE kind=? AND run_id=?').all(kind, runId).map((r) => JSON.parse(r.json));
  db.close();
  const hyps = objs('hypothesis').filter(isRepresentative);
  const tournament = objs('tournament').at(-1);
  let top;
  if (tournament && hyps.length > 1) {
    const order = tournament.standings.map((s) => s.hypothesisId ?? s.id).filter(Boolean);
    top = order.map((id) => hyps.find((h) => h.id === id)).find(Boolean) ?? hyps[0];
  } else {
    top = hyps[0];
  }
  if (!top) return { idea: null, reason: 'no representative hypotheses' };
  const f = top.falsification ?? {};
  const lit = top.literatureNovelty;
  const idea =
    `Title: ${top.statement}\n\n` +
    `Motivation\n${top.mechanism ?? ''}\n` +
    (top.rationale ? `Rationale: ${top.rationale}\n` : '') +
    (Array.isArray(top.assumptions) && top.assumptions.length > 0
      ? `Key assumptions: ${top.assumptions.map((a) => (typeof a === 'string' ? a : a.statement)).join('; ')}\n`
      : '') +
    `\nMain Idea\n${top.statement} The proposed mechanism implies measurable expectations: ` +
    (f.observable ? `observable: ${f.observable}; ` : '') +
    (f.measurement ? `measurement: ${f.measurement}; ` : '') +
    (f.expectedRelation ? `expected relation: ${f.expectedRelation}. ` : '') +
    (f.decisionRule ? `Decision rule: ${f.decisionRule} (provenance: ${f.decisionRuleProvenance ?? 'unspecified'}). ` : '') +
    (f.falsificationCondition ? `The idea is weakened if: ${f.weakeningCondition ?? ''}; falsified if: ${f.falsificationCondition}.` : '') +
    (lit ? ` Literature-novelty assessment against retrieved neighbors: ${lit.verdict} (${lit.neighbors.length} neighbors; ${lit.justification}).` : '');
  return { idea, hypId: top.id };
};

const renderProposal = (runId) => {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  const objs = (kind) => db.prepare('SELECT json FROM objects WHERE kind=? AND run_id=?').all(kind, runId).map((r) => JSON.parse(r.json));
  db.close();
  const plan = objs('plan').at(-1);
  const hyps = objs('hypothesis').filter(isRepresentative);
  const tournament = objs('tournament').at(-1);
  let top = hyps[0];
  if (tournament && hyps.length > 1) {
    const order = tournament.standings.map((s) => s.hypothesisId ?? s.id).filter(Boolean);
    top = order.map((id) => hyps.find((h) => h.id === id)).find(Boolean) ?? hyps[0];
  }
  const corpus = objs('source_document');
  if (!plan) return { proposal: null, reason: 'no plan object' };
  const step = (s, i) => `${i + 1}. [${s.kind}] ${s.title}: ${s.method ?? ''}` + (Array.isArray(s.failureConditions) && s.failureConditions.length ? ` Failure conditions: ${s.failureConditions.join('; ')}.` : '');
  const proposal =
    `Title\n${top ? top.statement : plan.objective}\n\n` +
    `Introduction\nObjective: ${plan.objective ?? ''}\n` +
    `The proposal discriminates between ${hyps.length} evidence-grounded hypotheses; the leading candidate is stated in the title, ranked by pairwise tournament with Bradley-Terry aggregation (uncertainty reported in the run scorecard).\n\n` +
    `Methodology\n${(plan.steps ?? []).map(step).join('\n')}\n\n` +
    `Metrics\n${(plan.metrics ?? []).map((m, i) => `${i + 1}. ${typeof m === 'string' ? m : JSON.stringify(m)}`).join('\n')}\n\n` +
    `Decision Rules\n` +
    `Success: ${plan.decisionRules?.successCriterion ?? ''}\n` +
    `Weakening: ${plan.decisionRules?.weakeningCriterion ?? ''}\n` +
    `Falsification: ${plan.decisionRules?.falsificationCriterion ?? ''}\n` +
    `Stop: ${plan.decisionRules?.stopCriterion ?? ''}\n\n` +
    `Literature basis (${corpus.length} retrieved sources, claims bound to retrieved text only):\n` +
    corpus.slice(0, 8).map((d) => `- ${d.title} (${d.publicationYear ?? 'n.d.'})${d.identifiers.find((i) => i.kind === 'doi') ? ' doi:' + d.identifiers.find((i) => i.kind === 'doi').value : ''}`).join('\n');
  return { proposal };
};

// ---------------------------------------------------------------------------
// judging (official rubric verbatim; our DeepSeek judge, temperature 0)
// ---------------------------------------------------------------------------

const parseReview = (raw) => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return new Error('not an object');
  const entries = Object.entries(raw);
  if (entries.length < 6) return new Error(`expected >=6 dimensions, got ${entries.length}`);
  for (const [k, v] of entries) {
    if (v === null || typeof v !== 'object') return new Error(`missing ${k}`);
    if (!Number.isInteger(v.score) || v.score < 1 || v.score > 10) return new Error(`${k}.score invalid`);
    if (k === 'OverallAssessment') {
      if (!Array.isArray(v.strengths) || !Array.isArray(v.weaknesses)) return new Error('OverallAssessment arrays missing');
    } else if (typeof v.justification !== 'string' || v.justification.length < 1) {
      return new Error(`${k}.justification missing`);
    }
  }
  if (!('OverallAssessment' in raw)) return new Error('missing OverallAssessment');
  return raw;
};

const judgeOne = async (provider, rubric, stage, contentMd, taskText, task, agent) => {
  const res = await provider.structuredCall(
    {
      task: rubric,
      systemPrompt: 'You are an expert machine learning reviewer applying the rubric exactly as written.',
      userPayload: {
        stage,
        review_target: contentMd,
        task_description: taskText,
      },
      outputKind: 'json',
      temperature: 0.0,
      maxTokens: 3000,
      purpose: `mlr-bench-${stage}-judge`,
    },
    parseReview,
  );
  if (!res.ok) throw new Error(`judge failed ${task}/${agent}/${stage}: ${res.error?.message}`);
  return res.data;
};

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const provider = makeProvider();
if (!provider.liveReady) die('DEEPSEEK_API_KEY not set');

const eligible = eligibleTasks();
if (eligible.length < SAMPLE_N) die(`only ${eligible.length} eligible tasks with full anchor coverage`);
// Fisher-Yates with the seeded rng (comparison-sort shuffles are biased)
const pool = [...eligible];
for (let i = pool.length - 1; i > 0; i--) {
  const r = rng(SEED + i);
  const j = Math.floor(r() * (i + 1));
  [pool[i], pool[j]] = [pool[j], pool[i]];
}
const sampled = pool.slice(0, SAMPLE_N).sort();
console.log(`[mlr-bench] eligible=${eligible.length} sampled(Seed ${SEED}, N=${SAMPLE_N}): ${sampled.join(', ')}`);
if (process.argv.includes('--dry-run')) {
  console.log(`[mlr-bench] rubrics extracted: idea=${IDEA_RUBRIC.length} chars, proposal=${PROPOSAL_RUBRIC.length} chars`);
  console.log(`[mlr-bench] idea-rubric-dims: CONSISTENCY=${IDEA_RUBRIC.includes('CONSISTENCY')} OverallAssessment=${IDEA_RUBRIC.includes('OverallAssessment')}; proposal SOUNDNESS=${PROPOSAL_RUBRIC.includes('SOUNDNESS')}`);
  console.log(`[mlr-bench] sample question head: ${questionFor(sampled[0]).slice(0, 160)}`);
  process.exit(0);
}

mkdirSync(RESULTS_DIR, { recursive: true });

// phase 1: FAR-Lab runs (sequential, ids recorded incrementally for resume)
if (!SKIP_RUNS) {
  const done = new Set(
    existsSync(RUNS_FILE) ? readFileSync(RUNS_FILE, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).task) : [],
  );
  for (const task of sampled) {
    if (done.has(task)) { console.log(`[mlr-bench] ${task}: run exists, skipping`); continue; }
    const q = questionFor(task);
    console.log(`[mlr-bench] starting FAR-Lab run for ${task} (question ${q.length} chars)`);
    try {
      const r = farRun(task, q);
      writeFileSync(RUNS_FILE, (existsSync(RUNS_FILE) ? readFileSync(RUNS_FILE, 'utf8') : '') + JSON.stringify({ task, runId: r.runId, status: r.status }) + '\n');
      console.log(`[mlr-bench] ${task} -> ${r.runId} (${r.status})`);
    } catch (e) {
      writeFileSync(RUNS_FILE, (existsSync(RUNS_FILE) ? readFileSync(RUNS_FILE, 'utf8') : '') + JSON.stringify({ task, error: String(e.message).slice(0, 300) }) + '\n');
      console.error(`[mlr-bench] ${task} RUN FAILED: ${e.message}`);
    }
  }
}

const runs = existsSync(RUNS_FILE) ? readFileSync(RUNS_FILE, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];

// phase 2: render + judge everything (resume-safe by rewriting whole file each pass)
const records = [];
for (const r of runs) {
  if (!r.runId) continue;
  const taskText = taskMd(r.task);
  const { idea } = renderIdea(r.runId);
  const { proposal } = renderProposal(r.runId);
  for (const [agent, ideaMd, proposalMd] of [
    ['farlab', idea, proposal],
    ...ANCHOR_AGENTS.map((a) => [a,
      readFileSync(join(REPO, 'agent_results/ideas_and_proposals', r.task, 'idea', `idea_${a}.md`), 'utf8'),
      readFileSync(join(REPO, 'agent_results/ideas_and_proposals', r.task, 'proposal', `proposal_${a}.md`), 'utf8')]),
  ]) {
    for (const [stage, md, rubric] of [['idea', ideaMd, IDEA_RUBRIC], ['proposal', proposalMd, PROPOSAL_RUBRIC]]) {
      if (md === null || md === undefined) {
        records.push({ task: r.task, runId: r.runId, agent, stage, skipped: true, reason: 'no farlab output' });
        continue;
      }
      try {
        const review = await judgeOne(provider, rubric, stage, md, taskText, r.task, agent);
        records.push({
          task: r.task, runId: r.runId, agent, stage, judge: 'deepseek-chat', temperature: 0,
          scores: Object.fromEntries(Object.entries(review).map(([k, v]) => [k, v.score])),
          overall: review.OverallAssessment.score,
          strengths: review.OverallAssessment.strengths,
          weaknesses: review.OverallAssessment.weaknesses,
        });
        console.log(`[mlr-bench] judged ${r.task}/${agent}/${stage} overall=${review.OverallAssessment.score}`);
      } catch (e) {
        records.push({ task: r.task, runId: r.runId, agent, stage, error: String(e.message).slice(0, 300) });
        console.error(`[mlr-bench] judge error ${r.task}/${agent}/${stage}: ${e.message}`);
      }
    }
  }
}

writeFileSync(OUT, records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');

// summary
const byAgent = {};
for (const r of records) {
  if (r.overall === undefined) continue;
  byAgent[r.agent] ??= {};
  byAgent[r.agent][r.stage] ??= [];
  byAgent[r.agent][r.stage].push(r.overall);
}
console.log('\n[mlr-bench] our-judge overall means (same tasks, same judge):');
for (const [agent, stages] of Object.entries(byAgent)) {
  for (const [stage, vals] of Object.entries(stages)) {
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    console.log(`  ${agent.padEnd(22)} ${stage.padEnd(9)} overall mean ${mean.toFixed(2)} (n=${vals.length})`);
  }
}
console.log(`\nDONE -> ${OUT}`);
