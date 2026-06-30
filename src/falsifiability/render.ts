import {
  EmptyScopeSlipError,
  EmptyUntestedReasonError,
} from './errors.ts';
import { makeVerdict } from './verdict.ts';
import type {
  EvidenceRecord,
  FalsificationSpec,
  ThresholdSpec,
  Verdict,
} from './types.ts';

export interface HonestVerdictRender {
  readonly verdict: Verdict;
  readonly scopeSlipText: string;
  readonly untestedReason: string;
  readonly conflictingEvidenceCount: number;
}

export function renderHonestVerdict(input: {
  readonly claim: string;
  readonly evidences: ReadonlyArray<EvidenceRecord>;
  readonly falsificationSpec: FalsificationSpec;
  readonly thresholdSpec: ThresholdSpec;
}): HonestVerdictRender {
  const decision = makeVerdict(input);

  if (decision.verdict === 'DEGRADED_SCOPE') {
    if (decision.scopeSlipText === null || decision.scopeSlipText.trim().length === 0) {
      throw new EmptyScopeSlipError(
        `renderHonestVerdict: DEGRADED_SCOPE requires scopeSlipText for claim "${input.claim}"`,
      );
    }
  }

  if (decision.verdict === 'UNTESTED') {
    if (decision.untestedReason === null || decision.untestedReason.trim().length === 0) {
      throw new EmptyUntestedReasonError(
        `renderHonestVerdict: UNTESTED requires untestedReason for claim "${input.claim}"`,
      );
    }
  }

  return {
    verdict: decision.verdict,
    scopeSlipText: decision.scopeSlipText ?? '',
    untestedReason: decision.untestedReason ?? '',
    conflictingEvidenceCount: decision.conflictingEvidenceCount,
  };
}
