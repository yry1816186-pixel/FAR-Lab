/**
 * Shared helpers for W4 evaluation baselines. Node ESM, imports the SAME dist/ modules
 * the FAR-Lab pipeline uses (same provider route, same source adapters) — fairness by
 * construction. No secret material in files: the provider reads DEEPSEEK_API_KEY from env.
 */
import { readFileSync } from 'node:fs';
import { createDeepSeekProvider } from '../dist/providers/deepseek.js';

export const loadProblems = () => {
  const raw = JSON.parse(readFileSync(new URL('./problems.json', import.meta.url), 'utf8'));
  return raw.problems;
};

export const makeProvider = () =>
  createDeepSeekProvider({ totalTimeoutMs: 300_000 }); // single-shot baseline needs a longer budget than one pipeline stage; recorded in results

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
3. citations: list the sources you relied on. ${hasCorpus
    ? 'ONLY cite the provided literature. Each citation: {doi, title, quote} where quote is a verbatim excerpt (in English) from that source\'s abstract/title in the provided material that supports a claim you make.'
    : 'Cite sources from your own knowledge as {doi, title, quote} where quote is the specific supporting statement. If you cannot recall a concrete real source for a claim, DO NOT invent one — omit the citation for that claim. If you cannot recall any concrete sources, return an empty citations array and say so in "limitations".'}
4. limitations: state honestly what your answer cannot support (missing evidence, uncertainty, whether the literature you relied on is real or recalled from memory).
${hasCorpus ? 'Ground every claim in the provided literature; do not import outside facts without marking them as unverified memory.' : 'You have no retrieval: answer from your own knowledge and mark its limits.'}

Output a single JSON object:
{"hypotheses":[{"statement":"...","mechanism":"...","assumptions":["..."],"predictions":["..."],"falsification":{"observable":"...","measurement":"...","expectedRelation":"...","decisionRule":"...","supportCondition":"...","weakeningCondition":"...","falsificationCondition":"...","confounders":["..."],"alternativeExplanations":["..."],"dataRequirements":["..."],"method":"...","failureInterpretation":"..."}}],"plan":{"objective":"...","steps":[{"title":"...","kind":"...","method":"...","failureConditions":["..."]}],"metrics":["..."],"decisionRules":{"successCriterion":"...","weakeningCriterion":"...","falsificationCriterion":"...","stopCriterion":"..."}},"citations":[{"doi":"...","title":"...","quote":"..."}],"limitations":"..."}
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
