/**
 * Base error for all falsifiability-domain failures. Subclass to distinguish
 * specific invariant violations in the verdict pipeline.
 */
export class FalsifiabilityError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'FalsifiabilityError';
  }
}

/**
 * Raised when the falsifiability gate rejects an input (missing threshold,
 * ambiguous metric, or untestable prediction). See Red Line #7.
 */
export class FalsifiabilityGateError extends FalsifiabilityError {
  constructor(message: string) {
    super(message);
    this.name = 'FalsifiabilityGateError';
  }
}

/**
 * Raised when a DEGRADED_SCOPE verdict is persisted without a non-empty
 * scope-slip description. DEGRADED_SCOPE must always explain what scope was
 * lost — an empty explanation hides that evidence was narrower than the claim.
 */
export class EmptyScopeSlipError extends FalsifiabilityError {
  constructor(message: string) {
    super(message);
    this.name = 'EmptyScopeSlipError';
  }
}

/**
 * Raised when an UNTESTED verdict is persisted without a non-empty reason.
 * UNTESTED must always explain why the claim could not be tested — an empty
 * reason hides the gap between the claim and available evidence.
 */
export class EmptyUntestedReasonError extends FalsifiabilityError {
  constructor(message: string) {
    super(message);
    this.name = 'EmptyUntestedReasonError';
  }
}

/**
 * Raised when the verdict kernel encounters a verdict string it does not
 * recognise. This is a fail-closed guard: the kernel only emits the five
 * canonical verdicts, so an unknown value signals corruption or a bug.
 */
export class UnknownVerdictError extends FalsifiabilityError {
  constructor(message: string) {
    super(message);
    this.name = 'UnknownVerdictError';
  }
}

/**
 * CONFIRMED 判决缺证据守卫错误（Red Line #7：CONFIRMED 需证据 + checkpoint）。
 *
 * 对称 EmptyScopeSlipError（DEGRADED_SCOPE）/ EmptyUntestedReasonError（UNTESTED）——
 * 当 recordVerdict 收到 verdict='CONFIRMED' 但 evidenceId 在 evidence_log 无对应记录
 * 或 evidence_payload 为空时抛出（持久化层防御纵深·禁绕过 makeVerdict 写无证据 CONFIRMED）。
 */
export class ConfirmedEvidenceMissingError extends FalsifiabilityError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfirmedEvidenceMissingError';
  }
}
