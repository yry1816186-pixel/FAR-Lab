import type {
  SourceAnchor,
  ReplayProver,
} from '../evidence_log/types.ts';
import type {
  Verdict,
  VerdictNodeKind,
} from '../schema/enums.ts';

export type ThresholdSemantics = 'gt' | 'lt' | 'range';

export interface FalsificationSpec {
  readonly prediction: string;
  readonly metric: string;
  readonly falsificationThreshold: number;
  readonly thresholdSemantics: ThresholdSemantics;
}

export interface ThresholdSpec {
  readonly semantics: ThresholdSemantics;
  readonly value?: number;
  readonly lower?: number;
  readonly upper?: number;
}

export interface EvidenceRecord {
  readonly claim: string;
  readonly metricValue?: number;
  readonly supportsClaim: boolean;
  readonly refutesClaim: boolean;
  readonly scopeNarrowerThanClaim: boolean;
  readonly sourceAnchor: SourceAnchor;
}

export interface VerdictDecision {
  readonly verdict: Verdict;
  readonly scopeSlipText: string | null;
  readonly untestedReason: string | null;
  readonly conflictingEvidenceCount: number;
}

export interface VerdictResult extends VerdictDecision {
  readonly metricValue: number | null;
}

export interface VerdictNode {
  readonly verdictId: string;
  readonly evidenceId: string;
  readonly parentVerdictId: string | null;
  readonly nodeKind: VerdictNodeKind;
  readonly verdict: Verdict;
  readonly falsificationSpec: FalsificationSpec;
  readonly thresholdSpec: ThresholdSpec | null;
  readonly metricValue: number | null;
  readonly conflictingEvidenceCount: number;
  readonly scopeSlipText: string | null;
  readonly untestedReason: string | null;
  readonly sourceAnchor: SourceAnchor;
  readonly replayProver: ReplayProver | null;
  readonly prevHash: string;
  readonly currentHash: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RecordVerdictArgs {
  readonly evidenceId: string;
  readonly parentVerdictId: string | null;
  readonly nodeKind: VerdictNodeKind;
  readonly verdict: Verdict;
  readonly falsificationSpec: FalsificationSpec;
  readonly thresholdSpec: ThresholdSpec | null;
  readonly metricValue: number | null;
  readonly conflictingEvidenceCount: number;
  readonly scopeSlipText: string | null;
  readonly untestedReason: string | null;
  readonly sourceAnchor: SourceAnchor;
  readonly replayProver: ReplayProver | null;
}

export type {
  ReplayProver,
  SourceAnchor,
} from '../evidence_log/types.ts';
export type {
  Verdict,
  VerdictNodeKind,
} from '../schema/enums.ts';
