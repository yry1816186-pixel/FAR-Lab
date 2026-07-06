/**
 * anti_theater detector —— AT-WORKFLOW-DIGEST（工作流摘要伪造检测）。
 *
 * 攻击语义（AT-WORKFLOW-DIGEST · workflow-digest-mismatch）：
 *   工作流绑定 trace（WorkflowBindingTrace）声明的工作流三件套摘要
 *   （workflowHash / containerDigest / environmentHash）与预注册时 freeze 的值不一致。
 *   不一致意味着实际跑的工作流 ≠ 预注册声明的工作流（代码 / 容器 / 环境漂移），
 *   属于"事后偷换工作流"的剧场攻击 → 必须 BLOCK（拒绝 seal CONFIRMED）。
 *
 * 检测逻辑（APPENDIX_E §2 伪代码）：
 *   遍历 input.bindings 中 kind==='workflow' 的绑定 wb：
 *     frozen = lookup_freeze_record(wb.workflowId)
 *     —— frozen 从 input.preregistrationRecord.workflowFreezeRecords 按 workflowId 查找；
 *        workflowFreezeRecords 缺失或未命中 → 跳过该绑定（无 freeze 记录无法对账·不臆造误报）。
 *     三路比对（expected=frozen 字段非空时才检查·空字符串视为"未声明"跳过，避免误报）：
 *       workflowHash 不等    → WORKFLOW_HASH_MISMATCH
 *       containerDigest 不等 → CONTAINER_DIGEST_MISMATCH
 *       environmentHash 不等 → ENV_HASH_MISMATCH
 *     每路不等产 1 个 finding（outcome=FAIL·blockSeal=true·升级 severity=BLOCK）。
 *
 * 安全关键保证（承诺误报率=0）：
 *   - 纯字符串精确比较（===），无近似匹配 / 无启发式 / 无 LLM 判定。
 *   - 仅当 freeze 记录存在且对应字段非空时才比对；冻结端缺失即跳过，绝不产 finding。
 *   - 确定性：相同输入恒产相同输出，不读 FS / 网络 / 时钟。
 *
 * 模型中立（F3/C1）：无 qwen / dashscope / openai 字面量。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。纯函数，不 mutate input。
 */

import type {
  AntiTheaterLintInput,
  DetectorFinding,
  WorkflowBindingTrace,
  WorkflowFreezeRecord,
} from '../types.ts';
import { makeFinding } from '../finding_factory.ts';

/**
 * 检测工作流摘要伪造（AT-WORKFLOW-DIGEST）。
 *
 * 遍历 workflow 绑定，与预注册 freeze 记录逐字段精确比对 workflowHash /
 * containerDigest / environmentHash；任一不等即产 FAIL finding（blockSeal=true）。
 *
 * @param input 反剧场 lint 输入（7 字段·本 detector 消费 bindings + preregistrationRecord）
 * @returns 发现列表（无发现返回 []）；纯函数·确定性·不 mutate input·不读 FS/网络。
 */
export function detect_workflow_digest(input: AntiTheaterLintInput): readonly DetectorFinding[] {
  const findings: DetectorFinding[] = [];

  const freezeRecords = input.preregistrationRecord.workflowFreezeRecords;
  // workflowFreezeRecords 缺失（W3 MVP 可缺）→ 无 frozen 端可对账，跳过全部 workflow 绑定。
  // 诚实边界：不臆造 frozen 值，不产误报。
  if (freezeRecords === undefined) {
    return findings;
  }

  // workflowId → WorkflowFreezeRecord 索引（O(n) 建表后 O(1) 查找；总复杂度 O(bindings + freezes)）。
  const freezeIndex = buildFreezeIndex(freezeRecords);

  for (const binding of input.bindings) {
    // kind 判别符分流：仅处理 workflow 绑定（dataset 绑定由 AT-DATA-DRIFT / AT-DATA-HASH-FAKE 负责）。
    if (binding.kind !== 'workflow') {
      continue;
    }

    const frozen = freezeIndex.get(binding.workflowId);
    // 该 workflowId 无对应 freeze 记录 → 无 frozen 端可对账，跳过（不产误报）。
    if (frozen === undefined) {
      continue;
    }

    // 三路精确比对。expected（frozen 端字段）非空字符串时才检查；
    // 空字符串视为"frozen 未声明该字段"→跳过，避免对未声明字段产误报。
    appendIfMismatch(
      findings,
      binding,
      frozen,
      'workflowHash',
      'WORKFLOW_HASH_MISMATCH',
      'WORKFLOW_HASH',
    );
    appendIfMismatch(
      findings,
      binding,
      frozen,
      'containerDigest',
      'CONTAINER_DIGEST_MISMATCH',
      'CONTAINER_DIGEST',
    );
    appendIfMismatch(
      findings,
      binding,
      frozen,
      'environmentHash',
      'ENV_HASH_MISMATCH',
      'ENV_HASH',
    );
  }

  return findings;
}

/**
 * 按 workflowId 构建 freeze 记录索引。
 * 重复 workflowId 时以首个为准（freeze 记录由预注册阶段单次写入，重复属上游不变量违反，
 * 此处不抛错以保持纯 lint 语义，取首个保证确定性）。
 */
function buildFreezeIndex(
  records: readonly WorkflowFreezeRecord[],
): ReadonlyMap<string, WorkflowFreezeRecord> {
  const index = new Map<string, WorkflowFreezeRecord>();
  for (const record of records) {
    if (!index.has(record.workflowId)) {
      index.set(record.workflowId, record);
    }
  }
  return index;
}

/**
 * 单字段 frozen vs executed 精确比对：frozen 非空且与 actual 不等 → 产 1 个 BLOCK finding。
 *
 * @param findings 累积列表（push 产出·调用方持有引用）
 * @param binding  workflow 绑定（executed 端·字段读取源）
 * @param frozen   workflow freeze 记录（frozen 端·字段比对源）
 * @param field    比对字段名（'workflowHash' | 'containerDigest' | 'environmentHash'）
 * @param reasonCode 机器可读原因代码（WORKFLOW_HASH_MISMATCH / CONTAINER_DIGEST_MISMATCH / ENV_HASH_MISMATCH）
 * @param suffixKey  findingIdSuffix 用大写字段名（WORKFLOW_HASH / CONTAINER_DIGEST / ENV_HASH）
 */
function appendIfMismatch(
  findings: DetectorFinding[],
  binding: WorkflowBindingTrace,
  frozen: WorkflowFreezeRecord,
  field: 'workflowHash' | 'containerDigest' | 'environmentHash',
  reasonCode: string,
  suffixKey: string,
): void {
  const actual = binding[field];
  const expected = frozen[field];

  // expected 非空字符串时才比对（空字符串视为 frozen 未声明该字段，跳过以避免误报）。
  if (expected === '') {
    return;
  }
  // 精确字符串比较：相同 workflow 不同字段值即 mismatch（误报率=0 的基石）。
  if (actual !== expected) {
    findings.push(
      makeFinding({
        attackId: 'AT-WORKFLOW-DIGEST',
        outcome: 'FAIL',
        reasonCode,
        // affectedProofHashInputs 指向 workflow 绑定 trace 的对应字段路径（APPENDIX_E §7.2）。
        affectedProofHashInputs: [`workflowBindings[${binding.workflowId}].${field}`],
        evidenceRef: `workflowBindings[${binding.workflowId}].${field}`,
        message: `Workflow digest mismatch for workflowId '${binding.workflowId}': ${field} field actual='${actual}' != frozen='${expected}' (preregistration freeze record violated)`,
        remediation: `Restore the preregistered ${field} for workflow '${binding.workflowId}', or re-register a new FEC with the updated workflow and re-run the experiment from scratch.`,
        findingIdSuffix: suffixKey,
        blockSeal: true,
      }),
    );
  }
}
