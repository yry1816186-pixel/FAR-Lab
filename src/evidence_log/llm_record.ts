import type { LlmGateway } from '../llm_gateway/gateway.ts';
import type {
  LlmRequest,
  LlmResponse,
  ProviderProfile,
} from '../llm_gateway/types.ts';
import { canonicalJson, hashCanonicalJson } from './hasher.ts';
import { appendRecord } from './repository.ts';
import type {
  AppendRecordOptions,
  CallAuditData,
  FinishReason,
  HashedRecord,
  PayloadKind,
  PurposeTag,
} from './types.ts';

/** Interface defining llm record metadata. */
export interface LlmRecordMetadata {
  readonly stageId: string;
  readonly payloadKind: PayloadKind;
  readonly purposeTag: PurposeTag;
  readonly reproHash: string;
  readonly gitCommitSha: string;
  readonly finishReason: FinishReason;
}

/** Input parameters for operations involving append llm response args. */
export interface AppendLlmResponseArgs {
  readonly request: LlmRequest;
  readonly response: LlmResponse;
  readonly metadata: LlmRecordMetadata;
  readonly appendOptions: AppendRecordOptions;
}

/** Input parameters for operations involving call and record llm args. */
export interface CallAndRecordLlmArgs {
  readonly profile: ProviderProfile;
  readonly request: LlmRequest;
  readonly metadata: LlmRecordMetadata;
  readonly appendOptions: AppendRecordOptions;
}

/** Interface defining recorded llm response. */
export interface RecordedLlmResponse {
  readonly response: LlmResponse;
  readonly record: HashedRecord;
}

/**
 * call and record llm.
 */
export async function callAndRecordLlm(
  db: import('better-sqlite3').Database,
  gateway: LlmGateway,
  args: CallAndRecordLlmArgs,
): Promise<RecordedLlmResponse> {
  const response = await gateway.callLlm(args.profile, args.request);
  const record = appendLlmResponseRecord(db, {
    request: args.request,
    response,
    metadata: args.metadata,
    appendOptions: args.appendOptions,
  });

  return {
    response,
    record,
  };
}

/**
 * append llm response record.
 */
export function appendLlmResponseRecord(
  db: import('better-sqlite3').Database,
  args: AppendLlmResponseArgs,
): HashedRecord {
  if (args.appendOptions.providerProfile !== args.response.credential.providerProfile) {
    throw new Error(
      `appendLlmResponseRecord: appendOptions profile ${args.appendOptions.providerProfile} does not match response profile ${args.response.credential.providerProfile}`,
    );
  }

  const requestRecord: Record<string, unknown> = {
    providerProfile: args.response.credential.providerProfile,
    request: args.request,
  };
  const responseRecord: Record<string, unknown> = {
    content: args.response.content,
    credential: args.response.credential,
    raw: args.response.raw,
  };
  const audit: CallAuditData = {
    requestPayload: canonicalJson(requestRecord, 'appendLlmResponseRecord.requestPayload'),
    responsePayload: canonicalJson(responseRecord, 'appendLlmResponseRecord.responsePayload'),
    // IC-07(F-01 修复):request 侧同样落内容哈希,使 DROP TRIGGER/文件级旁路篡改可检
    requestPayloadHash: hashCanonicalJson(requestRecord),
    responsePayloadHash: hashCanonicalJson(responseRecord),
    finishReason: args.metadata.finishReason,
    usageTokensTotal: args.response.credential.tokenUsage.totalTokens,
  };

  return appendRecord(
    db,
    {
      stageId: args.metadata.stageId,
      cred: {
        modelId: args.response.credential.modelId,
        dashscopeRequestId: dashscopeRequestIdFor(args.response),
        reproHash: args.metadata.reproHash,
        gitCommitSha: args.metadata.gitCommitSha,
        isoTimestamp: args.response.credential.isoTimestamp,
      },
      payloadKind: args.metadata.payloadKind,
      purposeTag: args.metadata.purposeTag,
    },
    audit,
    args.appendOptions,
  );
}

function dashscopeRequestIdFor(response: LlmResponse): string | null {
  if (response.credential.providerProfile !== 'competition_aliyun_qwen') {
    return null;
  }
  if (response.credential.providerRequestId === null) {
    throw new Error('appendLlmResponseRecord: competition_aliyun_qwen response is missing providerRequestId');
  }
  return response.credential.providerRequestId;
}
