import {
  EmptyScopeSlipError,
  EmptyUntestedReasonError,
} from './errors.ts';
import {
  buildLegacyVerdictKernelInput,
  makeLegacyCompatFec,
  verdictResultFromKernelOutput,
} from './legacy_kernel_adapter.ts';
import { decideFiveValueVerdict } from './verdict_kernel_v2.ts';
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
  const fec = makeLegacyCompatFec({
    claimId: 'render-honest-verdict',
    falsificationSpec: input.falsificationSpec,
    thresholdSpec: input.thresholdSpec,
    frozenAt: '1970-01-01T00:00:00.000Z',
  });
  const kernelOutput = decideFiveValueVerdict(
    buildLegacyVerdictKernelInput({
      claim: input.claim,
      evidences: input.evidences,
      falsificationSpec: input.falsificationSpec,
      thresholdSpec: input.thresholdSpec,
      fec,
    }),
  );
  const decision = verdictResultFromKernelOutput(kernelOutput);

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
