/**
 * anti_theater schemas —— untrusted JSON → AntiTheaterLintInput 骨架结构校验（#11b）。
 *
 * 职责：far verify --lint-input 读 AntiTheaterLintInput JSON 文件后，从 unknown 安全解析为
 *       AntiTheaterLintInput 骨架（7 顶层字段存在 + 一层立即子节点 discriminator + 1 literal-const）。
 *
 * 设计裁决（决策 A·parser 深度 = 骨架 + 安全网，与 parseProofEnvelopeV2 严格对称）：
 *   - 不全程递归（fec 19 字段树不做全量校验）。skeleton 拒绝大多数结构攻击（删字段/错类型）。
 *   - 深层损坏由双重安全网兜底：
 *       (a) verifyAntiTheaterLint 把 runAntiTheaterLint 包 try/catch → 抛错即 FAIL（src/cli/commands/verify.ts）。
 *       (b) 不抛但与 envelope 内嵌报告不一致 → diffAntiTheaterReport → FAIL。
 *   - 返回 {ok,error}（非 throw）—— 与 parseProofEnvelopeV2 一致，caller 单一 if/else 处理。
 *   - AntiTheaterInputError（errors.ts·死代码）保留作 future zod-wrapper 出口，本任务不复活（最小变更）。
 *
 * 模型中立（F3/C1）：无 qwen/dashscope/openai 字面量。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。untrusted 输入经结构守卫 + 单层 as（配依据）。
 */

import type { AntiTheaterLintInput } from './types.ts';

// ===== 常量 =====

/** FEC 契约版本 literal-const 守卫（镜像 parseProofEnvelopeV2 的 schemaVersion 守卫）。 */
const FEC_CONTRACT_VERSION = 'FEC/2.0';

/** bindings 元素 kind discriminant 合法值（EvidenceBinding 联合的判别字段）。 */
const BINDING_KINDS = new Set<string>(['dataset', 'workflow']);

// ===== 公开 API =====

/**
 * parseAntiTheaterLintInput —— untrusted JSON → AntiTheaterLintInput 骨架结构校验（决策 A）。
 *
 * 校验：7 顶层字段存在 + 正确 shape（object/array/primitive）+ 一层立即子节点 discriminator
 *      （bindings[].kind / measurements[]/runs[] 元素为对象 + metricValue:number）+
 *       fec.contractVersion === 'FEC/2.0' literal-const。
 * 深层语义（hash 自洽/enum 字面量/fec 子结构）委托 runAntiTheaterLint（verify 收集器 try/catch 安全网）。
 *
 * @returns ok:true（input）| ok:false（error·结构错误描述）。
 */
export function parseAntiTheaterLintInput(
  raw: unknown,
): { readonly ok: true; readonly input: AntiTheaterLintInput } | { readonly ok: false; readonly error: string } {
  if (!isPlainObject(raw)) {
    return { ok: false, error: 'AntiTheaterLintInput 根节点须为 JSON 对象' };
  }

  const structErrors: string[] = [];

  // —— fec（顶层对象 + contractVersion literal-const 守卫·所有 detector 都访问 fec.*）——
  const fec = raw.fec;
  if (!isPlainObject(fec)) {
    structErrors.push('fec 须为对象');
  } else if (fec.contractVersion !== FEC_CONTRACT_VERSION) {
    structErrors.push(
      `fec.contractVersion 须为 "${FEC_CONTRACT_VERSION}"（实际: ${JSON.stringify(fec.contractVersion)}）`,
    );
  }

  // —— bindings（数组 + 每元素 kind discriminant·dataset_drift/workflow_digest 用 kind 分流）——
  if (!Array.isArray(raw.bindings)) {
    structErrors.push('bindings 须为数组');
  } else {
    raw.bindings.forEach((binding: unknown, index: number): void => {
      if (!isPlainObject(binding)) {
        structErrors.push(`bindings[${index}] 须为对象`);
      } else if (!BINDING_KINDS.has(binding.kind as string)) {
        structErrors.push(
          `bindings[${index}].kind 须为 'dataset' 或 'workflow'（实际: ${JSON.stringify(binding.kind)}）`,
        );
      }
    });
  }

  // —— executionTrace（对象 + measurements/runs 数组 + 每元素对象·metricValue:number 防 NaN 崩 hash）——
  const executionTrace = raw.executionTrace;
  if (!isPlainObject(executionTrace)) {
    structErrors.push('executionTrace 须为对象');
  } else {
    const measurements = executionTrace.measurements;
    if (!Array.isArray(measurements)) {
      structErrors.push('executionTrace.measurements 须为数组');
    } else {
      measurements.forEach((measurement: unknown, index: number): void => {
        if (!isPlainObject(measurement)) {
          structErrors.push(`executionTrace.measurements[${index}] 须为对象`);
        } else if (typeof measurement.metricValue !== 'number') {
          structErrors.push(`executionTrace.measurements[${index}].metricValue 须为 number`);
        }
      });
    }
    const runs = executionTrace.runs;
    if (!Array.isArray(runs)) {
      structErrors.push('executionTrace.runs 须为数组');
    } else {
      runs.forEach((run: unknown, index: number): void => {
        if (!isPlainObject(run)) {
          structErrors.push(`executionTrace.runs[${index}] 须为对象`);
        }
      });
    }
  }

  // —— verdict（对象 + verdict:string + scopeReport 对象·fake_degraded/report_mismatch 直接访问）——
  const verdict = raw.verdict;
  if (!isPlainObject(verdict)) {
    structErrors.push('verdict 须为对象');
  } else {
    if (typeof verdict.verdict !== 'string') {
      structErrors.push('verdict.verdict 须为 string');
    }
    if (!isPlainObject(verdict.scopeReport)) {
      structErrors.push('verdict.scopeReport 须为对象');
    }
  }

  // —— envelopeDraft（对象 + humanSummary:string + nullResults 数组·report_mismatch/fake_degraded 访问）——
  const envelopeDraft = raw.envelopeDraft;
  if (!isPlainObject(envelopeDraft)) {
    structErrors.push('envelopeDraft 须为对象');
  } else {
    if (typeof envelopeDraft.humanSummary !== 'string') {
      structErrors.push('envelopeDraft.humanSummary 须为 string');
    }
    if (!Array.isArray(envelopeDraft.nullResults)) {
      structErrors.push('envelopeDraft.nullResults 须为数组');
    }
  }

  // —— preregistrationRecord（对象 + alpha:number + toleranceFrozen:boolean + optional freeze 数组）——
  const preregistrationRecord = raw.preregistrationRecord;
  if (!isPlainObject(preregistrationRecord)) {
    structErrors.push('preregistrationRecord 须为对象');
  } else {
    if (typeof preregistrationRecord.alpha !== 'number') {
      structErrors.push('preregistrationRecord.alpha 须为 number');
    }
    if (typeof preregistrationRecord.toleranceFrozen !== 'boolean') {
      structErrors.push('preregistrationRecord.toleranceFrozen 须为 boolean');
    }
    const datasetFreezeRecords = preregistrationRecord.datasetFreezeRecords;
    if (datasetFreezeRecords !== undefined && !Array.isArray(datasetFreezeRecords)) {
      structErrors.push('preregistrationRecord.datasetFreezeRecords 须为数组（若提供）');
    }
    const workflowFreezeRecords = preregistrationRecord.workflowFreezeRecords;
    if (workflowFreezeRecords !== undefined && !Array.isArray(workflowFreezeRecords)) {
      structErrors.push('preregistrationRecord.workflowFreezeRecords 须为数组（若提供）');
    }
  }

  // —— runRegistry（对象 + runs/declaredNullResults 数组·seed_cherry/fake_degraded 遍历）——
  const runRegistry = raw.runRegistry;
  if (!isPlainObject(runRegistry)) {
    structErrors.push('runRegistry 须为对象');
  } else {
    if (!Array.isArray(runRegistry.runs)) {
      structErrors.push('runRegistry.runs 须为数组');
    }
    if (!Array.isArray(runRegistry.declaredNullResults)) {
      structErrors.push('runRegistry.declaredNullResults 须为数组');
    }
  }

  if (structErrors.length > 0) {
    return { ok: false, error: `AntiTheaterLintInput 结构不完整: ${structErrors.join('; ')}` };
  }

  // 单层 as 经结构守卫保证（零容忍 #1：untrusted 输入不裸 cast·禁止 `as unknown as` 双重断言）。
  // isPlainObject 守卫已把 raw 收窄为 Record<string,unknown>（TS 拒绝 Record→接口直接断言），
  // 故先经 `const input: unknown = raw` 赋值合法放宽回 unknown（赋值非断言），再做唯一一次 unknown→T 断言。
  // 上方守卫已保证 7 字段存在 + 一层立即子节点 discriminator；
  // 深层字段缺失由 verifyAntiTheaterLint 的 try/catch 安全网捕获为 FAIL（非静默错误）。
  const input: unknown = raw;
  return { ok: true, input: input as AntiTheaterLintInput };
}

// ===== 辅助（本文件私有·避免跨 CLI 层 import 破坏 anti_theater 层独立性）=====

/** isPlainObject —— 排除 null/数组的普通对象守卫（镜像 verify.ts 同名 helper）。 */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
