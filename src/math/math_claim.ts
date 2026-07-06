// spec 38 · Math verification layer — type contracts.
//
// Enum values are authoritative per spec 38 §1 / §1.1:
//   - MathClaimKind: 12 values (8 symbolic + 4 numerical) — spec §1
//   - VerificationLevel: 4 values (L1_cas / L2_smt / L3_formal / L4_human) — spec §1 (lowercase)
//   - VerificationOutcome: 3 values (verified / refuted / unknown) — spec §1
//   - BackendKind: 5 values (cas / smt / lean4 / dafny / numerical) — spec §1.1
//   - FormalTarget: 3 values (lean4 / dafny / smtlib) — spec §1 / §5
// BACKEND_LEVEL maps only the 4 symbolic backends to a level (spec §1.1);
// 'numerical' never contributes to achievedLevel (non-self-proving — spec §4.5).
//
// Enum-sync red-line (spec §1 line 171): MATH_CLAIM_KINDS / VERIFICATION_LEVELS /
// VERIFICATION_OUTCOMES / BACKEND_KINDS must be byte-equal across TS, the §7 SQL
// CHECK constraints, and Python repro/math_types.py, guarded by
// tests/schema/schema_enum_sync.test.ts.
//
// Model-neutrality: this file contains NO provider/model references. It is pure
// structural typing for math claims and verification records.
//
// Naming: camelCase for TS in-memory fields (CLAUDE.md red-line #3). The physical
// SQL columns (snake_case) live in schema/migrations/0003_math_verification.sql
// and are mapped by evidence_sink.ts. `linkedVerdictNodeId` is a compound
// identifier soft-linking to the falsifiability layer; it does NOT import the
// standalone Verdict type.

import { FatalMathError } from './errors.ts';

// ============================================================
// §1  MathClaimKind — 12 values (8 symbolic + 4 numerical) — spec §1
// ============================================================

export const SYMBOLIC_MATH_CLAIM_KINDS = [
  'algebraic_identity',
  'equation_solution',
  'calculus',
  'inequality',
  'dimensional_consistency',
  'matrix_identity',
  'statistic_identity',
  'theorem',
] as const;

export const NUMERICAL_MATH_CLAIM_KINDS = [
  'numerical_reproduction',
  'statistical_inference',
  'optimization_convergence',
  'validated_numerics',
] as const;

export const MATH_CLAIM_KINDS = [
  ...SYMBOLIC_MATH_CLAIM_KINDS,
  ...NUMERICAL_MATH_CLAIM_KINDS,
] as const;

export type SymbolicMathClaimKind = (typeof SYMBOLIC_MATH_CLAIM_KINDS)[number];
export type NumericalMathClaimKind = (typeof NUMERICAL_MATH_CLAIM_KINDS)[number];
export type MathClaimKind = (typeof MATH_CLAIM_KINDS)[number];

export function isSymbolicKind(kind: string): kind is SymbolicMathClaimKind {
  return (SYMBOLIC_MATH_CLAIM_KINDS as readonly string[]).includes(kind);
}

export function isNumericalKind(kind: string): kind is NumericalMathClaimKind {
  return (NUMERICAL_MATH_CLAIM_KINDS as readonly string[]).includes(kind);
}

export function isMathClaimKind(value: string): value is MathClaimKind {
  return (MATH_CLAIM_KINDS as readonly string[]).includes(value);
}

// ============================================================
// §2  VerificationLevel — 4 values (L1_cas / L2_smt / L3_formal / L4_human) — spec §1
// ============================================================

export const VERIFICATION_LEVELS = [
  'L1_cas',
  'L2_smt',
  'L3_formal',
  'L4_human',
] as const;

export type VerificationLevel = (typeof VERIFICATION_LEVELS)[number];

export function isVerificationLevel(value: string): value is VerificationLevel {
  return (VERIFICATION_LEVELS as readonly string[]).includes(value);
}

// Rank ordering (spec §1.1): L1_cas < L2_smt < L3_formal < L4_human.
// Used by meetsRequiredLevel (partial-order compare) and derivedAchievedLevel
// (max aggregation over verified symbolic backends). L4_human ranks highest;
// it is reached only via a HumanCheckpoint-backed verification row.
export const LEVEL_RANK: Readonly<Record<VerificationLevel, number>> = {
  L1_cas: 1,
  L2_smt: 2,
  L3_formal: 3,
  L4_human: 4,
};

// ============================================================
// §3  VerificationOutcome — 3 values (verified / refuted / unknown) — spec §1
// ============================================================

export const VERIFICATION_OUTCOMES = [
  'verified',
  'refuted',
  'unknown',
] as const;

export type VerificationOutcome = (typeof VERIFICATION_OUTCOMES)[number];

export function isVerificationOutcome(value: string): value is VerificationOutcome {
  return (VERIFICATION_OUTCOMES as readonly string[]).includes(value);
}

// ============================================================
// §4  BackendKind — 5 values (cas / smt / lean4 / dafny / numerical) — spec §1.1
// ============================================================

export const BACKEND_KINDS = [
  'cas',
  'smt',
  'lean4',
  'dafny',
  'numerical',
] as const;

export type BackendKind = (typeof BACKEND_KINDS)[number];

export function isBackendKind(value: string): value is BackendKind {
  return (BACKEND_KINDS as readonly string[]).includes(value);
}

// Symbolic backends (spec §1.1 BACKEND_LEVEL keys): the 4 backends that can
// return a self-proving 'verified' outcome and therefore contribute to
// achievedLevel. 'numerical' is excluded — it is non-self-proving (spec §4.5).
export const SYMBOLIC_BACKEND_KINDS = [
  'cas',
  'smt',
  'lean4',
  'dafny',
] as const;

export type SymbolicBackendKind = (typeof SYMBOLIC_BACKEND_KINDS)[number];

export function isSymbolicBackendKind(kind: BackendKind): kind is SymbolicBackendKind {
  return (SYMBOLIC_BACKEND_KINDS as readonly string[]).includes(kind);
}

// Maps a symbolic backend kind to the VerificationLevel it satisfies when it
// returns outcome='verified' (spec §1.1). Only the 4 symbolic backends are
// keys; 'numerical' has no entry and never contributes to achievedLevel.
export const BACKEND_LEVEL: Readonly<Record<SymbolicBackendKind, VerificationLevel>> = {
  cas: 'L1_cas',
  smt: 'L2_smt',
  lean4: 'L3_formal',
  dafny: 'L3_formal',
};

// ============================================================
// §5  FormalExpression — machine-checkable target of a MathClaim — spec §1
// ============================================================

// Formal target language (spec §1 line 73 / §5 line 371). This is the LANGUAGE
// the `source` is written in, NOT the expression text itself.
export const FORMAL_TARGETS = [
  'lean4',
  'dafny',
  'smtlib',
] as const;

export type FormalTarget = (typeof FORMAL_TARGETS)[number];

export function isFormalTarget(value: string): value is FormalTarget {
  return (FORMAL_TARGETS as readonly string[]).includes(value);
}

export interface FormalExpression {
  /** Formal target language (spec §1). The language `source` is written in. */
  readonly target: FormalTarget;
  /** Formalized source code in `target` language (e.g. SMT-LIB assertion,
   * Lean 4 term, Dafny method). For numerical claims this carries the JSON
   * numerical-experiment config (bound / seed / tolerance), since numerical
   * claims have no symbolic proof target. Required (non-empty). */
  readonly source: string;
  /** Identifier of the formalizer that produced `source`
   * (e.g. 'core_neutral@v1', 'competition_qwen_math@<snapshot>'). */
  readonly formalizerId: string;
  /** Autoformalizer self-rated confidence in [0, 1]. Advisory only — never
   * adjudicates (spec §0 model-does-not-judge). */
  readonly confidence: number;
}

// ============================================================
// §6  MathClaim — structured math claim (spec §1)
// ============================================================

export interface MathClaim {
  readonly claimId: string;
  readonly naturalLanguage: string;
  readonly claimKind: MathClaimKind;
  /** Formalized target. Nullable: a claim may be recorded before formalization
   * (spec §1 line 83). achievedLevel is NOT a field here — it is derived from
   * math_verifications via derivedAchievedLevel() (spec §1.1 方案A). */
  readonly formalization: FormalExpression | null;
  /** Minimum level required for this claim to be considered verified (spec §1). */
  readonly requiredLevel: VerificationLevel;
  /** Expected outcome if the claim is TRUE (declared at submission). Used by
   * backends to detect refutation (actual ≠ expected). */
  readonly expectedOutcome: VerificationOutcome;
  /** Soft link to falsifiability layer node. Compound identifier — does not
   * import the standalone Verdict type (model-neutrality + red-line safety). */
  readonly linkedVerdictNodeId: string | null;
  /** When true, math_gate forces UNTESTED unless achievedLevel >= L3_formal
   * (spec §1 line 175, §8). */
  readonly requireFormalVerification: boolean;
  readonly createdAt: string;
}

// ============================================================
// §7  MathVerificationRecord — one backend run on one claim — spec §1.1
// ============================================================

export interface MathVerificationRecord {
  readonly verificationId: string;
  readonly claimId: string;
  readonly backendKind: BackendKind;
  /** Backend identity fingerprint, e.g. 'sympy@1.12', 'z3@4.12', 'lean4@v4.3.0'. */
  readonly backendId: string;
  readonly outcome: VerificationOutcome;
  /** sha256 of the canonical formalization JSON (03 §2.4 SSOT, cross-lang byte-equal). */
  readonly inputHash: string;
  /** Proof artifact / model / simplify result / numerical bound (JSON string). */
  readonly outputArtifact: string | null;
  /** Compiler / backend stdout-stderr log. 'backend_disabled' when backend unavailable. */
  readonly compileLog: string | null;
  readonly durationMs: number;
  /** Full verifier fingerprint (JSON SourceAnchor). */
  readonly sourceAnchor: string;
  readonly verifiedAt: string;
}

// ============================================================
// §8  Derived helpers — spec §1.1 方案A (achievedLevel is derived, not stored)
// ============================================================

/**
 * Derive the achieved verification level from a set of verification records.
 * Spec 38 §1.1 方案A: achievedLevel is NOT a physical column; it is derived.
 *
 * Rules (spec §1.1):
 * - Only records with outcome='verified' on SYMBOLIC backends (cas/smt/lean4/dafny)
 *   contribute. The 'numerical' backend never contributes (non-self-proving —
 *   spec §4.5: numerical outcome is always 'unknown').
 * - The achieved level is the highest LEVEL_RANK among contributing backends.
 * - If no verified symbolic record exists, returns null (§8 gate → level_not_met).
 * - Pure function: identical inputs always yield identical output (auditable,
 *   fork-replay reproducible).
 */
export function derivedAchievedLevel(
  verifications: ReadonlyArray<MathVerificationRecord>,
): VerificationLevel | null {
  let bestRank = 0;
  let bestLevel: VerificationLevel | null = null;
  for (const record of verifications) {
    if (record.outcome !== 'verified') {
      continue; // only verified records contribute
    }
    if (!isSymbolicBackendKind(record.backendKind)) {
      continue; // 'numerical' / unknown backend never contributes (spec §1.1 line 145)
    }
    const level = BACKEND_LEVEL[record.backendKind];
    const rank = LEVEL_RANK[level];
    if (rank > bestRank) {
      bestRank = rank;
      bestLevel = level;
    }
  }
  return bestLevel;
}

/**
 * Whether an achieved level meets the required level (spec §1.1).
 * null achieved → false (no symbolic verification performed).
 * Otherwise rank(achieved) >= rank(required).
 */
export function meetsRequiredLevel(
  achieved: VerificationLevel | null,
  required: VerificationLevel,
): boolean {
  if (achieved === null) {
    return false;
  }
  return LEVEL_RANK[achieved] >= LEVEL_RANK[required];
}

/**
 * Validate a MathClaim's structural invariants. Throws FatalMathError on violation.
 *
 * Spec §1 line 175 constraint set:
 * - claimKind must be a known MathClaimKind.
 * - requiredLevel must be a known VerificationLevel.
 * - expectedOutcome must be a known VerificationOutcome.
 * - requireFormalVerification === true  =>  requiredLevel MUST be L3_formal
 *   (formal verification only happens at L3; L1/L2 are not formal-verified).
 * - requireFormalVerification === true on a numerical kind  =>  FatalMathError
 *   (numerical claims are always 'unknown' — spec §4.5 — so they can never
 *   satisfy a formal-verification requirement; the combination is contradictory).
 *
 * Domain routing (numerical → NumericalBackend, symbolic → CAS/SMT/Formal) is
 * enforced in MathVerifier.route (spec §4.5 line 352 / §15 T1.4), NOT here —
 * validateMathClaim only checks structural well-formedness.
 */
export function validateMathClaim(claim: MathClaim): void {
  if (!isMathClaimKind(claim.claimKind)) {
    throw new FatalMathError(
      `validateMathClaim: unknown claimKind "${claim.claimKind}" for claim ${claim.claimId}`,
    );
  }
  if (!isVerificationLevel(claim.requiredLevel)) {
    throw new FatalMathError(
      `validateMathClaim: unknown requiredLevel "${claim.requiredLevel}" for claim ${claim.claimId}`,
    );
  }
  if (!isVerificationOutcome(claim.expectedOutcome)) {
    throw new FatalMathError(
      `validateMathClaim: unknown expectedOutcome "${claim.expectedOutcome}" for claim ${claim.claimId}`,
    );
  }

  if (claim.requireFormalVerification) {
    if (claim.requiredLevel !== 'L3_formal') {
      throw new FatalMathError(
        `validateMathClaim: requireFormalVerification=true requires requiredLevel=L3_formal but got ${claim.requiredLevel} (claim ${claim.claimId})`,
      );
    }
    if (isNumericalKind(claim.claimKind)) {
      throw new FatalMathError(
        `validateMathClaim: numerical kind "${claim.claimKind}" cannot set requireFormalVerification=true (numerical claims are always outcome=unknown — spec 38 §4.5; claim ${claim.claimId})`,
      );
    }
  }

  if (claim.formalization !== null) {
    if (!isFormalTarget(claim.formalization.target)) {
      throw new FatalMathError(
        `validateMathClaim: unknown formalization.target "${claim.formalization.target}" (claim ${claim.claimId})`,
      );
    }
    if (claim.formalization.source.length === 0) {
      throw new FatalMathError(
        `validateMathClaim: formalization.source must be non-empty (claim ${claim.claimId})`,
      );
    }
    if (claim.formalization.formalizerId.length === 0) {
      throw new FatalMathError(
        `validateMathClaim: formalization.formalizerId must be non-empty (claim ${claim.claimId})`,
      );
    }
    const conf = claim.formalization.confidence;
    if (!Number.isFinite(conf) || conf < 0 || conf > 1) {
      throw new FatalMathError(
        `validateMathClaim: formalization.confidence must be in [0,1] but got ${conf} (claim ${claim.claimId})`,
      );
    }
  }
}

/**
 * Determine the default requiredLevel for a claim kind (when the caller does not
 * override). Symbolic → L1_cas (minimum self-proving level); numerical → L4_human
 * (numerical claims are non-self-proving — only a human checkpoint can close them).
 */
export function defaultRequiredLevel(kind: MathClaimKind): VerificationLevel {
  return isNumericalKind(kind) ? 'L4_human' : 'L1_cas';
}

// ============================================================
// §9  Backend invocation contracts (shared by all 5 backends)
// ============================================================

/** Input to any backend's verify() method. `expression` is the
 * FormalExpression.source string (the formalized source code / numerical config);
 * backends parse it according to their own protocol (e.g. CAS expects JSON
 * {lhs, rhs}). `expectedOutcome` lets the backend detect refutation. */
export interface BackendVerifyInput {
  readonly expression: string;
  readonly expectedOutcome: VerificationOutcome;
  /** Backend-specific mode hint (e.g. CAS 'expand' vs 'simplify'). Optional. */
  readonly mode?: string;
}

/** Result of one backend verification run. All backends return this shape so the
 * router and evidence_sink can treat them uniformly. */
export interface BackendVerifyResult {
  readonly backendKind: BackendKind;
  readonly backendId: string;
  readonly outcome: VerificationOutcome;
  readonly outputArtifact: string | null;
  readonly compileLog: string | null;
  readonly durationMs: number;
}

/** Common interface every backend implements. */
export interface MathBackend {
  readonly backendKind: BackendKind;
  readonly backendId: string;
  /** Whether the backend's external dependency is available (e.g. python+sympy
   * installed, z3 binary on PATH). When false, verify() returns unknown +
   * compileLog='backend_disabled'. */
  isAvailable(): boolean;
  verify(input: BackendVerifyInput): Promise<BackendVerifyResult>;
}
