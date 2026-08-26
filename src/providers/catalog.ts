import { z } from 'zod';
import { ProviderWireProtocol } from '../domain/model-config.js';

/**
 * PRESET PROVIDER CATALOG (user directive 2026-08-26: free best-effort
 * configuration of ALL models worldwide). One-click prefills for the custom-config
 * form: wire + canonical baseUrl (+ where to get a key). Templates are CONVENIENCE
 * ONLY — never a whitelist: the form still accepts any endpoint, incl. private
 * gateways, proxies and local runtimes the catalog never heard of.
 *
 * Honesty rules:
 *  - baseUrl values are the providers' canonical published API roots (official
 *    docs, stable across years). No invented/deprecated endpoints.
 *  - NO model-id lists: model catalogs churn weekly; the product's discovery
 *    button lists what an endpoint ACTUALLY serves (providers/discovery.ts).
 *  - Azure OpenAI is deliberately absent: its auth header (api-key:) and
 *    resource/deployment URL scheme differ from every wire here — shipping a
 *    template that cannot authenticate would be a fake preset. Point such routes
 *    at an OpenAI-compatible gateway or use the universal adapter once verified.
 */

export const ProviderTemplate = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  wire: ProviderWireProtocol,
  baseUrl: z.string().url(),
  /** Official page where an API key is obtained (may redirect — official domains only). */
  keyUrl: z.string().url().optional(),
  /** Short honest note (auth quirks, region aliases, local default port…). */
  note: z.string().optional(),
});
export type ProviderTemplate = z.infer<typeof ProviderTemplate>;

const RAW_TEMPLATES: Array<z.input<typeof ProviderTemplate>> = [
  // ---- international labs & aggregators ----
  { id: 'openai', label: 'OpenAI', wire: 'openai', baseUrl: 'https://api.openai.com/v1', keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic', label: 'Anthropic', wire: 'anthropic', baseUrl: 'https://api.anthropic.com', keyUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'google-gemini', label: 'Google Gemini', wire: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com', keyUrl: 'https://aistudio.google.com/apikey', note: '原生 generateContent 协议；亦提供 OpenAI 兼容端点（/v1beta/openai）' },
  { id: 'xai', label: 'xAI (Grok)', wire: 'openai', baseUrl: 'https://api.x.ai/v1', keyUrl: 'https://console.x.ai/' },
  { id: 'openrouter', label: 'OpenRouter', wire: 'openai', baseUrl: 'https://openrouter.ai/api/v1', keyUrl: 'https://openrouter.ai/keys', note: '聚合世界数百模型，一个 key 多厂商路由' },
  { id: 'groq', label: 'Groq', wire: 'openai', baseUrl: 'https://api.groq.com/openai/v1', keyUrl: 'https://console.groq.com/keys' },
  { id: 'mistral', label: 'Mistral AI', wire: 'openai', baseUrl: 'https://api.mistral.ai/v1', keyUrl: 'https://console.mistral.ai/api-keys' },
  { id: 'together', label: 'Together AI', wire: 'openai', baseUrl: 'https://api.together.xyz/v1', keyUrl: 'https://api.together.ai/settings/api-keys' },
  { id: 'perplexity', label: 'Perplexity', wire: 'openai', baseUrl: 'https://api.perplexity.ai', keyUrl: 'https://www.perplexity.ai/settings/api' },
  { id: 'cohere', label: 'Cohere', wire: 'openai', baseUrl: 'https://api.cohere.ai/compatibility/v1', keyUrl: 'https://dashboard.cohere.com/api-keys', note: 'OpenAI 兼容层' },
  { id: 'fireworks', label: 'Fireworks AI', wire: 'openai', baseUrl: 'https://api.fireworks.ai/inference/v1', keyUrl: 'https://fireworks.ai/account/api-keys' },
  { id: 'cerebras', label: 'Cerebras', wire: 'openai', baseUrl: 'https://api.cerebras.ai/v1', keyUrl: 'https://cloud.cerebras.ai/' },
  // ---- Chinese providers (equal citizens, not the closed set) ----
  { id: 'deepseek', label: 'DeepSeek', wire: 'openai', baseUrl: 'https://api.deepseek.com', keyUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'moonshot', label: 'Moonshot (Kimi)', wire: 'openai', baseUrl: 'https://api.moonshot.cn/v1', keyUrl: 'https://platform.moonshot.cn/console/api-keys', note: '国际站 base：https://api.moonshot.ai/v1' },
  { id: 'zhipu', label: 'Zhipu GLM', wire: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys', note: '另有 Anthropic 兼容端点：https://open.bigmodel.cn/api/anthropic' },
  { id: 'dashscope', label: 'Alibaba DashScope (Qwen)', wire: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', keyUrl: 'https://bailian.console.aliyun.com/' },
  // ---- local / self-hosted runtimes ----
  { id: 'ollama', label: 'Ollama (本地)', wire: 'openai', baseUrl: 'http://localhost:11434/v1', note: '本地默认端口；key 可留空或任意值' },
  { id: 'vllm', label: 'vLLM (自托管)', wire: 'openai', baseUrl: 'http://localhost:8000/v1', note: '启动参数 --api-key 时填写，否则可留空' },
  { id: 'lmstudio', label: 'LM Studio (本地)', wire: 'openai', baseUrl: 'http://localhost:1234/v1', note: '本地默认端口' },
  // ---- deterministic development route (no endpoint at all) ----
  { id: 'offline-dev', label: '离线开发路由 (Offline dev)', wire: 'offline', baseUrl: 'https://offline.farlab.invalid/v1', note: '确定性开发路线：不联网、不需要 key；走完整研究流程用于演示与界面验收，所有回执标记为 test 模式，绝不冒充真实模型调用' },
];

/** Parsed through the schema at module load — a catalog typo fails fast, never ships. */
export const PROVIDER_TEMPLATES: readonly ProviderTemplate[] = RAW_TEMPLATES.map(
  (t) => ProviderTemplate.parse(t),
);

export const templateById = (id: string): ProviderTemplate | undefined =>
  PROVIDER_TEMPLATES.find((t) => t.id === id);
