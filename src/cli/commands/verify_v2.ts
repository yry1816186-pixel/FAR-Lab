// src/cli/commands/verify_v2.ts
// `far verify-v2` — V2 receipt verification path.
//
// 接入 V2 域层：从 ProofEnvelopeV2 JSON 或 .far-proof bundle 读取，
// 构建 ReceiptManifest，运行六维 assurance 验证，使用 clean-room 独立验证器复算。
//
// 与 `far verify` 的区别：
//   - far verify: V1 路径（proofHash 重算 + 10 rules + anti-theater lint）
//   - far verify-v2: V2 路径（六维 assurance + manifest 完整性 + 独立根复算）
//
// Exit codes: 0 PASS / 7 FAIL / 2 arg error / 1 runtime error.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ProofEnvelopeV2 } from '../../proof_envelope/v2/types.ts';
import { verifyProofHashV2 } from '../../proof_envelope/v2/proof_hash.ts';
import {
  buildReceiptManifest,
  verifyReceiptManifest,
} from '../../v2_domain/receipt_manifest.ts';
import { verifyReceiptRoot } from '../../v2_domain/independent_verifier.ts';
import {
  buildVerificationResult,
  DEFAULT_DIMENSION_NOT_APPLICABLE,
} from '../../v2_domain/shared_schemas.ts';
import type { AssuranceDimensionResult } from '../../v2_domain/shared_schemas.ts';
import type { AssuranceDimension, ReceiptStanding, PreservationStatus } from '../../v2_domain/contract_enums.ts';
import { resolveStandardPolicyId } from '../../v2_domain/policy_registry.ts';
import { envelopeToManifestMembers } from './envelope_to_manifest_members.ts';

/** Parsed options for the V2 six-dimension verification path (`far verify --v2`). */
export interface VerifyV2Options {
  readonly envelopePath?: string;
  readonly bundlePath?: string;
  readonly json: boolean;
}

/** Result of a V2 verification run: process exit code + rendered output. */
export interface VerifyV2Result {
  readonly exitCode: number;
  readonly output: string;
}

/**
 * runVerifyV2 — 从 ProofEnvelopeV2 JSON 运行 V2 六维验证。
 */
export async function runVerifyV2(options: VerifyV2Options): Promise<VerifyV2Result> {
  // 1. 加载输入
  let envelope: ProofEnvelopeV2 | undefined;

  if (options.envelopePath) {
    if (!existsSync(options.envelopePath)) {
      return { exitCode: 2, output: `Error: envelope file not found: ${options.envelopePath}` };
    }
    try {
      const raw = readFileSync(options.envelopePath, 'utf8');
      envelope = JSON.parse(raw) as ProofEnvelopeV2;
    } catch (e) {
      return { exitCode: 1, output: `Error: failed to parse envelope JSON: ${e instanceof Error ? e.message : String(e)}` };
    }
  } else if (options.bundlePath) {
    const manifestPath = join(options.bundlePath, 'envelope.json');
    if (!existsSync(manifestPath)) {
      return { exitCode: 2, output: `Error: bundle envelope not found: ${manifestPath}` };
    }
    try {
      const raw = readFileSync(manifestPath, 'utf8');
      envelope = JSON.parse(raw) as ProofEnvelopeV2;
    } catch (e) {
      return { exitCode: 1, output: `Error: failed to parse bundle envelope: ${e instanceof Error ? e.message : String(e)}` };
    }
  } else {
    return { exitCode: 2, output: 'Error: --envelope <path> or --bundle <path> required' };
  }

  if (envelope === undefined) {
    return { exitCode: 1, output: 'Error: no envelope loaded' };
  }

  // 2. 从 envelope 构建 manifest members
  const manifestMembers = envelopeToManifestMembers(envelope);

  // 3. 构建 + 验证 manifest
  const manifest = buildReceiptManifest(manifestMembers);
  const manifestVerification = verifyReceiptManifest(manifest);

  // 4. 独立根复算（clean-room，不使用 producer 的 canonicalJson）
  const rootVerification = verifyReceiptRoot(manifestMembers, 'far.receipt-manifest.v1');

  // 5. 六维 assurance 判定
  const dimensions: Partial<Record<AssuranceDimension, AssuranceDimensionResult>> = {};

  // provenance
  dimensions.provenance = manifestVerification.isValid && rootVerification.isValid
    ? { dimension: 'provenance', outcome: 'PASS', reasonCodes: [], detail: 'manifest present and independently recomputed via clean-room verifier' }
    : { dimension: 'provenance', outcome: 'FAIL', reasonCodes: manifestVerification.isValid ? [] : ['MANDATORY_MEMBER_MISSING'], detail: `manifest or root verification failed: ${manifestVerification.reasonCode}` };

  // integrity: 内容寻址篡改检测——重算 proofHash 并与密封值比对（2026-08-06 修复：
  // 此前仅查格式 /^[0-9a-f]{64}$/，篡改 claim 后 digest 重算仍"完整"→ 篡改检测失效。
  // 现接入 verifyProofHashV2（canonical_json(全部 VC 字段 - proofHash) → sha256 重算比对）。
  const proofHashVerification = verifyProofHashV2(envelope);
  if (!manifestVerification.isValid) {
    dimensions.integrity = { dimension: 'integrity', outcome: 'FAIL', reasonCodes: ['MANDATORY_MEMBER_MISSING'], detail: `manifest incomplete: ${manifestVerification.missingMembers.join(', ')}` };
  } else if (proofHashVerification !== 'valid') {
    dimensions.integrity = { dimension: 'integrity', outcome: 'FAIL', reasonCodes: ['PROOF_HASH_MISMATCH'], detail: `content-addressed proofHash verification failed: ${proofHashVerification}` };
  } else {
    dimensions.integrity = { dimension: 'integrity', outcome: 'PASS', reasonCodes: [], detail: `proofHash recomputed and matched (${envelope.proofHash.slice(0, 12)}…); all ${manifestMembers.length} manifest members verified` };
  }

  // identity: keyless v0 → NOT_APPLICABLE
  dimensions.identity = DEFAULT_DIMENSION_NOT_APPLICABLE('identity');

  // processConformance
  dimensions.processConformance = manifestVerification.isValid
    ? { dimension: 'processConformance', outcome: 'PASS', reasonCodes: [], detail: 'all required manifest members present' }
    : { dimension: 'processConformance', outcome: 'FAIL', reasonCodes: ['MANDATORY_MEMBER_MISSING'], detail: 'manifest incomplete' };

  // executionReproduction: 需要外部运行环境，当前 NOT_APPLICABLE
  dimensions.executionReproduction = DEFAULT_DIMENSION_NOT_APPLICABLE('executionReproduction');

  // scientificVerdict: envelope verdict label 映射到 assurance outcome
  const verdict = envelope.verdictTrace?.verdict;
  dimensions.scientificVerdict = {
    dimension: 'scientificVerdict',
    outcome: verdict === 'CONFIRMED' || verdict === 'REFUTED' ? 'WARN' : 'WARN',
    reasonCodes: [],
    detail: `verdict=${verdict ?? 'UNKNOWN'} — protocol consistency confirmed, NOT scientific truth certification`,
  };

  // 6. 构建验证结果
  const receiptStanding: ReceiptStanding = 'ACTIVE';
  const preservationStatus: PreservationStatus = 'AVAILABLE';
  const result = buildVerificationResult({
    resultId: `vr-v2-${envelope.claim?.id ?? 'unknown'}`,
    receiptId: envelope.claim?.id ?? 'unknown',
    // M14 接线：从标准策略注册表 fail-closed 解析（策略 deprecated → 抛错·禁静默沿用旧策略）
    verificationPolicyId: resolveStandardPolicyId(),
    evaluatedAt: new Date().toISOString(),
    dimensionResults: dimensions,
    receiptStanding,
    preservationStatus,
  });

  // 7. 渲染输出
  const allPass = Object.values(result.dimensions).every((d) => d.outcome === 'PASS' || d.outcome === 'NOT_APPLICABLE' || d.outcome === 'WARN');
  const exitCode = allPass ? 0 : 7;

  if (options.json) {
    return { exitCode, output: JSON.stringify(result, null, 2) };
  }

  return { exitCode, output: formatVerifyV2Output(result, envelope, manifestVerification, rootVerification) };
}

/**
 * 格式化 V2 验证输出。
 */
function formatVerifyV2Output(
  result: ReturnType<typeof buildVerificationResult>,
  envelope: ProofEnvelopeV2,
  manifestVerification: ReturnType<typeof verifyReceiptManifest>,
  rootVerification: ReturnType<typeof verifyReceiptRoot>,
): string {
  const lines: string[] = [];
  lines.push('╔══════════════════════════════════════════════════════════════════════════╗');
  lines.push('║  FAR-Lab V2 Receipt Verification — Six Independent Assurance Dimensions  ║');
  lines.push('╚══════════════════════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`  Receipt ID:    ${result.receiptId}`);
  lines.push(`  Claim:         ${envelope.claim?.naturalLanguage?.slice(0, 60) ?? '(missing)'}…`);
  lines.push(`  Verdict:       ${envelope.verdictTrace?.verdict ?? 'UNKNOWN'}`);
  lines.push(`  proofHash:     ${envelope.proofHash?.slice(0, 24) ?? '(missing)'}…`);
  lines.push(`  Standing:      ${result.receiptStanding}`);
  lines.push(`  Evaluated:     ${result.evaluatedAt}`);
  lines.push('');

  lines.push('  ┌─────────────────────────┬──────────────┬──────────────────────────────────┐');
  lines.push('  │ Assurance Dimension     │ Outcome      │ Detail                           │');
  lines.push('  ├─────────────────────────┼──────────────┼──────────────────────────────────┤');

  const dimensionOrder: AssuranceDimension[] = [
    'provenance',
    'integrity',
    'identity',
    'processConformance',
    'executionReproduction',
    'scientificVerdict',
  ];

  for (const dim of dimensionOrder) {
    const d = result.dimensions[dim];
    const name = dim.padEnd(23);
    const outcome = d.outcome.padEnd(12);
    const detail = d.detail.slice(0, 32).padEnd(32);
    lines.push(`  │ ${name} │ ${outcome} │ ${detail} │`);
  }

  lines.push('  └─────────────────────────┴──────────────┴──────────────────────────────────┘');
  lines.push('');

  // Manifest verification detail
  lines.push('  Manifest verification:');
  lines.push(`    isValid:        ${manifestVerification.isValid}`);
  lines.push(`    missingMembers: ${manifestVerification.missingMembers.length === 0 ? '(none)' : manifestVerification.missingMembers.join(', ')}`);
  lines.push(`    duplicateKinds: ${manifestVerification.duplicateKinds.length === 0 ? '(none)' : manifestVerification.duplicateKinds.join(', ')}`);
  lines.push('');

  // Root verification detail
  lines.push('  Clean-room root verification:');
  lines.push(`    recomputedRoot: ${rootVerification.recomputedRoot.slice(0, 24)}…`);
  lines.push(`    isValid:        ${rootVerification.isValid}`);
  lines.push('');

  // Honesty boundary
  lines.push('  ⚠ LIMITATION: This verification confirms protocol/integrity conformance only.');
  lines.push('    It does NOT certify scientific truth, author innocence, or fraud absence.');
  lines.push(`    The scientificVerdict dimension is WARN — verdict label is protocol-consistent,`);
  lines.push('    not independently scientifically validated.');
  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════════════════');

  return lines.join('\n');
}
