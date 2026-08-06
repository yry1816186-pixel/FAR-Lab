/**
 * Migration authority: checksum/atomicity/compatibility.
 *
 * Authority: docs/far-lab-reboot/19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md §3.6,
 *   15_ROADMAP_AND_IMPLEMENTATION_HANDOFF.md §10 (migration rules).
 * Freeze: IMPL-013.
 *
 * Rules (roadmap §10):
 *   - Schema migration requires checksum, backup, forward-compat window, rehearsal
 *     on copy, failure atomicity, and verified restore.
 *   - Rollback = selecting a prior immutable candidate, never editing a sealed receipt.
 *
 * 模型中立 · 零容忍合规.
 */

import { createHash } from 'node:crypto';
import { canonicalJson } from '../evidence_log/hasher.ts';

// ===========================================================================
// Migration plan
// ===========================================================================

/** Input for building a migration plan. */
export interface MigrationPlanInput {
  readonly migrationId: string;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly description: string;
  readonly forwardCompatibleUntil: string;
  readonly rollbackPath: string;
}

/** Migration plan with checksum + atomicity metadata. */
export interface MigrationPlan {
  readonly migrationId: string;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly description: string;
  readonly forwardCompatibleUntil: string;
  readonly rollbackPath: string;
  readonly checksum: string;
  readonly canRollback: boolean;
}

/** Build a migration plan. Checksum binds the plan to its declared content. */
export function buildMigrationPlan(input: MigrationPlanInput): MigrationPlan {
  if (input.toVersion <= input.fromVersion) {
    throw new Error(
      `MIGRATION_INVALID: toVersion (${input.toVersion}) must be > fromVersion (${input.fromVersion})`,
    );
  }
  const checksum = createHash('sha256')
    .update(canonicalJson(input, 'buildMigrationPlan'), 'utf8')
    .digest('hex');
  return Object.freeze({
    ...input,
    checksum,
    canRollback: input.rollbackPath.length > 0,
  });
}

// ===========================================================================
// Atomic application
// ===========================================================================

/** Step function that returns a description or throws on failure. */
export type MigrationStep = () => string;

/** Options for atomic migration application. */
export interface AtomicMigrationOptions {
  readonly verifyAfter: () => boolean;
  readonly onRollback?: (failedStepIndex: number) => void;
}

/** Result of an atomic migration attempt. */
export interface AtomicMigrationResult {
  readonly applied: boolean;
  readonly rolledBack: boolean;
  readonly failureStep?: number;
  readonly failureReason?: string;
}

/**
 * Apply migration steps atomically: all-or-nothing.
 * If any step throws OR post-verify fails, all prior steps are rolled back
 * via onRollback callback. Returns whether applied or rolled back.
 */
export function applyMigrationAtomically(
  steps: readonly MigrationStep[],
  options: AtomicMigrationOptions,
): AtomicMigrationResult {
  const committedSteps: number[] = [];
  try {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (step === undefined) {
        throw new Error(`migration step ${i} is undefined`);
      }
      step();
      committedSteps.push(i);
    }
    // Post-verify after all steps.
    if (!options.verifyAfter()) {
      throw new Error('post-migration verification failed');
    }
    return { applied: true, rolledBack: false };
  } catch (err) {
    // failureStep = index of the step that threw (committedSteps.length, since
    // the failing step was not committed). If verify-after failed, it's steps.length - 1.
    const failureStep = committedSteps.length < steps.length
      ? committedSteps.length // step at this index threw
      : steps.length - 1;     // verify-after failed; last step index
    for (let i = committedSteps.length - 1; i >= 0; i--) {
      options.onRollback?.(committedSteps[i]!);
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      applied: false,
      rolledBack: true,
      failureStep,
      failureReason: message,
    };
  }
}

// ===========================================================================
// Compatibility report
// ===========================================================================

/** Compatibility report input. */
export interface CompatibilityReportInput {
  readonly schemaVersion: number;
  readonly codeMinVersion: number;
  readonly codeMaxVersion: number;
  readonly forwardCompatibleUntil: string;
  readonly evaluatedAt: string;
}

/** Compatibility report result. */
export interface CompatibilityReport {
  readonly compatible: boolean;
  readonly reasonCode: 'COMPATIBLE' | 'SCHEMA_OLDER_THAN_CODE_MIN' | 'SCHEMA_NEWER_THAN_CODE' | 'FORWARD_COMPAT_WINDOW_EXPIRED';
  readonly detail: string;
}

/** Build a compatibility report for a schema version against code range. */
export function buildCompatibilityReport(input: CompatibilityReportInput): CompatibilityReport {
  if (input.schemaVersion < input.codeMinVersion) {
    return {
      compatible: false,
      reasonCode: 'SCHEMA_OLDER_THAN_CODE_MIN',
      detail: `schema v${input.schemaVersion} is older than code minimum v${input.codeMinVersion}; migration required`,
    };
  }
  if (input.schemaVersion > input.codeMaxVersion) {
    return {
      compatible: false,
      reasonCode: 'SCHEMA_NEWER_THAN_CODE',
      detail: `schema v${input.schemaVersion} is newer than code maximum v${input.codeMaxVersion}; code upgrade required`,
    };
  }
  if (input.evaluatedAt >= input.forwardCompatibleUntil) {
    return {
      compatible: false,
      reasonCode: 'FORWARD_COMPAT_WINDOW_EXPIRED',
      detail: `forward-compat window expired at ${input.forwardCompatibleUntil}; evaluated at ${input.evaluatedAt}`,
    };
  }
  return {
    compatible: true,
    reasonCode: 'COMPATIBLE',
    detail: `schema v${input.schemaVersion} is within code range [${input.codeMinVersion}, ${input.codeMaxVersion}] and within forward-compat window`,
  };
}

// ===========================================================================
// Atomicity pre-flight assertion
// ===========================================================================

/**
 * Assert that a migration plan satisfies atomicity requirements.
 * Every migration must have a rollback path (or be explicitly declared irreversible
 * with compensating controls — not implemented in v0).
 * @throws MIGRATION_NOT_ATOMIC if no rollback path exists.
 */
export function assertMigrationAtomicity(plan: MigrationPlan): void {
  if (!plan.canRollback || plan.rollbackPath.length === 0) {
    throw new Error(
      `MIGRATION_NOT_ATOMIC: migration ${plan.migrationId} has no rollback path; atomicity cannot be guaranteed`,
    );
  }
}
