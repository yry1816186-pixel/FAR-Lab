/**
 * Rediscovery judge pipeline v2.1 (Wave-9 D-029 completion; single source of truth).
 *
 * v2 (D-037) made MATCHING deterministic (TF-IDF thresholds + LLM only for the
 * borderline band, majority-of-votes). v2.2 (2026-08-29) recalibrates the floor
 * against a NEW gold batch sampled from the v2.1 concise decomposition's below-floor
 * zone (claim-pair-gold-v21.jsonl): low 0.12→0.10, votes 3→5.
 * v2.1 closed the remaining variance source: DECOMPOSITION. The ground truth is no
 * longer re-decomposed per judging pass —
 * every task carries a FIXED, main-agent-reviewed gtClaims list (authored from the
 * recorded v1 median pass, 2026-08-22; see evidence/W9/) — and the agent-side
 * decomposition gets a fixed-granularity protocol (atomic subject-mechanism-direction
 * units, target count anchored to the GT grain, methodological predictions excluded).
 *
 * Variance budget after v2.1 (measured offline in eval/judge-variance.mjs --replay):
 *   matching layer   -> 0 (pure function, same inputs -> same F1)
 *   GT decomposition -> 0 (fixed claims; only the agent side is decomposed)
 *   agent decomposition -> 5-pass median (raised from 3 on 2026-08-29 with the
 *                          variance diagnosis: a 3-pass median let ONE decomposition
 *                          drift drop the mechanistic claims carrying a task's
 *                          matches — crispr swung 0.267 F1 between identical re-judges;
 *                          median-of-5 needs 3 drifted passes to lose the claims)
 *   borderline adjudication -> 5-vote majority (raised from 3 on 2026-08-29 with the
 *                          gold-v21 recalibration: the wider band carries more pairs,
 *                          and W9's vote-count experiment showed 3 votes are the
 *                          largest single variance lever on band decisions)
 */

import { thresholdMatch, finalizeCounts, MATCH_DEFAULTS, deterministicBandVerdict } from './claim-match.mjs';
import { atLeast } from './reducers.mjs';

const DECOMPOSE_SCHEMA = {
  type: 'object',
  properties: {
    agentClaims: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 24 },
  },
  required: ['agentClaims'],
  additionalProperties: false,
};

const ADJUDICATE_SCHEMA = {
  type: 'object',
  properties: { verdicts: { type: 'array', items: { type: 'boolean' } } },
  required: ['verdicts'],
  additionalProperties: false,
};

/**
 * Fixed-granularity decomposition protocol (D-029): the prompt pins WHAT a claim is
 * (one subject + one mechanism + one direction), the TARGET COUNT (GT grain ±2),
 * and what to EXCLUDE (methodological/test-design predictions that assert no
 * substantive finding). Anchor examples are the FIRST TWO fixed GT claims — the GT
 * text is already fully visible to the judge, so this leaks nothing.
 */
export const buildDecomposeTask = (agentText, gtClaims) => {
  const target = gtClaims.length;
  return {
    task: 'rediscovery:decompose-v21',
    systemPrompt: 'You are a precise scientific evaluation engine. Follow the requested JSON shape exactly.',
    userPayload: {
      agentOutput: agentText,
      protocol:
        `Decompose the agent output into atomic, verifiable scientific claims. ` +
        `PROTOCOL (fixed granularity): each claim = exactly one subject + one mechanism + one direction, ` +
        `stated as ONE terse declarative sentence of AT MOST 15 content words. Mirror the TERSENESS of the ` +
        `two example claims below — no qualifiers, hedges, contexts, or "which/that" clauses: write ` +
        `"MSS tumors yield low tumor mutational burden", NOT "Mismatch repair-proficient MSS colorectal ` +
        `tumors, which constitute the majority, are known to carry a comparatively low tumor mutational ` +
        `burden". Terse sentences are REQUIRED for the matcher — long sentences are scored as protocol ` +
        `violations. ` +
        `Aim for ${Math.max(3, target - 2)}-${target + 2} claims ` +
        `(the reference granularity is ${target} claims). Do NOT split one mechanism into fragments; do NOT merge two mechanisms into one claim. ` +
        `INCLUDE mechanistic/factual assertions the output commits to (hypothesis, mechanism, expected relations). ` +
        `EXCLUDE purely methodological predictions about experiments or measurements that assert no substantive finding. ` +
        `Granularity reference (two example claims at the target grain — DISCLOSED: these two GT claims are visible ` +
        `to decomposition as a bounded granularity anchor; decomposition does not see the rest of the GT): ` +
        `"<1> ${gtClaims[0] ?? ''}" and "<2> ${gtClaims[1] ?? gtClaims[0] ?? ''}".`,
    },
    outputKind: 'json',
    temperature: 0,
    maxTokens: 4000,
    purpose: 'rediscovery:decompose-v21',
    jsonSchema: DECOMPOSE_SCHEMA,
  };
};

/**
 * Medoid pass selection (v2.4, 2026-09-03 variance fix). Behavior:
 *   1. Filter to passes with the MEDIAN claim count (the old medianPass semantics —
 *      odd counts take the true middle, even counts the upper middle band).
 *   2. Among equal-count candidates pick the MEDOID: the pass whose claim set is most
 *      representative of all passes (max mean best-claim token-Jaccard similarity).
 *   3. Deterministic tie-break by content hash.
 * Rationale (live-measured 2026-09-03, qwen3.7-max R3): with 6 of 7 passes sharing a
 * count, the old pick-any-median-count-pass made the SELECTED CONTENT a sampling
 * lottery — crispr flipped whole-repeat F1 0.267/0.267/0.000 on which pass won the
 * tie while every pass's count was stable. The medoid removes the lottery without
 * touching the gold-calibrated matching/adjudication layers.
 */
const claimTokens = (c) => new Set(String(c).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
const jaccard = (a, b) => {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter += 1;
  return inter / (a.size + b.size - inter);
};

export const medianPass = (passes) => {
  if (passes.length === 0) return [];
  const sorted = [...passes].sort((a, b) => a.length - b.length);
  const target = sorted[Math.floor(sorted.length / 2)].length;
  const band = sorted.filter((p) => p.length === target);
  if (band.length === 1) return band[0];
  const tokenized = passes.map((p) => p.map(claimTokens));
  const contentHash = (p) => {
    let h = 0;
    for (const c of p) h = (h * 31 + [...claimTokens(c)].map((w) => w.charCodeAt(0)).reduce((a, b) => a + b, 0)) | 0;
    return h;
  };
  let best = band[0];
  let bestScore = -1;
  let bestHash = Infinity;
  for (const cand of band) {
    const candTokens = cand.map(claimTokens);
    let simSum = 0;
    let comparisons = 0;
    for (let i = 0; i < passes.length; i += 1) {
      if (passes[i] === cand) continue;
      for (const ct of candTokens) {
        let bestPair = 0;
        for (const ot of tokenized[i]) bestPair = Math.max(bestPair, jaccard(ct, ot));
        simSum += bestPair;
        comparisons += 1;
      }
    }
    const score = comparisons > 0 ? simSum / comparisons : 0;
    const hash = contentHash(cand);
    if (score > bestScore || (score === bestScore && hash < bestHash)) {
      best = cand;
      bestScore = score;
      bestHash = hash;
    }
  }
  return best;
};

/**
 * Full judge pipeline over one (agentText, fixed GT) pair. `call` is the provider
 * adapter: async (req, validate) -> { ok, data } | { ok:false, error }. Returns
 * fail-visible errors instead of throwing so variance harnesses can record them.
 */
export const judgeRediscovery = async ({ agentText, gtClaims, call, passes = 5, votes = 5 }) => {
  const validateDecompose = (raw) => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return new Error('not an object');
    if (!Array.isArray(raw.agentClaims) || raw.agentClaims.length === 0) return new Error('agentClaims empty');
    if (raw.agentClaims.some((c) => typeof c !== 'string' || c.trim().length < 8)) return new Error('claim too short');
    return raw;
  };
  const decPasses = [];
  for (let p = 0; p < passes; p += 1) {
    const r = await call(buildDecomposeTask(agentText, gtClaims), validateDecompose);
    if (!r.ok) return { ok: false, error: { stage: 'decompose', pass: p + 1, message: r.error?.message ?? 'decompose failed' } };
    // defense in depth: validation is the pipeline's own obligation, never trust that
    // the provider adapter ran it (a skipped validate would let garbage claims flow in)
    const checked = validateDecompose(r.data);
    if (checked instanceof Error) return { ok: false, error: { stage: 'decompose', pass: p + 1, message: checked.message } };
    decPasses.push(r.data.agentClaims.map((c) => String(c).trim()).filter(Boolean));
  }
  const agentClaims = medianPass(decPasses);
  const MATCH = MATCH_DEFAULTS; // gold-calibrated 2026-08-22 + 2026-08-29 (claim-pair-gold.jsonl 104 pairs + claim-pair-gold-v21.jsonl 53 pairs, zero-error constraint) — single source, mutation-locked by tests
  const m = thresholdMatch(agentClaims, gtClaims, MATCH);
  const adjudications = [];
  let adjudicationVotes = [];
  let votesFailed = 0;
  // S2 deterministic band pre-layer: zero-gold-error rules (opposing directions,
  // correlation-vs-mechanism) decide some borderline pairs outright. Decided
  // pairs never reach the LLM — they cannot swing on re-judge, which is the
  // judge-variance lever (recorded band: 6/109 decided, 3/16 leniency FPs killed).
  const llmEntries = [];
  m.borderline.forEach((b, k) => {
    const det = deterministicBandVerdict(
      b.side === 'agent' ? agentClaims[b.i] : gtClaims[b.i],
      b.side === 'agent'
        ? gtClaims[b.bestIdx] ?? gtClaims[0]
        : agentClaims[b.bestIdx] ?? agentClaims[0],
    );
    if (det === false) adjudications[k] = { matched: false };
    else llmEntries.push(k);
  });
  const detBandDecided = m.borderline.length - llmEntries.length;
  if (llmEntries.length > 0) {
    const items = llmEntries.map((k) => {
      const b = m.borderline[k];
      return {
        claim: b.side === 'agent' ? agentClaims[b.i] : gtClaims[b.i],
        bestCounterpart:
          b.side === 'agent'
            ? gtClaims[b.bestIdx] ?? gtClaims[0]
            : agentClaims[b.bestIdx] ?? agentClaims[0],
      };
    });
    const voteRows = [];
    const validateAdjudicate = (raw) => {
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return new Error('not an object');
      if (!Array.isArray(raw.verdicts) || raw.verdicts.length !== items.length) return new Error('verdicts misaligned');
      // element type is load-bearing: glm-5.3 sometimes returns [{k, verdict:'same'}]
      // objects; without this check the consumer's `x === true` map silently turned
      // every object element into a NO vote (live-measured 2026-08-29 — whole batches
      // voted 0/5 on paraphrase pairs)
      if (!raw.verdicts.every((v) => typeof v === 'boolean')) return new Error('verdicts not booleans');
      return raw;
    };
    for (let v = 0; v < votes; v += 1) {
      const r = await call(
        {
          task: 'rediscovery:adjudicate',
          systemPrompt: 'You are a precise scientific evaluation engine. Follow the requested JSON shape exactly.',
          userPayload: {
            pairs: items.map((x, k) => ({ k, claim: x.claim, candidate: x.bestCounterpart })),
            instruction:
              'For each pair decide: does the CLAIM assert substantially the same scientific finding (same entity/mechanism/DIRECTION) as the CANDIDATE? Synonyms count. Direction discipline: opposite direction (promotes vs inhibits) => false; one side negates what the other asserts ("does not inhibit" vs "inhibits") => false; merely covering the candidate\'s topic without asserting its direction => false; complementary phrasings of ONE fact ("low X" alongside "high Y" where X inhibits Y) => true. Unrelated or fabricated => false. Return verdicts array aligned with k order, each element a bare JSON boolean (true/false) — NOT an object or string.',
          },
          outputKind: 'json',
          temperature: 0,
          maxTokens: 2000,
          purpose: 'rediscovery:adjudicate',
          jsonSchema: ADJUDICATE_SCHEMA,
        },
        validateAdjudicate,
      );
      if (!r.ok) { voteRows.push(null); votesFailed += 1; continue; }
      const checked = validateAdjudicate(r.data);
      if (checked instanceof Error) { voteRows.push(null); votesFailed += 1; continue; }
      voteRows.push(r.data.verdicts.map((x) => x === true));
    }
    const valid = voteRows.filter((row) => row !== null);
    if (valid.length === 0) return { ok: false, error: { stage: 'adjudicate', message: 'all adjudication votes failed' } };
    const majorityThreshold = Math.floor(valid.length / 2) + 1;
    llmEntries.forEach((k, n) => {
      const perItem = valid.map((row) => row[n] === true);
      const matched = atLeast(perItem, majorityThreshold);
      adjudications[k] = { matched };
      adjudicationVotes.push({ k, votesOk: valid.length, yes: perItem.filter(Boolean).length, matched, unanimous: perItem.every(Boolean) });
    });
  }
  const counts = finalizeCounts(agentClaims, gtClaims, m, adjudications);
  const votesRequested = llmEntries.length * votes;
  return {
    ok: true,
    agentClaims,
    decomposition: { passes: decPasses.map((p) => p.length), selected: agentClaims.length },
    matcher: { version: 'v2.5-det-band-rules-negation', ...MATCH, borderline: m.borderline.length, detBandDecided },
    adjudications,
    adjudicationVotes,
    scoredUnscored: { votesRequested, votesOk: votesRequested - votesFailed, votesFailed, note: 'failed votes are excluded from the decision, never counted as no (inspect_ai unscored semantics)' },
    counts,
    f1: Math.round(counts.f1 * 1000) / 1000,
  };
};
