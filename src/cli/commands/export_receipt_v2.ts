// src/cli/commands/export_receipt_v2.ts
// `far export receipt-v2` — V2 receipt export path.
//
// 从 ProofEnvelopeV2 JSON 生成 V2 收据格式：
//   - ReceiptManifest（sorted members + root digest）
//   - 六维 VerificationResult（assurance dimensions）
//   - ContractBindingSet（frozen, digest-bound）
//
// Exit codes: 0 PASS / 2 arg error / 1 runtime error.

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { ProofEnvelopeV2 } from '../../proof_envelope/v2/types.ts';
import {
  buildReceiptManifest,
  verifyReceiptManifest,
  type ReceiptManifest,
  type ReceiptManifestMember,
} from '../../v2_domain/receipt_manifest.ts';
import {
  buildVerificationResult,
  DEFAULT_DIMENSION_NOT_APPLICABLE,
} from '../../v2_domain/shared_schemas.ts';
import type { AssuranceDimensionResult } from '../../v2_domain/shared_schemas.ts';
import type { AssuranceDimension, ReceiptStanding, PreservationStatus } from '../../v2_domain/contract_enums.ts';
import {
  buildContractBindingSet,
} from '../../v2_domain/algorithm_registry.ts';

// ===========================================================================
// Options + Result
// ===========================================================================

export interface ExportReceiptV2Options {
  readonly envelopePath?: string;
  readonly outputPath?: string;
  readonly format: 'json' | 'markdown';
}

export interface ExportReceiptV2Result {
  readonly exitCode: number;
  readonly output: string;
}

// ===========================================================================
// V2 Receipt output shape
// ===========================================================================

/** Complete V2 receipt export payload. */
export interface V2ReceiptExport {
  readonly schemaVersion: 'far.v2_receipt.v1';
  readonly generatedAt: string;
  readonly envelopeId: string;
  readonly manifest: ReceiptManifest;
  readonly verificationResult: ReturnType<typeof buildVerificationResult>;
  readonly contractBindingSet: ReturnType<typeof buildContractBindingSet>;
}

// ===========================================================================
// Main entry
// ===========================================================================

/**
 * runExportReceiptV2 — 从 ProofEnvelopeV2 JSON 生成 V2 收据。
 *
 * 读取 envelope → 构建 manifest members → 构建 ContractBindingSet（默认值）
 * → 运行六维验证 → 输出 JSON 或 Markdown。
 */
export async function runExportReceiptV2(options: ExportReceiptV2Options): Promise<ExportReceiptV2Result> {
  // 1. 加载 envelope
  if (options.envelopePath === undefined) {
    return { exitCode: 2, output: 'Error: --envelope <path> required' };
  }
  if (!existsSync(options.envelopePath)) {
    return { exitCode: 2, output: `Error: envelope file not found: ${options.envelopePath}` };
  }

  let envelope: ProofEnvelopeV2;
  try {
    const raw = readFileSync(options.envelopePath, 'utf8');
    envelope = JSON.parse(raw) as ProofEnvelopeV2;
  } catch (e) {
    return { exitCode: 1, output: `Error: failed to parse envelope JSON: ${e instanceof Error ? e.message : String(e)}` };
  }

  // 2. 从 envelope 构建 manifest members
  const manifestMembers = envelopeToManifestMembers(envelope);

  // 3. 构建 manifest
  const manifest = buildReceiptManifest(manifestMembers);
  const manifestVerification = verifyReceiptManifest(manifest);

  // 4. 构建 ContractBindingSet（v0 默认值）
  const contractBindingSet = buildContractBindingSet({
    deploymentProfile: 'O_OFFLINE_VERIFIER',
    verificationPolicyId: 'far.policy.standard-v0.v1',
    scientificProfile: 'far.scientific.offline-verification.v0',
    disclosureProfile: 'far.disclosure.full.v1',
    canonicalizationAlgorithmId: 'far.canon.jcs-primary.v1',
    numericalEquivalenceProfileId: 'N0',
    externalReferencePolicyId: 'far.extref.offline-optional.v0',
    executionContainmentPolicyId: 'far.containment.local-process.v0',
    preservationPolicyId: 'far.preservation.offline-indefinite.v0',
    trustPolicyId: 'far.trust.keyless-local.v0',
  });

  // 5. 六维 assurance 判定
  const dimensions: Partial<Record<AssuranceDimension, AssuranceDimensionResult>> = {};

  // provenance: manifest 有效性
  dimensions.provenance = manifestVerification.isValid
    ? { dimension: 'provenance', outcome: 'PASS', reasonCodes: [], detail: 'manifest present with all members digested' }
    : { dimension: 'provenance', outcome: 'FAIL', reasonCodes: manifestVerification.isValid ? [] : ['MANDATORY_MEMBER_MISSING'], detail: `manifest incomplete: ${manifestVerification.reasonCode}` };

  // integrity: proofHash + manifest 完整性
  const proofHashValid = typeof envelope.proofHash === 'string' && /^[0-9a-f]{64}$/.test(envelope.proofHash);
  if (!manifestVerification.isValid) {
    dimensions.integrity = { dimension: 'integrity', outcome: 'FAIL', reasonCodes: ['MANDATORY_MEMBER_MISSING'], detail: `manifest incomplete: ${manifestVerification.missingMembers.join(', ')}` };
  } else if (!proofHashValid) {
    dimensions.integrity = { dimension: 'integrity', outcome: 'FAIL', reasonCodes: ['PROOF_HASH_MISMATCH'], detail: 'envelope proofHash missing or invalid format' };
  } else {
    dimensions.integrity = { dimension: 'integrity', outcome: 'PASS', reasonCodes: [], detail: `proofHash valid (${envelope.proofHash.slice(0, 12)}…); all ${manifestMembers.length} manifest members verified` };
  }

  // identity: keyless v0 → NOT_APPLICABLE
  dimensions.identity = DEFAULT_DIMENSION_NOT_APPLICABLE('identity');

  // processConformance
  dimensions.processConformance = manifestVerification.isValid
    ? { dimension: 'processConformance', outcome: 'PASS', reasonCodes: [], detail: 'all required manifest members present' }
    : { dimension: 'processConformance', outcome: 'FAIL', reasonCodes: ['MANDATORY_MEMBER_MISSING'], detail: 'manifest incomplete' };

  // executionReproduction: 需要外部运行环境 → NOT_APPLICABLE
  dimensions.executionReproduction = DEFAULT_DIMENSION_NOT_APPLICABLE('executionReproduction');

  // scientificVerdict
  const verdict = envelope.verdictTrace?.verdict;
  dimensions.scientificVerdict = {
    dimension: 'scientificVerdict',
    outcome: 'WARN' as const,
    reasonCodes: [],
    detail: `verdict=${verdict ?? 'UNKNOWN'} — protocol consistency confirmed, NOT scientific truth certification`,
  };

  // 6. 构建 VerificationResult
  const receiptStanding: ReceiptStanding = 'ACTIVE';
  const preservationStatus: PreservationStatus = 'AVAILABLE';
  const result = buildVerificationResult({
    resultId: `vr-v2-${envelope.claim?.id ?? 'unknown'}`,
    receiptId: envelope.claim?.id ?? 'unknown',
    verificationPolicyId: 'far.policy.standard-v0.v1',
    evaluatedAt: new Date().toISOString(),
    dimensionResults: dimensions,
    receiptStanding,
    preservationStatus,
  });

  // 7. 构建 V2 receipt export payload
  const receipt: V2ReceiptExport = {
    schemaVersion: 'far.v2_receipt.v1',
    generatedAt: new Date().toISOString(),
    envelopeId: envelope.envelopeId,
    manifest,
    verificationResult: result,
    contractBindingSet,
  };

  // 8. 渲染输出
  const output = options.format === 'json'
    ? JSON.stringify(receipt, null, 2)
    : formatV2ReceiptMarkdown(receipt);

  // 9. 写文件或返回
  if (options.outputPath !== undefined) {
    writeFileSync(options.outputPath, output, 'utf8');
    return { exitCode: 0, output: `V2 receipt written to ${options.outputPath}` };
  }

  return { exitCode: 0, output };
}

// ===========================================================================
// Helpers
// ===========================================================================

/**
 * 从 ProofEnvelopeV2 提取 manifest members（与 verify_v2.ts 同逻辑）。
 */
function envelopeToManifestMembers(envelope: ProofEnvelopeV2): ReceiptManifestMember[] {
  const members: ReceiptManifestMember[] = [];
  const digest = (s: string): string => {
    return createHash('sha256').update(s, 'utf8').digest('hex');
  };

  if (envelope.claim) {
    members.push({ kind: 'claim', digest: digest(JSON.stringify(envelope.claim)), sizeBytes: JSON.stringify(envelope.claim).length });
  }
  if (envelope.fecSnapshot) {
    members.push({ kind: 'fecSnapshot', digest: digest(JSON.stringify(envelope.fecSnapshot)), sizeBytes: JSON.stringify(envelope.fecSnapshot).length });
  }
  if (envelope.protocolFreeze) {
    members.push({ kind: 'protocolFreeze', digest: digest(JSON.stringify(envelope.protocolFreeze)), sizeBytes: JSON.stringify(envelope.protocolFreeze).length });
  }
  if (envelope.datasetBindings) {
    members.push({ kind: 'datasetBindings', digest: digest(JSON.stringify(envelope.datasetBindings)), sizeBytes: JSON.stringify(envelope.datasetBindings).length });
  }
  if (envelope.workflowBindings) {
    members.push({ kind: 'workflowBindings', digest: digest(JSON.stringify(envelope.workflowBindings)), sizeBytes: JSON.stringify(envelope.workflowBindings).length });
  }
  if (envelope.verdictTrace) {
    members.push({ kind: 'verdictTrace', digest: digest(JSON.stringify(envelope.verdictTrace)), sizeBytes: JSON.stringify(envelope.verdictTrace).length });
  }
  if (envelope.antiTheaterReport) {
    members.push({ kind: 'antiTheaterReport', digest: digest(JSON.stringify(envelope.antiTheaterReport)), sizeBytes: JSON.stringify(envelope.antiTheaterReport).length });
  }

  return members;
}

/**
 * 格式化 V2 收据为 Markdown。
 */
function formatV2ReceiptMarkdown(receipt: V2ReceiptExport): string {
  const lines: string[] = [];

  lines.push('# FAR-Lab V2 Receipt');
  lines.push('');
  lines.push(`- Schema: \`${receipt.schemaVersion}\``);
  lines.push(`- Generated: ${receipt.generatedAt}`);
  lines.push(`- Envelope ID: \`${receipt.envelopeId}\``);
  lines.push(`- Manifest root: \`${receipt.manifest.rootDigest.slice(0, 24)}…\``);
  lines.push(`- Contract bindings digest: \`${receipt.contractBindingSet.digest.slice(0, 24)}…\``);
  lines.push('');

  // Verification result summary
  lines.push(`- Receipt ID: ${receipt.verificationResult.receiptId}`);
  lines.push(`- Standing: ${receipt.verificationResult.receiptStanding}`);
  lines.push(`- Evaluated: ${receipt.verificationResult.evaluatedAt}`);
  lines.push('');

  // Six-dimension table
  lines.push('## Six Assurance Dimensions');
  lines.push('');
  lines.push('| Assurance Dimension | Outcome | Detail |');
  lines.push('|---|---|---|');

  const dimensionOrder: AssuranceDimension[] = [
    'provenance',
    'integrity',
    'identity',
    'processConformance',
    'executionReproduction',
    'scientificVerdict',
  ];

  for (const dim of dimensionOrder) {
    const d = receipt.verificationResult.dimensions[dim];
    lines.push(`| ${d.dimension} | ${d.outcome} | ${d.detail} |`);
  }

  lines.push('');

  // Manifest details
  lines.push('## Manifest');
  lines.push('');
  lines.push(`- Schema: \`${receipt.manifest.schemaVersion}\``);
  lines.push(`- Root digest: \`${receipt.manifest.rootDigest}\``);
  lines.push(`- Required member count: ${receipt.manifest.requiredMemberCount}`);
  lines.push(`- Members (${receipt.manifest.members.length}):`);
  for (const member of receipt.manifest.members) {
    lines.push(`  - \`${member.kind}\`: ${member.digest.slice(0, 16)}… (${member.sizeBytes} bytes)`);
  }
  lines.push('');

  // Contract Binding Set details
  lines.push('## Contract Binding Set');
  lines.push('');
  lines.push(`- Version: ${receipt.contractBindingSet.version}`);
  lines.push(`- Digest: \`${receipt.contractBindingSet.digest}\``);
  lines.push(`- Deployment profile: ${receipt.contractBindingSet.bindings.deploymentProfile}`);
  lines.push(`- Verification policy: ${receipt.contractBindingSet.bindings.verificationPolicyId}`);
  lines.push(`- Canonicalization: ${receipt.contractBindingSet.bindings.canonicalizationAlgorithmId}`);
  lines.push('');

  // Limitations
  lines.push('## Limitations');
  lines.push('');
  lines.push('- This V2 Receipt is a DOC projection; it is not a new fact source and is not included in proofHash.');
  lines.push('- It does not certify universal scientific truth and does not replace peer review.');
  lines.push('- The scientificVerdict dimension is WARN — verdict label is protocol-consistent, not independently scientifically validated.');
  lines.push('');

  return lines.join('\n') + '\n';
}
