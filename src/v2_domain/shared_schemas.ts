/**
 * V2 Shared State/Reason/Error/Event Schemas.
 *
 * Authority: docs/far-lab-reboot/19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md §3-§5.
 * Freeze: SPEC-001/002 (IMPL-005). Provides the shared typed envelopes that
 * CLI/API/Web projections consume.
 *
 * 模型中立 · 零容忍合规.
 */

import type {
  AssuranceDimension,
  TaskAttemptState,
  ReceiptStanding,
  PreservationStatus,
  ReviewCaseState,
  V2ReasonCode,
  CanonicalOperationId,
} from './contract_enums.ts';

// ===========================================================================
// §4 Verification result — always 6 independent dimensions + summaries
// ===========================================================================

/** Single assurance dimension outcome. Never collapses to a single "verified". */
export interface AssuranceDimensionResult {
  readonly dimension: AssuranceDimension;
  readonly outcome: 'PASS' | 'FAIL' | 'WARN' | 'SKIP' | 'NOT_APPLICABLE';
  readonly reasonCodes: readonly V2ReasonCode[];
  readonly evidenceDigest?: string;
  readonly detail: string;
}

/**
 * Complete verification result (doc19 §4). Always returns all 6 dimensions.
 * Named policies may require a subset, but the result vector is never collapsed.
 */
export interface VerificationResult {
  readonly resultVersion: 1;
  readonly resultId: string;
  readonly receiptId: string;
  readonly verificationPolicyId: string;
  readonly evaluatedAt: string;
  readonly dimensions: Readonly<Record<AssuranceDimension, AssuranceDimensionResult>>;
  readonly receiptStanding: ReceiptStanding;
  readonly preservationStatus: PreservationStatus;
  readonly reviewSummary: 'NONE' | 'CONTESTED' | 'RESOLVED';
}

// ===========================================================================
// §5 CLI machine envelope — operationId-bound, JSONL-serializable
// ===========================================================================

/** CLI/API machine envelope (doc19 §5). Every command emits this. */
export interface MachineEnvelope {
  readonly envelopeVersion: 1;
  readonly operationId: CanonicalOperationId;
  readonly invocationId: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly exitCode: number;
  readonly result?: unknown;
  readonly events: readonly MachineEvent[];
  readonly warnings: readonly MachineWarning[];
}

/** Typed machine event in the envelope event stream. */
export interface MachineEvent {
  readonly eventSeq: number;
  readonly eventKind: string;
  readonly occurredAt: string;
  readonly payload?: unknown;
}

/** Non-fatal warning attached to the envelope. */
export interface MachineWarning {
  readonly reasonCode: V2ReasonCode;
  readonly detail: string;
}

// ===========================================================================
// §5 Problem schema — RFC 7807-shaped, operationId-bound
// ===========================================================================

/** Problem detail (RFC 7807-shaped extension, doc19 §5). */
export interface V2Problem {
  readonly problemVersion: 1;
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly operationId: CanonicalOperationId;
  readonly reasonCode: V2ReasonCode;
  readonly instance?: string;
}

// ===========================================================================
// §5 Capabilities schema — system.capabilities output
// ===========================================================================

/** System capabilities (doc19 §5, system.capabilities operation). */
export interface SystemCapabilities {
  readonly capabilitiesVersion: 1;
  readonly farVersion: string;
  readonly candidateDigest: string;
  readonly deploymentProfile: string;
  readonly enabledOperations: readonly CanonicalOperationId[];
  readonly numericalEquivalenceProfiles: readonly string[];
  readonly signatureSuites: readonly string[];
  readonly disabledFeatures: readonly { readonly feature: string; readonly reason: V2ReasonCode }[];
}

// ===========================================================================
// §3.2 Task projection — logical container view
// ===========================================================================

/** Task projection (doc19 §3.2). Logical container; state derived from current attempt. */
export interface TaskProjection {
  readonly taskId: string;
  readonly currentAttemptId: string;
  readonly attemptNumber: number;
  readonly state: TaskAttemptState;
  readonly operationId: CanonicalOperationId;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ===========================================================================
// §3.4 Review summary projection
// ===========================================================================

/** Review case projection (doc19 §3.4). */
export interface ReviewCaseProjection {
  readonly reviewId: string;
  readonly receiptId: string;
  readonly state: ReviewCaseState;
  readonly resolutionOutcome?: 'UPHELD' | 'AMENDED' | 'REJECTED_WITH_REASON' | 'UNRESOLVED';
  readonly contested: boolean;
  readonly events: readonly ReviewEvent[];
}

/** Append-only review event (doc19 §3.4). */
export interface ReviewEvent {
  readonly eventSeq: number;
  readonly eventKind: 'SUBMITTED' | 'RESPONSE_NEEDED' | 'RESPONDED' | 'RESOLVED' | 'WITHDRAWN' | 'CHALLENGED';
  readonly actor: string;
  readonly occurredAt: string;
  readonly detail: string;
}

// ===========================================================================
// Builders + helpers (IMPL-005)
// ===========================================================================

import { ASSURANCE_DIMENSIONS } from './contract_enums.ts';

/** Input for building a VerificationResult. */
export interface VerificationResultInput {
  readonly resultId: string;
  readonly receiptId: string;
  readonly verificationPolicyId: string;
  readonly evaluatedAt: string;
  readonly dimensionResults: Readonly<Partial<Record<AssuranceDimension, AssuranceDimensionResult>>>;
  readonly receiptStanding: ReceiptStanding;
  readonly preservationStatus: PreservationStatus;
  readonly reviewCases?: ReadonlyArray<{ readonly state: ReviewCaseState }>;
}

/**
 * Build a VerificationResult. Always includes all 6 assurance dimensions.
 * @throws Error with MISSING_ASSURANCE_DIMENSION if any of the 6 is absent.
 *
 * doc19 §4: no policy collapses the vector into one "verified" state.
 */
export function buildVerificationResult(input: VerificationResultInput): VerificationResult {
  const dimensions = {} as Record<AssuranceDimension, AssuranceDimensionResult>;
  for (const dim of ASSURANCE_DIMENSIONS) {
    const result = input.dimensionResults[dim];
    if (!result) {
      throw new Error(
        `MISSING_ASSURANCE_DIMENSION: dimension "${dim}" must have a result (use NOT_APPLICABLE if not evaluated)`,
      );
    }
    dimensions[dim] = result;
  }

  const reviewSummary = input.reviewCases
    ? (isReviewContested(input.reviewCases) ? 'CONTESTED' : 'NONE')
    : 'NONE';

  return Object.freeze({
    resultVersion: 1 as const,
    resultId: input.resultId,
    receiptId: input.receiptId,
    verificationPolicyId: input.verificationPolicyId,
    evaluatedAt: input.evaluatedAt,
    dimensions,
    receiptStanding: input.receiptStanding,
    preservationStatus: input.preservationStatus,
    reviewSummary,
  });
}

/**
 * Determine if a set of review cases yields a CONTESTED summary.
 * doc19 §3.4: CONTESTED is a derived summary when at least one unresolved challenge applies.
 */
export function isReviewContested(
  reviewCases: ReadonlyArray<{ readonly state: ReviewCaseState }>,
): boolean {
  // Unresolved = any non-terminal, non-resolved state.
  const unresolvedStates: ReadonlySet<string> = new Set(['DRAFT', 'SUBMITTED', 'RESPONSE_NEEDED', 'RESPONDED']);
  return reviewCases.some((rc) => unresolvedStates.has(rc.state));
}

/**
 * Produce a NOT_APPLICABLE placeholder for an assurance dimension.
 * Use when a verification policy does not evaluate that dimension.
 * The dimension is still present in the result (no collapse).
 */
export function DEFAULT_DIMENSION_NOT_APPLICABLE(dimension: AssuranceDimension): AssuranceDimensionResult {
  return Object.freeze({
    dimension,
    outcome: 'NOT_APPLICABLE' as const,
    reasonCodes: [],
    detail: 'dimension not evaluated under this verification policy',
  });
}
