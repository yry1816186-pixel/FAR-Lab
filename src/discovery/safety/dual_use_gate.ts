/**
 * discovery/safety/dual_use_gate — dual-use screening gate (directive §2.6):
 * a DETERMINISTIC + MODEL joint screen every fan-out candidate passes before
 * entering the research pipeline (plan/experiment).
 *
 * Two layers in series, TIGHTEN-ONLY composition:
 *   Layer 1 (deterministic, rules.ts): conjunction-group lexicon over the
 *     candidate's full text. A hit → BLOCK. This layer cannot be overturned
 *     by the model layer (structural anti-manipulation: the lower layer is
 *     immune to anything the upper layer says).
 *   Layer 2 (model, batch): ONE structured call screens the surviving
 *     candidates for lexically-disguised risk. The model holds REVIEW
 *     authority only (never a final pass) — verdict enum is ALLOW|REVIEW.
 *     A REVIEW → held out of this run (reasonCode SAFETY_REVIEW_HELD; there
 *     is no human-review channel in v0, so held = does not proceed).
 *     A failed/unparseable model screen → every surviving candidate held
 *     (SAFETY_SCREEN_FAILED) — fail-closed, never fail-open.
 *
 * Candidate text is UNTRUSTED DATA: it is sanitized into the prompt via
 * sanitizeExternalContent (sentinel-wrapped) exactly like corpus text.
 *
 * What this gate CANNOT prove (§7-spirit boundary statement): the lexicon has
 * variant blind spots, the model has deception blind spots, non-English
 * candidates rely on the model layer (the lexicon is English-first), and
 * REVIEW currently has no human exit — held candidates simply do not proceed.
 * This gate REDUCES dual-use risk; it does not eliminate it.
 *
 * Clinical / person-safety layer (directive §2.6 R10, night-r2 S3): Layer 1b
 * adds deterministic clinical refusals (dosage/prescription generation and
 * person-harm ingestion requests → CLINICAL_SAFETY_REFUSAL hold, remediation
 * points to a licensed clinician) and a forced bilingual advisory banner
 * (`clinicalAdvisory` on the result) for clinical/epidemiology/toxicology/
 * psych-intervention content that is NOT refused. The banner is a display
 * disclaimer, never a verdict. Clinical cannot-prove: the screen is a lexical
 * heuristic — it cannot identify all clinically-actionable content nor
 * substitute for regulatory review, and the refusal list is deliberately
 * narrow (dosage/prescription/person-harm) to avoid over-blocking legitimate
 * research; misses fall through to the model layer or pass unflagged.
 */

import { z } from 'zod';
import type { LlmGateway } from '../../llm_gateway/gateway.ts';
import type { ProviderProfile } from '../../llm_gateway/types.ts';
import { sanitizeExternalContent } from '../../llm_gateway/sanitizer.ts';
import type { HypothesisCandidate } from '../../research/types.ts';
import { callStructuredJson } from '../../research/llm.ts';
import {
  CLINICAL_ADVISORY_BANNER,
  matchedClinicalSafetyRules,
  matchedDualUseRules,
  type DualUseRule,
} from './rules.ts';

/** Model-screen response schema (one assessment per candidate INDEX). */
const SafetyScreenZod = z.object({
  assessments: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        verdict: z.enum(['ALLOW', 'REVIEW']),
        categories: z.array(z.string()),
        reasoning: z.string(),
      }),
    )
    .min(1),
});

/** Why a candidate did not proceed. */
export type SafetyHoldReason =
  | 'DUAL_USE_RULE_MATCH'
  | 'CLINICAL_SAFETY_REFUSAL'
  | 'SAFETY_REVIEW_HELD'
  | 'SAFETY_SCREEN_FAILED';

/** One non-proceeding candidate with its full audit trail. */
export interface SafetyHold {
  readonly candidate: HypothesisCandidate;
  readonly reasonCode: SafetyHoldReason;
  readonly categories: readonly string[];
  readonly matchedRuleIds: readonly string[];
  readonly detail: string;
}

/** The gate's verdict for a candidate batch (consumers see ONLY the allowed list). */
export interface SafetyScreenResult {
  readonly allowed: readonly HypothesisCandidate[];
  readonly held: readonly SafetyHold[];
  /**
   * Forced bilingual health/person-safety disclaimer (directive §2.6 R10):
   * CLINICAL_ADVISORY_BANNER when ANY screened candidate carried clinical or
   * person-safety content (advisory vocabulary or a deterministic clinical
   * refusal); null when the batch is lexically non-clinical. This is a
   * DISPLAY-LAYER disclaimer, never a verdict — it does not gate anything.
   */
  readonly clinicalAdvisory: string | null;
  readonly meta: {
    readonly screened: number;
    readonly blockedCount: number;
    readonly heldCount: number;
    readonly modelScreen: 'completed' | 'failed';
  };
}

/** Full text surface a candidate is screened over. */
function candidateText(c: HypothesisCandidate): string {
  return [
    c.statement,
    c.mechanism,
    c.relationToExistingTheory,
    c.observablePredictions.join(' '),
    c.falsificationMethod.prediction,
    c.assumptions.join(' '),
  ].join('\n');
}

/** Build the batch screen prompt (candidate text sanitized as untrusted data). */
export function buildSafetyScreenMessages(
  candidates: readonly HypothesisCandidate[],
): { system: string; user: string } {
  const system = [
    'You are the dual-use safety screen of a scientific conjecture engine.',
    'Each numbered candidate hypothesis was machine-generated. Assess whether pursuing',
    'it (its experiments, its methods, its products) could meaningfully enable',
    'biological, chemical, nuclear, or offensive-cyber harm — INCLUDING when that',
    'enabling potential is DISGUISED behind benign framing.',
    '',
    'Return one assessment per candidate index:',
    '  ALLOW  — pursuing this candidate is plainly benign research.',
    '  REVIEW — any meaningful dual-use concern, disguise suspicion, or genuine doubt.',
    'When in doubt, REVIEW. You never lose anything by reviewing; you only lose by',
    'passing something dangerous. Categories: biological | chemical | nuclear | cyber',
    '(empty array when none apply). Output JSON only, no markdown fences.',
  ].join('\n');
  const lines = candidates.map(
    (c, i) => `[#${i}]\n${sanitizeExternalContent(candidateText(c)).text}`,
  );
  const user = [
    `Screen these ${candidates.length} candidate hypotheses:`,
    '',
    lines.join('\n\n'),
  ].join('\n');
  return { system, user };
}

/**
 * Screen a candidate batch through the two-layer gate. Deterministic-layer
 * BLOCKs are decided without the model; the model screens the survivors in
 * ONE batch call; every non-ALLOW candidate is returned in `held` with its
 * audit trail. The gate never mutates or reorders the allowed candidates.
 */
export async function screenCandidatesForDualUse(
  gateway: LlmGateway,
  profile: ProviderProfile,
  candidates: readonly HypothesisCandidate[],
): Promise<SafetyScreenResult> {
  const held: SafetyHold[] = [];
  const survivors: HypothesisCandidate[] = [];
  let advisoryRequired = false;

  // Layer 1 — deterministic conjunction rules (cannot be overturned later).
  // Dual-use rules keep priority: a candidate hitting both layers is reported
  // as DUAL_USE_RULE_MATCH exactly as before (byte-identical legacy behavior).
  for (const candidate of candidates) {
    const text = candidateText(candidate);
    const matches: readonly DualUseRule[] = matchedDualUseRules(text);
    if (matches.length > 0) {
      held.push({
        candidate,
        reasonCode: 'DUAL_USE_RULE_MATCH',
        categories: [...new Set(matches.map((m) => m.category))],
        matchedRuleIds: matches.map((m) => m.id),
        detail: `deterministic rule convergence: ${matches.map((m) => m.id).join(', ')}`,
      });
      continue;
    }
    // Layer 1b — clinical / person-safety rules (§2.6 R10): deterministic
    // dosage/prescription/person-harm refusals hold fail-closed; advisory
    // vocabulary only raises the banner flag (never a hold).
    const clinical = matchedClinicalSafetyRules(text);
    const refusals = clinical.filter((r) => r.action === 'refuse');
    if (refusals.length > 0) {
      advisoryRequired = true;
      held.push({
        candidate,
        reasonCode: 'CLINICAL_SAFETY_REFUSAL',
        categories: [...new Set(refusals.map((r) => r.category))],
        matchedRuleIds: refusals.map((r) => r.id),
        detail:
          `clinical safety refusal (fail-closed hold): ${refusals.map((r) => r.id).join(', ')} - ` +
          'FAR-Lab does not generate dosage, prescription, or person-harm guidance; ' +
          'consult a licensed clinician for any health decision',
      });
      continue;
    }
    if (clinical.some((r) => r.action === 'advise')) {
      advisoryRequired = true;
    }
    survivors.push(candidate);
  }

  const clinicalAdvisory = advisoryRequired ? CLINICAL_ADVISORY_BANNER : null;

  if (survivors.length === 0) {
    return {
      allowed: [],
      held,
      clinicalAdvisory,
      meta: {
        screened: candidates.length,
        blockedCount: held.filter((h) => h.reasonCode === 'DUAL_USE_RULE_MATCH').length,
        heldCount: 0,
        modelScreen: 'failed',
      },
    };
  }

  // Layer 2 — batch model screen (REVIEW authority only).
  const { system, user } = buildSafetyScreenMessages(survivors);
  let assessments: z.infer<typeof SafetyScreenZod>['assessments'];
  try {
    const { data } = await callStructuredJson(
      gateway,
      profile,
      'discovery_safety_screen',
      SafetyScreenZod,
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      4096,
    );
    assessments = data.assessments;
  } catch (err) {
    // Fail-closed: an unusable screen holds EVERY survivor — never passes on doubt.
    for (const candidate of survivors) {
      held.push({
        candidate,
        reasonCode: 'SAFETY_SCREEN_FAILED',
        categories: [],
        matchedRuleIds: [],
        detail: `model screen failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    return {
      allowed: [],
      held,
      clinicalAdvisory,
      meta: { screened: candidates.length, blockedCount: 0, heldCount: survivors.length, modelScreen: 'failed' },
    };
  }

  const byIndex = new Map(assessments.map((a) => [a.index, a]));
  const allowed: HypothesisCandidate[] = [];
  for (let i = 0; i < survivors.length; i += 1) {
    const candidate = survivors[i]!;
    const assessment = byIndex.get(i);
    if (assessment === undefined) {
      held.push({
        candidate,
        reasonCode: 'SAFETY_SCREEN_FAILED',
        categories: [],
        matchedRuleIds: [],
        detail: `model screen omitted index ${i} — treated as unassessed (fail-closed)`,
      });
      continue;
    }
    if (assessment.verdict === 'ALLOW') {
      allowed.push(candidate);
      continue;
    }
    held.push({
      candidate,
      reasonCode: 'SAFETY_REVIEW_HELD',
      categories: assessment.categories,
      matchedRuleIds: [],
      detail: assessment.reasoning,
    });
  }

  return {
    allowed,
    held,
    clinicalAdvisory,
    meta: {
      screened: candidates.length,
      blockedCount: held.filter((h) => h.reasonCode === 'DUAL_USE_RULE_MATCH').length,
      heldCount: held.filter((h) => h.reasonCode !== 'DUAL_USE_RULE_MATCH').length,
      modelScreen: 'completed',
    },
  };
}
