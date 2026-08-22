/**
 * W4 LLM-judge (AUXILIARY evidence; calibration = uncalibrated_llm_judgment).
 * FARLAB_JUDGE_VOTES identical calls per problem (W4-F4 self-consistency; default 1 =
 * unchanged single-pass) comparing THREE hypothesis lists (FAR-Lab representatives vs
 * baseline-direct vs baseline-rag) in seeded-random blind order. The judge does NOT know
 * which system produced which list. Scores: hypothesis_quality (1-5), counter_evidence_
 * coverage (1-5) with the rubric embedded in the prompt; votes aggregate to the
 * per-dimension MEDIAN with min/max spread and every raw vote retained (judge-votes.mjs).
 * Same DeepSeek provider.
 * W5 field-parity fix (scientific review Q7): every list is sent through the SAME
 * projection (statement/mechanism/assumptions/falsification decisionRule) — baselines'
 * assumptions+decisionRule must reach the judge exactly like FAR-Lab's, and no field may
 * be rendered for one system only (format signatures de-blind the shuffled labels).
 * Run: node eval/llm-judge.mjs   (after baselines + FAR-Lab runs exist)
 * Output: eval/results/llm-judge.jsonl
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { loadProblems, makeProvider } from './lib.mjs';
import { isRepresentative } from '../dist/pipeline/stages/shared.js';
import { aggregateVotes } from './judge-votes.mjs';

const SEED = Number(process.env.FARLAB_JUDGE_SEED ?? 20260821); // recorded with results; env enables variance studies
/** W4-F4 self-consistency votes per problem (default 1 = unchanged single-pass behavior). */
const VOTES_RAW = Number(process.env.FARLAB_JUDGE_VOTES ?? 1);
if (!Number.isInteger(VOTES_RAW) || VOTES_RAW < 1) {
  console.error(`FARLAB_JUDGE_VOTES must be a positive integer (got ${JSON.stringify(process.env.FARLAB_JUDGE_VOTES)})`);
  process.exit(2);
}
const VOTES = VOTES_RAW;
const DB_PATH = new URL('../.far-run/far.db', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const RESULTS = new URL('./results/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// deterministic PRNG (mulberry32) — reproducible shuffles
const rng = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const readJsonl = (name) => {
  try {
    return readFileSync(RESULTS + name, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
};

const db = new DatabaseSync(DB_PATH, { readOnly: true });
const objects = (kind, runId) =>
  db.prepare('SELECT json FROM objects WHERE kind=? AND run_id=?').all(kind, runId).map((r) => JSON.parse(r.json));

const problems = loadProblems();
const direct = Object.fromEntries(readJsonl('baseline-direct.jsonl').map((r) => [r.problemId, r]));
const rag = Object.fromEntries(readJsonl('baseline-rag.jsonl').map((r) => [r.problemId, r]));

const provider = makeProvider();
if (!provider.liveReady) {
  console.error('FATAL: DEEPSEEK_API_KEY not set');
  process.exit(1);
}

/** Identical projection for ALL systems — the only way the blind labels stay blind. */
const toJudgeFields = (h) => ({
  statement: h.statement,
  mechanism: h.mechanism,
  assumptions: (Array.isArray(h.assumptions) ? h.assumptions : [])
    .map((a) => (typeof a === 'string' ? a : a?.statement))
    .filter((s) => typeof s === 'string' && s.trim().length > 0),
  falsificationDecisionRule: typeof h.falsification?.decisionRule === 'string' ? h.falsification.decisionRule : '',
});

const fmtHyps = (list, label) =>
  `=== OUTPUT ${label} ===\n` +
  list
    .map((h, i) =>
      `[${label}${i + 1}] ${h.statement}\n` +
      `    mechanism: ${String(h.mechanism ?? '').slice(0, 300)}\n` +
      `    assumptions: ${h.assumptions.slice(0, 5).map((a) => a.slice(0, 160)).join(' | ') || '(none stated)'}\n` +
      `    falsification decisionRule: ${h.falsificationDecisionRule.slice(0, 300) || '(none stated)'}`)
    .join('\n');

const RUBRIC = `Score EACH output on two dimensions, 1-5 integers:
- hypothesis_quality: 5 = multiple genuinely distinct, mechanistically specific, falsifiable hypotheses with clearly stated assumptions and predictions; 3 = partially distinct or partially vague; 1 = redundant restatements or unfalsifiable prose.
- counter_evidence_coverage: 5 = explicitly engages evidence AGAINST the hypotheses (contradictions, weaknesses, alternative explanations, uncertainty); 3 = mentions some caveats but no real opposing evidence; 1 = only supportive narrative.
Judge ONLY what is in the lists. Do not reward length alone.`;

const out = [];
mkdirSync(RESULTS, { recursive: true });

for (const p of problems) {
  // gather the three lists
  let farRunId = p.farRunId ?? null;
  if (!farRunId) {
    for (const r of db.prepare('SELECT id, question_id, created_at FROM runs ORDER BY created_at DESC').all()) {
      const qrow = db.prepare('SELECT json FROM objects WHERE kind=? AND id=?').get('question', r.question_id);
      if (qrow && JSON.parse(qrow.json).text === p.text) { farRunId = r.id; break; }
    }
  }
  const farHyps = farRunId
    ? objects('hypothesis', farRunId).filter(isRepresentative).map(toJudgeFields)
    : [];
  const directHyps = direct[p.id]?.output?.hypotheses?.map(toJudgeFields) ?? [];
  const ragHyps = rag[p.id]?.output?.hypotheses?.map(toJudgeFields) ?? [];

  if (farHyps.length === 0 || directHyps.length === 0 || ragHyps.length === 0) {
    out.push({ problemId: p.id, skipped: true, reason: `missing lists: far=${farHyps.length} direct=${directHyps.length} rag=${ragHyps.length}` });
    continue;
  }

  const entries = [
    { system: 'farlab', hyps: farHyps },
    { system: 'direct', hyps: directHyps },
    { system: 'rag', hyps: ragHyps },
  ];
  // seeded shuffle -> blind labels X/Y/Z
  const labels = ['X', 'Y', 'Z'];
  const rand = rng(SEED + p.id.charCodeAt(1));
  for (let i = entries.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }
  const mapping = Object.fromEntries(entries.map((e, i) => [labels[i], e.system]));

  const task = `${RUBRIC}

Research question: ${p.text}

Three anonymous candidate outputs (hypothesis lists):

${entries.map((e, i) => fmtHyps(e.hyps, labels[i])).join('\n\n')}

Return ONLY a JSON object:
{"X":{"hypothesis_quality":1-5,"counter_evidence_coverage":1-5,"one_line_reason":"..."},"Y":{...},"Z":{...}}
`;
  // W4-F4 self-consistency: FARLAB_JUDGE_VOTES identical calls of the SAME blind task
  // (same mapping — votes measure judge variance, never ordering variance); per-dimension
  // median + min/max spread, every raw vote recorded (disagreement is never hidden).
  const voteResults = [];
  for (let v = 0; v < VOTES; v++) {
    // sequential by design: gentle on rate-limited/budget routes
    voteResults.push(await provider.structuredCall(
      {
        task,
        systemPrompt: 'You are a strict, neutral scientific reviewer scoring anonymous outputs against a fixed rubric. You do not know or guess which system produced them.',
        userPayload: { problemId: p.id, rubricDimensions: ['hypothesis_quality', 'counter_evidence_coverage'] },
        outputKind: 'json',
        temperature: 0.0,
        maxTokens: 1024,
        purpose: 'w4-eval-llm-judge',
      },
      (raw) => {
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return new Error('not an object');
        for (const l of ['X', 'Y', 'Z']) {
          const v2 = raw[l];
          if (v2 === null || typeof v2 !== 'object') return new Error(`missing ${l}`);
          const hq = v2.hypothesis_quality, cc = v2.counter_evidence_coverage;
          if (!Number.isInteger(hq) || hq < 1 || hq > 5) return new Error(`${l}.hypothesis_quality invalid`);
          if (!Number.isInteger(cc) || cc < 1 || cc > 5) return new Error(`${l}.counter_evidence_coverage invalid`);
        }
        return raw;
      },
    ));
  }
  const agg = aggregateVotes(voteResults.map((r) => (r.ok ? { ok: true, data: r.data } : { ok: false })));
  const record = {
    problemId: p.id,
    problemType: p.type,
    seed: SEED,
    votes: { requested: VOTES, ok: agg ? agg.okVotes : 0, aggregation: VOTES > 1 ? 'median_selfconsistency' : 'single_pass' },
    blind_mapping: mapping,
    judge_ok: agg !== null,
    judge_error: agg === null
      ? { kind: voteResults[voteResults.length - 1].error?.kind ?? 'provider_error', message: voteResults[voteResults.length - 1].error?.message ?? 'all judge votes failed' }
      : null,
    calibration: 'uncalibrated_llm_judgment',
    scores: agg
      ? Object.fromEntries(Object.entries(mapping).map(([label, system]) => [system, {
          label,
          hypothesis_quality: agg.labels[label].hypothesis_quality.median,
          counter_evidence_coverage: agg.labels[label].counter_evidence_coverage.median,
          spread: {
            hypothesis_quality: [agg.labels[label].hypothesis_quality.min, agg.labels[label].hypothesis_quality.max],
            counter_evidence_coverage: [agg.labels[label].counter_evidence_coverage.min, agg.labels[label].counter_evidence_coverage.max],
          },
          one_line_reason: agg.labels[label].one_line_reason,
        }]))
      : null,
    per_vote: voteResults.map((r, i) => (r.ok
      ? { vote: i + 1, ok: true, data: r.data, usage: r.receipt.usage, latencyMs: r.receipt.latencyMs }
      : { vote: i + 1, ok: false, error: { kind: r.error?.kind ?? 'provider_error', message: r.error?.message ?? '' } })),
    receipt: {
      modelId: voteResults[0].receipt.modelId,
      modelVersion: voteResults[0].receipt.modelVersion,
      usage: voteResults.reduce((acc, r) => ({
        promptTokens: (acc.promptTokens ?? 0) + (r.receipt.usage.promptTokens ?? 0),
        completionTokens: (acc.completionTokens ?? 0) + (r.receipt.usage.completionTokens ?? 0),
      }), {}),
      latencyMs: voteResults.reduce((acc, r) => acc + r.receipt.latencyMs, 0),
    },
    at: new Date().toISOString(),
  };
  out.push(record);
  console.log(`${p.id} judge_ok=${record.judge_ok} votes=${record.votes.ok}/${VOTES} mapping=${JSON.stringify(mapping)} scores=${record.judge_ok ? JSON.stringify(Object.fromEntries(Object.entries(record.scores).map(([s, v3]) => [s, `${v3.hypothesis_quality}/${v3.counter_evidence_coverage}`]))) : (record.judge_error && record.judge_error.kind)}`);
}

const outFile = process.env.FARLAB_JUDGE_OUT ?? 'llm-judge.jsonl';
writeFileSync(RESULTS + outFile, out.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
console.log(`DONE -> eval/results/${outFile} (calibration=uncalibrated_llm_judgment, auxiliary only)`);
