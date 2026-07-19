export class FalsifiabilityError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'FalsifiabilityError';
  }
}

export class FalsifiabilityGateError extends FalsifiabilityError {
  constructor(message: string) {
    super(message);
    this.name = 'FalsifiabilityGateError';
  }
}

export class EmptyScopeSlipError extends FalsifiabilityError {
  constructor(message: string) {
    super(message);
    this.name = 'EmptyScopeSlipError';
  }
}

export class EmptyUntestedReasonError extends FalsifiabilityError {
  constructor(message: string) {
    super(message);
    this.name = 'EmptyUntestedReasonError';
  }
}

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
