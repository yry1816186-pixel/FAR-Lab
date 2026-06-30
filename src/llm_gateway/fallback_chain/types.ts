/**
 * FallbackChain 类型层契约（spec 05 §8.2 / §9 / spec 24 §5）。
 *
 * 设计：引擎**模型无关 + 调用方注入**（caller injection）。
 *   - executeFallbackChain 接收 chain（FallbackModelTarget[]）+ caller（注入的调用函数）。
 *   - 生产：caller 包装真实百炼 adapter 调用。
 *   - 测试：caller 是确定性 mock（按 modelId 抛特定错误）——离线可全测触发矩阵/链路遍历。
 *
 * 诚实铁律（F11 · spec 24 §5）：绝不静默换模型。每次 fallback 在 attempts[] 留痕，
 *   degradationSummary 非空——上游 call_records 记 degraded_from + reason + trigger_signal。
 *
 * D3 红线（spec 24 §5·引擎通用机制）：命中 invalidatesD3 target（非国产基座）→ invalidatesD3=true。
 *   注：V1 生产 COMPETITION_FALLBACK_CHAIN 已删 deepseek（3 元素 Qwen-only·evo-01·24 §5 2026-06），
 *   本机制保留为防御性——未来若引入非国产基座仍触发诚实声明。
 *
 * 模型中立：本文件不含任何 qwen/dashscope 字面量（链定义在 adapters/aliyun_qwen/fallback_config.ts）。
 * 零容忍合规：无 any / @ts-ignore / 空 catch / 双重断言。
 */

/**
 * 单个降级链目标模型。
 * @param modelId 模型标识（进 call_records.model）。
 * @param invalidatesD3 非国产基座 → true（失 D3 红线·必须诚实声明）。V1 生产 chain 无此 target（deepseek 已删·evo-01）。
 * @param role 审计角色标签（primary / backup_1 / backup_2 / last_resort）。
 */
export interface FallbackModelTarget {
  readonly modelId: string;
  readonly invalidatesD3?: boolean;
  readonly role?: string;
}

/** 单次尝试的结局。 */
export type FallbackAttemptOutcome = 'success' | 'fallback' | 'fatal' | 'skipped';

/**
 * 链路中单次尝试的审计记录（进 attempts[]——降级留痕，绝不静默换 F11）。
 * @param triggerSignal 触发信号（'http_429' / 'timeout' / 'network' / 'http_400' / 'non_qwen_model' / ...）。
 * @param reason 人类可读原因（写 call_records.reason）。
 * @param dashscopeRequestId 失败响应的 DashScope 请求 id（可能为 null）。
 */
export interface FallbackAttempt {
  readonly modelId: string;
  readonly outcome: FallbackAttemptOutcome;
  readonly triggerSignal: string | null;
  readonly reason: string | null;
  readonly dashscopeRequestId: string | null;
}

/**
 * 触发矩阵判定结果（spec 05 §9.2）。
 * @param fallback 是否触发降级（true=继续下一个 target；false=致命·终止整链）。
 */
export interface ShouldFallbackResult {
  readonly fallback: boolean;
  readonly triggerSignal: string;
  readonly reason: string;
}

/**
 * caller 注入契约：调用一个 target，成功返回 {data, dashscopeRequestId}。
 * 生产实现包装真实百炼 adapter；测试用确定性实现。
 */
export interface FallbackCallerResult<TData> {
  readonly data: TData;
  readonly dashscopeRequestId: string | null;
}
export type FallbackCaller<TData> = (target: FallbackModelTarget) => Promise<FallbackCallerResult<TData>>;

/**
 * 降级链执行结果。
 * @param data 最终成功响应（chainExhausted/fatal 时为 null）。
 * @param succeededModelId 成功命中的 modelId（失败时 null）。
 * @param attempts 全部尝试的审计轨迹（绝不静默换·F11 留痕）。
 * @param degradedFrom 降级起点（primary modelId）；仅当发生过降级才非 null。
 * @param degradationCount 降级次数（= attempts.length - 1，成功时；耗尽时 = chain.length）。
 * @param chainExhausted 全部 target 都 fallback 但无成功（true 时 data=null）。
 * @param fatalEncountered 遇到致命错误（4xx/config）提前终止（true 时 data=null）。
 * @param invalidatesD3 是否命中非国产基座成功 → 失 D3 红线·必须诚实声明。V1 生产 chain 无此 target（deepseek 已删·evo-01）。
 * @param degradationSummary 降级摘要（写 call_records.degradationReason）；无降级时为 null。
 */
export interface FallbackChainResult<TData> {
  readonly data: TData | null;
  readonly succeededModelId: string | null;
  readonly attempts: readonly FallbackAttempt[];
  readonly degradedFrom: string | null;
  readonly degradationCount: number;
  readonly chainExhausted: boolean;
  readonly fatalEncountered: boolean;
  readonly invalidatesD3: boolean;
  readonly degradationSummary: string | null;
}
