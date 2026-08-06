/**
 * envelope_to_manifest_members —— ProofEnvelopeV2 → ReceiptManifestMember[] 共享映射（单一真相源）。
 *
 * 2026-08-06 修复：此前 export_receipt_v2.ts 与 verify_v2.ts 各自维护一份仅映射 8 种的
 * envelopeToManifestMembers（缺 experimentRuns/measurementResults/statisticalResults/ledgerRoot），
 * 导致完整 V2 收据也报「manifest incomplete」——与 REQUIRED_MANIFEST_MEMBER_KINDS（11 种必需成员）
 * 不一致。本文件为唯一权威映射，export 与 verify 共用（DRY·防漂移）。
 *
 * 语义：成员缺省（undefined）→ 不产生该 member；verifyReceiptManifest 对必需成员缺失
 * 按协议 fail（禁静默降级·doc19 VS-02/VS-03）。
 *
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch / 桩。
 */

import { createHash } from 'node:crypto';

import type { ProofEnvelopeV2 } from '../../proof_envelope/v2/types.ts';
import type { ReceiptManifestMember } from '../../v2_domain/receipt_manifest.ts';

/**
 * 从 ProofEnvelopeV2 提取全部 11 种必需成员（与 REQUIRED_MANIFEST_MEMBER_KINDS 对齐）。
 *
 * digest = sha256(JSON.stringify(字段))——与 clean-room 独立验证器（independent_verifier）
 * 的重算约定一致（canonical 形态由 producer/verifier 双侧约定·跨语言对拍测试覆盖）。
 */
export function envelopeToManifestMembers(envelope: ProofEnvelopeV2): ReceiptManifestMember[] {
  const members: ReceiptManifestMember[] = [];
  const digest = (s: string): string => {
    return createHash('sha256').update(s, 'utf8').digest('hex');
  };
  const push = (kind: ReceiptManifestMember['kind'], value: unknown): void => {
    if (value === undefined) {
      return; // 字段缺省 → 不产生 member（verifyReceiptManifest 会按必需成员缺失 fail）
    }
    const json = JSON.stringify(value);
    members.push({ kind, digest: digest(json), sizeBytes: json.length });
  };

  push('claim', envelope.claim);
  push('fecSnapshot', envelope.fecSnapshot);
  push('protocolFreeze', envelope.protocolFreeze);
  push('datasetBindings', envelope.datasetBindings);
  push('workflowBindings', envelope.workflowBindings);
  push('experimentRuns', envelope.experimentRuns);
  push('measurementResults', envelope.measurementResults);
  push('statisticalResults', envelope.statisticalResults);
  push('verdictTrace', envelope.verdictTrace);
  push('antiTheaterReport', envelope.antiTheaterReport);
  push('ledgerRoot', envelope.ledgerRoot);

  return members;
}
