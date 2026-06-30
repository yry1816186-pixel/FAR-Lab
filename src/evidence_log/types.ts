import type { FinishReason, PayloadKind, PurposeTag } from '../schema/enums.ts';
import type { ProviderProfile } from '../llm_gateway/types.ts';

export const GENESIS_PREV_HASH = '0'.repeat(64);

export interface ProviderNeutralCredential {
  readonly modelId: string;
  readonly dashscopeRequestId: string | null;
  readonly reproHash: string;
  readonly gitCommitSha: string;
  readonly isoTimestamp: string;
}

export interface CodeLocation {
  readonly filePath: string;
  readonly location: string;
  readonly lineNumber?: number;
}

export interface SourceAnchor {
  readonly gitCommitSha: string;
  readonly dashscopeRequestId: string | null;
  readonly isoTimestamp: string;
  readonly rawResponseHash: string;
  readonly codeLocation?: CodeLocation;
}

export interface ReplayProver {
  readonly modelSnapshot: string;
  readonly messages: readonly unknown[];
  readonly seed: number;
  readonly params: Record<string, unknown>;
  readonly expectedResponseHash?: string;
}

export interface CanonicalInput {
  readonly stageId: string;
  readonly cred: ProviderNeutralCredential;
  readonly payloadKind: PayloadKind;
  readonly purposeTag: PurposeTag;
  readonly prevHash: string;
  readonly seq?: number;
  readonly currentHash?: string;
}

export type AppendRecordInput = Omit<
  CanonicalInput,
  'prevHash' | 'seq' | 'currentHash'
> & {
  readonly prevHash?: string;
};

export interface VerifiedCanonicalInput {
  readonly stageId: string;
  readonly cred: ProviderNeutralCredential;
  readonly payloadKind: PayloadKind;
  readonly prevHash: string;
}

export interface CallAuditData {
  readonly requestPayload: string;
  readonly responsePayload: string;
  readonly finishReason: FinishReason;
  readonly usageTokensTotal: number | null;
  readonly responsePayloadHash?: string | null;
  /**
   * 降级来源模型 id（FallbackChain 降级时由调用方注入；非降级为 null/undefined）。
   * 落库到 call_records.degraded_from 审计列；不进 canonical_hash 白名单（纯审计）。
   * Authority: 05 §8.2/§9 + 0007_add_degraded_from.sql。
   */
  readonly degradedFrom?: string | null;
}

export interface CallRecordRow {
  readonly seq: number;
  readonly stage_id: string;
  readonly payload_kind: string;
  readonly purpose_tag: string;
  readonly model_id: string;
  readonly dashscope_request_id: string | null;
  readonly repro_hash: string;
  readonly git_commit_sha: string;
  readonly iso_timestamp: string;
  readonly request_payload: string;
  readonly response_payload: string;
  readonly response_payload_hash: string | null;
  readonly degraded_from: string | null;
  readonly finish_reason: string;
  readonly usage_tokens_total: number | null;
  readonly prev_hash: string;
  readonly current_hash: string;
  readonly created_at: string;
}

export interface EvidenceLogRow {
  readonly evidence_id: string;
  readonly call_record_seq: number;
  readonly stage_id: string;
  readonly payload_kind: string;
  readonly evidence_payload: string;
  readonly source_anchor: string;
  readonly source_anchor_git: string;
  readonly source_anchor_req: string | null;
  readonly source_anchor_ts: string;
  readonly source_anchor_path: string | null;
  readonly source_anchor_lineno: number | null;
  readonly created_at: string;
}

export interface EvidenceLogEntry {
  readonly evidenceId: string;
  readonly callRecordSeq: number;
  readonly stageId: string;
  readonly payloadKind: PayloadKind;
  readonly evidencePayload: string;
  readonly sourceAnchor: SourceAnchor;
  readonly createdAt: string;
}

export interface AppendEvidenceLogArgs {
  readonly callRecordSeq: number;
  readonly evidencePayload: Record<string, unknown>;
  readonly sourceAnchor: SourceAnchor;
  readonly evidenceId?: string;
}

export type CallRecordHashRow = Omit<
  CallRecordRow,
  'request_payload' | 'response_payload' | 'response_payload_hash' | 'finish_reason' | 'usage_tokens_total'
>;

export interface HashedRecord {
  readonly seq: number;
  readonly currentHash: string;
  readonly prevHash: string;
  readonly row: CallRecordRow;
}

export interface ChainHead {
  readonly seq: number;
  readonly currentHash: string;
}

export interface VerifyResult {
  readonly ok: boolean;
  readonly brokenAtSeq: number | null;
  readonly expectedHash: string | null;
  readonly actualHash: string | null;
  readonly verifiedCount: number;
}

export interface AppendRecordOptions {
  readonly providerProfile: ProviderProfile;
  readonly competitionModelSnapshot?: string;
}

export type {
  FinishReason,
  PayloadKind,
  PurposeTag,
} from '../schema/enums.ts';
export type {
  ProviderProfile,
} from '../llm_gateway/types.ts';
