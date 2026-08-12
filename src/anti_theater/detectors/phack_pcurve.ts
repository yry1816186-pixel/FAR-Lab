/**
 * anti_theater detector: AT-PHACK-MARGINAL-P —— marginal primary p-value p-hacking risk signal.
 *
 * Honest scope: This detector fires when the SINGLE primary adjusted p-value lands in the
 * marginal zone [0.04, 0.05) alongside a large test family (familySize >= 3). It is a
 * p-hacking RISK SIGNAL, NOT a p-curve distribution test.
 *
 * A true p-curve caliper (Simonsohn, Simmons & Nelson, 2014) requires a DISTRIBUTION of
 * p-values across studies (comparing the frequency of p in [0.040, 0.045] vs [0.045, 0.050]).
 * The current anti-theater input carries only a single scalar primaryAdjustedPValue plus the
 * FEC multipleTestingPlan.familySize, so a distributional p-curve test cannot be performed
 * here. Implementing a real p-curve caliper across studies is a V2 feature that needs a
 * multi-study FEC aggregation.
 *
 * What this signal means: when a family of >= 3 tests is run and the single headline result
 * squeezes just under alpha (p in [0.04, 0.05)), that is the region most commonly produced
 * by selective reporting / optional stopping / outcome switching — hence a WARN risk flag,
 * not proof of p-hacking.
 *
 * Reference (recommended follow-up, NOT performed by this detector):
 *   - Simonsohn, U., Simmons, J. P., & Nelson, L. D. (2014). P-curve: A key to
 *     the file-drawer. Journal of Experimental Psychology: General, 143(2), 534-547.
 *
 * Outcome: WARN (does not block seal, but flags p-hacking risk in the report).
 * Triggered only when primaryAdjustedPValue is present and familySize >= 3.
 */

import type { AntiTheaterLintInput, DetectorFinding } from '../types.ts';
import { makeFinding } from '../finding_factory.ts';

/** Lower bound (inclusive) of the marginal-significance zone. */
const JUST_SIGNIFICANT_LOW = 0.040;
const JUST_SIGNIFICANT_HIGH = 0.050;

/** Minimum family size for the marginal-p signal to be meaningful. */
const MIN_SIGNIFICANT_PVALUES = 3;

/** Fields consumed (documented for proofHash transparency). */
const AFFECTED_PROOF_HASH_INPUTS: readonly string[] = [
  'verdict.statisticalReport',
];

/** Remediation guidance (p-curve is a recommended FOLLOW-UP, not something this detector performs). */
const REMEDIATION =
  'The single primary adjusted p-value sits in the marginal-significance zone (p ∈ [0.04, 0.05)) ' +
  'alongside a large test family, which is a p-hacking risk signal — not proof. Pre-register all ' +
  'analyses, report all outcomes regardless of significance, and apply multiple-testing correction. ' +
  'As a recommended follow-up, perform a p-curve distribution analysis across studies (Simonsohn et al. 2014).';

/**
 * Detect a marginal primary p-value indicating p-hacking RISK (single-scalar signal).
 *
 * Reads the single primaryAdjustedPValue plus the FEC multipleTestingPlan.familySize. Fires a
 * WARN only when familySize >= 3 AND the primary adjusted p-value lands in [0.04, 0.05). This is
 * NOT a p-curve distribution test; it cannot be, because the input carries one p-value, not a
 * distribution. A real p-curve caliper is a recommended follow-up (see file header).
 */
export function detect_phack_pcurve(input: AntiTheaterLintInput): readonly DetectorFinding[] {
  // The anti-theater input exposes the single primary adjusted p-value via the verdict
  // statisticalReport (not a distribution of p-values). AntiTheaterLintInput.verdict is the
  // VerdictKernelOutput, which exposes statisticalReport.primaryAdjustedPValue and the FEC
  // multipleTestingPlan.familySize. A distributional p-curve across studies would need a
  // multi-study FEC aggregation (V2 feature); this detector handles the single-primary case.
  const primaryP = input.verdict.statisticalReport.primaryAdjustedPValue;
  if (primaryP === null || primaryP === undefined) {
    return [];
  }

  const familySize = input.fec.multipleTestingPlan?.familySize ?? 1;
  if (familySize < MIN_SIGNIFICANT_PVALUES) {
    return [];
  }

  // Marginal-primary signal: the single headline p-value lands in the just-significant zone.
  // With a large family (>= 3 tests) and the primary squeezing just under alpha, this is the
  // region most associated with selective reporting / optional stopping — a risk flag, not proof.
  const inDangerZone = primaryP >= JUST_SIGNIFICANT_LOW && primaryP < JUST_SIGNIFICANT_HIGH;

  if (!inDangerZone) {
    return [];
  }

  // Warn: primary result is marginally significant with a large test family (risk signal).
  const finding: DetectorFinding = makeFinding({
    attackId: 'AT-PHACK-MARGINAL-P',
    outcome: 'WARN',
    reasonCode: 'MARGINAL_PRIMARY_P',
    evidenceRef: 'verdict.statisticalReport.primaryAdjustedPValue',
    message:
      `Primary adjusted p-value (${primaryP.toFixed(4)}) is marginally significant ` +
      `[${JUST_SIGNIFICANT_LOW}, ${JUST_SIGNIFICANT_HIGH}) with a large test family (n=${familySize}). ` +
      `A headline result that squeezes just under alpha amid many tests is a p-hacking risk signal ` +
      `(selective reporting / optional stopping). This is a single-p risk flag, not a p-curve distribution test.`,
    affectedProofHashInputs: AFFECTED_PROOF_HASH_INPUTS,
    remediation: REMEDIATION,
  });

  return [finding];
}
