// spec 38 §6 · Core-neutral autoformalizer.
// Converts natural-language math claims into machine-checkable FormalExpression
// objects using RULE-BASED pattern matching (NO LLM calls — model-neutral).
//
// formalizerId: 'core_neutral@v1'
// isModelNeutralCore: true
//
// FormalExpression shape (spec §1): { target: FormalTarget, source: string, ... }.
// `target` is the formal LANGUAGE (lean4/dafny/smtlib), chosen from the target
// backend; `source` is the formalized source code / numerical config text.
//
// The competition_math_adapter.ts wraps this with a model-backed formalizer
// (competition profile) for higher-quality formalization. This core module is the
// fallback that always works without any API key.
//
// Honest degradation: when no pattern matches, confidence < 0.5, which triggers
// the thought-structure synthesizer's DEGRADATION_PROMPT in the dialogue layer.
//
// Model-neutrality: this file references NO model/provider.

import type {
  BackendKind,
  FormalExpression,
  FormalTarget,
  MathClaimKind,
} from './math_claim.ts';
import { isNumericalKind, isSymbolicKind } from './math_claim.ts';

export interface AutoformalizeInput {
  readonly naturalLanguage: string;
  readonly claimKind: MathClaimKind;
  /** Backend the source is being formalized for. Influences source format and
   * the FormalTarget language. */
  readonly targetBackend?: BackendKind;
  /** Non-empty list of backends that must verify this formalization. */
  readonly mustBeVerifiedBy: readonly BackendKind[];
}

export interface Autoformalizer {
  readonly formalizerId: string;
  readonly isModelNeutralCore: boolean;
  autoformalize(input: AutoformalizeInput): Promise<FormalExpression>;
}

const HIGH_CONFIDENCE = 0.9;
const LOW_CONFIDENCE = 0.3;

/**
 * Core-neutral rule-based autoformalizer. Produces FormalExpression objects:
 * `target` (formal language) is derived from the target backend; `source`
 * carries the structured expression text — CAS JSON ({lhs, rhs}), SMT JSON
 * ({script, query}), or numerical config JSON ({bound, expression}).
 */
export class CoreNeutralAutoformalizer implements Autoformalizer {
  readonly formalizerId = 'core_neutral@v1';
  readonly isModelNeutralCore = true;

  async autoformalize(input: AutoformalizeInput): Promise<FormalExpression> {
    const nl = input.naturalLanguage.trim();
    const target = backendToFormalTarget(input.targetBackend);
    const source = this.buildSource(nl, input.claimKind, input.targetBackend);
    const confidence = this.estimateConfidence(nl, input.claimKind);
    return { target, source, formalizerId: this.formalizerId, confidence };
  }

  private buildSource(nl: string, kind: MathClaimKind, backend: BackendKind | undefined): string {
    if (isNumericalKind(kind)) {
      return this.buildNumericalSource(nl, kind);
    }
    if (backend === 'smt') {
      return this.buildSmtSource(nl);
    }
    return this.buildCasSource(nl, kind);
  }

  private buildCasSource(nl: string, kind: MathClaimKind): string {
    // algebraic_identity / equation_solution: "X = Y" or "X equals Y".
    const eqMatch = nl.match(/^(.+?)\s*(?:equals|=)\s*(.+)$/i);
    if (eqMatch !== null && (kind === 'algebraic_identity' || kind === 'equation_solution')) {
      const lhs = eqMatch[1]?.trim() ?? '';
      const rhs = eqMatch[2]?.trim() ?? '';
      return JSON.stringify({ lhs, rhs });
    }

    // inequality: "X < Y" or "X less than Y".
    const ltMatch = nl.match(/^(.+?)\s*(?:less than|<)\s*(.+)$/i);
    if (ltMatch !== null && kind === 'inequality') {
      const lhs = ltMatch[1]?.trim() ?? '';
      const rhs = ltMatch[2]?.trim() ?? '';
      return JSON.stringify({ lhs, rhs, op: '<' });
    }

    // inequality: "X > Y" or "X greater than Y".
    const gtMatch = nl.match(/^(.+?)\s*(?:greater than|>)\s*(.+)$/i);
    if (gtMatch !== null && kind === 'inequality') {
      const lhs = gtMatch[1]?.trim() ?? '';
      const rhs = gtMatch[2]?.trim() ?? '';
      return JSON.stringify({ lhs, rhs, op: '>' });
    }

    // Fallback (calculus / dimensional_consistency / matrix_identity /
    // statistic_identity / theorem): the core-neutral rule engine cannot
    // structurally parse these — emit a raw expression for CAS parse mode.
    return JSON.stringify({ expr: nl });
  }

  private buildSmtSource(nl: string): string {
    // Equality-style claims → SMT equality assertion.
    const eqMatch = nl.match(/^(.+?)\s*(?:equals|=)\s*(.+)$/i);
    if (eqMatch !== null) {
      const lhs = this.toSmt(eqMatch[1]?.trim() ?? '');
      const rhs = this.toSmt(eqMatch[2]?.trim() ?? '');
      const script = `(declare-const x Int) (assert (= ${lhs} ${rhs}))`;
      return JSON.stringify({ script, query: 'unsat' });
    }
    // Generic fallback: wrap NL as an opaque assertion.
    return JSON.stringify({ script: `(assert ${this.toSmt(nl)})`, query: 'unsat' });
  }

  private buildNumericalSource(nl: string, kind: MathClaimKind): string {
    // Parse "X in range [a, b]" — applies to any numerical kind with an interval.
    const rangeMatch = nl.match(/\[(-?[\d.]+),\s*(-?[\d.]+)\]/);
    if (rangeMatch !== null) {
      const min = Number.parseFloat(rangeMatch[1] ?? '0');
      const max = Number.parseFloat(rangeMatch[2] ?? '0');
      return JSON.stringify({
        bound: { min, max, sampleCount: 100, description: nl },
        expression: nl,
        numericalKind: kind,
      });
    }

    // Default numerical source with a zero bound (caller must refine).
    return JSON.stringify({
      bound: { min: 0, max: 0, sampleCount: 0, description: nl },
      expression: nl,
      numericalKind: kind,
    });
  }

  private toSmt(expr: string): string {
    // Very simple: replace ** with ^, keep as-is otherwise. This is a
    // rule-based best-effort; the competition adapter does better.
    return expr.replace(/\*\*/g, '^');
  }

  private estimateConfidence(nl: string, kind: MathClaimKind): number {
    // High confidence if we recognize a structural pattern.
    if (isSymbolicKind(kind)) {
      if (/=\s|equals|less than|greater than|<|>/.test(nl)) {
        return HIGH_CONFIDENCE;
      }
    }
    if (isNumericalKind(kind)) {
      if (/\[\s*-?[\d.]+|range|converg|p-value|kkt|interval|rhat/.test(nl)) {
        return HIGH_CONFIDENCE;
      }
    }
    // No pattern matched — honest degradation.
    return LOW_CONFIDENCE;
  }
}

/**
 * Map a target backend to the formal target language (spec §1 FormalTarget).
 * lean4/dafny backends map to their namesake language; cas/smt/numerical map to
 * 'smtlib' (the symbolic-expression interchange). Numerical claims carry their
 * config in `source` as JSON, with 'smtlib' as a placeholder target.
 */
export function backendToFormalTarget(backend: BackendKind | undefined): FormalTarget {
  switch (backend) {
    case 'lean4': return 'lean4';
    case 'dafny': return 'dafny';
    default: return 'smtlib'; // cas / smt / numerical / undefined
  }
}

/** Factory: create the default core-neutral autoformalizer. */
export function createCoreNeutralAutoformalizer(): CoreNeutralAutoformalizer {
  return new CoreNeutralAutoformalizer();
}
