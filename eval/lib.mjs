/**
 * Shared helpers for evaluation baselines. Node ESM, imports the SAME dist/ modules
 * the FAR-Lab pipeline uses (same provider route, same source adapters) — fairness by
 * construction. No secret material in files: providers read keys from env
 * (ZHIPU_API_KEY/ZAI_API_KEY), never from this repo.
 *
 * DeepSeek is BANNED in this project (user directive 2026-08-22). Default route =
 * GLM via bigmodel.cn's Anthropic-compatible endpoint (eval/glm-anthropic-provider.mjs);
 * FARLAB_BASELINE_PROVIDER=zai|dashscope selects the other OpenAI-protocol routes.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const loadProblems = () => {
  // FARLAB_PROBLEMS (cwd-relative path) pins run ids per problem — required when
  // question texts repeat across batches (before/after) so the judge/metrics read
  // the intended runs, not whichever happens to match newest.
  const path = process.env.FARLAB_PROBLEMS
    ? resolve(process.cwd(), process.env.FARLAB_PROBLEMS)
    : new URL('./problems.json', import.meta.url);
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return raw.problems;
};

export const makeProvider = async () => {
  const route = process.env.FARLAB_BASELINE_PROVIDER ?? 'glm';
  if (route === 'deepseek') {
    console.error('FATAL: deepseek is banned in this project (user directive 2026-08-22); use glm|zai|dashscope');
    process.exit(1);
  }
  if (route === 'glm') {
    const { createGlmAnthropicProvider } = await import('./glm-anthropic-provider.mjs');
    return createGlmAnthropicProvider({ totalTimeoutMs: 300_000, model: process.env.FARLAB_ZAI_MODEL ?? 'glm-5.3' });
  }
  if (route === 'zai') {
    process.env.ZHIPU_API_KEY ??= process.env.ZAI_API_KEY; // secrets.env may use either name
    const { createZaiProvider } = await import('../dist/providers/zai.js');
    return createZaiProvider({ totalTimeoutMs: 300_000, model: process.env.FARLAB_ZAI_MODEL ?? 'glm-5.3' });
  }
  if (route === 'dashscope') {
    const { createDashScopeProvider } = await import('../dist/providers/dashscope.js');
    return createDashScopeProvider({ totalTimeoutMs: 300_000 });
  }
  console.error(`FATAL: unknown FARLAB_BASELINE_PROVIDER '${route}' (glm|zai|dashscope)`);
  process.exit(1);
};

/** Strong-baseline task prompt. Describes the TARGET SHAPE (fields), not our checker internals. */
export const baselineTaskPrompt = ({ question, domain, hasCorpus }) => `
You are a senior researcher in ${domain}. Produce a complete scientific hypothesis-generation and research-plan answer for the research question below.

QUESTION: ${question}

Requirements:
1. hypotheses: at least 3 (4-5 preferred) genuinely DISTINCT hypotheses (different mechanisms or different core assumptions, not rewordings of one idea). For each give:
   - statement: the hypothesis in one falsifiable sentence
   - mechanism: the causal mechanism it posits
   - assumptions: the load-bearing assumptions it rests on
   - predictions: observable predictions that would follow if it is true
   - falsification: how to test/refute THIS hypothesis with concrete fields:
     observable, measurement, expectedRelation, decisionRule (must contain an explicit
     comparison/threshold/if-then judging criterion, e.g. "if X >= Y then supported"),
     supportCondition, weakeningCondition, falsificationCondition, confounders,
     alternativeExplanations, dataRequirements, method, failureInterpretation.
2. plan: one research plan able to discriminate between the hypotheses:
   - objective
   - steps: at least 3 steps, each with title, kind (literature|data_analysis|tool_run|simulation|experiment|human_review|other), method (what is actually done), failureConditions (what an outcome would count as this step failing)
   - metrics: at least 2
   - decisionRules: exactly these four fields, each non-empty: successCriterion, weakeningCriterion, falsificationCriterion, stopCriterion
   - multipleTestingPolicy: when a plan tests several hypotheses, state the multiplicity
     discipline explicitly as one of: "single_primary" (one confirmatory primary
     comparison, the rest descriptive), "alpha_spending" (alpha allocated across
     comparisons), or "e_value_accumulation" (e-values summed across comparisons)
3. citations: list the sources you relied on. ${hasCorpus
    ? 'ONLY cite the provided literature. Each citation: {doi, title, quote} where quote is a verbatim excerpt (in English) from that source\'s abstract/title in the provided material that supports a claim you make.'
    : 'Cite sources from your own knowledge as {doi, title, quote} where quote is the specific supporting statement. If you cannot recall a concrete real source for a claim, DO NOT invent one — omit the citation for that claim. If you cannot recall any concrete sources, return an empty citations array and say so in "limitations".'}
4. limitations: state honestly what your answer cannot support (missing evidence, uncertainty, whether the literature you relied on is real or recalled from memory).
${hasCorpus ? 'Ground every claim in the provided literature; do not import outside facts without marking them as unverified memory.' : 'You have no retrieval: answer from your own knowledge and mark its limits.'}

Output a single JSON object:
{"hypotheses":[{"statement":"...","mechanism":"...","assumptions":["..."],"predictions":["..."],"falsification":{"observable":"...","measurement":"...","expectedRelation":"...","decisionRule":"...","supportCondition":"...","weakeningCondition":"...","falsificationCondition":"...","confounders":["..."],"alternativeExplanations":["..."],"dataRequirements":["..."],"method":"...","failureInterpretation":"..."}}],"plan":{"objective":"...","steps":[{"title":"...","kind":"...","method":"...","failureConditions":["..."]}],"metrics":["..."],"decisionRules":{"successCriterion":"...","weakeningCriterion":"...","falsificationCriterion":"...","stopCriterion":"..."},"multipleTestingPolicy":"single_primary|alpha_spending|e_value_accumulation"},"citations":[{"doi":"...","title":"...","quote":"..."}],"limitations":"..."}
`;

/** Light structural parse of the baseline output (shape check independent of our domain zod schemas). */
export const parseBaselineOutput = (raw) => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'top level not an object' };
  const errs = [];
  if (!Array.isArray(raw.hypotheses) || raw.hypotheses.length < 1) errs.push('hypotheses missing/empty');
  if (raw.hypotheses) {
    raw.hypotheses.forEach((h, i) => {
      if (typeof h?.statement !== 'string' || h.statement.trim().length < 10) errs.push(`hypotheses[${i}].statement missing/trivial`);
      if (typeof h?.mechanism !== 'string') errs.push(`hypotheses[${i}].mechanism missing`);
    });
  }
  const p = raw.plan;
  if (p === null || typeof p !== 'object') errs.push('plan missing');
  else {
    if (typeof p.objective !== 'string' || !p.objective.trim()) errs.push('plan.objective missing');
    if (!Array.isArray(p.steps) || p.steps.length < 1) errs.push('plan.steps missing/empty');
    if (!Array.isArray(p.metrics) || p.metrics.length < 1) errs.push('plan.metrics missing/empty');
    const dr = p.decisionRules;
    if (dr === null || typeof dr !== 'object') errs.push('plan.decisionRules missing');
    else for (const f of ['successCriterion', 'weakeningCriterion', 'falsificationCriterion', 'stopCriterion']) {
      if (typeof dr[f] !== 'string' || !dr[f].trim()) errs.push(`plan.decisionRules.${f} missing`);
    }
  }
  if (!Array.isArray(raw.citations)) errs.push('citations missing (must be an array, possibly empty)');
  return errs.length === 0 ? { ok: true } : { ok: false, reason: errs.join('; ') };
};

/**
 * `research start --json` stdout parser (2026-09-05 instrument fix). The CLI prints
 * TWO json lines: the early {runId,status} ack, and on completion the full run
 * report whose identifier field is `id` (ResearchRun object shape — NOT runId).
 * Reading `.runId` off the last line silently yielded undefined: completed runs were
 * written as runId-less ledger rows that neither resume nor judging could see
 * (live-burned 2026-09-05: 9 completed runs vanished from the MLR ledger this way).
 * Accepts both shapes; last json line wins (it carries the terminal status).
 */
export const parseRunOutput = (stdout) => {
  const line = stdout.split('\n').filter((l) => l.trim().startsWith('{')).at(-1);
  if (line === undefined) return { runId: undefined, status: undefined };
  const parsed = JSON.parse(line);
  return { runId: parsed.runId ?? parsed.id, status: parsed.status };
};
