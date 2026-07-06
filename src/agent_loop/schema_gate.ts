/**
 * schema_gate —— zod parse 运行时收窄 LLM 响应内容为结构化 payload。
 *
 * 设计要点：
 *   - 流程：JSON.parse(content) → unknown → schema.parse(unknown) → P。
 *   - 用 type guard 从 unknown 安全收窄（禁 as 强转结构·零容忍 #1）。
 *   - 禁 fallback / 禁静默返回 null（零容忍 #4）：JSON.parse 或 schema.parse 失败
 *     一律 throw STAGE_SCHEMA_INVALID（带 stageId + cause）。
 *
 * 与 run_stage.ts 的 parseStructuredContent 的关系：run_stage.ts 内联了同名逻辑（历史原因·
 * stage 执行器骨架自包含）。本文件抽出独立可测的 parsePayloadSafe，供 stages/* 与测试复用。
 * run_stage.ts 未改为调用本文件（避免循环依赖风险·run_stage 已自包含且经测试覆盖）。
 *
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

import type { z } from 'zod';

import type { StageId } from './types.ts';


// ---------- parsePayloadSafe（zod 收窄·失败转 STAGE_SCHEMA_INVALID） ----------

/**
 * 解析 LLM 响应内容为 zod schema 收窄的结构化 payload。
 *
 * 流程：
 *   1. JSON.parse(content) → unknown（type guard 收窄前的中间态）。
 *   2. schema.parse(unknown) → P（zod 运行时收窄·R10 替代 as 强转）。
 *
 * 失败处理（禁 fallback·零容忍 #4）：
 *   - JSON.parse 失败（SyntaxError）→ throw { code: 'STAGE_SCHEMA_INVALID', stageId, cause }。
 *   - schema.parse 失败（ZodError）→ throw { code: 'STAGE_SCHEMA_INVALID', stageId, cause }。
 *
 * @param content LLM 响应文本（须为合法 JSON 字符串）
 * @param schema 该阶段结构化产物的 zod schema（运行时收窄）
 * @param stageId 阶段标识（落错误上下文·审计）
 * @returns schema 收窄后的结构化 payload P
 * @throws {code: 'STAGE_SCHEMA_INVALID'} content 非 JSON 或 zod parse 失败
 */
export function parsePayloadSafe<P>(
  content: string,
  schema: z.ZodType<P>,
  stageId: StageId,
): P {
  // 1. JSON.parse → unknown（中间态·不 as 强转·直接传给 schema.parse 收窄）
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (err) {
    throw Object.assign(
      new Error(
        `parsePayloadSafe[${stageId}]: STAGE_SCHEMA_INVALID `
          + `(response.content is not valid JSON: ${errorMessage(err)})`,
      ),
      { code: 'STAGE_SCHEMA_INVALID', stageId, cause: err },
    );
  }

  // 2. schema.parse(unknown) → P（zod 运行时收窄·禁 as 强转结构）
  try {
    return schema.parse(raw);
  } catch (err) {
    throw Object.assign(
      new Error(
        `parsePayloadSafe[${stageId}]: STAGE_SCHEMA_INVALID `
          + `(zod parse failed: ${errorMessage(err)})`,
      ),
      { code: 'STAGE_SCHEMA_INVALID', stageId, cause: err },
    );
  }
}


// ---------- errorMessage（type guard 从 unknown 安全提取错误信息） ----------

/**
 * 从 unknown 错误对象安全提取 message（type guard 收窄·禁 as 强转结构）。
 *
 * 零容忍精神：用 type guard 替代 `(err as Error).message` 单层断言（虽单层 as 不触零容忍·
 * 但 type guard 更严格·与 retry_policy.ts 的 hasStatus 同风格）。
 */
function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
