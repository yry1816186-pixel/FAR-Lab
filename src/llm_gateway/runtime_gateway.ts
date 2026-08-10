// src/llm_gateway/runtime_gateway.ts
// 运行期 LLM 网关解析（WS-A.1 让真实推理可达——API server 路径闭合）。
//
// 背景：CLI 命令（far ask/arena/court）已支持 --profile competition_aliyun_qwen + 凭据门，
// 但 `far api`（REST server）从不构造真实网关——POST /hypothesize 即使用户设了
// FAR_DASHSCOPE_API_KEY 也跑 offline_replay（「Entire system dead in production」在 API 面依旧成立）。
//
// 模型中立红线（24§0.1）：src/api/ 禁 Qwen/DashScope 字面量。本文件位于 llm_gateway/
// （C10 纪律：模型字面量允许在 adapter/gateway 层）——api.ts/server.ts 只 import
// resolveRuntimeGateway 抽象，无任何模型字面量泄漏。
//
// 诚实边界：key 不存在时返回 null（调用方走 offline_replay 确定性 fixture），绝不假装 live。

import type { LlmGateway } from './gateway.ts';
import { createCompetitionQwenGateway } from './competition_gateway.ts';

/** 运行期环境（显式传入·禁 process.env 直读·可测）。 */
export type RuntimeEnv = Readonly<Record<string, string | undefined>>;

/** 支持的 API key 环境变量名（按优先级）。 */
const API_KEY_ENV_NAMES = ['FAR_DASHSCOPE_API_KEY', 'DASHSCOPE_API_KEY'] as const;

/**
 * 从运行期环境解析 LLM 网关：
 *   - 任一 API key env 存在且非空 → competition_aliyun_qwen 网关（真实 HTTP·计费）
 *   - 否则 → null（调用方降级 offline_replay·确定性 fixture）
 *
 * fail-conservative：key 为空串视为缺失（不构造会 401 的网关）。
 */
export function resolveRuntimeGateway(env: RuntimeEnv): LlmGateway | null {
  const apiKey = API_KEY_ENV_NAMES.map((name) => env[name]).find(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  if (apiKey === undefined) {
    return null;
  }
  return createCompetitionQwenGateway({ apiKey });
}
