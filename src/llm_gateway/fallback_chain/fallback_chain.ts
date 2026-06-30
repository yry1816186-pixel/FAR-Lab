/**
 * FallbackChain 执行引擎（spec 05 §8.2 / spec 24 §5）。
 *
 * 职责：遍历降级链，按触发矩阵在每个失败 target 上决定 fallback / fatal，
 * 全程留痕（attempts[] + degradationSummary），绝不静默换模型（F11）。
 *
 * 设计：模型无关 + caller 注入。
 *   - 生产 caller：包装真实百炼 adapter（callBailianForCred + extractRequestId）。
 *   - 测试 caller：确定性 mock——按 modelId 抛特定错误，离线全测触发矩阵/链路/耗尽/D3。
 *
 * 与 retry_policy 的正交关系：
 *   retry = 同模型内瞬时错误退避重试（429/503 backoff）；
 *   fallback = 跨模型切换（持续失败）。两者可组合：caller 内部先 retry，retry 耗尽后抛错触发 fallback。
 *   V1 引擎不内嵌 retry（保持单一职责；组合由 caller 决定）。
 *
 * 不抛错策略：链路耗尽 / 致命错误 → 返回结构化结果（data=null, chainExhausted/fatalEncountered=true），
 * 由调用方（run_stage）决定后续（throw RETRY_EXHAUSTED 或降级标 degraded）。依赖反转·可组合。
 *
 * 模型中立。零容忍合规：无 any / @ts-ignore / 空 catch / 双重断言。
 */

import { shouldFallback } from './error_classifier.ts';
import { BailianHttpError } from './errors.ts';
import type {
  FallbackAttempt,
  FallbackCaller,
  FallbackChainResult,
  FallbackModelTarget,
} from './types.ts';

/** 从错误对象安全提取 DashScope 请求 id（仅 BailianHttpError 携带）。 */
function requestIdFromError(error: unknown): string | null {
  if (error instanceof BailianHttpError) {
    return error.dashscopeRequestId;
  }
  return null;
}

/**
 * 构造降级摘要（写 call_records.degradationReason）。
 * 无降级（首个 target 成功）→ null。
 * 有降级 → `degraded A → B (trigger: http_429 @ step 1, timeout @ step 2)`。
 */
function buildSummary(
  attempts: readonly FallbackAttempt[],
  primaryModelId: string,
  succeededModelId: string | null,
): string | null {
  // 仅 1 次尝试且成功 → 无降级。
  if (attempts.length <= 1 && succeededModelId !== null) {
    return null;
  }
  const failedSteps = attempts
    .filter((a) => a.outcome !== 'success')
    .map((a, idx) => {
      const step = idx + 1;
      const trigger = a.triggerSignal ?? 'unknown';
      return `${a.modelId}(${trigger}@${step})`;
    })
    .join(' → ');

  if (succeededModelId !== null) {
    return `degraded ${primaryModelId} → ${succeededModelId} via [${failedSteps}]`;
  }
  // 全部失败（耗尽或致命）。
  return `chain failed: ${primaryModelId} → ${failedSteps} → NO_SUCCESS`;
}

/**
 * 执行降级链。
 *
 * @param chain 降级目标序列（首位 = primary degradedFrom）。
 * @param caller 注入的调用函数（生产=真实百炼；测试=确定性 mock）。
 * @returns FallbackChainResult（绝不抛错——耗尽/致命返回 data=null 结构化结果）。
 *
 * @throws 仅当 chain 为空（配置错误·降级起点未定义）。
 */
export async function executeFallbackChain<TData>(
  chain: readonly FallbackModelTarget[],
  caller: FallbackCaller<TData>,
): Promise<FallbackChainResult<TData>> {
  const primaryTarget = chain[0];
  if (primaryTarget === undefined) {
    throw new Error('fallback_chain: empty chain (primary degradedFrom undefined)');
  }
  const primary = primaryTarget.modelId;
  const attempts: FallbackAttempt[] = [];
  let invalidatesD3 = false;

  for (const target of chain) {
    try {
      const { data, dashscopeRequestId } = await caller(target);
      attempts.push({
        modelId: target.modelId,
        outcome: 'success',
        triggerSignal: null,
        reason: null,
        dashscopeRequestId,
      });
      // 命中非国产基座 → 标失 D3（spec 24 §5）。注：V1 生产 chain 无此 target（deepseek 已删·evo-01），机制保留防御性。
      if (target.invalidatesD3 === true) {
        invalidatesD3 = true;
      }
      const succeededModelId = target.modelId;
      return {
        data,
        succeededModelId,
        attempts,
        degradedFrom: attempts.length > 1 ? primary : null,
        degradationCount: Math.max(0, attempts.length - 1),
        chainExhausted: false,
        fatalEncountered: false,
        invalidatesD3,
        degradationSummary: buildSummary(attempts, primary, succeededModelId),
      };
    } catch (error) {
      const verdict = shouldFallback(error);
      attempts.push({
        modelId: target.modelId,
        outcome: verdict.fallback ? 'fallback' : 'fatal',
        triggerSignal: verdict.triggerSignal,
        reason: verdict.reason,
        dashscopeRequestId: requestIdFromError(error),
      });

      if (!verdict.fallback) {
        // 致命错误（4xx / config / 未知）→ F11：绝不静默换，立即终止整链。
        return {
          data: null,
          succeededModelId: null,
          attempts,
          degradedFrom: attempts.length > 1 ? primary : null,
          degradationCount: Math.max(0, attempts.length - 1),
          chainExhausted: false,
          fatalEncountered: true,
          invalidatesD3,
          degradationSummary: buildSummary(attempts, primary, null),
        };
      }
      // verdict.fallback === true → 继续下一个 target（循环）。
    }
  }

  // 链路遍历完毕且无成功 → 耗尽（全部 target 都触发 fallback 但无人成功）。
  return {
    data: null,
    succeededModelId: null,
    attempts,
    degradedFrom: attempts.length > 1 ? primary : null,
    degradationCount: attempts.length,
    chainExhausted: true,
    fatalEncountered: false,
    invalidatesD3,
    degradationSummary: buildSummary(attempts, primary, null),
  };
}
