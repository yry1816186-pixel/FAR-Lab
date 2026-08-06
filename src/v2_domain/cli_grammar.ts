/**
 * V2 CLI Grammar — command registry, exit code contract, JSONL envelope serialization.
 *
 * Authority: docs/far-lab-reboot/19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md §5.
 * Freeze: IMPL-017.
 *
 * Provides:
 *   - CLI_EXIT_CODES: deterministic exit code mapping for CLI commands.
 *   - CliCommandSpec / CommandRegistry: typed command registration with digest integrity.
 *   - buildCommandRegistry: validates operation IDs against CANONICAL_OPERATION_IDS,
 *     sorts commands by commandId, computes SHA-256 digest over canonical JSON.
 *   - serializeEnvelopeAsJsonl: serializes a MachineEnvelope as one JSON object per line.
 *   - parseExitCode: maps operation result to deterministic exit code.
 *
 * 模型中立 · 零容忍合规: 无 any / @ts-ignore / 双重断言 / 空 catch. 全 readonly.
 */

import type { CanonicalOperationId } from './contract_enums.ts';
import { CANONICAL_OPERATION_IDS } from './contract_enums.ts';
import type { MachineEnvelope } from './shared_schemas.ts';
import { canonicalJson } from '../evidence_log/hasher.ts';

// ===========================================================================
// CLI exit codes — stable contract with callers (POSIX sysexits convention)
// ===========================================================================

/** CLI exit codes (IMPL-017). POSIX sysexits-inspired, stable CLI contract. */
export const CLI_EXIT_CODES = {
  SUCCESS: 0,
  TASK_FAILED: 1,
  USAGE_ERROR: 2,
  INTEGRITY_FAILURE: 70,
  UNSUPPORTED_OPERATION: 69,
  TASK_RETRYABLE: 75,
} as const;

/**
 * Type alias: a value from CLI_EXIT_CODES.
 * Useful for function return annotations that must be one of the known codes.
 */
export type CliExitCode = (typeof CLI_EXIT_CODES)[keyof typeof CLI_EXIT_CODES];

// ===========================================================================
// Command spec + registry
// ===========================================================================

/** Specification for a single CLI command. */
export interface CliCommandSpec {
  readonly commandId: string;
  readonly operationId: CanonicalOperationId;
  readonly subjectType: string;
  readonly summary: string;
}

/** Immutable command registry with integrity digest. */
export interface CommandRegistry {
  readonly commands: readonly CliCommandSpec[];
  readonly digest: string;
  readonly commandCount: number;
}

// ===========================================================================
// buildCommandRegistry — validates, sorts, digests
// ===========================================================================

/**
 * Build an immutable command registry from a list of command specs.
 *
 * - Every operationId MUST exist in CANONICAL_OPERATION_IDS.
 * - Commands are sorted by commandId (deterministic UTF-16 code-unit order).
 * - digest = SHA-256(canonical_json(sorted commands)).
 *
 * @throws Error with code 'CLI_UNKNOWN_OPERATION' if any operationId is unknown.
 */
export function buildCommandRegistry(commands: readonly CliCommandSpec[]): CommandRegistry {
  const validOps: ReadonlySet<string> = new Set(CANONICAL_OPERATION_IDS);

  for (const cmd of commands) {
    if (!validOps.has(cmd.operationId)) {
      const err = new Error(
        `CLI_UNKNOWN_OPERATION: operationId "${cmd.operationId}" is not in CANONICAL_OPERATION_IDS`,
      );
      (err as Error & { code: string }).code = 'CLI_UNKNOWN_OPERATION';
      throw err;
    }
  }

  // Sort by commandId for deterministic ordering.
  const sorted = [...commands].sort((a, b) => {
    if (a.commandId < b.commandId) return -1;
    if (a.commandId > b.commandId) return 1;
    return 0;
  });

  const digest = canonicalJson({ commands: sorted });
  const hashDigest = createSha256Hex(digest);

  return Object.freeze({
    commands: Object.freeze(sorted),
    digest: hashDigest,
    commandCount: sorted.length,
  });
}

// ===========================================================================
// serializeEnvelopeAsJsonl — one JSON object per line
// ===========================================================================

/**
 * Serialize a MachineEnvelope as JSONL.
 *
 * - One line per event in the envelope's events array.
 * - Final line is the envelope summary (without the full events array, to avoid
 *   duplication; instead includes eventCount).
 */
export function serializeEnvelopeAsJsonl(envelope: MachineEnvelope): string {
  const lines: string[] = [];

  // Emit each event as a separate line.
  for (const event of envelope.events) {
    lines.push(JSON.stringify(event));
  }

  // Final summary line: envelope metadata (without full events to avoid duplication).
  const summary = {
    envelopeVersion: envelope.envelopeVersion,
    operationId: envelope.operationId,
    invocationId: envelope.invocationId,
    startedAt: envelope.startedAt,
    finishedAt: envelope.finishedAt,
    exitCode: envelope.exitCode,
    result: envelope.result,
    eventCount: envelope.events.length,
    warningCount: envelope.warnings.length,
  };
  lines.push(JSON.stringify(summary));

  return lines.join('\n') + '\n';
}

// ===========================================================================
// parseExitCode — maps operation result to deterministic exit code
// ===========================================================================

/**
 * Parse an operation result into a deterministic CLI exit code.
 *
 * - applied=true → SUCCESS (0)
 * - failureReason contains 'integrity' → INTEGRITY_FAILURE (70)
 * - failureReason contains 'retry' → TASK_RETRYABLE (75)
 * - otherwise → TASK_FAILED (1)
 */
export function parseExitCode(result: { readonly applied: boolean; readonly failureReason?: string }): CliExitCode {
  if (result.applied) {
    return CLI_EXIT_CODES.SUCCESS;
  }

  const reason = (result.failureReason ?? '').toLowerCase();

  if (reason.includes('integrity')) {
    return CLI_EXIT_CODES.INTEGRITY_FAILURE;
  }

  if (reason.includes('retry')) {
    return CLI_EXIT_CODES.TASK_RETRYABLE;
  }

  return CLI_EXIT_CODES.TASK_FAILED;
}

// ===========================================================================
// Internal helpers
// ===========================================================================

import { createHash } from 'node:crypto';

function createSha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}
