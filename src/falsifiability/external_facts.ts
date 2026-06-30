import type { LlmResponse } from '../llm_gateway/types.ts';
import { hashCanonicalJson } from '../evidence_log/hasher.ts';
import type {
  CodeLocation,
  SourceAnchor,
} from '../evidence_log/types.ts';

export function extractExternalFact(
  response: LlmResponse,
  gitCommitSha: string,
  codeLocation?: CodeLocation,
): SourceAnchor {
  if (gitCommitSha.trim().length === 0) {
    throw new Error('extractExternalFact: gitCommitSha must be non-empty');
  }

  const rawResponseHash = hashCanonicalJson({
    content: response.content,
    credential: response.credential,
    raw: response.raw,
  });

  return {
    gitCommitSha,
    dashscopeRequestId:
      response.credential.providerProfile === 'competition_aliyun_qwen'
        ? response.credential.providerRequestId
        : null,
    isoTimestamp: response.credential.isoTimestamp,
    rawResponseHash,
    ...(codeLocation === undefined ? {} : { codeLocation }),
  };
}
