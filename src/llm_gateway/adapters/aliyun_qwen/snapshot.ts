export const COMPETITION_MODEL_SNAPSHOT = 'qwen3.7-max-2026-05-20';
export const MODEL_SNAPSHOT = COMPETITION_MODEL_SNAPSHOT;

export const STRUCTURED_SAFE_MODEL = 'qwen-max-2025-09-24';

/**
 * Competition endpoint（公开端点·非密钥）。默认字面量与 .env.example:17 一致；
 * 运行时遵循 .env.example 承诺——可由 process.env.COMPETITION_BASE_URL 覆盖。
 *
 * 注意边界：COMPETITION_MODEL_SNAPSHOT 保持字面常量不变（模型身份冻结·红线#2 模型中立·
 * repro_hash 确定性要求模型不可被 env 覆盖）；仅「端点」作为基础设施允许覆盖。
 * env 未设置时回落默认字面量——offline_replay.test.ts:49 字面断言仍成立。
 */
export const COMPETITION_BASE_URL =
  process.env.COMPETITION_BASE_URL ??
  'https://dashscope.aliyuncs.com/compatible-mode/v1';
export const BASE_URL = COMPETITION_BASE_URL;

export const COMPETITION_MODEL_SNAPSHOT_STATUS =
  '[verified_live: web search confirmed qwen3.7-max-2026-05-20 available on DashScope as of 2026-06-27]';
