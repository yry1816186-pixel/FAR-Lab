/**
 * anti_theater detector —— AT-DATA-DRIFT（数据集三层 hash 漂移检测）。
 *
 * 攻击语义：数据集 binding 声明的 contentHash / schemaHash / statsFingerprint 与预注册时
 *   freeze 的对应字段不一致 → 数据集在 freeze 后被静默替换或漂移（drift），导致实验
 *   在与声明不同的数据上跑通。contentHash/schemaHash 漂移阻断 seal（FAIL）；
 *   statsFingerprint 漂移为告警（WARN，统计指纹可能因合法采样波动变化，但仍需人工核验）。
 *
 * 算法（确定性·纯函数·不读 FS/网络·不 mutate input）：
 *   frozenMap = { record.datasetId -> record } from input.preregistrationRecord.datasetFreezeRecords
 *   for binding in input.bindings:
 *     if binding.kind !== 'dataset': continue
 *     frozen = frozenMap[binding.datasetId]
 *     if frozen is undefined: skip（无 freeze 基准 → 不判·维持误报率=0，见下方退化裁决）
 *     if binding.contentHash !== frozen.contentHash:
 *       emit FAIL DATASET_HASH_MISMATCH (suffix='-CONTENT_HASH')
 *     if binding.schemaHash !== frozen.schemaHash:
 *       emit FAIL DATASET_SCHEMA_MISMATCH (suffix='-SCHEMA_HASH')
 *     if binding.statsFingerprint 非空 && binding.statsFingerprint !== frozen.statsFingerprint:
 *       emit WARN DATASET_STATS_MISMATCH (suffix='-STATS_FINGERPRINT')
 *
 * 退化裁决（PARTIAL/W4·必读）：
 *   - 伪代码 lookup_freeze_record(binding.datasetId) 假设每个 binding 都有对应 freeze 记录。
 *     实际 PreregistrationRecord.datasetFreezeRecords 为 optional（见 types.ts:274），且生产
 *     freeze 记录可能不全。当某 binding 找不到 frozen 基准时，本 detector 跳过该 binding
 *     （不臆断漂移）——维持误报率=0（无基准不下结论），代价是漏检（PARTIAL/W4 ROADMAP：
 *     未来在 FEC compiler 层强制 datasetFreezeRecords 覆盖所有 datasetRequirements）。
 *   - statsFingerprint 为空字符串时不触发 stats 检查（对齐伪代码 truthy 守卫·空指纹视为未声明）。
 *
 * 模型中立（F3/C1）：无 qwen/dashscope/openai 字面量。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。纯函数·确定性·不 mutate input·不读 FS/网络。
 */

import type {
  AntiTheaterLintInput,
  DatasetFreezeRecord,
  DetectorFinding,
} from '../types.ts';
import { makeFinding } from '../finding_factory.ts';

/** attackId（ATTACK_ID_TO_KIND['AT-DATA-DRIFT'] = 'dataset-drift'·makeFinding 校验）。 */
const ATTACK_ID = 'AT-DATA-DRIFT';

/**
 * 检测数据集三层 hash 漂移（contentHash/schemaHash/statsFingerprint vs 预注册 freeze 记录）。
 *
 * @param input AntiTheaterLintInput（消费 bindings[kind==='dataset'] + preregistrationRecord.datasetFreezeRecords）
 * @returns 发现列表（无发现 → []；每条漂移 binding 可产 0-3 条 finding，attackId 相同用 findingIdSuffix 区分）
 */
export function detect_dataset_drift(input: AntiTheaterLintInput): readonly DetectorFinding[] {
  const findings: DetectorFinding[] = [];

  // frozen 端：从 preregistrationRecord.datasetFreezeRecords 构建 datasetId -> record 查找表。
  // datasetFreezeRecords 为 optional（PARTIAL/W4 退化·见文件头）：缺时整个 detector 无基准 → 全部跳过。
  const freezeRecords = input.preregistrationRecord.datasetFreezeRecords;
  const frozenByDatasetId = new Map<string, DatasetFreezeRecord>();
  if (freezeRecords !== undefined) {
    for (const record of freezeRecords) {
      frozenByDatasetId.set(record.datasetId, record);
    }
  }

  for (const binding of input.bindings) {
    if (binding.kind !== 'dataset') {
      continue;
    }

    // 退化裁决：无 freeze 基准 → 跳过该 binding（不臆断漂移·维持误报率=0）。
    const frozen = frozenByDatasetId.get(binding.datasetId);
    if (frozen === undefined) {
      continue;
    }

    // binding.kind === 'dataset' 已由上文 continue 收窄为 DatasetBindingTrace（判别式 union narrowing），
    // 故 ds 直接赋值 binding 即可访问 datasetId/contentHash/schemaHash/statsFingerprint（无需 as 断言）。
    const ds = binding;
    const dsId = ds.datasetId;

    // 子路径 1：contentHash 不等 → FAIL DATASET_HASH_MISMATCH。
    if (ds.contentHash !== frozen.contentHash) {
      findings.push(
        makeFinding({
          attackId: ATTACK_ID,
          outcome: 'FAIL',
          reasonCode: 'DATASET_HASH_MISMATCH',
          evidenceRef: `bindings[dataset:${dsId}].contentHash`,
          message:
            `Dataset '${dsId}' contentHash drifted: declared '${ds.contentHash}' !== frozen '${frozen.contentHash}' ` +
            '(dataset replaced or mutated after pre-registration freeze).',
          affectedProofHashInputs: [`bindings[dataset:${dsId}].contentHash`],
          remediation:
            'Re-freeze the dataset contentHash from the current data, or restore the frozen dataset so its contentHash matches the pre-registration record.',
          findingIdSuffix: `CONTENT_HASH-${dsId}`,
        }),
      );
    }

    // 子路径 2：schemaHash 不等 → FAIL DATASET_SCHEMA_MISMATCH。
    if (ds.schemaHash !== frozen.schemaHash) {
      findings.push(
        makeFinding({
          attackId: ATTACK_ID,
          outcome: 'FAIL',
          reasonCode: 'DATASET_SCHEMA_MISMATCH',
          evidenceRef: `bindings[dataset:${dsId}].schemaHash`,
          message:
            `Dataset '${dsId}' schemaHash drifted: declared '${ds.schemaHash}' !== frozen '${frozen.schemaHash}' ` +
            '(dataset schema modified after pre-registration freeze).',
          affectedProofHashInputs: [`bindings[dataset:${dsId}].schemaHash`],
          remediation:
            'Re-freeze the dataset schemaHash from the current schema, or restore the frozen dataset schema so its schemaHash matches the pre-registration record.',
          findingIdSuffix: `SCHEMA_HASH-${dsId}`,
        }),
      );
    }

    // 子路径 3：statsFingerprint 非空且不等 → WARN DATASET_STATS_MISMATCH（truthy 守卫·空指纹视为未声明）。
    if (ds.statsFingerprint !== '' && ds.statsFingerprint !== frozen.statsFingerprint) {
      findings.push(
        makeFinding({
          attackId: ATTACK_ID,
          outcome: 'WARN',
          reasonCode: 'DATASET_STATS_MISMATCH',
          evidenceRef: `bindings[dataset:${dsId}].statsFingerprint`,
          message:
            `Dataset '${dsId}' statsFingerprint drifted: declared '${ds.statsFingerprint}' !== frozen '${frozen.statsFingerprint}' ` +
            '(dataset summary statistics changed after freeze; may indicate sampling drift or benign re-aggregation — human review required).',
          affectedProofHashInputs: [`bindings[dataset:${dsId}].statsFingerprint`],
          remediation:
            'Confirm whether the statsFingerprint change is benign (e.g. legitimate re-aggregation) or indicates drift; re-freeze the fingerprint if intentional.',
          findingIdSuffix: `STATS_FINGERPRINT-${dsId}`,
        }),
      );
    }
  }

  return findings;
}
