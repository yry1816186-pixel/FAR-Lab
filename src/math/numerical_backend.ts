// §3.5 · Numerical backend.
//
// INVARIANT (§4.5): numerical verification is NON-SELF-PROVING. This
// backend ALWAYS returns outcome='unknown'. It never claims 'verified' or
// 'refuted'. A numerical bound is MANDATORY in outputArtifact — omitting it
// raises InvalidBackendResultError.
//
// This invariant is enforced at the type level: the NumericalBackend class has
// no code path that returns 'verified' or 'refuted'. The bound is computed from
// the target (caller-supplied numerical data) and packaged for human inspection.
//
// Model-neutrality: this file references NO model/provider. It is pure TS.

import type {
  BackendVerifyInput,
  BackendVerifyResult,
  MathBackend,
} from './math_claim.ts';
import { InvalidBackendResultError } from './errors.ts';
/** Numerical bound descriptor: a [min, max] range with sample count and
 * human-readable description. Always present in numerical verification output. */
export interface NumericalBound {
  readonly min: number;
  readonly max: number;
  readonly sampleCount: number;
  readonly description: string;
}

interface NumericalTarget {
  readonly bound?: NumericalBound;
  readonly expression?: string;
}
/** Numerical verification backend (spec 38 S3.5). ALWAYS returns
 * outcome='unknown' (non-self-proving invariant - spec S4.5).
 * Pure TypeScript, no external dependencies - always available. */
export class NumericalBackend implements MathBackend {
  readonly backendKind = 'numerical' as const;
  readonly backendId = 'numerical@v1';

  isAvailable(): boolean {
    // Pure TS, no external dependency. Always available.
    return true;
  }

  async verify(input: BackendVerifyInput): Promise<BackendVerifyResult> {
    const start = Date.now();

    let target: NumericalTarget;
    try {
      target = JSON.parse(input.expression) as NumericalTarget;
    } catch (error) {
      return {
        backendKind: 'numerical',
        backendId: this.backendId,
        outcome: 'unknown',
        outputArtifact: null,
        compileLog: `numerical_parse_error: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    }

    if (target.bound === undefined) {
      throw new InvalidBackendResultError(
        'NumericalBackend.verify: numerical backend requires a mandatory bound in target.bound (§4.5 non-self-proving invariant)',
      );
    }

    const bound = target.bound;
    if (!Number.isFinite(bound.min) || !Number.isFinite(bound.max)) {
      throw new InvalidBackendResultError(
        `NumericalBackend.verify: bound.min/max must be finite but got min=${bound.min}, max=${bound.max}`,
      );
    }
    if (bound.sampleCount < 0 || !Number.isInteger(bound.sampleCount)) {
      throw new InvalidBackendResultError(
        `NumericalBackend.verify: sampleCount must be a non-negative integer but got ${bound.sampleCount}`,
      );
    }

    const artifact = JSON.stringify({
      bound,
      expression: target.expression ?? null,
      note: 'numerical_verification_is_non_self_proving_outcome_always_unknown',
    });

    return {
      backendKind: 'numerical',
      backendId: this.backendId,
      outcome: 'unknown', // ALWAYS unknown — type-level invariant
      outputArtifact: artifact,
      compileLog: 'numerical_bound_recorded_outcome_unknown_by_design',
      durationMs: Date.now() - start,
    };
  }
}
