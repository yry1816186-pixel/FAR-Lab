/**
 * retry_policy —— 百炼 429/503 退避 + 每阶段 token 上限表。
 *
 * 设计要点：
 *   - 仅对瞬态错误（429/503）退避重试；400/401/403/404/500/502 立即 fatal（不重试）。
 *   - 指数退避：baseDelayMs * 2^attempt（1s/2s/4s）。
 *   - maxRetries 是「额外重试次数」：maxRetries=3 意味着最多 4 次尝试（1 + 3 重试）。
 *   - MAX_TOKENS_TABLE 是每阶段 token 上限 SSOT（防 LLM 啰嗦烧配额·宪法 §5.2 算力预算闸）。
 *
 * 零容忍合规：
 *   - 无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 *   - isTransient 用 type guard 从 unknown 安全收窄（禁单层 as 强转结构）。
 */

import type { StageId } from './types.ts';


// ---------- §7.4 MAX_TOKENS_TABLE（每阶段 token 上限 SSOT） ----------

/**
 * 每阶段 token 上限（防 LLM 啰嗦烧配额）。
 *
 * StageId union 含 stage0_dialogue（M-1·dialogueMode=enabled 时触发），
 * Record<StageId, number> 须 7 键全覆盖，否则 TS2741。
 *
 * stage0_dialogue 复用 understanding 输出语义（产 ResearchThoughtFramework·§2 表），
 * 2000 token 足够。
 */
export const MAX_TOKENS_TABLE: Readonly<Record<StageId, number>> = {
  stage0_dialogue: 2000,
  stage1_understanding: 2000,
  stage2_integration: 4000,
  stage3_hypothesis: 3000, // 假设需精炼
  stage4_evidence: 6000, // 证据梳理需较长
  stage5_plan: 4000,
  stage6_feedback: 2000,
} as const;


// ---------- §7.3 withRetry（指数退避·仅瞬态错误） ----------

/** Input parameters for operations involving retry options. */
export interface RetryOptions {
  /** 额外重试次数（默认 3·总尝试 = 1 + maxRetries） */
  readonly maxRetries: number;
  /** 退避基数（默认 1000ms·指数 2^attempt） */
  readonly baseDelayMs: number;
}

/** Constant: DEFAULT_RETRY_OPTIONS. */
export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
};

/**
 * 指数退避重试（仅对 429/503 这类瞬态错误）。
 *
 * 400/401/403/404/500/502 立即 fatal（不重试）——这些是配置/请求错误，
 * 重试无意义且烧配额。
 *
 * @param fn 待重试的异步操作
 * @param opts 重试参数（默认 maxRetries=3 / baseDelayMs=1000）
 * @returns fn 的成功返回值
 * @throws 原始错误（非瞬态或重试耗尽时）或 RETRY_EXHAUSTED（理论不可达·循环内已处理）
 *
 * [已实证·百炼 fallback 触发矩阵·smoke 验证通过]
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = DEFAULT_RETRY_OPTIONS,
): Promise<T> {
  let lastErr: unknown = undefined;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // 非瞬态错误 或 已达最大重试次数 → 立即抛出原错误
      if (!isTransient(err) || attempt === opts.maxRetries) {
        throw err;
      }
      // 瞬态错误 + 仍有重试余量 → 指数退避
      const delay = opts.baseDelayMs * Math.pow(2, attempt);
      await sleep(delay);
    }
  }

  // 理论不可达：循环内 attempt === maxRetries 时已 throw。
  // 保留兜底以通过 TS 控制流分析（循环条件不保证至少执行一次时 lastErr 可能未赋值）。
  throw Object.assign(
    new Error('RETRY_EXHAUSTED: retry loop exited without return or throw'),
    { code: 'RETRY_EXHAUSTED', cause: lastErr },
  );
}

/**
 * 判定错误是否为瞬态（可重试）。
 *
 * 仅 429（限流）和 503（服务不可用）视为瞬态。
 * 其余状态码（400/401/403/404/500/502 等）立即 fatal。
 *
 * 错误对象须含 `status: number` 字段（由 llm_gateway adapter 标准化抛出）。
 * 无 status 字段的错误视为非瞬态（立即 fatal）。
 */
function isTransient(err: unknown): boolean {
  if (!hasStatus(err)) {
    return false;
  }
  const status = err.status;
  return status === 429 || status === 503;
}

/**
 * Type guard：判定错误对象是否含数值型 status 字段。
 *
 * 用 type guard 替代 `as { status: number }` 单层断言，更严格（零容忍精神）。
 */
function hasStatus(err: unknown): err is { status: number } {
  if (typeof err !== 'object' || err === null) {
    return false;
  }
  if (!('status' in err)) {
    return false;
  }
  return typeof (err as { status: unknown }).status === 'number';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
