/**
 * IMPL-030 — Versioned Telemetry/Diagnostic Semantic Conventions.
 *
 * Provides versioned semantic conventions for telemetry fields with:
 *   - Four-tier field classification (PUBLIC / INTERNAL / SENSITIVE / SECRET)
 *   - Per-field PII risk flagging and cardinality budgets
 *   - Deterministic digest via canonical JSON hash (reuses evidence_log/hasher)
 *   - Evidence-decoupled: no dependency on proof envelope or evidence log types.
 *
 * Authority: IMPL-030. 模型中立 · 零容忍合规: 无 any / @ts-ignore. 全 readonly.
 */

import { createHash } from 'node:crypto';
import stableStringify from 'fast-json-stable-stringify';
import { compareStringsDeterministic } from '../evidence_log/hasher.ts';

// ===========================================================================
// §1 Field classification taxonomy
// ===========================================================================

/** Four-tier telemetry field classification. */
export const TELEMETRY_FIELD_CLASSIFICATIONS = [
  'PUBLIC',
  'INTERNAL',
  'SENSITIVE',
  'SECRET',
] as const;

/** Type alias: field classification tier. */
export type TelemetryFieldClassification =
  (typeof TELEMETRY_FIELD_CLASSIFICATIONS)[number];

// ===========================================================================
// §2 Types — field spec, semantic convention
// ===========================================================================

/** Specification for a single telemetry field within a semantic convention. */
export interface TelemetryFieldSpec {
  /** Logical field name in the telemetry event. */
  readonly fieldName: string;
  /** Classification tier governing redaction and leak detection. */
  readonly classification: TelemetryFieldClassification;
  /** Corresponding OpenTelemetry attribute key (e.g. 'far.task.state'). */
  readonly otelAttributeKey: string;
  /** Whether the field carries personally identifiable information (PII). */
  readonly piiRisk: boolean;
  /**
   * Maximum allowed number of distinct values for this field.
   * Used by assertCardinalityBudget to prevent high-cardinality attacks.
   */
  readonly cardinalityBudget: number;
}

/** A versioned semantic convention governing telemetry field behavior. */
export interface SemanticConvention {
  /** Convention version string (e.g. '1.0.0'). */
  readonly version: string;
  /** Ordered field specifications. */
  readonly fields: readonly TelemetryFieldSpec[];
  /** SHA-256 digest of canonical JSON of fields sorted by fieldName. */
  readonly digest: string;
  /** Sum of all field cardinality budgets (upper bound of total cardinality). */
  readonly maxCardinality: number;
}

// ===========================================================================
// §3 Builders
// ===========================================================================

/**
 * Build a versioned semantic convention from field specifications.
 *
 * Digest is computed as SHA-256 of canonical JSON (stable-stringify) of the
 * fields array sorted by fieldName. Sorting uses the deterministic comparator
 * from evidence_log/hasher to guarantee cross-platform consistency.
 *
 * @param version  Convention version string.
 * @param fields   Field specifications (order does not affect digest).
 * @returns Frozen SemanticConvention.
 */
export function buildSemanticConvention(
  version: string,
  fields: readonly TelemetryFieldSpec[],
): SemanticConvention {
  if (version === '') {
    throw new Error('buildSemanticConvention: version must be non-empty');
  }

  const sorted = [...fields].sort((a, b) =>
    compareStringsDeterministic(a.fieldName, b.fieldName),
  );

  const canonical = stableStringify(sorted);
  if (canonical === undefined) {
    throw new Error('buildSemanticConvention: stable stringify returned undefined');
  }

  const digest = createHash('sha256').update(canonical, 'utf8').digest('hex');
  const maxCardinality = fields.reduce(
    (sum, f) => sum + f.cardinalityBudget,
    0,
  );

  return Object.freeze({
    version,
    fields: Object.freeze([...fields]),
    digest,
    maxCardinality,
  });
}

// ===========================================================================
// §4 Leak detection — assert no sensitive/secret data in an event
// ===========================================================================

/**
 * Assert that a telemetry event contains no fields classified as SENSITIVE or SECRET.
 *
 * @throws Error with code 'TELEMETRY_SENSITIVE_DATA_LEAK' if any matching field is found.
 */
export function assertNoSensitiveData(
  event: Record<string, unknown>,
  convention: SemanticConvention,
): void {
  for (const field of convention.fields) {
    if (
      field.classification === 'SENSITIVE' ||
      field.classification === 'SECRET'
    ) {
      if (field.fieldName in event) {
        throw new Error(
          `TELEMETRY_SENSITIVE_DATA_LEAK: field "${field.fieldName}" (${field.classification}) is present in telemetry event`,
        );
      }
    }
  }
}

// ===========================================================================
// §5 Field redaction
// ===========================================================================

/** Sentinel value replacing redacted fields. */
const REDACTED_PLACEHOLDER = '[REDACTED]';

/**
 * Redact SENSITIVE and SECRET fields in a telemetry event.
 *
 * PUBLIC and INTERNAL fields pass through unchanged.
 * SENSITIVE → '[REDACTED]', SECRET → '[REDACTED]'.
 * Fields not present in the convention are left untouched.
 *
 * @returns A new object with redacted values (input is never mutated).
 */
export function redactFields(
  event: Record<string, unknown>,
  convention: SemanticConvention,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...event };

  for (const field of convention.fields) {
    if (
      field.classification === 'SENSITIVE' ||
      field.classification === 'SECRET'
    ) {
      if (field.fieldName in result) {
        result[field.fieldName] = REDACTED_PLACEHOLDER;
      }
    }
  }

  return result;
}

// ===========================================================================
// §6 Cardinality budget enforcement
// ===========================================================================

/**
 * Assert that observed unique-value counts per field do not exceed their budgets.
 *
 * @param fieldCounts  Map of field name → observed unique value count.
 * @param convention   The governing semantic convention.
 * @throws Error with code 'TELEMETRY_CARDINALITY_EXCEEDED' if any field exceeds budget.
 */
export function assertCardinalityBudget(
  fieldCounts: Record<string, number>,
  convention: SemanticConvention,
): void {
  for (const field of convention.fields) {
    const observed = fieldCounts[field.fieldName];
    if (observed !== undefined && observed > field.cardinalityBudget) {
      throw new Error(
        `TELEMETRY_CARDINALITY_EXCEEDED: field "${field.fieldName}" has ${observed} distinct values, budget is ${field.cardinalityBudget}`,
      );
    }
  }
}
