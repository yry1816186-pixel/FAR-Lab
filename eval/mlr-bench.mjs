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
 *   our judge is the makeProvider GLM route (temperature 0; glm since the 2026-08-22 DeepSeek ban).
 *   ONLY; the decision comparison is our-judge-on-same-tasks: farlab vs the
 *   published o4-mini / deepseek-r1 idea+proposal files.
 * - FAR-Lab outputs are rendered from persisted run objects by a deterministic
 *   mapping (top tournament representative -> idea; plan -> proposal). No manual
 *   editing, no embellishment.
 *
 * Usage: node eval/mlr-bench.mjs [--skip-runs]   (writes eval/results/mlr-bench.jsonl)
 * Env: MLRBENCH_REPO (default .cache/repos/mlrbench); provider via makeProvider (GLM default, FARLAB_BASELINE_PROVIDER=glm|zai|dashscope; deepseek banned).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { makeProvider } from './lib.mjs';
import { isRepresentative } from '../dist/pipeline/stages/shared.js';

const SEED = 20260822;
const SAMPLE_N = Number(process.env.MLR_SAMPLE_N ?? 5);
// Sharding (FA-SCI-07 sprint 2026-09-04): a 30-task batch is calendar-infeasible
// serially (~40min/run); MLR_SHARD=i/MLR_SHARDS=n restricts THIS process to the
// i-th slice of the sampled list with per-shard runs/out files. Merge the runs
// files and re-run --skip-runs (with MLR_RUNS_FILE on the merged file) for the
// unified judge pass.
const SHARD = Number(process.env.MLR_SHARD ?? 0);
const SHARDS = Number(process.env.MLR_SHARDS ?? 0);
if (!Number.isInteger(SHARD) || !Number.isInteger(SHARDS) || SHARDS < 0 || (SHARDS > 0 && (SHARD < 1 || SHARD > SHARDS))) {
  console.error('FATAL: MLR_SHARD/MLR_SHARDS must be i/n with 1<=i<=n (or 0/0 = unsharded)');
  process.exit(2);
}
const REPO = resolve(process.cwd(), process.env.MLRBENCH_REPO ?? '.cache/repos/mlrbench');
const RESULTS_DIR = resolve(process.cwd(), 'eval/results');
const OUT = resolve(process.cwd(), process.env.MLR_OUT ?? join(RESULTS_DIR, 'mlr-bench.jsonl'));
const RUNS_FILE = resolve(process.cwd(), process.env.MLR_RUNS_FILE ?? join(RESULTS_DIR, 'mlr-bench-runs.jsonl'));
const SKIP_RUNS = process.argv.includes('--skip-runs');
const RENDER_ONLY = process.argv.includes('--render-only'); // deterministic render check, no judge calls, no API key needed
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

/** MLR-Bench task -> FAR-Lab research question (deterministic mapping, recorded).
 * W5-F3 fidelity fix: the CFP's paragraph/list STRUCTURE is preserved (newlines kept)
 * instead of being collapsed into one whitespace-flattened run — the flattening was a
 * diagnosed gap (evidence/W-EV2/mlr-bench.md "task flattening"): FAR-Lab's scope stage
 * cannot see topic boundaries it was never shown. Only markdown noise chars are stripped. */
const questionFor = (task) => {
  const md = taskMd(task);
  const title = md.match(/^#\s+(.+)$/m)?.[1] ?? task;
  let body = md;
  if (body.startsWith('# ')) body = body.slice(body.indexOf('\n') + 1); // heading dropped; title already prepended
  // strip markdown emphasis/code markers but KEEP line structure; cap at a line boundary
  const stripped = body.replace(/[#*`]/g, '');
  const cut = stripped.slice(0, 5_000);
  const lastBreak = cut.lastIndexOf('\n');
  const capped = cut.length >= 5_000 && lastBreak > 2_000 ? cut.slice(0, lastBreak) : cut;
  return `${title}.\n${capped.trim()}`;
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
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: Number(process.env.MLR_RUN_TIMEOUT_MIN ?? 45) * 60_000 });
  const line = stdout.split('\n').filter((l) => l.trim().startsWith('{')).at(-1);
  return JSON.parse(line ?? '{}');
};

const DB_PATH = resolve(process.cwd(), '.far-run/far.db');

const renderIdea = (runId) => {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  const objs = (kind) => db.prepare('SELECT json FROM objects WHERE kind=? AND run_id=?').all(kind, runId).map((r) => JSON.parse(r.json));
  const hyps = objs('hypothesis').filter(isRepresentative);
  const tournament = objs('tournament').at(-1);
  db.close();
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
    (lit
      ? ` Literature-novelty assessment against retrieved neighbors: ${lit.verdict} (${lit.neighbors.length} neighbors; ${lit.justification}).` +
        ` Delta vs nearest neighbors: ${lit.neighbors.slice(0, 3).map((n) => `${n.title}${n.year ? ` (${n.year})` : ''}`).join('; ')}.`
      : '');
  return { idea, hypId: top.id };
};

const renderProposal = (runId) => {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  const objs = (kind) => db.prepare('SELECT json FROM objects WHERE kind=? AND run_id=?').all(kind, runId).map((r) => JSON.parse(r.json));
  const plan = objs('plan').at(-1);
  const hyps = objs('hypothesis').filter(isRepresentative);
  const tournament = objs('tournament').at(-1);
  const corpus = objs('source_document');
  const claims = objs('claim');
  const relations = objs('evidence_relation');
  db.close();
  let top = hyps[0];
  if (tournament && hyps.length > 1) {
    const order = tournament.standings.map((s) => s.hypothesisId ?? s.id).filter(Boolean);
    top = order.map((id) => hyps.find((h) => h.id === id)).find(Boolean) ?? hyps[0];
  }
  if (!plan) return { proposal: null, reason: 'no plan object' };
  // Idea2Plan 5-section alignment (Wave-3 #8): render what the persisted objects ALREADY
  // carry (resources/ethics/confounders/policy/provenance) — fidelity, not embellishment.
  // Per-doc relevance is derived deterministically from bound claims + relation polarity.
  const claimsByDoc = new Map();
  const counterClaimIds = new Set(
    relations.filter((r) => r.relation === 'contradicts' || r.relation === 'weakens').map((r) => r.claimId),
  );
  for (const c of claims) {
    for (const loc of c.locators ?? []) {
      const entry = claimsByDoc.get(loc.sourceDocumentId) ?? { verified: 0, counter: 0 };
      if (c.bindingStatus === 'verified') entry.verified += 1;
      if (counterClaimIds.has(c.id)) entry.counter += 1;
      claimsByDoc.set(loc.sourceDocumentId, entry);
    }
  }
  const relOf = (d) => {
    const e = claimsByDoc.get(d.id);
    if (e === undefined) return 'no bound claims (context only)';
    return `${e.verified} verified claim${e.verified === 1 ? '' : 's'}${e.counter > 0 ? `, ${e.counter} counter-evidence` : ''}`;
  };
  const f = top?.falsification ?? {};
  const mt = plan.multipleTestingPolicy
    ? `Multiple-testing discipline: ${plan.multipleTestingPolicy}${plan.multipleTestingNote ? ` — ${plan.multipleTestingNote}` : ''}\n`
    : '';
  const step = (s, i) => `${i + 1}. [${s.kind}] ${s.title}: ${s.method ?? ''}` + (Array.isArray(s.failureConditions) && s.failureConditions.length ? ` Failure conditions: ${s.failureConditions.join('; ')}.` : '');
  const proposal =
    `Title\n${top ? top.statement : plan.objective}\n\n` +
    `1. Introduction\nObjective: ${plan.objective ?? ''}\n` +
    `The proposal discriminates between ${hyps.length} evidence-grounded hypotheses; the leading candidate is stated in the title (ranked by pairwise tournament with Bradley-Terry aggregation; uncertainty reported in the run scorecard). Its mechanism: ${(top?.mechanism ?? '').slice(0, 400)}\n\n` +
    `2. Key Literatures (${corpus.length} retrieved sources; every claim is bound to text actually retrieved — no ungrounded citations):\n` +
    corpus.slice(0, 12).map((d) => `- ${d.title} (${d.publicationYear ?? 'n.d.'})${d.identifiers.find((i) => i.kind === 'doi') ? ' doi:' + d.identifiers.find((i) => i.kind === 'doi').value : ''} — relevance: ${relOf(d)}`).join('\n') +
    (corpus.length > 12 ? `\n- … ${corpus.length - 12} more` : '') + '\n\n' +
    `3. Methods\n${(plan.steps ?? []).map(step).join('\n')}\n\n` +
    `4. Initial Experimental Design\n` +
    (top && Array.isArray(top.predictions) && top.predictions.length
      ? `Predictions of the leading hypothesis:\n${top.predictions.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n`
      : '') +
    (f.observable || f.measurement || f.expectedRelation
      ? `Falsification design (leading hypothesis): observable: ${f.observable ?? 'n/a'}; measurement: ${f.measurement ?? 'n/a'}; expected relation: ${f.expectedRelation ?? 'n/a'}.\n`
      : '') +
    (f.decisionRule ? `Decision rule: ${f.decisionRule}\n` : '') +
    (plan.statistics?.length ? `Statistics: ${plan.statistics.join('; ')}\n` : '') +
    `Metrics:\n${(plan.metrics ?? []).map((m, i) => `${i + 1}. ${typeof m === 'string' ? m : JSON.stringify(m)}`).join('\n')}\n` +
    `Decision Rules:\n` +
    `Success: ${plan.decisionRules?.successCriterion ?? ''}\n` +
    `Weakening: ${plan.decisionRules?.weakeningCriterion ?? ''}\n` +
    `Falsification: ${plan.decisionRules?.falsificationCriterion ?? ''}\n` +
    `Stop: ${plan.decisionRules?.stopCriterion ?? ''}\n` +
    (f.decisionRuleProvenance ? `Threshold provenance (leading hypothesis): ${f.decisionRuleProvenance}.\n` : '') +
    mt + '\n' +
    `5. Resources, Compliance, and Ethical Considerations\n` +
    `Compute: ${plan.resources?.compute ?? 'n/a'}; cost: ${plan.resources?.cost ?? 'n/a'}; time: ${plan.resources?.time ?? 'n/a'}.\n` +
    (plan.confounders?.length ? `Confounders: ${plan.confounders.join('; ')}.\n` : '') +
    (plan.alternativeExplanations?.length ? `Alternative explanations: ${plan.alternativeExplanations.join('; ')}.\n` : '') +
    (plan.ethics?.length ? `Ethics: ${plan.ethics.join('; ')}.\n` : '') +
    (plan.risks?.length ? `Risks: ${plan.risks.join('; ')}.` : '');
  return { proposal };
};

// ---------------------------------------------------------------------------
// judging (official rubric verbatim; makeProvider GLM route, temperature 0)
// ---------------------------------------------------------------------------

// Official dimension key sets (must match the verbatim rubrics; asserted at startup so an
// upstream rename fails fast instead of silently admitting garbage dimension names).
const IDEA_DIMS = ['Consistency', 'Clarity', 'Novelty', 'Feasibility', 'Significance', 'OverallAssessment'];
const PROPOSAL_DIMS = ['Consistency', 'Clarity', 'Novelty', 'Soundness', 'Feasibility', 'Significance', 'OverallAssessment'];
const dimName = (rubric, dim) => rubric.toUpperCase().includes(dim.toUpperCase());

const parseReview = (expectedDims, raw) => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return new Error('not an object');
  const entries = Object.entries(raw);
  const got = [...entries.map(([k]) => k)].sort();
  const want = [...expectedDims].sort();
  if (got.length !== want.length || got.some((k, i) => k !== want[i])) {
    return new Error(`dimension key set mismatch: got [${got.join(',')}] want [${want.join(',')}]`);
  }
  for (const [k, v] of entries) {
    if (v === null || typeof v !== 'object') return new Error(`missing ${k}`);
    if (!Number.isInteger(v.score) || v.score < 1 || v.score > 10) return new Error(`${k}.score invalid`);
    if (k === 'OverallAssessment') {
      if (!Array.isArray(v.strengths) || !Array.isArray(v.weaknesses)) return new Error('OverallAssessment arrays missing');
    } else if (typeof v.justification !== 'string' || v.justification.length < 1) {
      return new Error(`${k}.justification missing`);
    }
  }
  return raw;
};

const judgeOne = async (provider, rubric, expectedDims, stage, contentMd, taskText, task, agent, contextMd) => {
  const res = await provider.structuredCall(
    {
      task: rubric,
      systemPrompt: 'You are an expert machine learning reviewer applying the rubric exactly as written.',
      userPayload: {
        stage,
        review_target: contentMd,
        task_description: taskText,
        // W5-F3 grounding-context parity: upstream proposal judges read task + IDEA +
        // related work together (mlrbench review_proposal.py:169-185) — consistency is
        // only gradeable against the upstream artifact. Context for judging only;
        // the idea itself is NOT re-scored here.
        ...(stage === 'proposal' && contextMd
          ? { idea_for_consistency_context: contextMd, context_note: 'idea provided as consistency-judging context only; score the PROPOSAL against the rubric' }
          : {}),
      },
      outputKind: 'json',
      temperature: 0.0,
      maxTokens: 3000,
      purpose: `mlr-bench-${stage}-judge`,
    },
    (raw) => parseReview(expectedDims, raw),
  );
  if (!res.ok) throw new Error(`judge failed ${task}/${agent}/${stage}: ${res.error?.message}`);
  return res.data;
};

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const provider = await makeProvider();
if (!provider.liveReady && !RENDER_ONLY) die('live route not ready (check FARLAB_BASELINE_PROVIDER/ZAI key per makeProvider — deepseek is banned)');

const eligible = eligibleTasks();
if (eligible.length < SAMPLE_N) die(`only ${eligible.length} eligible tasks with full anchor coverage`);
// Fisher-Yates with the seeded rng (comparison-sort shuffles are biased)
const pool = [...eligible];
for (let i = pool.length - 1; i > 0; i--) {
  const r = rng(SEED + i);
  const j = Math.floor(r() * (i + 1));
  [pool[i], pool[j]] = [pool[j], pool[i]];
}
const sampledAll = pool.slice(0, SAMPLE_N).sort();
const sampled = SHARDS > 0 ? sampledAll.filter((_, i) => i % SHARDS === (SHARD - 1)) : sampledAll;
console.log(`[mlr-bench] eligible=${eligible.length} sampled(Seed ${SEED}, N=${SAMPLE_N}${SHARDS > 0 ? `, shard ${SHARD}/${SHARDS}` : ''}): ${sampled.join(', ')}`);
if (process.argv.includes('--dry-run')) {
  console.log(`[mlr-bench] rubrics extracted: idea=${IDEA_RUBRIC.length} chars, proposal=${PROPOSAL_RUBRIC.length} chars`);
  console.log(`[mlr-bench] idea-rubric-dims: CONSISTENCY=${IDEA_RUBRIC.includes('CONSISTENCY')} OverallAssessment=${IDEA_RUBRIC.includes('OverallAssessment')}; proposal SOUNDNESS=${PROPOSAL_RUBRIC.includes('SOUNDNESS')}`);
  console.log(`[mlr-bench] sample question head: ${questionFor(sampled[0]).slice(0, 160)}`);
  process.exit(0);
}

mkdirSync(RESULTS_DIR, { recursive: true });

// fail fast if upstream renames a rubric dimension (expected key sets must match verbatim rubrics)
for (const d of IDEA_DIMS) if (!dimName(IDEA_RUBRIC, d)) die(`idea rubric no longer mentions dimension '${d}'`);
for (const d of PROPOSAL_DIMS) if (!dimName(PROPOSAL_RUBRIC, d)) die(`proposal rubric no longer mentions dimension '${d}'`);

// phase 1: FAR-Lab runs (sequential, ids recorded incrementally for resume)
if (!SKIP_RUNS) {
  const priorLines = existsSync(RUNS_FILE) ? readFileSync(RUNS_FILE, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const done = new Set(priorLines.filter((r) => r.runId).map((r) => r.task));
  for (const task of sampled) {
    if (done.has(task)) { console.log(`[mlr-bench] ${task}: run exists, skipping`); continue; }
    const q = questionFor(task);
    console.log(`[mlr-bench] starting FAR-Lab run for ${task} (question ${q.length} chars)`);
    try {
      const r = farRun(task, q);
      writeFileSync(RUNS_FILE, (existsSync(RUNS_FILE) ? readFileSync(RUNS_FILE, 'utf8') : '') + JSON.stringify({ task, runId: r.runId, status: r.status }) + '\n');
      console.log(`[mlr-bench] ${task} -> ${r.runId} (${r.status})`);
    } catch (e) {
      writeFileSync(RUNS_FILE, (existsSync(RUNS_FILE) ? readFileSync(RUNS_FILE, 'utf8') : '') + JSON.stringify({ task, error: String(e.message).slice(0, 300), stderr: String(e.stderr ?? '').slice(0, 500) }) + '\n');
      console.error(`[mlr-bench] ${task} RUN FAILED: ${e.message}${e.stderr ? '\nstderr: ' + String(e.stderr).slice(0, 1000) : ''}`);
    }
  }
}

const runs = existsSync(RUNS_FILE) ? readFileSync(RUNS_FILE, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
// dedupe by task (first runId line wins; a duplicate could only appear if the CLI printed
// JSON then still exited non-zero — surfaced loudly instead of double-judged silently)
const seenTasks = new Set();
const uniqueRuns = [];
for (const r of runs) {
  if (!r.runId || seenTasks.has(r.task)) continue;
  seenTasks.add(r.task);
  uniqueRuns.push(r);
}
if (uniqueRuns.length !== runs.filter((r) => r.runId).length) {
  console.warn(`[mlr-bench] NOTE: duplicate task runId lines in ${RUNS_FILE}; judging each task once (first line)`);
}

// deterministic render verification (no model calls): REL_RENDER_RUN=<runId> node eval/mlr-bench.mjs --render-only
if (RENDER_ONLY) {
  const runId = process.env.REL_RENDER_RUN ?? uniqueRuns.at(-1)?.runId;
  if (!runId) die('--render-only: no runId available (pass REL_RENDER_RUN)');
  const { idea } = renderIdea(runId);
  const { proposal } = renderProposal(runId);
  console.log(`[mlr-bench] render-only for ${runId} (rendering: idea-proposal-v2)`);
  console.log('===== IDEA =====\n' + (idea ?? '(null: no representative hypotheses)'));
  console.log('===== PROPOSAL =====\n' + (proposal ?? '(null: no plan object)'));
  process.exit(0);
}

// phase 2: render + judge everything (resume-safe by rewriting whole file each pass)
const records = [];
for (const r of uniqueRuns) {
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
    for (const [stage, md, rubric, dims] of [['idea', ideaMd, IDEA_RUBRIC, IDEA_DIMS], ['proposal', proposalMd, PROPOSAL_RUBRIC, PROPOSAL_DIMS]]) {
      if (md === null || md === undefined) {
        records.push({ task: r.task, runId: r.runId, agent, stage, skipped: true, reason: 'no farlab output' });
        continue;
      }
      try {
        const review = await judgeOne(provider, rubric, dims, stage, md, taskText, r.task, agent, ideaMd);
        records.push({
judge: 'glm (makeProvider route; identity per PROTOCOL addendum)', temperature: 0,
          ...(agent === 'farlab' ? { rendering: 'idea-proposal-v2' } : {}),
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
