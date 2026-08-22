/**
 * Self-consistency vote aggregation for the LLM judge (W4-F4, 2026-08-22).
 *
 * Source-fused mechanism (google-gemini/gemini-cli evals/llm-judge.ts:30-114,
 * Apache-2.0 — N parallel judge runs, majority vote), adapted to FAR-Lab's rubric:
 * blind labels X/Y/Z each carry integer 1-5 scores on two dimensions. FAR-Lab takes
 * the per-dimension MEDIAN across votes (consistent with the rediscovery judge-v2
 * 3-vote median precedent, D-037) instead of a YES/NO majority, and — scientific
 * honesty rule — records min/max spread and every raw vote rather than hiding
 * disagreement behind a point estimate.
 *
 * Pure functions only; unit-tested in tests/judge-votes.test.ts. No API calls.
 */

/** Median of numbers: middle element for odd counts, mean of the two middles for even. */
export const medianOf = (nums) => {
  if (nums.length === 0) throw new Error('medianOf: empty input');
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const DIMENSIONS = ['hypothesis_quality', 'counter_evidence_coverage'];

/**
 * Aggregate judge votes.
 *
 * @param {Array<{ok: true, data: Record<string, {hypothesis_quality: number, counter_evidence_coverage: number, one_line_reason?: string}>} | {ok: false}>} votes
 * @returns {{
 *   okVotes: number,
 *   labels: Record<string, {
 *     hypothesis_quality: {median: number, min: number, max: number},
 *     counter_evidence_coverage: {median: number, min: number, max: number},
 *     one_line_reason: string | null
 *   }>
 * } | null} null when no vote succeeded (caller records judge_ok=false honestly).
 */
export const aggregateVotes = (votes) => {
  const okVotes = votes.filter((v) => v.ok);
  if (okVotes.length === 0) return null;
  const labels = {};
  for (const label of ['X', 'Y', 'Z']) {
    labels[label] = {};
    for (const dim of DIMENSIONS) {
      const values = okVotes.map((v) => v.data[label][dim]);
      labels[label][dim] = { median: medianOf(values), min: Math.min(...values), max: Math.max(...values) };
    }
    // Reason from the first vote whose HQ equals the median (ties resolve to the earliest);
    // null only if no vote carried a reason string.
    const hqMedian = labels[label].hypothesis_quality.median;
    labels[label].one_line_reason =
      okVotes.find((v) => v.data[label].hypothesis_quality === hqMedian && typeof v.data[label].one_line_reason === 'string')
        ?.data[label].one_line_reason ?? null;
  }
  return { okVotes: okVotes.length, labels };
};
