/**
 * IMPL-010: Signer identity, trust-time evaluation, and authorization predicates.
 *
 * This module evaluates:
 *   - Trust-time context validity (historical / current / renewal)
 *   - Signature subject authorization (fail-closed: empty list = no authorization)
 *
 * Authority: docs/far-lab-reboot/ — signer identity & trust-time policy.
 * 模型中立 · 零容忍合规: no any / @ts-ignore / dual assertions / empty catch.
 */

import type { SignatureAlgorithmSuite } from './algorithm_registry.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Trust-time context evaluation result. */
export interface TrustTimeEvaluation {
  readonly contextKind: 'historical' | 'current' | 'renewal';
  readonly isValid: boolean;
  readonly revocationFreshnessMet: boolean;
  readonly reasonCode?: 'SUITE_STOP_SIGN_EXCEEDED' | 'SUITE_STOP_VERIFY_EXCEEDED' | undefined;
}

/** Signature subject (signer) authorization evaluation result. */
export interface SignatureSubjectEvaluation {
  readonly isAuthorized: boolean;
  readonly signerId: string;
  readonly evaluatedAt: string;
}

// ---------------------------------------------------------------------------
// evaluateTrustTimeContext
// ---------------------------------------------------------------------------

/**
 * Evaluate whether a signature is valid within a given trust-time context.
 *
 * - historical: the signature was produced before the suite's stopSignDate.
 * - current:   verification is happening before the suite's stopVerifyDate.
 * - renewal:   v0 simplified — valid if stopVerifyDate > evaluatedAt (same as current).
 *
 * Fail-closed: any date boundary exceeded produces isValid=false with a reason code.
 */
export function evaluateTrustTimeContext(
  signedAt: string,
  evaluatedAt: string,
  suite: SignatureAlgorithmSuite,
  contextKind: 'historical' | 'current' | 'renewal',
): TrustTimeEvaluation {
  const { stopSignDate, stopVerifyDate } = suite.renewalPolicy;

  // Check stop-sign exceeded (matters for historical context; also checked proactively).
  const stopSignExceeded = signedAt >= stopSignDate;
  // Check stop-verify exceeded (matters for current and renewal contexts).
  const stopVerifyExceeded = evaluatedAt >= stopVerifyDate;

  switch (contextKind) {
    case 'historical': {
      return {
        contextKind,
        isValid: !stopSignExceeded,
        revocationFreshnessMet: !stopSignExceeded,
        reasonCode: stopSignExceeded ? 'SUITE_STOP_SIGN_EXCEEDED' : undefined,
      };
    }
    case 'current': {
      return {
        contextKind,
        isValid: !stopVerifyExceeded,
        revocationFreshnessMet: !stopVerifyExceeded,
        reasonCode: stopVerifyExceeded ? 'SUITE_STOP_VERIFY_EXCEEDED' : undefined,
      };
    }
    case 'renewal': {
      // v0 simplified: treat renewal same as current — valid if still within verify window.
      // Full implementation would require continuous chain evidence between suites.
      return {
        contextKind,
        isValid: !stopVerifyExceeded,
        revocationFreshnessMet: !stopVerifyExceeded,
        reasonCode: stopVerifyExceeded ? 'SUITE_STOP_VERIFY_EXCEEDED' : undefined,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// evaluateSignatureSubject
// ---------------------------------------------------------------------------

/**
 * Evaluate whether a signer is authorized.
 *
 * Fail-closed: empty authorizedSigners → isAuthorized=false (no "all authorized" default).
 * The authorizedSigners list MUST explicitly contain the signerId.
 */
export function evaluateSignatureSubject(
  signerId: string,
  authorizedSigners: readonly string[],
  signedAt: string,
): SignatureSubjectEvaluation {
  const isAuthorized = authorizedSigners.includes(signerId);
  return {
    isAuthorized,
    signerId,
    evaluatedAt: signedAt,
  };
}
