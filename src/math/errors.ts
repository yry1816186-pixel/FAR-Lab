// spec 38 · Math verification layer errors.
// Mirrors the falsifiability error pattern (src/falsifiability/errors.ts).
/** Base error for the math verification layer. All math-specific errors
 * extend this class. */
export class MathVerificationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MathVerificationError';
  }
}

/** Raised when a MathClaim is structurally invalid or when the verifier router
 * detects a cross-domain misroute (e.g. a numerical claim sent to a symbolic
 * backend, or vice versa — spec 38 §4.5 routing isolation). */
export class FatalMathError extends MathVerificationError {
  constructor(message: string) {
    super(message);
    this.name = 'FatalMathError';
  }
}

/** Raised when a backend returns a structurally invalid result (e.g. a
 * numerical backend that omits the mandatory bound — spec 38 §4.5). */
export class InvalidBackendResultError extends MathVerificationError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBackendResultError';
  }
}
