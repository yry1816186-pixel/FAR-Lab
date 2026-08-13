/**
 * research/falsifiability_gate — the deterministic falsifiability gate for
 * Track-1A hypotheses (directive §9.6 / §9.7 / Phase 2 "可证伪性门").
 *
 * Every candidate hypothesis carries a FalsificationMethod (prediction +
 * metric + comparator + threshold). This module maps it to the kernel's
 * FalsificationSpec and runs the EXISTING `falsifiabilityGate` (the same gate
 * the verdict pipeline enforces) — so the hypothesis layer and the verdict
 * kernel share one falsifiability contract instead of re-implementing one.
 *
 * The gate is PURE (no LLM, no I/O): the same hypothesis always produces the
 * same report, which is what makes `far research verify` able to recompute it
 * and what lets v2 run files be upgraded deterministically.
 *
 * A hypothesis whose method fails the gate is excluded from primary selection
 * (fail-closed: an unfalsifiable hypothesis cannot become the research plan's
 * primary target).
 */

import { falsifiabilityGate } from '../falsifiability/gate.ts';
import type { FalsificationSpec, ThresholdSpec } from '../falsifiability/types.ts';
import type { FalsificationMethod } from '../agent_loop/types.ts';
import type { FalsifiabilityGateReport, HypothesisCandidate } from './types.ts';

/** One hypothesis's gate outcome. */
export interface FalsifiabilityCheck {
  readonly hypothesisId: string;
  readonly passed: boolean;
  readonly errors: readonly string[];
}

/** A mapped falsification spec + its (optional) structured range threshold. */
export interface MappedFalsification {
  readonly spec: FalsificationSpec;
  readonly thresholdSpec: ThresholdSpec | undefined;
}

/**
 * Map the research layer's FalsificationMethod to the kernel's
 * FalsificationSpec. Throws with a human-readable reason when the mapping is
 * impossible (missing threshold for the comparator, non-finite numbers, or an
 * inverted range) — the same error becomes the gate failure reason.
 */
export function falsificationMethodToSpec(method: FalsificationMethod): MappedFalsification {
  const { prediction, metric, comparator } = method;
  if (prediction.trim().length === 0) {
    throw new Error('falsification method has an empty prediction');
  }
  if (metric.trim().length === 0) {
    throw new Error(`falsification method for prediction "${prediction}" has an empty metric`);
  }

  if (comparator === 'gt' || comparator === 'lt') {
    const value = method.value;
    if (value === undefined || !Number.isFinite(value)) {
      throw new Error(
        `comparator "${comparator}" requires a finite value threshold (prediction "${prediction}")`,
      );
    }
    return {
      spec: { prediction, metric, falsificationThreshold: value, thresholdSemantics: comparator },
      thresholdSpec: undefined,
    };
  }

  // comparator === 'range'
  const { lower, upper } = method;
  if (lower === undefined || upper === undefined || !Number.isFinite(lower) || !Number.isFinite(upper)) {
    throw new Error(
      `comparator "range" requires finite lower+upper thresholds (prediction "${prediction}")`,
    );
  }
  if (lower >= upper) {
    throw new Error(
      `comparator "range" requires lower < upper (got ${lower} >= ${upper}) for prediction "${prediction}"`,
    );
  }
  return {
    spec: { prediction, metric, falsificationThreshold: lower, thresholdSemantics: 'range' },
    thresholdSpec: { semantics: 'range', lower, upper },
  };
}

/**
 * Validate one hypothesis's falsification method against the kernel gate.
 * Never throws: failures are returned as structured errors (the report must
 * exist even when the gate refuses a hypothesis).
 */
export function checkFalsifiability(candidate: HypothesisCandidate): FalsifiabilityCheck {
  const errors: string[] = [];
  try {
    const mapped = falsificationMethodToSpec(candidate.falsificationMethod);
    // The kernel gate: empty prediction/metric, non-finite thresholds, and
    // incomplete range specs are rejected here.
    falsifiabilityGate({
      hypothesis: candidate.statement,
      falsificationSpec: mapped.spec,
      ...(mapped.thresholdSpec !== undefined ? { thresholdSpec: mapped.thresholdSpec } : {}),
    });
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }
  return { hypothesisId: candidate.id, passed: errors.length === 0, errors };
}

/**
 * Compute the run-level falsifiability gate report (pure). The same frozen
 * hypotheses always produce the same report — this is what v2-file upgrade
 * and `far research verify` recompute.
 */
export function computeFalsifiabilityGateReport(
  hypotheses: readonly HypothesisCandidate[],
): FalsifiabilityGateReport {
  const perHypothesis: Record<string, { passed: boolean; errors: readonly string[] }> = {};
  for (const h of hypotheses) {
    const check = checkFalsifiability(h);
    perHypothesis[h.id] = { passed: check.passed, errors: check.errors };
  }
  return {
    perHypothesis,
    allPassed: hypotheses.every((h) => perHypothesis[h.id]?.passed === true),
  };
}
