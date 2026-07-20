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

/**
 * FUSION-OS-6 provenance class（Open Science data_vid=None + forged marker 范式·来源不可自填红线）。
 * - system_derived：系统持有 canonical 输入导出（可信·原始终点）。
 * - llm_generated：LLM 产出（不可信·须配 systemClaimHash 绑定 + dashscopeRequestId 强制 null·不得直接升 CONFIRMED/REFUTED）。
 * - human：人工录入（外部观测·须人工核验）。
 */
export type ProvenanceClass = 'system_derived' | 'llm_generated' | 'human';

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
  /**
   * IC-07(F-01 修复):request payload 内容哈希(sha256 canonical JSON·写入时落)。
   * verifyCallRecordPayloadHashes 重算比对;老行 NULL = legacy-not-covered(如实标注,不计 tampered)。
   * 不进 canonical 链输入(避免历史 current_hash 失效;独立内容寻址列,与链正交)。
   */
  readonly requestPayloadHash?: string | null;
  readonly responsePayloadHash?: string | null;
  /**
   * 降级来源模型 id（FallbackChain 降级时由调用方注入；非降级为 null/undefined）。
   * 落库到 call_records.degraded_from 审计列；不进 canonical_hash 白名单（纯审计）。
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
  /** IC-07 · migration 0020:老行 NULL = legacy-not-covered */
  readonly request_payload_hash: string | null;
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
  readonly derivable: number;
  readonly evidence_payload_hash: string | null;
  readonly provenance_class: string;
  readonly system_claim_hash: string | null;
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
  readonly derivable: 0 | 1;
  readonly evidencePayloadHash: string | null;
  readonly provenanceClass: ProvenanceClass;
  readonly systemClaimHash: string | null;
}

export interface AppendEvidenceLogArgs {
  readonly callRecordSeq: number;
  readonly evidencePayload: Record<string, unknown>;
  readonly sourceAnchor: SourceAnchor;
  readonly evidenceId?: string;
  /**
   * FUSION-OS-10：derivable 标记（Open Science host_call_log.derivable 范式）。
   * - 0（缺省）= 不可重算的外部观测（原始终点·字节原样存档·不绑定 hash）。
   * - 1 = 可由系统 canonical 输入重算 → appendEvidenceLog 落 evidence_payload_hash = sha256(canonical JSON)，
   *   verifyEvidencePayloadHashes 重算比对，失配 → tampered（反剧场：不信任 workload 自填字节）。
   * 不进 canonical_hash 4 键白名单（独立内容寻址列·与链式 current_hash 正交·零回归）。
   */
  readonly derivable?: 0 | 1;
  /**
   * FUSION-OS-6：provenance class tag（Open Science data_vid=None + forged marker 范式）。
   * - 缺省 system_derived。
   * - llm_generated：appendEvidenceLog fail-closed 要求 systemClaimHash 非空 + sourceAnchor.dashscopeRequestId=null
   *   （LLM-asserted provenance 字段不可自填·反剧场红线·forged marker 检测）。
   */
  readonly provenanceClass?: ProvenanceClass;
  /** FUSION-OS-6：系统侧重导出的 claim hash（bindProvenance 由 claimText + canonicalSystemInput + rawResponseHash 重算）。 */
  readonly systemClaimHash?: string | null;
}

export type CallRecordHashRow = Omit<
  CallRecordRow,
  'request_payload' | 'response_payload' | 'request_payload_hash' | 'response_payload_hash' | 'finish_reason' | 'usage_tokens_total'
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

/**
 * FUSION-OS-10：evidence_payload 内容寻址重算结果（derivable=1 行的 hash 绑定验证）。
 * ok=false 时 tamperedEvidenceIds 列出 evidence_payload_hash 与重算 sha256 失配的 evidence_id
 * （evidence 字节被 DB 文件级篡改·绕过 append-only trigger 的情形）。
 */
export interface VerifyEvidencePayloadResult {
  readonly ok: boolean;
  readonly verifiedCount: number;
  readonly tamperedEvidenceIds: readonly string[];
}

/**
 * IC-07(F-01 修复):call_records payload 内容寻址重算结果。
 * ok=false 时 tamperedSeqs 列出 request/response payload 与落库 hash 失配的 seq
 * (payload 字节被 DROP TRIGGER/文件级旁路篡改的情形)。
 * legacyCount:hash 列 NULL 的老行(0020 落地前写入)→ 如实标注 legacy-not-covered,不计 tampered。
 */
export interface VerifyCallRecordPayloadResult {
  readonly ok: boolean;
  readonly verifiedCount: number;
  readonly legacyCount: number;
  readonly tamperedSeqs: readonly number[];
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
