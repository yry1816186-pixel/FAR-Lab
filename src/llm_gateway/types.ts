export const KNOWN_PROVIDER_PROFILES = [
  'competition_aliyun_qwen',
  'research_best_available',
  'local_open_weights',
  'offline_replay',
] as const;

export const LLM_CAPABILITIES = [
  'reasoning',
  'structured',
  'vision',
  'code',
  'embedding',
  'rerank',
] as const;

export type KnownProviderProfile = (typeof KNOWN_PROVIDER_PROFILES)[number];
export type ProviderProfile = KnownProviderProfile | (string & {});
export type LlmCapability = (typeof LLM_CAPABILITIES)[number];

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

export interface CostSnapshot {
  readonly currency: string;
  readonly amount: number;
  readonly source: string;
}

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
}

export interface LlmMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string;
}

export interface LlmRequest {
  readonly messages: readonly LlmMessage[];
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly responseFormat?: 'text' | 'json_schema';
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

export interface LlmResponse {
  readonly credential: LlmCallCredential;
  readonly content: string;
  readonly raw: unknown;
}

export interface ProviderAdapter {
  readonly profile: ProviderProfile;
  call(request: LlmRequest): Promise<LlmResponse>;
}
