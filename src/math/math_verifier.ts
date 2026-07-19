// spec 38 §4 · Math verifier router.
// Routes a MathClaim to the appropriate backend based on claimKind (domain) +
// requiredLevel (symbolic strength).
//
// Routing table (spec 38 §15 T1.4 / §4.5):
//   numerical kind (isNumericalKind)        → NumericalBackend (always unknown + bound)
//   symbolic kind + L1_cas                   → CasBackend (SymPy, expand=sound)
//   symbolic kind + L2_smt                   → SmtBackend (Z3)
//   symbolic kind + L3_formal                → FormalBackend (Lean 4) or DafnyBackend
//   symbolic kind + L4_human                 → no automatic backend (HumanCheckpoint closes it)
//
// Domain isolation (spec 38 §4.5 line 352): the router routes by claimKind domain.
// A numerical claim is NEVER sent to a symbolic backend, and vice versa. This is
// a structural invariant of the router — there is no requiredLevel-based domain
// inference (an earlier revision incorrectly used requiredLevel=L4 to infer the
// numerical domain; spec §15 T1.4 routes by isNumericalKind(claimKind) instead).
//
// inputHash: sha256 of the canonical formalization JSON (03 §2.4 SSOT). The
// canonical object is {target, source, formalizerId, confidence} (source is
// required under spec §1). confidence is normalized via canonicalConfidence()
// (fixed-point string) to guarantee cross-language byte-equality with the Python
// mirror (repro/far_chain_repro/math_input_hash.py) — raw float diverges on
// integer values like 1.0 (audit [F] / Red Line #5).
//
// Model-neutrality: this file references NO model/provider.

import { ulid } from 'ulid';
import { hashCanonicalJson } from '../evidence_log/hasher.ts';
import { FatalMathError } from './errors.ts';
import {
  BACKEND_KINDS,
  isNumericalKind,
  isSymbolicKind,
  validateMathClaim,
} from './math_claim.ts';
import type {
  BackendVerifyInput,
  FormalExpression,
  MathBackend,
  MathClaim,
  MathVerificationRecord,
  VerificationLevel,
} from './math_claim.ts';
import { SymPyCasBackend } from './cas_backend.ts';
import { Z3SmtBackend } from './smt_backend.ts';
import { Lean4FormalBackend } from './formal_backend.ts';
import { DafnyBackend } from './dafny_backend.ts';
import { NumericalBackend } from './numerical_backend.ts';

export interface MathVerifierOptions {
  readonly casBackend?: MathBackend;
  readonly smtBackend?: MathBackend;
  /** Backend used for L3_formal. Defaults to Lean4FormalBackend. */
  readonly formalBackend?: MathBackend;
  readonly dafnyBackend?: MathBackend;
  readonly numericalBackend?: MathBackend;
}

export class MathVerifier {
  private readonly backends: Partial<Record<string, MathBackend>>;

  constructor(options: MathVerifierOptions = {}) {
    this.backends = {
      cas: options.casBackend ?? new SymPyCasBackend(),
      smt: options.smtBackend ?? new Z3SmtBackend(),
      lean4: options.formalBackend ?? new Lean4FormalBackend(),
      dafny: options.dafnyBackend ?? new DafnyBackend(),
      numerical: options.numericalBackend ?? new NumericalBackend(),
    };
  }

  /**
   * Verify a single MathClaim by routing it to the appropriate backend.
   * Returns a MathVerificationRecord with the result.
   *
   * - If the routed backend is unavailable, outcome='unknown' +
   *   compileLog='backend_disabled' (honest degradation — spec §4.5).
   * - If the claim requires L4_human (symbolic, human checkpoint), no automatic
   *   backend runs; outcome='unknown' + compileLog='human_checkpoint_required'.
   */
  async verify(claim: MathClaim): Promise<MathVerificationRecord> {
    validateMathClaim(claim);

    if (claim.formalization === null) {
      throw new FatalMathError(
        `MathVerifier.verify: claim ${claim.claimId} has null formalization — cannot verify without a formal target`,
      );
    }

    const backend = this.route(claim);
    const verifiedAt = new Date().toISOString();

    if (backend === null) {
      // L4_human symbolic claim: no automatic backend reaches human level.
      // A HumanCheckpoint must append a math_verifications row (backend_kind
      // pointing at human review, outcome='verified') to close it (spec §1.1).
      return this.buildRecord(claim, claim.formalization, {
        backendKind: 'lean4', // placeholder kind for the record shape; outcome=unknown
        backendId: 'human@checkpoint',
        outcome: 'unknown',
        outputArtifact: null,
        compileLog: 'human_checkpoint_required',
        durationMs: 0,
      }, verifiedAt);
    }

    const input = this.buildVerifyInput(claim, backend);
    const result = await backend.verify(input);

    return this.buildRecord(claim, claim.formalization, result, verifiedAt);
  }

  private buildRecord(
    claim: MathClaim,
    formalization: FormalExpression,
    result: {
      readonly backendKind: MathVerificationRecord['backendKind'];
      readonly backendId: string;
      readonly outcome: MathVerificationRecord['outcome'];
      readonly outputArtifact: string | null;
      readonly compileLog: string | null;
      readonly durationMs: number;
    },
    verifiedAt: string,
  ): MathVerificationRecord {
    const inputHash = this.computeInputHash(formalization);
    const sourceAnchor = JSON.stringify({
      backendId: result.backendId,
      backendKind: result.backendKind,
      verifierTimestamp: verifiedAt,
    });
    return {
      verificationId: ulid(),
      claimId: claim.claimId,
      backendKind: result.backendKind,
      backendId: result.backendId,
      outcome: result.outcome,
      inputHash,
      outputArtifact: result.outputArtifact,
      compileLog: result.compileLog,
      durationMs: result.durationMs,
      sourceAnchor,
      verifiedAt,
    };
  }

  /**
   * Route a claim to its backend based on claimKind domain + requiredLevel.
   * Returns null when no automatic backend applies (symbolic L4_human → human
   * checkpoint). Throws FatalMathError only on a structurally unknown kind
   * (unreachable after validateMathClaim) or a missing configured backend.
   */
  private route(claim: MathClaim): MathBackend | null {
    if (isNumericalKind(claim.claimKind)) {
      // Numerical domain → NumericalBackend (always unknown + bound — spec §4.5).
      // Domain is decided by claimKind, NOT requiredLevel.
      const backend = this.backends.numerical;
      if (backend === undefined) {
        throw new FatalMathError(`MathVerifier.route: numerical backend not configured (claim ${claim.claimId})`);
      }
      return backend;
    }

    if (isSymbolicKind(claim.claimKind)) {
      return this.routeSymbolicByLevel(claim);
    }

    throw new FatalMathError(
      `MathVerifier.route: unknown claim kind "${claim.claimKind}" (claim ${claim.claimId})`,
    );
  }

  private routeSymbolicByLevel(claim: MathClaim): MathBackend | null {
    const backendKey = this.levelToBackendKey(claim.requiredLevel);
    if (backendKey === null) {
      // L4_human: no automatic backend — human checkpoint closes it.
      return null;
    }
    const backend = this.backends[backendKey];
    if (backend === undefined) {
      throw new FatalMathError(
        `MathVerifier.route: backend ${backendKey} not configured for requiredLevel ${claim.requiredLevel} (claim ${claim.claimId})`,
      );
    }
    return backend;
  }

  private levelToBackendKey(level: VerificationLevel): 'cas' | 'smt' | 'lean4' | null {
    switch (level) {
      case 'L1_cas': return 'cas';
      case 'L2_smt': return 'smt';
      case 'L3_formal': return 'lean4';
      case 'L4_human': return null; // human checkpoint — no automatic backend
      default: {
        // Exhaustiveness guard (unreachable after validateMathClaim).
        const exhaustive: never = level;
        throw new FatalMathError(`MathVerifier.levelToBackendKey: unmappable level ${exhaustive as string}`);
      }
    }
  }

  private buildVerifyInput(claim: MathClaim, backend: MathBackend): BackendVerifyInput {
    const formalization = claim.formalization;
    if (formalization === null) {
      throw new FatalMathError('MathVerifier.buildVerifyInput: null formalization (unreachable after route guard)');
    }
    const input: BackendVerifyInput = {
      expression: formalization.source,
      expectedOutcome: claim.expectedOutcome,
    };
    // CAS uses 'expand' mode for sound verification by default (spec §2 C4 —
    // 'expand' is a decision procedure for polynomials; 'simplify' is heuristic
    // and the SymPy backend already forces outcome='unknown' for it).
    if (backend.backendKind === 'cas') {
      return { ...input, mode: 'expand' };
    }
    return input;
  }

  /**
   * Compute the canonical inputHash for a formalization.
   *
   * Cross-language byte-equality (03 §2.4 / Red Line #5): canonical object is
   * {target, source, formalizerId, confidence}. confidence is normalized via
   * canonicalConfidence() (fixed-point string) because raw float diverges across
   * JS (JSON.stringify(1.0)="1") and Python (json.dumps(1.0)="1.0") on integer
   * values — byte-equality would break when confidence===1.0 (audit [F]).
   */
  computeInputHash(formalization: NonNullable<MathClaim['formalization']>): string {
    const canonical = {
      target: formalization.target,
      source: formalization.source,
      formalizerId: formalization.formalizerId,
      confidence: canonicalConfidence(formalization.confidence),
    };
    return hashCanonicalJson(canonical);
  }
}

/**
 * Normalize confidence to a cross-language (TS↔Python) byte-equal string.
 *
 * Root cause (audit [F] / Red Line #5): JS Number does not distinguish int/float
 * (1.0 === 1) → JSON.stringify(1.0)="1"; Python float → json.dumps(1.0)="1.0".
 * fast-json-stable-stringify (hashCanonicalJson 底层) and Python json.dumps diverge
 * on integer-valued floats → computeInputHash byte-diverges when confidence===1.0.
 *
 * Strategy: fixed-point 6 decimals (toFixed(6) / Python f"{c:.6f}") — fixed-point
 * has no exponent-threshold divergence (JS String and Python repr switch to
 * exponential at different magnitudes: 1e-5 → JS "0.00001" vs Python "1e-05").
 * -0.0 is normalized to +0 (JS (-0).toFixed(6)="0.000000" vs Python "-0.000000").
 * Both sides operate on the same IEEE-754 double, so fixed-point rounding is identical.
 *
 * confidence ∈ [0,1] is pre-validated by validateMathClaim (math_claim.ts:360).
 * 6 decimals exceeds autoformalizer self-rating precision (advisory — spec §0
 * model-does-not-judge); sufficient for a complete formalization fingerprint.
 *
 * Python mirror: repro/far_chain_repro/math_input_hash.py canonical_confidence().
 * Cross-lang consistency guarded by tests/math/math_input_hash_cross_lang.test.ts.
 */
export function canonicalConfidence(confidence: number): string {
  // 归一化 -0 → +0（JS/Python 定点对 -0 输出分歧：JS "0.000000" vs Python "-0.000000"）
  const normalized = confidence === 0 ? 0 : confidence;
  return normalized.toFixed(6);
}

/** Factory: create a MathVerifier with all default backend implementations. */
export function createDefaultMathVerifier(options: MathVerifierOptions = {}): MathVerifier {
  return new MathVerifier(options);
}

/** All backend kinds the verifier can route to (re-exported for tests). */
export { BACKEND_KINDS };
