import { falsifiabilityGate } from './gate.ts';
import { evaluateThreshold } from './threshold_semantics.ts';
import type {
  EvidenceRecord,
  FalsificationSpec,
  ThresholdSpec,
  VerdictDecision,
  VerdictResult,
} from './types.ts';

/**
 * Decides a verdict from a claim and its evidence records using the legacy
 * simple algorithm (scope-slip → DEGRADED_SCOPE, conflict → INCONCLUSIVE,
 * all-support → CONFIRMED, all-refute → REFUTED, empty → UNTESTED).
 *
 * @param input - The claim text and evidence records.
 * @returns A {@link VerdictDecision}.
 * @throws {Error} if claim is empty or evidence state is unreachable.
 */
export function decideVerdict(input: {
  readonly claim: string;
  readonly evidences: ReadonlyArray<EvidenceRecord>;
}): VerdictDecision {
  if (input.claim.trim().length === 0) {
    throw new Error('decideVerdict: claim must be non-empty');
  }
  if (input.evidences.length === 0) {
    return {
      verdict: 'UNTESTED',
      scopeSlipText: null,
      untestedReason: 'no evidence collected for this claim',
      conflictingEvidenceCount: 0,
    };
  }

  for (const evidence of input.evidences) {
    assertEvidenceRecord(evidence);
  }

  const narrower = input.evidences.find((evidence) => evidence.scopeNarrowerThanClaim);
  if (narrower !== undefined) {
    return {
      verdict: 'DEGRADED_SCOPE',
      scopeSlipText: narrower.claim,
      untestedReason: null,
      conflictingEvidenceCount: 0,
    };
  }

  const supportsCount = input.evidences.filter((evidence) => evidence.supportsClaim).length;
  const refutesCount = input.evidences.filter((evidence) => evidence.refutesClaim).length;

  if (supportsCount > 0 && refutesCount > 0) {
    return {
      verdict: 'INCONCLUSIVE',
      scopeSlipText: null,
      untestedReason: null,
      conflictingEvidenceCount: Math.min(supportsCount, refutesCount),
    };
  }

  if (supportsCount === input.evidences.length) {
    return {
      verdict: 'CONFIRMED',
      scopeSlipText: null,
      untestedReason: null,
      conflictingEvidenceCount: 0,
    };
  }

  if (refutesCount === input.evidences.length) {
    return {
      verdict: 'REFUTED',
      scopeSlipText: null,
      untestedReason: null,
      conflictingEvidenceCount: 0,
    };
  }

  throw new Error(
    `decideVerdict: unreachable evidence state, supports=${supportsCount}, refutes=${refutesCount}, total=${input.evidences.length}`,
  );
}

/**
 * Full verdict pipeline: validates the falsification spec via the gate,
 * enriches evidence with threshold evaluation, then decides the verdict.
 *
 * @param input - Claim, evidences, falsification spec, and threshold spec.
 * @returns A {@link VerdictResult} including the measured metric value.
 */
export function makeVerdict(input: {
  readonly claim: string;
  readonly evidences: ReadonlyArray<EvidenceRecord>;
  readonly falsificationSpec: FalsificationSpec;
  readonly thresholdSpec: ThresholdSpec;
}): VerdictResult {
  falsifiabilityGate({
    hypothesis: input.claim,
    falsificationSpec: input.falsificationSpec,
    thresholdSpec: input.thresholdSpec,
  });

  const enrichedEvidences = input.evidences.map((evidence): EvidenceRecord => {
    if (evidence.metricValue === undefined) {
      return evidence;
    }
    const evaluation = evaluateThreshold(evidence.metricValue, input.thresholdSpec);
    return {
      ...evidence,
      supportsClaim: evaluation.supportsClaim,
      refutesClaim: evaluation.refutesClaim,
    };
  });

  const decision = decideVerdict({
    claim: input.claim,
    evidences: enrichedEvidences,
  });

  return {
    ...decision,
    metricValue: firstMetricValue(enrichedEvidences),
  };
}

function assertEvidenceRecord(evidence: EvidenceRecord): void {
  if (evidence.claim.trim().length === 0) {
    throw new Error('decideVerdict: evidence claim must be non-empty');
  }
  if (evidence.metricValue !== undefined && !Number.isFinite(evidence.metricValue)) {
    throw new Error(`decideVerdict: metricValue must be finite for evidence "${evidence.claim}"`);
  }
  if (evidence.supportsClaim === evidence.refutesClaim) {
    throw new Error(
      `decideVerdict: evidence must set exactly one of supportsClaim/refutesClaim for "${evidence.claim}"`,
    );
  }
}

function firstMetricValue(evidences: ReadonlyArray<EvidenceRecord>): number | null {
  const evidence = evidences.find((item) => item.metricValue !== undefined);
  if (evidence === undefined || evidence.metricValue === undefined) {
    return null;
  }
  return evidence.metricValue;
}
