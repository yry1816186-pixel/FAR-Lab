/**
 * Independent clean-room verifier: independence charter + from-scratch verification.
 *
 * Authority: docs/far-lab-reboot/19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md §2/§9,
 *   17_FORMAL_PROTOCOL_REPRODUCIBILITY_AND_LONGEVITY.md §7.
 * Freeze: SPEC-009 (charter) + IMPL-009 (verifier).
 *
 * IRG-009: "Two verifiers" can share a common-mode defect. This verifier
 * re-implements canonical JSON + sha256 from Node.js primitives (NOT reusing
 * the producer's vendored canonicalize or canonicalJson from evidence_log/hasher.ts)
 * to detect common-mode canonicalization/hash defects.
 *
 * 模型中立 · 零容忍合规.
 */

import { createHash } from 'node:crypto';

// ===========================================================================
// §9 Independence classes + declaration
// ===========================================================================

/** Independence classes (doc19 §9, IRG-009). */
export const INDEPENDENCE_CLASSES = [
  'NO_SHARED_PARSER',
  'NO_SHARED_CANONICALIZER',
  'NO_SHARED_HASH_WRAPPER',
  'NO_SHARED_TEST_AUTHORSHIP',
  'NO_SHARED_TRUST_MATERIAL',
] as const;
/** Type alias: independence class. */
export type IndependenceClass = (typeof INDEPENDENCE_CLASSES)[number];

/** A single declared dependency status. */
export interface IndependenceClassStatus {
  readonly className: IndependenceClass;
  readonly satisfied: boolean;
  readonly detail: string;
}

/** A shared dependency violation. */
export interface SharedDependency {
  readonly className: IndependenceClass;
  readonly detail: string;
}

/** Independence declaration (SPEC-009). */
export interface IndependenceDeclaration {
  readonly verifierName: string;
  readonly verifierTeam: string;
  readonly declarationVersion: 1;
  readonly classes: readonly IndependenceClassStatus[];
  readonly allClassesVerified: boolean;
  readonly violations: readonly IndependenceClass[];
  readonly testedAt: string;
}

/** Input for building an independence declaration. */
export interface IndependenceDeclarationInput {
  readonly verifierName: string;
  readonly verifierTeam: string;
  readonly sharedDependencies: readonly SharedDependency[];
  readonly testedAt: string;
}

/** Build an independence declaration from disclosed shared dependencies. */
export function buildIndependenceDeclaration(
  input: IndependenceDeclarationInput,
): IndependenceDeclaration {
  const violationSet = new Set(input.sharedDependencies.map((d) => d.className));
  const classes: IndependenceClassStatus[] = INDEPENDENCE_CLASSES.map((className) => {
    const violation = input.sharedDependencies.find((d) => d.className === className);
    return {
      className,
      satisfied: violation === undefined,
      detail: violation?.detail ?? 'no shared dependency disclosed',
    };
  });
  const violations = [...violationSet];
  return Object.freeze({
    verifierName: input.verifierName,
    verifierTeam: input.verifierTeam,
    declarationVersion: 1 as const,
    classes,
    allClassesVerified: violations.length === 0,
    violations,
    testedAt: input.testedAt,
  });
}

/** Result of verifying an independence declaration. */
export interface IndependenceVerification {
  readonly isIndependent: boolean;
  readonly violationCount: number;
}

/** Verify an independence declaration. Independent iff all classes satisfied. */
export function verifyIndependence(decl: IndependenceDeclaration): IndependenceVerification {
  return {
    isIndependent: decl.allClassesVerified && decl.violations.length === 0,
    violationCount: decl.violations.length,
  };
}

// ===========================================================================
// §7 Independent canonical JSON + sha256 — from scratch, no producer reuse
// ===========================================================================

/**
 * Independent canonical JSON serialization.
 * Does NOT reuse producer's vendored canonicalize (RFC 8785) or canonicalJson.
 * Sorts keys lexicographically (UTF-16 code-unit order), no whitespace.
 */
export function independentCanonicalJson(value: unknown): string {
  return serializeCanonical(value);
}

function serializeCanonical(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('independentCanonicalJson: non-finite number (NaN/Infinity) rejected');
    }
    return String(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(serializeCanonical).join(',') + ']';
  }
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort(compareCodeUnit);
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + serializeCanonical(obj[k])).join(',') + '}';
  }
  throw new Error(`independentCanonicalJson: unsupported type ${typeof value}`);
}

function compareCodeUnit(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Independent sha256 hex digest. Uses Node crypto directly (not producer wrapper). */
export function independentSha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

// ===========================================================================
// §2 Independent receipt root verification
// ===========================================================================

const HEX64 = /^[0-9a-f]{64}$/;

/** A member for independent verification. */
export interface VerifierMember {
  readonly kind: string;
  readonly digest: string;
  readonly sizeBytes: number;
}

/** Result of independent root verification. */
export interface ReceiptRootVerification {
  readonly isValid: boolean;
  readonly invalidMembers: readonly string[];
  readonly recomputedRoot: string;
  readonly reasonCode: 'ROOT_VALID' | 'MEMBER_DIGEST_INVALID' | 'ROOT_MISMATCH';
}

/**
 * Independently verify a receipt root by recomputing it from members.
 * This is the clean-room path: it does NOT call buildReceiptManifest.
 */
export function verifyReceiptRoot(
  members: readonly VerifierMember[],
  _schemaVersion: string,
  expectedRoot?: string,
): ReceiptRootVerification {
  const invalidMembers = members
    .filter((m) => !HEX64.test(m.digest))
    .map((m) => m.kind);

  if (invalidMembers.length > 0) {
    return {
      isValid: false,
      invalidMembers,
      recomputedRoot: '',
      reasonCode: 'MEMBER_DIGEST_INVALID',
    };
  }

  // Recompute root: sort by kind, canonical JSON, sha256.
  const sorted = [...members].sort((a, b) => compareCodeUnit(a.kind, b.kind));
  const canonical = independentCanonicalJson(sorted);
  const recomputedRoot = independentSha256Hex(canonical);

  if (expectedRoot !== undefined && expectedRoot !== recomputedRoot) {
    return {
      isValid: false,
      invalidMembers: [],
      recomputedRoot,
      reasonCode: 'ROOT_MISMATCH',
    };
  }

  return {
    isValid: true,
    invalidMembers: [],
    recomputedRoot,
    reasonCode: 'ROOT_VALID',
  };
}
