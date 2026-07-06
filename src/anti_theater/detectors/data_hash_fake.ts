/**
 * anti_theater detector —— AT-DATA-HASH-FAKE（数据集 contentHash 伪造检测）。
 *
 * 攻击语义：实验声明 dataset binding 的 contentHash 是整数据集指纹，但实际底层数据块
 *   的 chunkHashes 重组 Merkle root ≠ contentHash → 说明 contentHash 被伪造
 *   （或底层数据与冻结指纹不一致）。任何一条对不上即阻断 seal（伪造 integrity 根 = 最严重）。
 *
 * 算法（确定性·纯函数·不读 FS/网络·不 mutate input）：
 *   for binding in input.bindings:
 *     if binding.kind !== 'dataset': continue
 *     if binding.chunkHashes 缺或空: skip（PARTIAL/W4：无法重算·不臆断）
 *     actual = computeMerkleRoot(binding.chunkHashes)
 *     if actual !== binding.contentHash: emit DATASET_HASH_FORGERY finding
 *
 * R6 MVP 退化裁决（必读）：
 *   - 伪代码 recompute_merkle_root(binding.chunkHashes) 假设 chunkHashes 恒存在。
 *   - 实际 DatasetBindingTrace.chunkHashes 为 optional（见 types.ts:303），生产 trace 可缺。
 *   - 当 chunkHashes 缺/空时，本 detector 无法重算 Merkle root → 跳过该 binding（不臆断伪造）。
 *     这维持误报率=0（无证据不下结论），代价是漏检（PARTIAL/W4 ROADMAP：未来补 chunkHashes
 *     全量强制化或 contentHash 格式校验）。详见 06_ROADMAP_AND_DOD.md §5.3 W4。
 *   - chunkHashes 非空时：computeMerkleRoot 对非法 64-hex 叶会 throw（见 merkle_root.ts:301-310），
 *     本 detector 不静默 coerce——让异常向上传播（lint 入口负责兜底，detector 自身保持纯函数语义）。
 *
 * 模型中立（F3/C1）：无 qwen/dashscope/openai 字面量。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。
 */

import type { AntiTheaterLintInput, DetectorFinding } from '../types.ts';
import { makeFinding } from '../finding_factory.ts';
import { computeMerkleRoot } from '../../evidence_log/merkle_root.ts';

/**
 * 检测数据集 contentHash 伪造（Merkle root 重算比对）。
 *
 * @param input AntiTheaterLintInput（消费 bindings[kind==='dataset']）
 * @returns 发现列表（无发现 → []；每条伪造 binding 一条 DATASET_HASH_FORGERY finding）
 */
export function detect_data_hash_fake(input: AntiTheaterLintInput): readonly DetectorFinding[] {
  const findings: DetectorFinding[] = [];

  for (const binding of input.bindings) {
    if (binding.kind !== 'dataset') {
      continue;
    }

    // R6 MVP 退化：chunkHashes 缺/空 → 无法重算 Merkle root，跳过（不臆断）。
    // binding.kind==='dataset' 守卫已将 binding 收窄为 DatasetBindingTrace，直接访问 chunkHashes。
    const chunkHashes = binding.chunkHashes;
    if (chunkHashes === undefined || chunkHashes.length === 0) {
      continue;
    }

    const actualRoot = computeMerkleRoot(chunkHashes);
    if (actualRoot !== binding.contentHash) {
      findings.push(
        makeFinding({
          attackId: 'AT-DATA-HASH-FAKE',
          outcome: 'FAIL',
          reasonCode: 'DATASET_HASH_FORGERY',
          evidenceRef: `bindings[dataset:${binding.datasetId}].contentHash`,
          message: `Dataset '${binding.datasetId}' contentHash forged: recomputed Merkle root '${actualRoot}' !== declared contentHash '${binding.contentHash}' (${chunkHashes.length} chunk(s)).`,
          affectedProofHashInputs: [
            `bindings[dataset:${binding.datasetId}].contentHash`,
            `bindings[dataset:${binding.datasetId}].chunkHashes`,
          ],
          remediation:
            'Re-freeze the dataset contentHash from the actual chunkHashes (sha256-based Merkle root), or restore the original data chunks so their Merkle root matches the declared contentHash.',
          findingIdSuffix: `DATASET_${binding.datasetId}`,
          blockSeal: true,
        }),
      );
    }
  }

  return findings;
}
