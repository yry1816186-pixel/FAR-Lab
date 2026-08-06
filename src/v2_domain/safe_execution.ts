/**
 * Safe execution: no shell strings + enforced containment.
 *
 * Authority: docs/far-lab-reboot/19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md §7.2,
 *   SEC-0002 (untrusted execution containment), R-005 (shell-string injection risk).
 * Freeze: IMPL-011 (shell-string resolution) + IMPL-012 (isolated worker).
 *
 * v0 resolution: NO shell strings. Execution is a typed command vector with
 * explicit args (no shell interpolation), resource limits, and egress policy.
 * Network egress is DENY_ALL by default in v0.
 *
 * 模型中立 · 零容忍合规.
 */

import { createHash } from 'node:crypto';
import { canonicalJson } from '../evidence_log/hasher.ts';

// ===========================================================================
// IMPL-011: Execution manifest (typed command vector, no shell)
// ===========================================================================

/** Network egress policy. */
export const NETWORK_EGRESS_POLICIES = ['DENY_ALL', 'ALLOWLIST', 'ALLOW_ALL'] as const;
/** Type alias: network egress policy. */
export type NetworkEgressPolicy = (typeof NETWORK_EGRESS_POLICIES)[number];

/** Input for building an execution manifest. */
export interface ExecutionManifestInput {
  readonly executable: string;
  readonly args: readonly string[];
  readonly workingDirectory: string;
  readonly envAllowlist: readonly string[];
  readonly stdinData: string | null;
}

/** Execution manifest (doc19 §7.2). Typed command vector, never shell. */
export interface ExecutionManifest extends ExecutionManifestInput {
  readonly shellInvocation: false;  // always false — no shell
  readonly manifestDigest: string;
}

// Shell metacharacters that indicate injection attempts.
const SHELL_METACHARS = /[;|&$`<>\n\r\\]/;

/**
 * Build an execution manifest. Rejects shell metacharacters in args.
 * The manifest is a typed command vector — never passed through a shell.
 */
export function buildExecutionManifest(input: ExecutionManifestInput): ExecutionManifest {
  // Validate no shell metacharacters in executable or args.
  if (SHELL_METACHARS.test(input.executable)) {
    throw new Error(
      `SHELL_METACHAR_DETECTED: executable "${input.executable}" contains shell metacharacters`,
    );
  }
  for (const arg of input.args) {
    if (SHELL_METACHARS.test(arg)) {
      throw new Error(
        `SHELL_METACHAR_DETECTED: arg "${arg}" contains shell metacharacters`,
      );
    }
  }
  const manifestDigest = createHash('sha256')
    .update(canonicalJson(input, 'buildExecutionManifest'), 'utf8')
    .digest('hex');
  return Object.freeze({ ...input, shellInvocation: false as const, manifestDigest });
}

/**
 * Assert that a string is NOT a shell command (no pipes, substitution, etc.).
 * Used to reject the old shell-string scheduling contract.
 * @throws SHELL_STRING_REJECTED if the string contains shell operators.
 */
export function assertNoShellString(command: string): void {
  // Shell operators that indicate shell-string scheduling.
  if (/[;|&]|`|\$\(|>\s/.test(command)) {
    throw new Error(
      `SHELL_STRING_REJECTED: "${command.slice(0, 40)}..." contains shell operators; use typed command vector instead`,
    );
  }
}

// ===========================================================================
// IMPL-012: Containment policy
// ===========================================================================

/** Input for building a containment policy. */
export interface ContainmentPolicyInput {
  readonly maxCpuSeconds: number;
  readonly maxMemoryMb: number;
  readonly maxFilesystemWrites: readonly string[];
  readonly networkEgress: NetworkEgressPolicy;
  readonly allowedExitCodes: readonly number[];
}

/** Containment policy (doc19 §7.2, SEC-0002). */
export interface ContainmentPolicy extends ContainmentPolicyInput {
  readonly policyDigest: string;
}

/** Build a containment policy. */
export function buildContainmentPolicy(input: ContainmentPolicyInput): ContainmentPolicy {
  const policyDigest = createHash('sha256')
    .update(canonicalJson(input, 'buildContainmentPolicy'), 'utf8')
    .digest('hex');
  return Object.freeze({ ...input, policyDigest });
}

/** v0 safe default execution profile. Network denied, bounded resources. */
export const SAFE_EXECUTION_PROFILE: ContainmentPolicy = Object.freeze(
  buildContainmentPolicy({
    maxCpuSeconds: 600,
    maxMemoryMb: 4096,
    maxFilesystemWrites: [],
    networkEgress: 'DENY_ALL',
    allowedExitCodes: [0],
  }),
);

/**
 * Assert that a containment policy enforces all required limits.
 * v0 requires: CPU limit, memory limit, DENY_ALL or ALLOWLIST network egress.
 * @throws CONTAINMENT_NOT_ENFORCED if any limit is missing.
 */
export function assertContainmentEnforced(policy: ContainmentPolicy): void {
  if (policy.maxCpuSeconds <= 0) {
    throw new Error(
      'CONTAINMENT_NOT_ENFORCED: CPU limit must be > 0 (unbounded CPU = DoS risk)',
    );
  }
  if (policy.maxMemoryMb <= 0) {
    throw new Error(
      'CONTAINMENT_NOT_ENFORCED: memory limit must be > 0 (unbounded memory = DoS risk)',
    );
  }
  if (policy.networkEgress === 'ALLOW_ALL') {
    throw new Error(
      'CONTAINMENT_NOT_ENFORCED: network egress ALLOW_ALL is unsafe; use DENY_ALL or ALLOWLIST',
    );
  }
}
