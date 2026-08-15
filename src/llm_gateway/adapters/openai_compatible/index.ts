/**
 * OpenAI-Compatible Unified Adapter（用户愿景「各种接口与功能适配」）。
 *
 * 一套代码适配所有 OpenAI 兼容端点：OpenAI / DeepSeek / Zhipu / Ollama / vLLM /
 * DashScope compatible-mode 等，全部通过 baseURL + envVar + defaultModel 配置驱动。
 *
 * 设计原则：
 *   1. 独立通用扩展，**不触碰 competition profile**（Qwen-only fallback 链·§5）。
 *   2. 凭证走环境变量，绝不硬编码密钥。
 *   3. 失败可见：不静默换模型；降级路径在 adapterMeta.usedFallbackModel 显式标注。
 *   4. 确定性铁律：adapter 只做 LLM 调用；裁决确定性由 R0-R9 内核保证，与 LLM 输出无关。
 *
 * ADDITIVE ONLY — 不修改任何现有模块。
 */
import OpenAI from 'openai';
import type { LlmRequest, LlmResponse, ProviderAdapter } from '../../types.ts';

/** OpenAI 兼容适配器配置。 */
export interface OpenAICompatibleConfig {
  /** 提供商 profile 标识（如 'openai_compatible_deepseek'） */
  readonly profile: string;
  /** 端点 baseURL（如 'https://api.deepseek.com/v1'、'http://localhost:11434/v1'） */
  readonly baseURL: string;
  /** 环境变量名（如 'DEEPSEEK_API_KEY'）——密钥唯一来源 */
  readonly envVar: string;
  /** 默认模型 ID */
  readonly defaultModel: string;
  /** 降级模型 ID 列表（按序尝试，全部失败才报错） */
  readonly fallbackModels?: readonly string[];
    /** 固定温度覆盖（结构化输出场景可设 0） */
  readonly temperature?: number;
  /**
   * 内部客户端工厂（测试注入用；生产默认 new OpenAI）。
   * 注入返回实现最小 chat.completions.create 接口的对象即可，
   * 使 fallback 链与错误路径可在零网络下验证。
   */
  readonly clientFactory?: (clientConfig: { baseURL: string; apiKey: string }) => ChatClient;
}

/** 最小客户端接口（仅需 chat.completions.create）。 */
export interface ChatClient {
  readonly chat: {
    readonly completions: {
      create(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
    };
  };
}

/** OpenAI SDK 客户端适配为最小接口。 */
function wrapOpenAI(client: OpenAI): ChatClient {
  return {
    chat: {
      completions: {
        create: (payload) =>
          client.chat.completions
            .create(payload as unknown as Parameters<typeof client.chat.completions.create>[0])
            .then(
              (resp) => resp as unknown as Record<string, unknown>,
            ),
      },
    },
  };
}

/** 汇总该 profile 的 token 消耗。 */
function summarizeUsage(raw: unknown): { inputTokens: number; outputTokens: number; totalTokens: number } {
  const u = (raw as { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } })?.usage;
  const input = u?.prompt_tokens ?? 0;
  const output = u?.completion_tokens ?? 0;
  return { inputTokens: input, outputTokens: output, totalTokens: input + output };
}

/**
 * 创建 OpenAI 兼容统一适配器。
 * @param config - baseURL/envVar/model 全配置化参数。
 * @returns 实现 ProviderAdapter 接口的适配器实例。
 */
export function createOpenAICompatibleAdapter(config: OpenAICompatibleConfig): ProviderAdapter {
  if (!config.baseURL || !config.envVar || !config.defaultModel) {
    throw new Error(`openai_compatible: profile=${config.profile} requires baseURL/envVar/defaultModel`);
  }

  const modelChain = [config.defaultModel, ...(config.fallbackModels ?? [])];
  const apiKey = process.env[config.envVar];

  return {
    profile: config.profile,

    async call(request: LlmRequest): Promise<LlmResponse> {
      const client = (
        config.clientFactory ?? ((clientConfig) => wrapOpenAI(new OpenAI(clientConfig)))
      )({ baseURL: config.baseURL, apiKey: apiKey ?? 'not-set' });

      let lastError: Error | null = null;

      for (const model of modelChain) {
        try {
          const payload: Record<string, unknown> = {
            model,
            messages: request.messages as unknown[],
            ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
            ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
          };
          if (request.responseFormat === 'json_schema' && request.jsonSchema) {
            payload.response_format = {
              type: 'json_schema',
              json_schema: {
                name: request.jsonSchema.name,
                schema: request.jsonSchema.schema,
                ...(request.jsonSchema.strict !== undefined ? { strict: request.jsonSchema.strict } : {}),
              },
            };
          }

          const resp = await client.chat.completions.create(payload);
          const content = (resp as { choices?: Array<{ message?: { content?: string } }> })
            ?.choices?.[0]?.message?.content ?? '';

          return {
            credential: {
              providerProfile: config.profile,
              providerRequestId:
                typeof (resp as { id?: unknown }).id === 'string'
                  ? ((resp as { id?: string }).id ?? null)
                  : null,
              modelId: model,
              modelVersion: null,
              capability: request.responseFormat === 'json_schema' ? 'structured' : 'reasoning',
              isoTimestamp: new Date().toISOString(),
              tokenUsage: summarizeUsage(resp),
              adapterMeta: {
                baseURL: config.baseURL,
                usedFallbackModel: model !== config.defaultModel ? model : null,
              },
            },
            content,
            raw: resp,
          };
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          if (model === config.defaultModel) continue; // 尝试 fallback
        }
      }

      // 全链失败：显式抛错，绝不静默返回空内容（F11 反 theater）。
      throw new Error(
        `openai_compatible(${config.profile}): all ${modelChain.length} model(s) failed ` +
          `(default=${config.defaultModel}, fallbacks=[${(config.fallbackModels ?? []).join(',')}]). ` +
          `lastError=${lastError?.message ?? 'unknown'}`,
      );
    },
  };
}
