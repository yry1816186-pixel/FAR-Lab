/**
 * W4 deterministic metrics (pre-declared in eval/PROTOCOL.md).
 * Reads: .far-run/far.db (read-only), eval/results/baseline-*.jsonl
 * Writes: eval/results/metrics.json (+ stdout tables)
 * Uses the SAME dist checkers as the pipeline: checkFalsificationCompleteness, checkPlanExecutability,
 * and isRepresentative for clustering. Citation validity = live Crossref DOI resolution.
 * Run: node eval/metrics.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { HypothesisCandidate, ResearchPlan } from '../dist/domain/index.js';
import { checkFalsificationCompleteness } from '../dist/pipeline/stages/falsify.js';
import { checkPlanExecutability } from '../dist/pipeline/stages/plan.js';
import { isRepresentative } from '../dist/pipeline/stages/shared.js';
import { createCrossrefAdapter } from '../dist/sources/crossref.js';

const DB_PATH = new URL('../.far-run/far.db', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const RESULTS_DIR = new URL('./results/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const db = new DatabaseSync(DB_PATH, { readOnly: true });
const objects = (kind, runId) =>
  db.prepare('SELECT json FROM objects WHERE kind=? AND run_id=?').all(kind, runId).map((r) => JSON.parse(r.json));

// ---------------------------------------------------------------------------
// FAR-Lab per-run metrics
// ---------------------------------------------------------------------------
const COUNTER_RELATIONS = new Set(['contradicts', 'weakens', 'fails_to_replicate', 'alternative_explanation']);

const farlabRunMetrics = (runId) => {
  const run = db.prepare('SELECT doc FROM runs WHERE id=?').get(runId);
  const runDoc = JSON.parse(run.doc);
  const sources = objects('source_document', runId);
  const claims = objects('claim', runId);
  const relations = objects('evidence_relation', runId);
  const hypotheses = objects('hypothesis', runId);
  const plans = objects('plan', runId);
  const receipts = objects('receipt', runId);

  const verifiedSources = sources.filter((s) => s.verification && s.verification.resolved === true && s.verification.titleMatch === true);
  const verifiedClaims = claims.filter((c) => c.bindingStatus === 'verified');
  const counterRelations = relations.filter((r) => COUNTER_RELATIONS.has(r.relation));
  const relationTypeCounts = {};
  for (const r of relations) relationTypeCounts[r.relation] = (relationTypeCounts[r.relation] ?? 0) + 1;
  const reps = hypotheses.filter((h) => isRepresentative(h));
  const withSpec = reps.filter((h) => h.falsification);
  const completeSpecs = withSpec.filter((h) => h.falsification.completenessCheck && h.falsification.completenessCheck.passed === true);
  const plan = plans[0] ?? null;

  // performance profile from receipts
  const modelCalls = receipts.filter((r) => r.kind === 'model_call');
  const atList = receipts.map((r) => r.at).sort();
  const span = atList.length >= 2 ? Date.parse(atList[atList.length - 1]) - Date.parse(atList[0]) : 0;
  const byStage = {};
  for (const r of modelCalls) {
    const st = r.stage ?? '(unrecorded)';
    byStage[st] ??= { calls: 0, latencyMs: [] };
    byStage[st].calls += 1;
    if (r.modelCall) byStage[st].latencyMs.push(r.modelCall.latencyMs);
  }
  const allLat = modelCalls.map((r) => r.modelCall?.latencyMs ?? null).filter((v) => v !== null).sort((a, b) => a - b);
  const tokens = modelCalls.reduce(
    (acc, r) => ({
      prompt: acc.prompt + (r.modelCall?.usage?.promptTokens ?? 0),
      completion: acc.completion + (r.modelCall?.usage?.completionTokens ?? 0),
      total: acc.total + (r.modelCall?.usage?.totalTokens ?? 0),
    }),
    { prompt: 0, completion: 0, total: 0 },
  );

  return {
    runId,
    status: runDoc.status,
    sources_total: sources.length,
    sources_verified: verifiedSources.length,
    source_verification_rate: sources.length ? verifiedSources.length / sources.length : null,
    claims_total: claims.length,
    claims_verified: verifiedClaims.length,
    claim_binding_rate: claims.length ? verifiedClaims.length / claims.length : null,
    evidence_relations_total: relations.length,
    counter_evidence_relations: counterRelations.length,
    relation_type_counts: relationTypeCounts,
    hypotheses_total: hypotheses.length,
    representatives: reps.length,
    hypothesis_distinctness: hypotheses.length ? reps.length / hypotheses.length : null,
    falsification_total: withSpec.length,
    falsification_complete: completeSpecs.length,
    falsification_completeness_rate: withSpec.length ? completeSpecs.length / withSpec.length : null,
    plan_present: plan !== null,
    plan_executability_passed: plan?.executabilityCheck?.passed ?? null,
    plan_executability_missing: plan?.executabilityCheck?.missing ?? null,
    receipts: receipts.length,
    model_calls: modelCalls.length,
    live_receipts: receipts.filter((r) => r.executionMode === 'live').length,
    live_rate: receipts.length ? receipts.filter((r) => r.executionMode === 'live').length / receipts.length : null,
    perf: {
      first_to_last_receipt_ms: span,
      model_call_latency_ms: allLat.length
        ? { min: allLat[0], median: allLat[Math.floor(allLat.length / 2)], max: allLat[allLat.length - 1] }
        : null,
      model_calls_by_stage: Object.fromEntries(
        Object.entries(byStage).map(([st, v]) => [
          st,
          { calls: v.calls, latencyMs: v.latencyMs.length ? { min: Math.min(...v.latencyMs), median: v.latencyMs.sort((a, b) => a - b)[Math.floor(v.latencyMs.length / 2)], max: Math.max(...v.latencyMs) } : null },
        ]),
      ),
      tokens,
    },
  };
};

// ---------------------------------------------------------------------------
// Baseline metrics: zod schema parse + SAME deterministic checkers
// ---------------------------------------------------------------------------
const NOW = '2026-08-21T00:00:00.000Z';
// ids must satisfy the domain regex ^prefix_[0-9a-z]{20,32}$ — evaluation-local opaque bodies
const evalId = (prefix, n) => `${prefix}_evalw4${String(n).padStart(14, '0')}`;

const buildZodHypotheses = (output) =>
  (output.hypotheses ?? []).map((h, i) => ({
    id: evalId('hyp', i + 1),
    runId: evalId('run', 0),
    version: 0,
    statement: h.statement ?? '',
    mechanism: h.mechanism ?? '',
    derivation: { strategy: 'evidence_conditioned', rationale: 'baseline single-shot output', inputClaimIds: [] },
    assumptions: (h.assumptions ?? []).map((a, j) => ({ id: `asm_${i}_${j}`, statement: String(a), kind: 'stipulated', backingClaimIds: [] })),
    predictions: (h.predictions ?? []).map(String),
    falsification: h.falsification
      ? {
          observable: h.falsification.observable ?? '',
          measurement: h.falsification.measurement ?? '',
          expectedRelation: h.falsification.expectedRelation ?? '',
          decisionRule: h.falsification.decisionRule ?? '',
          supportCondition: h.falsification.supportCondition ?? '',
          weakeningCondition: h.falsification.weakeningCondition ?? '',
          falsificationCondition: h.falsification.falsificationCondition ?? '',
          confounders: (h.falsification.confounders ?? []).map(String),
          alternativeExplanations: (h.falsification.alternativeExplanations ?? []).map(String),
          dataRequirements: (h.falsification.dataRequirements ?? []).map(String),
          method: h.falsification.method ?? '',
          failureInterpretation: h.falsification.failureInterpretation ?? '',
        }
      : undefined,
    createdAt: NOW,
  }));

const buildZodPlan = (output, hypIds) => ({
  id: evalId('pln', 1),
  runId: evalId('run', 0),
  objective: output.plan?.objective ?? '',
  hypothesisIds: hypIds,
  variables: [],
  controls: [],
  inclusionCriteria: [],
  exclusionCriteria: [],
  dataRequirements: [], // baseline schema (declared in PROTOCOL) does not request dataRequirements
  toolRequirements: [],
  steps: (output.plan?.steps ?? []).map((s, i) => ({
    id: evalId('task', i + 1),
    title: s.title ?? `step ${i + 1}`,
    kind: s.kind ?? 'other',
    inputs: [],
    outputs: [],
    method: s.method ?? '',
    failureConditions: (s.failureConditions ?? []).map(String),
    dependsOn: [],
  })),
  metrics: (output.plan?.metrics ?? []).map(String),
  statistics: [],
  decisionRules: {
    successCriterion: output.plan?.decisionRules?.successCriterion ?? '',
    weakeningCriterion: output.plan?.decisionRules?.weakeningCriterion ?? '',
    falsificationCriterion: output.plan?.decisionRules?.falsificationCriterion ?? '',
    stopCriterion: output.plan?.decisionRules?.stopCriterion ?? '',
  },
  confounders: [],
  alternativeExplanations: [],
  risks: [],
  ethics: [],
  prerequisites: [],
  evidenceClaimIds: [],
  createdAt: NOW,
});

const baselineMetrics = (record) => {
  const out = {
    problemId: record.problemId,
    baseline: record.baseline,
    call_ok: record.ok === true,
    shape_parse_ok: record.parse?.ok === true,
    shape_parse_reason: record.parse?.ok === false ? record.parse.reason : null,
  };
  if (!record.ok || !record.output) return { ...out, zod_hypothesis_parse_ok: null, zod_plan_parse_ok: null, zod_failures: ['call_failed'], checker: null, citations: null };

  const zodFailures = [];
  const hyps = buildZodHypotheses(record.output);
  const hypResults = hyps.map((h) => {
    const r = HypothesisCandidate.safeParse(h);
    if (!r.success) zodFailures.push(`hypothesis[${h.id}]: ${r.error.issues.slice(0, 2).map((i) => `${i.path.join('.')}:${i.message}`).join(' | ')}`);
    return r.success;
  });
  const planObj = buildZodPlan(record.output, hyps.map((h) => h.id));
  const planResult = ResearchPlan.safeParse(planObj);
  if (!planResult.success) zodFailures.push(`plan: ${planResult.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}:${i.message}`).join(' | ')}`);

  // SAME deterministic checkers on raw baseline output
  const falsifyChecks = (record.output.hypotheses ?? []).map((h) =>
    h.falsification
      ? checkFalsificationCompleteness({
          observable: h.falsification.observable ?? '',
          measurement: h.falsification.measurement ?? '',
          expectedRelation: h.falsification.expectedRelation ?? '',
          decisionRule: h.falsification.decisionRule ?? '',
          supportCondition: h.falsification.supportCondition ?? '',
          weakeningCondition: h.falsification.weakeningCondition ?? '',
          falsificationCondition: h.falsification.falsificationCondition ?? '',
          method: h.falsification.method ?? '',
          failureInterpretation: h.falsification.failureInterpretation ?? '',
        })
      : { passed: false, missing: ['falsification: absent'] },
  );
  const execCheck = checkPlanExecutability(
    {
      objective: record.output.plan?.objective ?? '',
      hypothesisIds: hyps.map((h) => h.id),
      steps: (record.output.plan?.steps ?? []).map((s, i) => ({
        id: evalId('task', i + 1),
        title: s.title ?? `step ${i + 1}`,
        method: s.method ?? '',
        failureConditions: (s.failureConditions ?? []).map(String),
        inputs: [],
        dependsOn: [],
      })),
      metrics: (record.output.plan?.metrics ?? []).map(String),
      decisionRules: {
        successCriterion: record.output.plan?.decisionRules?.successCriterion ?? '',
        weakeningCriterion: record.output.plan?.decisionRules?.weakeningCriterion ?? '',
        falsificationCriterion: record.output.plan?.decisionRules?.falsificationCriterion ?? '',
        stopCriterion: record.output.plan?.decisionRules?.stopCriterion ?? '',
      },
      dataRequirements: [],
    },
    hyps.map((h) => h.id),
  );

  return {
    ...out,
    hypotheses_n: hyps.length,
    zod_hypothesis_parse_ok: hypResults.every(Boolean),
    zod_hypotheses_parsed: hypResults.filter(Boolean).length,
    zod_plan_parse_ok: planResult.success,
    zod_failures: zodFailures,
    checker: {
      falsification_completeness_rate: falsifyChecks.length ? falsifyChecks.filter((c) => c.passed).length / falsifyChecks.length : null,
      falsification_missing_examples: falsifyChecks.flatMap((c) => c.missing).slice(0, 6),
      plan_executability_passed: execCheck.passed,
      plan_executability_missing: execCheck.missing.slice(0, 8),
    },
    tokens: record.receipt?.usage ?? null,
    wall_ms: record.wallMs ?? null,
    model_version: record.receipt?.modelVersion ?? record.receipt?.modelId ?? null,
  };
};

// ---------------------------------------------------------------------------
// Citation validity: live Crossref DOI resolution + title match + quote grounding
// ---------------------------------------------------------------------------
const normalizeText = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const tokenOverlap = (a, b) => {
  const A = new Set(normalizeText(a).split(' ').filter((w) => w.length > 1));
  const B = new Set(normalizeText(b).split(' ').filter((w) => w.length > 1));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / Math.min(A.size, B.size);
};

const citationValidity = async (record, crossref) => {
  const cites = record.output?.citations;
  if (!Array.isArray(cites) || cites.length === 0) return { citations_total: Array.isArray(cites) ? cites.length : null, note: 'no citations array or empty' };
  const corpus = record.baseline === 'rag' ? (record.retrieval?.corpus ?? []) : [];
  const details = [];
  for (const c of cites) {
    const doi = typeof c?.doi === 'string' ? c.doi.trim().replace(/^https?:\/\/doi\.org\//i, '').replace(/^doi:/i, '') : '';
    let resolved = false;
    let crossrefTitle = null;
    let titleMatch = false;
    if (doi) {
      try {
        const r = await crossref.resolve({ kind: 'doi', value: doi });
        resolved = r.found === true;
        crossrefTitle = r.record?.title ?? null;
        if (resolved) titleMatch = tokenOverlap(c.title ?? '', crossrefTitle) >= 0.6;
      } catch {
        resolved = false;
      }
    }
    let quote_grounded = null;
    if (record.baseline === 'rag' && typeof c?.quote === 'string' && c.quote.trim()) {
      const nq = normalizeText(c.quote);
      quote_grounded = corpus.some((s) => normalizeText(`${s.title ?? ''} ${s.abstractText ?? ''}`).includes(nq));
    }
    details.push({ doi: doi || null, resolved, crossref_title: crossrefTitle, cited_title: c?.title ?? null, title_match: titleMatch, quote_grounded });
  }
  const supported = details.filter((d) => d.resolved && d.title_match).length;
  return {
    citations_total: details.length,
    doi_resolved: details.filter((d) => d.resolved).length,
    title_matched: details.filter((d) => d.title_match).length,
    quote_grounded: details.filter((d) => d.quote_grounded === true).length,
    quote_checked: details.filter((d) => d.quote_grounded !== null).length,
    unsupported_rate: details.length ? 1 - supported / details.length : null,
    details,
  };
};

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
const readJsonl = (name) => {
  try {
    return readFileSync(RESULTS_DIR + name, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
};

// FARLAB_PROBLEMS resolves against the CURRENT WORKING DIRECTORY (a plain path),
// so pinned-problem files created next to this script are reachable regardless of
// how the process addresses the repo (URL-based resolution breaks under path
// virtualization where fresh writes are not visible through absolute file URLs).
const problemsPath = process.env.FARLAB_PROBLEMS
  ? resolve(process.cwd(), process.env.FARLAB_PROBLEMS)
  : fileURLToPath(new URL('./problems.json', import.meta.url));
const problems = JSON.parse(readFileSync(problemsPath, 'utf8')).problems;
const crossref = createCrossrefAdapter();

const farlab = {};
for (const p of problems) {
  if (p.farRunId) farlab[p.id] = farlabRunMetrics(p.farRunId);
}

// resolve FAR-Lab runs for problems without a pinned id: match by question text
for (const p of problems) {
  if (!p.farRunId) {
    const rows = db.prepare('SELECT id, question_id, created_at FROM runs ORDER BY created_at DESC').all();
    for (const r of rows) {
      const qrow = db.prepare('SELECT json FROM objects WHERE kind=? AND id=?').get('question', r.question_id);
      if (qrow && JSON.parse(qrow.json).text === p.text) {
        farlab[p.id] = farlabRunMetrics(r.id);
        farlab[p.id].resolvedByQuestionMatch = true;
        break;
      }
    }
  }
}

const baselines = { direct: [], rag: [] };
for (const rec of readJsonl('baseline-direct.jsonl')) baselines.direct.push(baselineMetrics(rec));
for (const rec of readJsonl('baseline-rag.jsonl')) baselines.rag.push(baselineMetrics(rec));

// citation validity (network) — only for records that produced output
const citationChecks = { direct: [], rag: [] };
for (const rec of readJsonl('baseline-direct.jsonl')) citationChecks.direct.push(await citationValidity(rec, crossref));
for (const rec of readJsonl('baseline-rag.jsonl')) citationChecks.rag.push(await citationValidity(rec, crossref));

// aggregate helpers
const mean = (xs) => {
  const v = xs.filter((x) => typeof x === 'number' && !Number.isNaN(x));
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10000) / 10000 : null;
};

const farlabAgg = {
  runs: Object.keys(farlab).length,
  source_verification_rate: mean(Object.values(farlab).map((m) => m.source_verification_rate)),
  claim_binding_rate: mean(Object.values(farlab).map((m) => m.claim_binding_rate)),
  counter_evidence_runs_with_any: Object.values(farlab).filter((m) => m.counter_evidence_relations > 0).length,
  counter_evidence_coverage: Object.values(farlab).length ? Object.values(farlab).filter((m) => m.counter_evidence_relations > 0).length / Object.values(farlab).length : null,
  counter_evidence_relations_mean: mean(Object.values(farlab).map((m) => m.counter_evidence_relations)),
  hypothesis_distinctness: mean(Object.values(farlab).map((m) => m.hypothesis_distinctness)),
  representatives_mean: mean(Object.values(farlab).map((m) => m.representatives)),
  falsification_completeness_rate: mean(Object.values(farlab).map((m) => m.falsification_completeness_rate)),
  plan_executability_pass_runs: Object.values(farlab).filter((m) => m.plan_executability_passed === true).length,
  live_rate: mean(Object.values(farlab).map((m) => m.live_rate)),
};

const baselineAgg = (list) => ({
  problems: list.length,
  call_ok: list.filter((m) => m.call_ok).length,
  shape_parse_ok: list.filter((m) => m.shape_parse_ok).length,
  zod_hypothesis_fully_parsed: list.filter((m) => m.zod_hypothesis_parse_ok === true).length,
  zod_plan_parsed: list.filter((m) => m.zod_plan_parse_ok === true).length,
  falsification_completeness_rate: mean(list.map((m) => m.checker?.falsification_completeness_rate).filter((v) => v !== null && v !== undefined)),
  plan_executability_pass: list.filter((m) => m.checker?.plan_executability_passed === true).length,
  hypotheses_mean: mean(list.map((m) => m.hypotheses_n).filter((v) => v !== undefined)),
});

const citationAgg = (list) => {
  const real = list.filter((c) => c && typeof c.citations_total === 'number');
  const total = real.reduce((a, c) => a + c.citations_total, 0);
  const resolved = real.reduce((a, c) => a + (c.doi_resolved ?? 0), 0);
  const matched = real.reduce((a, c) => a + (c.title_matched ?? 0), 0);
  const grounded = real.reduce((a, c) => a + (c.quote_grounded ?? 0), 0);
  return {
    problems_with_citations: real.length,
    problems_empty_citations: list.filter((c) => c && c.citations_total === 0).length,
    citations_total: total,
    doi_resolved: resolved,
    title_matched: matched,
    quote_grounded: grounded,
    unsupported_rate: total ? 1 - matched / total : null,
  };
};

const result = {
  computedAt: new Date().toISOString(),
  protocol: 'eval/PROTOCOL.md (pre-declared)',
  farlab: { per_run: farlab, aggregate: farlabAgg },
  baselines: {
    direct: { per_problem: baselines.direct, aggregate: baselineAgg(baselines.direct), citations: { aggregate: citationAgg(citationChecks.direct), per_problem: citationChecks.direct } },
    rag: { per_problem: baselines.rag, aggregate: baselineAgg(baselines.rag), citations: { aggregate: citationAgg(citationChecks.rag), per_problem: citationChecks.rag } },
  },
};

mkdirSync(RESULTS_DIR, { recursive: true });
writeFileSync(RESULTS_DIR + 'metrics.json', JSON.stringify(result, null, 1), 'utf8');

// stdout summary tables
const pct = (v) => (v === null || v === undefined ? 'n/a' : (v * 100).toFixed(1) + '%');
console.log('=== FAR-Lab per-run ===');
for (const [pid, m] of Object.entries(farlab)) {
  console.log(
    `${pid} ${m.runId} ${m.status}: srcVer=${m.sources_verified}/${m.sources_total} (${pct(m.source_verification_rate)}) claimBind=${m.claims_verified}/${m.claims_total} (${pct(m.claim_binding_rate)}) counter=${m.counter_evidence_relations}/${m.evidence_relations_total} reps=${m.representatives}/${m.hypotheses_total} falsif=${pct(m.falsification_completeness_rate)} planExec=${m.plan_executability_passed} live=${pct(m.live_rate)} span=${(m.perf.first_to_last_receipt_ms / 60000).toFixed(1)}min tokens=${m.perf.tokens.total}`,
  );
}
console.log('=== baselines (aggregate) ===');
for (const b of ['direct', 'rag']) {
  const a = result.baselines[b].aggregate;
  const c = result.baselines[b].citations.aggregate;
  console.log(
    `${b}: call_ok=${a.call_ok}/${a.problems} shape=${a.shape_parse_ok} zodHyp=${a.zod_hypothesis_fully_parsed} zodPlan=${a.zod_plan_parsed} falsif=${pct(a.falsification_completeness_rate)} planExec=${a.plan_executability_pass} hypN=${a.hypotheses_mean} cites=${c.citations_total} resolved=${c.doi_resolved} matched=${c.title_matched} quoteGrounded=${c.quote_grounded} unsupported=${pct(c.unsupported_rate)}`,
  );
}
console.log('WROTE eval/results/metrics.json');
