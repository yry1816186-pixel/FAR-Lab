/**
 * baseline-rag: OpenAlex top-5 (SAME adapter as FAR-Lab, real retrieval) + one structured DeepSeek call.
 * Output: eval/results/baseline-rag.jsonl. Also stores the retrieved corpus per problem so
 * citation quote-grounding can be checked deterministically later.
 * Run: node eval/baseline-rag.mjs
 */
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { loadProblems, makeProvider, baselineTaskPrompt, parseBaselineOutput } from './lib.mjs';
import { createOpenAlexAdapter } from '../dist/sources/openalex.js';
import { createEuropePmcAdapter } from '../dist/sources/europepmc.js';

const DIR = new URL('./results/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = DIR + 'baseline-rag.jsonl';
mkdirSync(DIR, { recursive: true });

const problems = loadProblems();
const provider = await makeProvider();
// W4R 2026-08-29 (disclosed protocol deviation): OpenAlex keyless daily budget
// returned HTTP 429 on every baseline query this session, which would have made
// "baseline-rag" a corpus-less direct baseline — unfair to the baseline. EuropePMC
// is a pipeline source family (same adapter code path, abstract-rich, no budget
// wall) and serves the same top-k-relevance role. Deviation recorded in the report.
const RETRIEVAL = process.env.W4R_RAG_SOURCE === 'openalex' ? createOpenAlexAdapter() : createEuropePmcAdapter();
const RETRIEVAL_NAME = process.env.W4R_RAG_SOURCE === 'openalex' ? 'openalex' : 'europepmc';
if (!provider.liveReady) {
  console.error('FATAL: DEEPSEEK_API_KEY not set — fail closed');
  process.exit(1);
}
console.log(`provider=${provider.name} model=${provider.modelId} retrieval=${RETRIEVAL_NAME}(top5)`);

for (const p of problems) {
  // --- real retrieval, same adapter code path as the pipeline retrieve stage ---
  // OpenAlex treats trailing '?'/'*' as wildcards -> HTTP 400 (verified live 2026-08-21);
  // the FAR-Lab scope stage reformulates queries so the pipeline never hits this.
  // Baseline uses the question with wildcard chars stripped — same fix any caller must apply.
  const searchQuery = p.text.replace(/[*?]+/g, ' ').replace(/\s+/g, ' ').trim();
  let corpus = null;
  let retrievalError = null;
  try {
    const result = await RETRIEVAL.search(searchQuery, { limit: 5 });
    corpus = result.records.map((r) => ({
      doi: r.identifiers.find((i) => i.kind === 'doi')?.value ?? null,
      openalexId: r.identifiers.find((i) => i.kind === 'openalex')?.value ?? null,
      title: r.title,
      publicationYear: r.publicationYear ?? null,
      venue: r.venue ?? null,
      abstractText: r.abstractText ?? null,
    }));
    console.log(`${p.id} retrieval: http=${result.httpStatus} n=${corpus.length} abstracts=${corpus.filter((c) => c.abstractText).length}`);
  } catch (e) {
    retrievalError = String(e && e.message ? e.message : e);
    console.error(`${p.id} retrieval FAILED: ${retrievalError}`);
  }

  const corpusBlock = corpus && corpus.length > 0
    ? 'Provided literature (top-5 OpenAlex results for the question):\n' + corpus
        .map(
          (c, i) => `[S${i + 1}] title: ${c.title}\n    year: ${c.publicationYear ?? 'n/a'} venue: ${c.venue ?? 'n/a'} doi: ${c.doi ?? 'n/a'}\n    abstract: ${(c.abstractText ?? '(no abstract in record)').slice(0, 1500)}`,
        )
        .join('\n')
    : 'Provided literature: (retrieval returned no usable records — say so and answer from knowledge with explicit limits)';

  const task = baselineTaskPrompt({ question: p.text, domain: p.domain, hasCorpus: true }) + '\n\n' + corpusBlock;

  const t0 = Date.now();
  const res = await provider.structuredCall(
    {
      task,
      systemPrompt: 'You are an expert scientific researcher producing rigorous, falsifiable hypotheses and executable research plans, grounded strictly in the provided literature. Never fabricate sources.',
      userPayload: { question: p.text, domain: p.domain, goalType: p.goalType, corpusSize: corpus ? corpus.length : 0 },
      outputKind: 'json',
      temperature: 0.4,
      maxTokens: 16000,
      purpose: 'w4-eval-baseline-rag',
    },
    (raw) => {
      const parsed = parseBaselineOutput(raw);
      return parsed.ok ? raw : new Error(parsed.reason);
    },
  );
  const record = {
    baseline: 'rag',
    problemId: p.id,
    problemType: p.type,
    question: p.text,
    domain: p.domain,
    retrieval: { ok: retrievalError === null, error: retrievalError, corpus },
    ok: res.ok,
    error: res.error ? { kind: res.error.kind, message: res.error.message } : null,
    parse: parseBaselineOutput(res.ok ? res.data : null),
    output: res.ok ? res.data : null,
    receipt: res.receipt,
    wallMs: Date.now() - t0,
    at: new Date().toISOString(),
  };
  appendFileSync(OUT, JSON.stringify(record) + '\n', 'utf8');
  console.log(`${p.id} ok=${res.ok} parse_ok=${record.parse.ok} wall=${record.wallMs}ms tokens=${res.receipt?.usage?.totalTokens ?? 'n/a'}${res.error ? ' err=' + res.error.kind : ''}`);
}
writeFileSync(DIR + 'baseline-rag.corpus.json', JSON.stringify({ at: new Date().toISOString(), note: 'retrieved corpus snapshot per problem (for quote-grounding checks)' }, null, 1), 'utf8');
console.log('DONE baseline-rag -> eval/results/baseline-rag.jsonl');
