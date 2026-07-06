/**
 * ProofEnvelope proofHash: canonical_json(所有字段 - proofHash) → sha256.
 *
 * V1 scope（21 §0 V1 + 33 CROSS-CUT-004）:
 *   V1 proofHash = TS 侧 self-check（sealer 计算 + verifyProofHash 重算同一 computeProofHash）。
 *   「第三方跨语言独立重算」需 Python proof envelope 镜像（repro/far_chain_repro/，V2+ 路线图）；
 *   V1 仅保证 TS 自洽（seal→verify 一致），跨语言 byte-equal 待 V2+ Python 镜像落地。
 *   算法复用 L0 canonicalHash（09 §3「不新增 hash 算法」）：fast-json-stable-stringify + sha256。
 *
 * 关键:
 *   - Python 侧: json.dumps(separators=(',',':'), ensure_ascii=False, sort_keys=True)
 *   - TS 侧: fast-json-stable-stringify (no spaces, consistent key ordering)
 *   - 两者只对有序值数组产生相同输出
 *   - proofHash 字段本身从计算中排除 (self-excluding hash)
 *   - checks/knownFailures 主动排序（见 computeProofHash 内）= V1 防御性序列化，
 *     防「调用方传乱序 checks/knownFailures → proofHash 漂移」；validateProofEnvelope
 *     产出 checks 已是 ruleId 升序（RULES.map），排序对其为 no-op；knownFailures 排序
 *     保证 string[] 顺序无关。V2+ Python 镜像须按同规则排序以保证跨语言一致。
 *
 * 模型中立: 不含任何 qwen/dashscope/bailian 字面量。
 * 零容忍合规: 无 any / @ts-ignore / 空 catch。
 */

import { createHash } from 'node:crypto';
import stableStringify from 'fast-json-stable-stringify';
import type { ProofEnvelope } from './types.ts';

/**
 * 计算 ProofEnvelope 的 proofHash。
 * 排除 proofHash 字段自身,对剩余字段做 canonical_json → sha256。
 *
 * 与 Python canonical_hash 对齐:
 *   - separators: no whitespace between keys/values (fast-json-stable-stringify default)
 *   - sort_keys: consistent key ordering
 *   - ensure_ascii=False: Unicode 直传 (TS JSON 默认 UTF-8)
 */
export function computeProofHash(envelope: Omit<ProofEnvelope, 'proofHash'>): string {
  const { checks, knownFailures, ...rest } = envelope;

  // 对 checks 数组做确定性序列化: 每个 check 按 (ruleId, outcome) 排序
  const sortedChecks = [...checks].sort((a, b) => {
    const ruleCmp = a.ruleId.localeCompare(b.ruleId);
    if (ruleCmp !== 0) return ruleCmp;
    return a.outcome.localeCompare(b.outcome);
  });

  const sortedFailures = [...knownFailures].sort();

  const canonical = stableStringify({
    ...rest,
    checks: sortedChecks,
    knownFailures: sortedFailures,
  });

  if (canonical === undefined) {
    throw new Error('computeProofHash: stable stringify returned undefined');
  }

  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * 独立重算校验: 给定完整 envelope,验证 proofHash 是否正确。
 * 用于 "verification not trust" 演示。
 */
export function verifyProofHash(envelope: ProofEnvelope): boolean {
  const { proofHash, ...fieldsForHash } = envelope;
  const recomputed = computeProofHash(fieldsForHash);
  return recomputed === proofHash;
}
