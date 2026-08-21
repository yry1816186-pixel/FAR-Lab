/**
 * W4 LLM-judge (AUXILIARY evidence; calibration = uncalibrated_llm_judgment).
 * ONE judge call per problem comparing THREE hypothesis lists (FAR-Lab representatives vs
 * baseline-direct vs baseline-rag) in seeded-random blind order. The judge does NOT know
 * which system produced which list. Scores: hypothesis_quality (1-5), counter_evidence_
 * coverage (1-5) with the rubric embedded in the prompt. Same DeepSeek provider.
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

const SEED = Number(process.env.FARLAB_JUDGE_SEED ?? 20260821); // recorded with results; env enables variance studies
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
  const res = await provider.structuredCall(
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
        const v = raw[l];
        if (v === null || typeof v !== 'object') return new Error(`missing ${l}`);
        const hq = v.hypothesis_quality, cc = v.counter_evidence_coverage;
        if (!Number.isInteger(hq) || hq < 1 || hq > 5) return new Error(`${l}.hypothesis_quality invalid`);
        if (!Number.isInteger(cc) || cc < 1 || cc > 5) return new Error(`${l}.counter_evidence_coverage invalid`);
      }
      return raw;
    },
  );
  const record = {
    problemId: p.id,
    problemType: p.type,
    seed: SEED,
    blind_mapping: mapping,
    judge_ok: res.ok,
    judge_error: res.error ? { kind: res.error.kind, message: res.error.message } : null,
    calibration: 'uncalibrated_llm_judgment',
    scores: res.ok
      ? Object.fromEntries(Object.entries(mapping).map(([label, system]) => [system, { label, ...res.data[label] }]))
      : null,
    receipt: { modelId: res.receipt.modelId, modelVersion: res.receipt.modelVersion, latencyMs: res.receipt.latencyMs, usage: res.receipt.usage },
    at: new Date().toISOString(),
  };
  out.push(record);
  console.log(`${p.id} judge_ok=${res.ok} mapping=${JSON.stringify(mapping)} scores=${res.ok ? JSON.stringify(Object.fromEntries(Object.entries(record.scores).map(([s, v]) => [s, `${v.hypothesis_quality}/${v.counter_evidence_coverage}`]))) : (record.judge_error && record.judge_error.kind)}`);
}

const outFile = process.env.FARLAB_JUDGE_OUT ?? 'llm-judge.jsonl';
writeFileSync(RESULTS + outFile, out.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
console.log(`DONE -> eval/results/${outFile} (calibration=uncalibrated_llm_judgment, auxiliary only)`);
