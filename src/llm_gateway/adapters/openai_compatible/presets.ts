/**
 * OpenAI-Compatible 预置 profile 注册表。
 *
 * 用户愿景「各种接口与功能适配」：开箱即用覆盖主流 OpenAI 兼容端点，
 * 全部 baseURL + envVar 配置化（密钥唯一来源 = 环境变量，绝不硬编码）。
 *
 * 注意：
 *   - 各 profile 的凭证 envVar 未设置时，adapter 仍可创建（用 'not-set' apiKey），
 *     真实调用会失败并显式报错——绝不静默。
 *   - 本地端点（Ollama/vLLM）无需密钥，envVar 留空字符串表示「无需密钥」。
 *   - 竞争 profile（competition_aliyun_qwen）的 Qwen-only fallback 红线（§5）
 *     不适用于本通用注册表——这里每项是独立可选的通用适配器。
 */
import { createOpenAICompatibleAdapter } from './index.ts';
import type { ProviderAdapter } from '../../types.ts';

/** 预置 OpenAI 兼容提供商 profile 定义。 */
export interface OpenAICompatiblePreset {
  readonly profile: string;
  readonly label: string;
  readonly baseURL: string;
  readonly envVar: string;
  readonly defaultModel: string;
  readonly fallbackModels?: readonly string[];
  readonly requiresKey: boolean;
}

/** 预置注册表（单一来源）。 */
export const OPENAI_COMPATIBLE_PRESETS: readonly OpenAICompatiblePreset[] = [
  {
    profile: 'openai_compatible_openai',
    label: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    envVar: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o-mini',
    fallbackModels: ['gpt-4o'],
    requiresKey: true,
  },
  {
    profile: 'openai_compatible_deepseek',
    label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    envVar: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-chat',
    fallbackModels: ['deepseek-reasoner'],
    requiresKey: true,
  },
  {
    profile: 'openai_compatible_zhipu',
    label: 'Zhipu GLM',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    envVar: 'ZHIPU_API_KEY',
    defaultModel: 'glm-4-flash',
    fallbackModels: ['glm-4-air'],
    requiresKey: true,
  },
  {
    profile: 'openai_compatible_ollama',
    label: 'Ollama (local)',
    baseURL: 'http://localhost:11434/v1',
    envVar: '',
    defaultModel: 'llama3.1',
    fallbackModels: ['qwen2.5'],
    requiresKey: false,
  },
  {
    profile: 'openai_compatible_vllm',
    label: 'vLLM (self-hosted GPU)',
    baseURL: 'http://localhost:8000/v1',
    envVar: '',
    defaultModel: 'Qwen2.5-72B-Instruct',
    requiresKey: false,
  },
];

/**
 * 构建所有预置适配器（按注册表顺序）。
 * @returns 已创建的 ProviderAdapter 列表（可直接 register 进 LlmGateway）。
 */
export function createOpenAICompatiblePresetAdapters(): readonly ProviderAdapter[] {
  return OPENAI_COMPATIBLE_PRESETS.map((p) =>
    createOpenAICompatibleAdapter({
      profile: p.profile,
      baseURL: p.baseURL,
      envVar: p.envVar,
      defaultModel: p.defaultModel,
      ...(p.fallbackModels !== undefined ? { fallbackModels: p.fallbackModels } : {}),
    }),
  );
}
