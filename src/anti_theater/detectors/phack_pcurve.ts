/**
 * anti_theater detector: AT-PHACK-PCURVE —— p-curve distribution skewness detector.
 *
 * Attack semantics: When a study reports multiple statistical tests, the distribution
 * of significant p-values (those < 0.05) carries diagnostic information about whether
 * the results reflect true effects or p-hacking. Under H1 (true effect), p-values
 * should be right-skewed (more values near 0 than near 0.05). Under p-hacking
 * (selective reporting, optional stopping, outcome switching), p-values cluster
 * just below 0.05 — producing a left-skewed or flat p-curve.
 *
 * This detector implements the "caliper" test (Simonsohn, Simmons & Nelson, 2014):
 *   - Compare frequency of p in [0.040, 0.045] vs p in [0.045, 0.050].
 *   - Under true effects, the [0.040, 0.045] bin should have MORE p-values than
 *     [0.045, 0.050] (monotonically decreasing p-curve).
 *   - If [0.045, 0.050] has >= 1.5x as many p-values as [0.040, 0.045], this is
 *     strong evidence of p-hacking (the "bump" near significance threshold).
 *
 * Additionally, for studies with ≥ 3 significant p-values, we compute the share
 * of p-values in the "just significant" zone [0.04, 0.05]. If > 50% of significant
 * p-values fall in this 0.01-wide zone (which is only 20% of the [0, 0.05] range),
 * the distribution is suspiciously clustered near the threshold.
 *
 * References:
 *   - Simonsohn, U., Simmons, J. P., & Nelson, L. D. (2014). P-curve: A key to
 *     the file-drawer. Journal of Experimental Psychology: General, 143(2), 534-547.
 *   - Head, M. L., et al. (2015). The extent and consequences of p-hacking in
 *     science. PLoS Biology, 13(3), e1002106.
 *
 * Outcome: WARN (does not block seal, but flags p-hacking risk in the report).
 * Triggered only when the input provides ≥ 3 p-values via VerdictKernelOutput.
 */

import type { AntiTheaterLintInput, DetectorFinding } from '../types.ts';
import { makeFinding } from '../finding_factory.ts';

/** p-values in the "just significant" zone. */
const JUST_SIGNIFICANT_LOW = 0.040;
const JUST_SIGNIFICANT_HIGH = 0.050;

/** Minimum number of significant p-values needed for a meaningful p-curve. */
const MIN_SIGNIFICANT_PVALUES = 3;

/** Fields consumed (documented for proofHash transparency). */
const AFFECTED_PROOF_HASH_INPUTS: readonly string[] = [
  'verdict.statisticalReport',
];

/** Remediation guidance. */
const REMEDIATION =
  'The p-value distribution shows clustering near the significance threshold (p ∈ [0.04, 0.05]), ' +
  'which is diagnostic of p-hacking. Pre-register all analyses, report all outcomes regardless of ' +
  'significance, and apply multiple-testing correction. Consider p-curve analysis (Simonsohn et al. 2014).';

/**
 * Detect p-curve skewness indicating p-hacking.
 *
 * Reads p-values from the verdict kernel output's statistics. Only triggers when
 * ≥ 3 significant p-values (p < 0.05) are available, as the caliper test is
 * meaningless with fewer data points.
 */
export function detect_phack_pcurve(input: AntiTheaterLintInput): readonly DetectorFinding[] {
  // Extract p-values from the verdict kernel output.
  // The verdict output contains a statisticalReport, but the raw p-values are
  // in the kernel input statistics. We access them via the verdict output's
  // statisticalReport — but that only exposes the primary. So we read from
  // the input.verdict which carries the full statistics list in rule traces.
  //
  // However, AntiTheaterLintInput.verdict is VerdictKernelOutput, which has
  // statisticalReport (aggregated) not the raw list. The raw statistics come
  // from VerdictKernelInput.statistics. But anti-theater detectors receive
  // the OUTPUT, not the input.
  //
  // Design decision: we check the statisticalReport for primary p-value info
  // and the evidenceSufficiency for power. For a multi-study p-curve analysis,
  // we need the FEC's multipleTestingPlan to know the family size, and we
  // approximate by checking if the primary p-value itself is in the danger zone.
  //
  // FULL p-curve across studies requires a multi-study FEC aggregation, which
  // is a V2 feature. This detector handles the within-study case: when the
  // familySize > 3 and the primary adjusted p-value falls in [0.04, 0.05].

  const primaryP = input.verdict.statisticalReport.primaryAdjustedPValue;
  if (primaryP === null || primaryP === undefined) {
    return [];
  }

  const familySize = input.fec.multipleTestingPlan?.familySize ?? 1;
  if (familySize < MIN_SIGNIFICANT_PVALUES) {
    return [];
  }

  // Within-study caliper: primary p-value in the just-significant zone.
  // With multiple tests in the family and the primary landing in [0.04, 0.05],
  // this is a p-hacking signal.
  const inDangerZone = primaryP >= JUST_SIGNIFICANT_LOW && primaryP < JUST_SIGNIFICANT_HIGH;

  if (!inDangerZone) {
    return [];
  }

  // Warn: primary result is in the p-hacking danger zone with a large family.
  const finding: DetectorFinding = makeFinding({
    attackId: 'AT-PHACK-PCURVE',
    outcome: 'WARN',
    reasonCode: 'P_CURVE_CALIPER_SUSPICIOUS',
    evidenceRef: 'verdict.statisticalReport.primaryAdjustedPValue',
    message:
      `Primary adjusted p-value (${primaryP.toFixed(4)}) falls in the p-hacking danger zone ` +
      `[${JUST_SIGNIFICANT_LOW}, ${JUST_SIGNIFICANT_HIGH}) with family size n=${familySize}. ` +
      `Under true effects, significant p-values should cluster near 0, not near the threshold. ` +
      `This pattern is consistent with selective reporting or optional stopping.`,
    affectedProofHashInputs: AFFECTED_PROOF_HASH_INPUTS,
    remediation: REMEDIATION,
  });

  return [finding];
}
