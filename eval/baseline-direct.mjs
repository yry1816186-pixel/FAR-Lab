/**
 * baseline-direct: same DeepSeek provider, NO retrieval, one structured call per problem.
 * Output: eval/results/baseline-direct.jsonl (one line per problem, raw model output + receipt + parse result).
 * Run: node eval/baseline-direct.mjs
 */
import { mkdirSync, appendFileSync } from 'node:fs';
import { loadProblems, makeProvider, baselineTaskPrompt, parseBaselineOutput } from './lib.mjs';

const winPath = (u) => u.pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DIR = winPath(new URL('./results/', import.meta.url));
const OUT = DIR + 'baseline-direct.jsonl';
mkdirSync(DIR, { recursive: true });

const problems = loadProblems();
const provider = makeProvider();
if (!provider.liveReady) {
  console.error('FATAL: DEEPSEEK_API_KEY not set — baseline cannot run (fail closed, no fabrication)');
  process.exit(1);
}
console.log(`provider=${provider.name} model=${provider.modelId} liveReady=${provider.liveReady}`);

for (const p of problems) {
  const task = baselineTaskPrompt({ question: p.text, domain: p.domain, hasCorpus: false });
  const t0 = Date.now();
  const res = await provider.structuredCall(
    {
      task,
      systemPrompt: 'You are an expert scientific researcher producing rigorous, falsifiable hypotheses and executable research plans. Be honest about evidence limits; never fabricate sources.',
      userPayload: { question: p.text, domain: p.domain, goalType: p.goalType },
      outputKind: 'json',
      temperature: 0.4,
      maxTokens: 8192,
      purpose: 'w4-eval-baseline-direct',
    },
    (raw) => {
      const parsed = parseBaselineOutput(raw);
      return parsed.ok ? raw : new Error(parsed.reason);
    },
  );
  const record = {
    baseline: 'direct',
    problemId: p.id,
    problemType: p.type,
    question: p.text,
    domain: p.domain,
    ok: res.ok,
    error: res.error ? { kind: res.error.kind, message: res.error.message } : null,
    parse: parseBaselineOutput(res.ok ? res.data : null),
    output: res.ok ? res.data : null,
    receipt: res.receipt,
    wallMs: Date.now() - t0,
    at: new Date().toISOString(),
  };
  appendFileSync(OUT, JSON.stringify(record) + '\n', 'utf8');
  console.log(`${p.id} ok=${res.ok} parse_ok=${record.parse.ok} wall=${record.wallMs}ms model=${res.receipt.modelVersion ?? res.receipt.modelId} tokens=${res.receipt.usage.totalTokens ?? 'n/a'}${res.error ? ' err=' + res.error.kind : ''}`);
}
console.log('DONE baseline-direct -> eval/results/baseline-direct.jsonl');
