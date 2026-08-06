/**
 * V2 Domain Contract Set — canonical state vocabulary, qualified profile types,
 * assurance dimensions, operation IDs, legacy aliases, and reason codes.
 *
 * Authority: docs/far-lab-reboot/19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md §3-§5.
 * Freeze: SPEC-001 / IMPL-002. This module is the sole source of truth for V2
 * serialized state values. V1 ProofEnvelope (src/proof_envelope/types.ts) remains
 * untouched; V2 is additive.
 *
 * Evidence state: CANDIDATE_FREEZE — the reboot package classified these as
 * `SPECIFIED_UNAPPROVED` / `MACHINE_AUTHORITY_OPEN`. The project owner (single
 * maintainer) has authorized this implementation. These enums are the machine
 * authority; they are NOT externally council-approved until IRG-015/016/017 close.
 *
 * Invariants (doc19):
 *   - Every serialized field named *profile* MUST be qualified (no bare "profile").
 *   - No dimension collapses the assurance vector into one "verified" badge.
 *   - CANCELED (not CANCELLED) is the sole serialized spelling.
 *   - TIMED_OUT is never a state; EXPIRED + phase-specific reason instead.
 *   - COMPILED/ISSUED/READY_TO_SEAL/PUBLISHED are NOT receipt standing values.
 *
 * 模型中立 · 零容忍合规: 无 any / @ts-ignore / 双重断言 / 空 catch. 全 readonly.
 */

// ===========================================================================
// §3.1 Draft lifecycle + preflight result
// ===========================================================================

/** Draft lifecycle state (doc19 §3.1). Sole edge: EDITABLE → DISCARDED. */
export const DRAFT_LIFECYCLE_STATES = ['EDITABLE', 'DISCARDED'] as const;
/** Type alias: draft lifecycle state. */
export type DraftLifecycleState = (typeof DRAFT_LIFECYCLE_STATES)[number];

/** Preflight result state (doc19 §3.1). Separate immutable object, not a draft lifecycle state. */
export const PREFLIGHT_RESULT_STATES = ['PREFLIGHT_BLOCKED', 'PREFLIGHT_READY'] as const;
/** Type alias: preflight result state. */
export type PreflightResultState = (typeof PREFLIGHT_RESULT_STATES)[number];

// ===========================================================================
// §3.2 Task attempt state
// ===========================================================================

/**
 * TaskAttempt serialized state (doc19 §3.2). Complete legal set.
 * TIMED_OUT is absent by design — use EXPIRED + registered deadline reason.
 * CANCELED is the sole spelling (not CANCELLED).
 */
export const TASK_ATTEMPT_STATES = [
  'QUEUED',
  'PREPARING',
  'RUNNING',
  'PAUSED',
  'CANCEL_REQUESTED',
  'SUCCEEDED',
  'SUCCEEDED_WITH_GAPS',
  'FAILED_RETRYABLE',
  'FAILED_TERMINAL',
  'CANCELED',
  'EXPIRED',
] as const;
/** Type alias: task attempt state. */
export type TaskAttemptState = (typeof TASK_ATTEMPT_STATES)[number];

/** Terminal task attempt states — never transition (doc19 §3.2). */
export const TERMINAL_TASK_ATTEMPT_STATES = [
  'SUCCEEDED',
  'SUCCEEDED_WITH_GAPS',
  'FAILED_RETRYABLE',
  'FAILED_TERMINAL',
  'CANCELED',
  'EXPIRED',
] as const;

// ===========================================================================
// §3.3 Receipt standing + preservation status
// ===========================================================================

/** Receipt standing (doc19 §3.3). Begins SEALED+ACTIVE. */
export const RECEIPT_STANDING_VALUES = ['ACTIVE', 'SUPERSEDED', 'WITHDRAWN'] as const;
/** Type alias: receipt standing. */
export type ReceiptStanding = (typeof RECEIPT_STANDING_VALUES)[number];

/** Preservation status (doc19 §3.3). Orthogonal to standing. */
export const PRESERVATION_STATUS_VALUES = ['AVAILABLE', 'ARCHIVED', 'PAYLOAD_REMOVED'] as const;
/** Type alias: preservation status. */
export type PreservationStatus = (typeof PRESERVATION_STATUS_VALUES)[number];

// ===========================================================================
// §3.4 Review case states + resolution outcomes
// ===========================================================================

/** Review case state (doc19 §3.4). */
export const REVIEW_CASE_STATES = [
  'DRAFT',
  'SUBMITTED',
  'RESPONSE_NEEDED',
  'RESPONDED',
  'RESOLVED',
  'WITHDRAWN',
] as const;
/** Type alias: review case state. */
export type ReviewCaseState = (typeof REVIEW_CASE_STATES)[number];

/** Review resolution outcome (doc19 §3.4). One per RESOLVED case. */
export const REVIEW_RESOLUTION_OUTCOMES = [
  'UPHELD',
  'AMENDED',
  'REJECTED_WITH_REASON',
  'UNRESOLVED',
] as const;
/** Type alias: review resolution outcome. */
export type ReviewResolutionOutcome = (typeof REVIEW_RESOLUTION_OUTCOMES)[number];

// ===========================================================================
// §4 Qualified profile types + assurance dimensions
// ===========================================================================

/**
 * Deployment profile (doc19 §4). O/L enabled in v0; I/H declared but blocked.
 * One-letter labels (O/L/I/H) are display-only, never V2 API/CLI values.
 */
export const DEPLOYMENT_PROFILE_VALUES = [
  'O_OFFLINE_VERIFIER',
  'L_LOCAL_AUTHOR',
  'I_INSTITUTION_PRIVATE',
  'H_HOSTED',
] as const;
/** Type alias: deployment profile. */
export type DeploymentProfile = (typeof DEPLOYMENT_PROFILE_VALUES)[number];

/** v0 enabled deployment profiles (I/H blocked). */
export const V0_ENABLED_DEPLOYMENT_PROFILES: readonly DeploymentProfile[] = [
  'O_OFFLINE_VERIFIER',
  'L_LOCAL_AUTHOR',
];

/**
 * Six independent assurance dimensions (doc19 §4, core doc 07).
 * No policy collapses these into one "verified" state.
 */
export const ASSURANCE_DIMENSIONS = [
  'provenance',
  'integrity',
  'identity',
  'processConformance',
  'executionReproduction',
  'scientificVerdict',
] as const;
/** Type alias: assurance dimension. */
export type AssuranceDimension = (typeof ASSURANCE_DIMENSIONS)[number];

// ===========================================================================
// §5 Canonical operation IDs (semantic authority for CLI/API/Web)
// ===========================================================================

/**
 * Canonical operation IDs (doc19 §5). CLI/API/Web are projections.
 * The operation ID is the semantic authority; surface absence is explicit.
 */
export const CANONICAL_OPERATION_IDS = [
  // system
  'system.capabilities',
  'system.doctor',
  'system.config.get',
  'system.config.explain',
  'system.config.validate',
  // project
  'project.create',
  'project.get',
  // receipt + draft
  'receipt.list',
  'receipt.get',
  'receipt.components.list',
  'receipt.component.get',
  'receipt.verify',
  'receipt.replay',
  'receipt.diff',
  'receipt.supersede',
  'receipt.withdraw',
  'draft.list',
  'draft.create',
  'draft.get',
  'draft.update',
  'draft.discard',
  'draft.preflight',
  'draft.compile',
  // viewer
  'viewer.open',
  // verification + replay results
  'verification.get',
  'replay.get',
  // task lifecycle
  'task.get',
  'task.events',
  'task.cancel',
  'task.resume',
  'task.retry',
  // review
  'review.create',
  'review.get',
  'review.request_evidence',
  'review.respond',
  'review.challenge',
  'review.resolve',
  'review.withdraw',
  'review.import_exchange',
  // export
  'export.create',
  // policy
  'policy.list',
  'policy.get',
  'policy.evaluate',
] as const;
/** Type alias: canonical operation ID. */
export type CanonicalOperationId = (typeof CANONICAL_OPERATION_IDS)[number];

// ===========================================================================
// §3.6 Legacy term aliases (accepted only in explicit legacy reader)
// ===========================================================================

/**
 * Legacy term → canonical mapping (doc19 §3.6).
 * These aliases MUST NOT be emitted by V2. Used only by the migration/legacy reader.
 */
export const LEGACY_TERM_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  // Task cancellation spelling
  CANCELLING: 'CANCEL_REQUESTED',
  CANCELLED: 'CANCELED',
  // Deadline (never a state itself)
  TIMED_OUT: 'EXPIRED',
  // Receipt standing aliases (not standing values in V2)
  COMPILED: 'ACTIVE',
  ISSUED: 'ACTIVE',
  READY_TO_SEAL: 'ACTIVE',
  SEALED: 'ACTIVE',
  // Distribution events (not standing)
  PUBLISHED: 'ACTIVE',
  SHARED: 'ACTIVE',
  EXPORTED: 'ACTIVE',
  // Preservation alias
  ARCHIVED: 'ARCHIVED',
});

// ===========================================================================
// V2 reason codes (fail-closed vocabulary)
// ===========================================================================

/**
 * V2 reason codes (doc19 §3.1-§3.6, §6). Every rejection/transition-gate failure
 * must resolve to one of these. Extensible, but each addition is a contract change.
 */
export const V2_REASON_CODES = [
  // §3.2 task retry / deadline
  'TASK_RETRY_NOT_ALLOWED',
  'TASK_QUEUE_DEADLINE_EXCEEDED',
  'TASK_EXECUTION_DEADLINE_EXCEEDED',
  'TASK_CHECKPOINT_MISMATCH',
  'TASK_VERSION_CONFLICT',
  // §3.1 legacy preflight
  'LEGACY_PREFLIGHT_SUBJECT_INCOMPLETE',
  // §3.3 legacy standing
  'LEGACY_STANDING_UNKNOWN',
  // §3.4 legacy review
  'LEGACY_REVIEW_SUBJECT_MISSING',
  'LEGACY_REVIEW_ATTRIBUTION_MISSING',
  'LEGACY_REVIEW_BASIS_MISSING',
  'LEGACY_REVIEW_REQUEST_INCOMPLETE',
  'LEGACY_REVIEW_STATE_AMBIGUOUS',
  'LEGACY_TIMEOUT_PHASE_UNKNOWN',
  // §3.2 legacy timeout
  // §6 viewer / integrity
  'UNVERIFIED_PRESENTATION',
  'PROOF_HASH_MISMATCH',
  'MANIFEST_MISSING',
  'MANDATORY_MEMBER_MISSING',
  'DOWNGRADE_REJECTED',
  'UNSUPPORTED_SCHEMA_VERSION',
  // §3.3 receipt standing transitions
  'SUPERSEDE_REQUIRES_SUCCESSOR',
  'WITHDRAW_REQUIRES_AUTHORITY',
  // §4 profile / policy
  'DEPLOYMENT_PROFILE_BLOCKED',
  'VERIFICATION_POLICY_REQUIRED_DIMENSION_MISSING',
  // §7 distribution
  'SUPPORT_CHANNEL_UNAVAILABLE',
  'SUPPORT_DESCRIPTOR_EXPIRED',
] as const;
/** Type alias: V2 reason code. */
export type V2ReasonCode = (typeof V2_REASON_CODES)[number];
