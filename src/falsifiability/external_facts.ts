import type { LlmResponse } from '../llm_gateway/types.ts';
import { hashCanonicalJson } from '../evidence_log/hasher.ts';
import type {
  CodeLocation,
  ProvenanceClass,
  SourceAnchor,
} from '../evidence_log/types.ts';
import type { IdentifierClaim } from './verdict_kernel_v2.ts';

/**
 * Extracts a verifiable {@link SourceAnchor} from an LLM response, binding the
 * response content + credential + raw payload into a content-addressed hash.
 * The resulting anchor can be attached to evidence records to prove the metric
 * value originated from this specific LLM call.
 *
 * @param response - The LLM response to extract provenance from.
 * @param gitCommitSha - The git commit that produced this response (non-empty).
 * @param codeLocation - Optional source code location for finer-grained attribution.
 * @returns A {@link SourceAnchor} with `rawResponseHash` binding the response.
 * @throws {Error} if `gitCommitSha` is empty.
 */
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

/**
 * 离线确定性 identifier registry（FUSION-OS-14·design doc line 328 harness-verified 来源）。
 * 已知 DOI/arXiv/accession/author_year → resolved；未知 → not_found；registry undefined（加载故障）→ unresolved。
 * 确定性无网络（unresolved 由 registry 不可达映射，模拟联网环境故障·落点约束 R3 边界）。
 */
export const HARNESS_VERIFIED_IDENTIFIERS: ReadonlySet<string> = new Set([
  'doi:10.1/far-verified-001',
  'arxiv:2026.0001',
  'accession:ABC123',
  'author_year:Smith_2024',
]);

/**
 * Resolves an identifier claim (DOI, arXiv ID, accession number, author_year)
 * against an offline deterministic registry (FUSION-OS-14). Returns a trust
 * verdict: `resolved` if the registry contains the identifier, `not_found` if
 * absent, or `unresolved` if the registry itself is unavailable (simulating a
 * network failure in an offline environment).
 *
 * @param claim - The identifier kind and value to resolve.
 * @param registry - The deterministic identifier set, or `undefined` if unavailable.
 * @returns An {@link IdentifierClaim} with resolution status filled by the trust root.
 */
export function resolveIdentifierClaim(
  claim: { readonly kind: IdentifierClaim['kind']; readonly value: string },
  registry: ReadonlySet<string> | undefined,
): IdentifierClaim {
  if (registry === undefined) {
    return { kind: claim.kind, value: claim.value, resolutionStatus: 'unresolved', harnessVerifiedSource: false };
  }
  const resolved = registry.has(`${claim.kind}:${claim.value}`);
  return {
    kind: claim.kind,
    value: claim.value,
    resolutionStatus: resolved ? 'resolved' : 'not_found',
    harnessVerifiedSource: resolved,
  };
}

/** 信任根重算（FUSION-OS-14·来源不可自填红线）：所有 kernel-input builder 须经此函数，禁透传 caller 自填 resolutionStatus。 */
export function recomputeIdentifierClaims(claims: readonly IdentifierClaim[]): readonly IdentifierClaim[] {
  return claims.map((c) => resolveIdentifierClaim({ kind: c.kind, value: c.value }, HARNESS_VERIFIED_IDENTIFIERS));
}

/**
 * FUSION-OS-6 bindProvenance 输入：系统持有的绑定上下文。
 * claimText + canonicalSystemInput 由系统持有（非 LLM 自填），isoTimestamp 由系统侧提供（非 response.credential）。
 */
export interface BindProvenanceSystemContext {
  readonly gitCommitSha: string;
  /** 系统侧时间戳（ISO·非 response.credential.isoTimestamp·来源不可自填）。 */
  readonly isoTimestamp: string;
  readonly claimText: string;
  readonly canonicalSystemInput: Record<string, unknown>;
  readonly codeLocation?: CodeLocation;
}

/** FUSION-OS-6 bindProvenance 输出：LLM 产出的清洁 provenance 绑定。 */
export interface BoundProvenance {
  /** dashscopeRequestId 强制 null（LLM-asserted 字段不可自填）+ isoTimestamp 系统侧 + rawResponseHash 系统重算。 */
  readonly anchor: SourceAnchor;
  readonly provenanceClass: ProvenanceClass;
  readonly systemClaimHash: string;
}

/**
 * FUSION-OS-6：把 LLM 产出绑定为可信审计形态（Open Science data_vid=None + 系统 hash 重算范式）。
 *
 * 与 extractExternalFact 的关键差异（闭合来源不可自填窗口）：
 *   1. anchor.dashscopeRequestId **强制 null**（extractExternalFact:26-29 直通 response.credential.providerRequestId——LLM 自填）。
 *   2. anchor.isoTimestamp 取 systemContext（系统侧），非 response.credential.isoTimestamp（LLM 自填）。
 *   3. systemClaimHash = sha256(canonical {claimText, canonicalSystemInput, rawResponseHash})——系统持有 claimText + canonicalSystemInput 重导出。
 *
 * 返回的 BoundProvenance 可直接喂 appendEvidenceLog(provenanceClass='llm_generated', systemClaimHash)：fail-closed 门放行。
 */
export function bindProvenance(
  response: LlmResponse,
  systemContext: BindProvenanceSystemContext,
): BoundProvenance {
  if (systemContext.gitCommitSha.trim().length === 0) {
    throw new Error('bindProvenance: gitCommitSha must be non-empty');
  }
  if (systemContext.claimText.trim().length === 0) {
    throw new Error('bindProvenance: claimText must be non-empty (LLM output must bind to a claim)');
  }

  const rawResponseHash = hashCanonicalJson({
    content: response.content,
    credential: response.credential,
    raw: response.raw,
  });
  const systemClaimHash = hashCanonicalJson({
    claimText: systemContext.claimText,
    canonicalSystemInput: systemContext.canonicalSystemInput,
    rawResponseHash,
  });
  const anchor: SourceAnchor = {
    gitCommitSha: systemContext.gitCommitSha,
    dashscopeRequestId: null,
    isoTimestamp: systemContext.isoTimestamp,
    rawResponseHash,
    ...(systemContext.codeLocation === undefined ? {} : { codeLocation: systemContext.codeLocation }),
  };
  return { anchor, provenanceClass: 'llm_generated', systemClaimHash };
}
