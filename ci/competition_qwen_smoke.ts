// ci/competition_qwen_smoke.ts
// 职责：CI STEP 11——competition_qwen_smoke 条件门（4 模型真实调用 + thinking/json_schema 互斥实测）
// 历史溯源：10_CI_pipeline.md §3 / E6 verified smoke test（FAR_CHAIN_DEV_SPEC/ 已于 commit 66e2975 归档·见 FINAL_PACKAGE/ PDF 层）·运行时 SSOT 以本脚本源码 + 实测为准
//
// [须day-1核验·E6·方法:配 DASHSCOPE_API_KEY 真实计费调用]
// 状态词（02 §7.4）：NEEDS_HUMAN_OPERATION（截图归档）+ NEEDS_REAL_ENV（计费调用）。
// 诚实铁律（HANDOFF §5.3）：无 key graceful skip ≠ 通过；CI_GREEN 声明须标注 "E6 skipped 待人工"，否则假绿。
// 详见 docs/DAY1_VERIFICATION.md §E6。
// 实现：
//   1. 读取 DASHSCOPE_API_KEY（无 key 时 graceful skip · exit 0）
//   2. 经 aliyun_qwen adapter（providerProfile=competition_aliyun_qwen）的 buildCreateParams 构建参数
//   3. 用 OpenAI Node SDK 直连百炼 compatible-mode/v1 端点
//   4. extractRequestId 从 response headers 取 x-request-id [N4]
//   5. 四模型真实调用 + thinking/json_schema 互斥实测
//   6. 全部通过 → COMPETITION_QWEN_SMOKE: OK · exit 0；任一失败 → exit 1
// 类型安全：无 :any / @ts-ignore / as unknown as（零容忍合规）；OpenAI SDK 类型边界处的 `as` 单断言配依据注释（窄断言，非双重断言）
// 出口铁律：参数经 aliyun_qwen adapter（buildCreateParams / COMPETITION_BASE_URL / COMPETITION_MODEL_SNAPSHOT）构建；
//           smoke 直接用 OpenAI SDK 调百炼端点验证连通（gateway.callLlm 抽象不适用 smoke 的端点连通测试目的）

import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import OpenAI from 'openai';
import {
  COMPETITION_BASE_URL,
  COMPETITION_MODEL_SNAPSHOT,
  STRUCTURED_SAFE_MODEL,
} from '../src/llm_gateway/adapters/aliyun_qwen/snapshot.ts';
import {
  buildCreateParams,
} from '../src/llm_gateway/adapters/aliyun_qwen/create_params.ts';
import type {
  AliyunQwenChatMessage,
  AliyunQwenCreateParams,
} from '../src/llm_gateway/adapters/aliyun_qwen/create_params.ts';
import {
  ThinkingJsonSchemaConflictError,
} from '../src/llm_gateway/adapters/aliyun_qwen/errors.ts';

// ---------- 类型守卫 ----------

interface ChatCompletionLike {
  readonly id: string;
  readonly choices: ReadonlyArray<{
    readonly message?: { readonly content?: string | null };
    readonly finish_reason?: string | null;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isChatCompletion(value: unknown): value is ChatCompletionLike {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string') return false;
  if (!Array.isArray(value.choices)) return false;
  return value.choices.every(
    (choice: unknown) => isRecord(choice) && 'message' in choice,
  );
}

// ---------- 模型清单 ----------

const SMOKE_MODELS = [
  { model: COMPETITION_MODEL_SNAPSHOT, label: 'reasoning_snapshot' },
  { model: STRUCTURED_SAFE_MODEL, label: 'structured_safe' },
  { model: 'qwen3-coder-480b-a35b', label: 'code' },
  { model: 'qwen3-235b-a22b', label: 'fallback_base' },
] as const;

// ---------- helpers ----------

function fail(message: string): never {
  console.error(`COMPETITION_QWEN_SMOKE: FAIL (${message})`);
  process.exit(1);
}

function finishReasonOk(fr: string | null | undefined): boolean {
  if (fr === null || fr === undefined) return false;
  return fr === 'stop' || fr === 'length' || fr === 'tool_calls';
}

// ---------- 主流程 ----------

export async function main(): Promise<void> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    console.log('COMPETITION_QWEN_SMOKE: SKIP (no key)');
    return;
  }

  const client = new OpenAI({
    apiKey,
    baseURL: COMPETITION_BASE_URL,
  });

  // ---- Phase 1: 四模型真实调用 ----
  for (const { model, label } of SMOKE_MODELS) {
    const messages: AliyunQwenChatMessage[] = [
      { role: 'user', content: 'reply with OK' },
    ];
    const params: AliyunQwenCreateParams = { enable_thinking: false };
    const resolved = buildCreateParams(model, messages, params);

    try {
      // openai-node v4 create() 返回 ChatCompletion（stream:false 时）。
      // 用 unknown 收窄 + isChatCompletion type guard 验证形状（禁 as 强转）。
      const raw: unknown = await client.chat.completions.create({
        model: resolved.model,
        messages: resolved.messages as OpenAI.Chat.ChatCompletionMessageParam[], // 窄断言依据：AliyunQwenChatMessage 结构兼容 OpenAI message（均 role+content 字段），SDK 类型边界必要
        stream: false,
      });
      if (!isChatCompletion(raw)) {
        fail(`${label} (${model}): response is not a chat completion`);
      }
      const result = raw; // narrowed to ChatCompletionLike
      if (!result.id.startsWith('chatcmpl-')) {
        fail(`${label} (${model}): id "${result.id}" does not match chatcmpl- pattern`);
      }
      const content = result.choices[0]?.message?.content;
      if (typeof content !== 'string' || content.trim().length === 0) {
        fail(`${label} (${model}): empty or missing message content`);
      }
      const fr = result.choices[0]?.finish_reason;
      if (!finishReasonOk(fr)) {
        fail(`${label} (${model}): unexpected finish_reason "${fr}"`);
      }
      console.log(`  [${label}] ${model}: OK (chatcmpl_id=${result.id})`);
    } catch (err) {
      if (err instanceof Error && err.message.includes('ThinkingJsonSchemaConflict')) {
        throw err; // re-throw adapter errors
      }
      fail(`${label} (${model}): API error — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ---- Phase 2: thinking + json_schema 互斥实测 ----
  // 子用例 A: enable_thinking:false + json_schema → 应成功
  {
    const messages: AliyunQwenChatMessage[] = [
      { role: 'user', content: 'return {"x":1}' },
    ];
    const schemaDef = {
      type: 'json_schema' as const,
      json_schema: {
        name: 'r',
        schema: {
          type: 'object' as const,
          properties: { x: { type: 'number' as const } },
          required: ['x'],
        },
      },
    };
    const resolved = buildCreateParams('qwen3.7-max-2026-05-20', messages, {
      enable_thinking: false,
      response_format: schemaDef,
    });
    try {
      const raw: unknown = await client.chat.completions.create({
        model: resolved.model,
        messages: resolved.messages as OpenAI.Chat.ChatCompletionMessageParam[], // 窄断言依据：AliyunQwenChatMessage 结构兼容 OpenAI message（均 role+content 字段），SDK 类型边界必要
        // response_format 透传（百炼兼容 OpenAI json_schema）
        response_format: schemaDef,
        stream: false,
      });
      if (!isChatCompletion(raw)) {
        fail('thinking+json_schema(A): response is not a chat completion');
      }
      const result = raw;
      const rawContent = result.choices[0]?.message?.content;
      if (typeof rawContent !== 'string') {
        fail('thinking+json_schema(A): missing content');
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawContent);
      } catch {
        fail(`thinking+json_schema(A): content is not valid JSON: ${rawContent.slice(0, 80)}`);
      }
      if (!isRecord(parsed) || parsed.x !== 1) {
        fail(`thinking+json_schema(A): expected {"x":1}, got ${rawContent.slice(0, 80)}`);
      }
      console.log('  [thinking+json_schema] disable_thinking + json_schema: OK');
    } catch (err) {
      if (err instanceof Error && err.message.includes('ThinkingJsonSchemaConflict')) {
        throw err;
      }
      fail(`thinking+json_schema(A): API error — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 子用例 B: enable_thinking:true + json_schema → adapter 层抛 ThinkingJsonSchemaConflictError（不发 HTTP）
  {
    const messages: AliyunQwenChatMessage[] = [
      { role: 'user', content: 'return {"x":1}' },
    ];
    const schemaDef = {
      type: 'json_schema' as const,
      json_schema: {
        name: 'r',
        schema: {
          type: 'object' as const,
          properties: { x: { type: 'number' as const } },
          required: ['x'],
        },
      },
    };
    let caught = false;
    try {
      buildCreateParams('qwen3.7-max-2026-05-20', messages, {
        enable_thinking: true,
        response_format: schemaDef,
      });
    } catch (err) {
      if (err instanceof ThinkingJsonSchemaConflictError) {
        caught = true;
      } else {
        throw err;
      }
    }
    if (!caught) {
      fail('thinking+json_schema(B): expected ThinkingJsonSchemaConflictError but none thrown');
    }
    console.log('  [thinking+json_schema] enable_thinking + json_schema: correctly rejected (client-side guard)');
  }

  console.log('COMPETITION_QWEN_SMOKE: OK');
}

// ---------- CLI entry ----------

const here = dirname(fileURLToPath(import.meta.url));
const argv1 = process.argv[1];
const invokedDirectly =
  argv1 !== undefined &&
  pathToFileURL(argv1).href ===
    `file://${here.split(/[\\/]/).join('/')}/competition_qwen_smoke.ts` &&
  import.meta.url === pathToFileURL(argv1).href;
if (invokedDirectly) {
  void main();
}
