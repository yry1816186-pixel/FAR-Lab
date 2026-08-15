/** Constant: KNOWN_PROVIDER_PROFILES. */
export const KNOWN_PROVIDER_PROFILES = [
  'competition_aliyun_qwen',
  'research_best_available',
  'local_open_weights',
  'offline_replay',
] as const;

/** Constant: LLM_CAPABILITIES. */
export const LLM_CAPABILITIES = [
  'reasoning',
  'structured',
  'vision',
  'code',
  'embedding',
  'rerank',
] as const;

/** Type alias: known provider profile. */
export type KnownProviderProfile = (typeof KNOWN_PROVIDER_PROFILES)[number];
/** Type alias: provider profile. */
export type ProviderProfile = KnownProviderProfile | (string & {});
/** Type alias: llm capability. */
export type LlmCapability = (typeof LLM_CAPABILITIES)[number];

/** Interface defining token usage. */
export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  /**
   * CU4-02：计量来源标记——true = 厂商真实 token 计量；
   * false = 字符伪 token（offline_replay 用字符数估算，非真实 token）。
   * 缺省 true（真实计量）；offline_replay 显式 false。预算/报告侧据此区分
   * 口径（伪 token 不得混入 usage_tokens_total 作为真实成本依据）。
   */
  readonly measured?: boolean;
}

/** Interface defining cost snapshot. */
export interface CostSnapshot {
  readonly currency: string;
  readonly amount: number;
  readonly source: string;
}

/** Interface defining llm call credential. */
export interface LlmCallCredential {
  readonly providerProfile: ProviderProfile;
  readonly providerRequestId: string | null;
  readonly modelId: string;
  readonly modelVersion: string | null;
  readonly capability: LlmCapability;
  readonly isoTimestamp: string;
  readonly tokenUsage: TokenUsage;
  readonly costSnapshot?: CostSnapshot;
  readonly adapterMeta?: Record<string, unknown>;
  /** Provider-reported finish reason (null = not reported by the provider). */
  readonly finishReason?: string | null;
}

/** Interface defining llm message. */
export interface LlmMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string;
}

/**
 * Structured Output schema 对象（DashScope/OpenAI 兼容的 json_schema 形态）。
 *
 * 设计：LlmRequest 持 plain JSON schema 对象（非 zod 实例），保持 llm_gateway
 * adapter-agnostic（不依赖 agent_loop/stages 的 zod schema）。caller（run_stage.ts）
 * 用 zodToJsonSchema 把 stage zod schema 转为 plain 对象后注入。
 *
 * name 约束（OpenAI/DashScope 一致）：a-z/A-Z/0-9/_/-，≤64 字符。
 */
export interface LlmJsonSchema {
  readonly name: string;
  readonly schema: Record<string, unknown>;
  readonly strict?: boolean;
}

/** Interface defining llm request. */
export interface LlmRequest {
  readonly messages: readonly LlmMessage[];
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly responseFormat?: 'text' | 'json_schema';
  /**
   * Structured Output schema 对象。仅当 responseFormat='json_schema' 时有效。
   * adapter（aliyun_qwen）透传为 DashScope/OpenAI response_format.json_schema；
   * offline_replay 忽略（fixture 已是结构化）。
   * T-013（评委04 F-4-004 · 2026-07-25 第 3 轮 CP-17）完整接线。
   */
  readonly jsonSchema?: LlmJsonSchema;
  readonly purposeTag?: string;
  /**
   * 请求所属阶段标识（agent_loop 执行器注入·如 'stage3_hypothesis'）。
   * 与 purposeTag 同为可选字符串（避免 llm_gateway → agent_loop 类型耦合）。
   * offline_replay fixture registry 按 stageId 命中对应阶段的预录 fixture，
   * 使无 API key 的默认离线路径能端到端跑通真实确定性 demo（替原先的静默 echo 回退）。
   * 生产 adapter（aliyun_qwen 等）忽略此字段。
   */
  readonly stageId?: string;
}

/** Interface defining llm response. */
export interface LlmResponse {
  readonly credential: LlmCallCredential;
  readonly content: string;
  readonly raw: unknown;
}

/** Interface defining provider adapter. */
export interface ProviderAdapter {
  readonly profile: ProviderProfile;
  call(request: LlmRequest): Promise<LlmResponse>;
}
