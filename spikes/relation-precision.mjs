/**
 * Relation-precision spike (2026-08-22, Wave-3 scout): measure whether the
 * LLM-only claim->hypothesis relation labels are actually supported, to feed
 * the deferred "local ONNX NLI cross-checker" trigger in TECH_CANDIDATES.md B
 * ("If LLM-only relation precision measured insufficient").
 *
 * Design: BLIND re-judging — the judge sees the claim text + its bound source
 * quote + the hypothesis statement, and independently classifies the relation
 * into {supports, contradicts, weakens, qualifies, unrelated}. The pipeline's
 * chosen label is compared only AFTER the judge answers. Stratified seeded
 * sample across completed runs.
 *
 * Calibration disclosure: judge is deepseek-chat (temperature 0), the same
 * model family that generated the relations — self-agreement bias inflates
 * precision, so the result is an UPPER BOUND estimate, not ground truth.
 *
 * Usage: node spikes/relation-precision.mjs   (writes spikes/output/relation-precision.jsonl)
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createDeepSeekProvider } from '../dist/providers/deepseek.js';

const SEED = Number(process.env.REL_PREC_SEED ?? 20260822);
// quota override: REL_PREC_QUOTA='{"contradicts":12}' (+ optional REL_PREC_EXCLUDE file of relationIds already sampled)
const QUOTA = process.env.REL_PREC_QUOTA ? JSON.parse(process.env.REL_PREC_QUOTA) : { supports: 12, contradicts: 8, weakens: 5, qualifies: 5 };
const EXCLUDE = process.env.REL_PREC_EXCLUDE
  ? new Set(readFileSync(resolve(process.cwd(), process.env.REL_PREC_EXCLUDE), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).relationId))
  : new Set();
const OUT_DIR = resolve(process.cwd(), 'spikes/output');
const OUT = join(OUT_DIR, process.env.REL_PREC_OUT ?? 'relation-precision.jsonl');

const rng = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pickN = (arr, n, rand) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
};

const db = new DatabaseSync(resolve(process.cwd(), '.far-run/far.db'), { readOnly: true });
const completedRuns = new Set(db.prepare("SELECT id FROM runs WHERE status='completed'").all().map((r) => r.id));
const F4_MODE = process.env.REL_PREC_MODE === 'f4'; // claim-claim cross relations instead of claim->hypothesis
const RUN_FILTER = process.env.REL_PREC_RUN; // optional: judge relations from ONE run only (post-fix verification)
const relations = db.prepare("SELECT json FROM objects WHERE kind='evidence_relation'").all()
  .map((r) => JSON.parse(r.json))
  .filter((r) => completedRuns.has(r.runId) && (!RUN_FILTER || r.runId === RUN_FILTER) && (F4_MODE ? r.targetClaimId !== undefined : r.targetClaimId === undefined && r.targetHypothesisId !== undefined));
const claims = new Map(db.prepare("SELECT json FROM objects WHERE kind='claim'").all().map((r) => [JSON.parse(r.json).id, JSON.parse(r.json)]));
const hyps = new Map(db.prepare("SELECT json FROM objects WHERE kind='hypothesis'").all().map((r) => [JSON.parse(r.json).id, JSON.parse(r.json)]));
db.close();

const eligible = (r) =>
  F4_MODE
    ? claims.has(r.claimId) && claims.has(r.targetClaimId)
    : claims.has(r.claimId) && hyps.has(r.targetHypothesisId);

const sample = [];
const rand = rng(SEED);
for (const [kind, n] of Object.entries(QUOTA)) {
  const pool = relations.filter((r) => r.relation === kind && eligible(r) && !EXCLUDE.has(r.id));
  for (const r of pickN(pool, n, rand)) sample.push(r);
}
console.log(`[rel-prec] mode=${F4_MODE ? 'f4-claim-claim' : 'claim-to-hypothesis'} sampled ${sample.length} of ${relations.length} relations (completed runs only), quota=${JSON.stringify(QUOTA)}`);

const provider = createDeepSeekProvider({ totalTimeoutMs: 120_000 });
const KINDS = ['supports', 'contradicts', 'weakens', 'qualifies', 'unrelated', 'not_comparable'];
const parseVerdict = (raw) => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return new Error('not an object');
  if (!KINDS.includes(raw.relation)) return new Error(`relation must be one of ${KINDS.join('/')}`);
  if (typeof raw.confidence !== 'number' || raw.confidence < 0 || raw.confidence > 1) return new Error('confidence must be 0..1');
  if (typeof raw.justification !== 'string' || raw.justification.length < 1) return new Error('justification missing');
  return raw;
};

const ADJACENT = new Set(['contradicts|weakens', 'weakens|contradicts', 'qualifies|supports']);
const records = [];
let idx = 0;
for (const rel of sample) {
  idx += 1;
  const claim = claims.get(rel.claimId);
  const hyp = hyps.get(rel.targetHypothesisId);
  const claimB = F4_MODE ? claims.get(rel.targetClaimId) : undefined;
  const quote = claim.locators?.[0]?.quote ?? '(no bound quote)';
  const f4Task =
    'You are auditing claim-claim relations extracted from DIFFERENT papers. Given TWO claims, classify their relation: "supports" if they corroborate the same finding; "contradicts" if they assert incompatible findings about the same subject/quantity; "qualifies" if one restricts the conditions of the other; "unrelated" if different subjects; "not_comparable" if they cannot be compared on the given text. Judge only from the texts. Respond as JSON: {relation: string, confidence: number 0..1, justification: string}.';
  try {
    const res = await provider.structuredCall(
      {
        task: F4_MODE
          ? f4Task
          : 'You are auditing evidence relations in a scientific hypothesis system. Given ONE evidence claim (with its verbatim source quote) and ONE hypothesis, classify what the claim actually does to the hypothesis. Use "supports" if the claim is evidence FOR the hypothesis; "contradicts" if it is direct evidence AGAINST; "weakens" if it partially undermines or limits it; "qualifies" if it adds a condition/scope/nuance; "unrelated" if neither. Judge only from the texts provided. Respond as JSON: {relation: string, confidence: number 0..1, justification: string}.',
        systemPrompt: 'You are a meticulous scientific evidence auditor. Classify strictly from the given texts.',
        userPayload: F4_MODE
          ? {
              claim_a: claim.text,
              claim_b: claimB.text,
            }
          : {
              claim_text: claim.text,
              source_quote: quote,
              hypothesis_statement: hyp.statement,
            },
        outputKind: 'json',
        temperature: 0.0,
        maxTokens: 500,
        purpose: `relation-precision-audit-${idx}`,
      },
      parseVerdict,
    );
    if (!res.ok) throw new Error(res.error?.message ?? 'structuredCall failed');
    const judge = res.data.relation;
    const match = judge === rel.relation;
    const adjacent = !match && ADJACENT.has(`${judge}|${rel.relation}`);
    records.push({
      relationId: rel.id, runId: rel.runId, pipelineLabel: rel.relation, judgeLabel: judge,
      judgeConfidence: res.data.confidence, match, adjacent,
      claimBinding: claim.bindingStatus, justification: res.data.justification.slice(0, 300),
    });
    console.log(`[rel-prec] ${idx}/${sample.length} pipeline=${rel.relation} judge=${judge} ${match ? 'MATCH' : adjacent ? 'adjacent' : 'MISMATCH'} (conf ${res.data.confidence})`);
  } catch (e) {
    records.push({ relationId: rel.id, runId: rel.runId, pipelineLabel: rel.relation, error: String(e.message).slice(0, 300) });
    console.error(`[rel-prec] ${idx}/${sample.length} ERROR: ${e.message}`);
  }
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');

const judged = records.filter((r) => r.judgeLabel !== undefined);
const valid = judged.filter((r) => r.match).length;
const adj = judged.filter((r) => r.adjacent).length;
const byKind = {};
for (const r of judged) {
  byKind[r.pipelineLabel] ??= { n: 0, match: 0 };
  byKind[r.pipelineLabel].n += 1;
  if (r.match) byKind[r.pipelineLabel].match += 1;
}
console.log('\n[rel-prec] SUMMARY (blind same-family judge, temp 0 — UPPER BOUND due to self-agreement bias):');
console.log(`  exact precision: ${valid}/${judged.length} = ${(100 * valid / judged.length).toFixed(1)}%`);
console.log(`  +adjacent(contradicts<->weakens, qualifies->supports): ${(100 * (valid + adj) / judged.length).toFixed(1)}%`);
for (const [k, v] of Object.entries(byKind)) console.log(`  ${k.padEnd(12)} ${v.match}/${v.n}`);
console.log(`  errors: ${records.length - judged.length}`);
console.log(`DONE -> ${OUT}`);
