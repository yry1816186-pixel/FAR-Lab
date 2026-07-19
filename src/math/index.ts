// spec 38 · Math verification layer — public API barrel.
//
// Re-exports all public types, constants, classes, and functions from the
// math verification subsystem. Consumers should import from '@/math' (this
// index) rather than reaching into individual modules.
//
// Note: math_verifier.ts re-exports BACKEND_KINDS from math_claim.ts; to avoid
// an ambiguous re-export, we explicitly list math_verifier's unique symbols
// instead of `export *` for that one module.

// Core types & constants (spec 38 §1-§4)
export * from './math_claim.ts';

// Errors (spec 38 §4.5)
export * from './errors.ts';

// Autoformalizer (spec 38 §6) — model-neutral core + competition adapter
export * from './autoformalizer.ts';
export * from './competition_math_adapter.ts';

// Backends (spec 38 §3-§4) — L1 CAS / L2 SMT / L3 Formal / L4 Numeric
export * from './cas_backend.ts';
export * from './smt_backend.ts';
export * from './formal_backend.ts';
export * from './dafny_backend.ts';
export * from './numerical_backend.ts';

// Verifier router (spec 38 §4) — explicit exports to avoid BACKEND_KINDS clash
export { MathVerifierOptions, MathVerifier, createDefaultMathVerifier } from './math_verifier.ts';

// Evidence sink (spec 38 §5) — persistence + evidence_log append
export * from './evidence_sink.ts';

// Premise search (spec 38 §7) — LeanDojo ReProver style
export * from './premise_search.ts';

// Math gate (spec 38 §8) — extends 07 falsifiability
export * from './math_gate.ts';

// Honesty wall (spec 38 §9) — verification boundary rendering
export * from './honesty_wall.ts';
