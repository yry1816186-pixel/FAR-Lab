import { z } from 'zod';

/**
 * MODEL CAPABILITY REGISTRY (model-plane lane, 2026-08-24).
 *
 * Rich per-model capability metadata — the single authority the router and the
 * structured-output negotiator consult. Design rules:
 *
 *  - CURATED entries carry sourceRefs (official doc URL + retrieval date). Facts the
 *    source did not state stay undefined — never guessed.
 *  - Registry prices are REFERENCE metadata only (currency-honest, CNY for Bailian).
 *    Cost accounting stays with the receipt-derived ledger + user-declared pricing
 *    (BP-4 no-invented-prices rule) — the registry never feeds costUsd.
 *  - Unknown models resolve to undefined; callers must treat "not in registry" as
 *    "capabilities unverified", fail visible, and never infer capabilities from a name.
 */

export const StructuredOutputTier = z.enum(['json_schema_strict', 'json_object', 'prompt_contract']);
export type StructuredOutputTier = z.infer<typeof StructuredOutputTier>;

export const LatencyClass = z.enum(['fast', 'balanced', 'deep']);
export type LatencyClass = z.infer<typeof LatencyClass>;

export const CapabilityTask = z.enum([
  'text', 'vision', 'audio', 'tool_calling', 'embedding', 'rerank',
  'structured_output', 'reasoning', 'streaming', 'batch',
]);
export type CapabilityTask = z.infer<typeof CapabilityTask>;

export const PriceRef = z.object({
  currency: z.enum(['CNY', 'USD']),
  /** Input price per 1M tokens as printed by the provider's billing doc (reference only). */
  inputPerMTok: z.number().nonnegative(),
  outputPerMTok: z.number().nonnegative(),
  /** Tiered pricing (e.g. qwen3.7-flash ≤32K/≤256K/≤1M) collapses to the LOWEST tier here; see pricingNote. */
  pricingNote: z.string().optional(),
  url: z.string(),
});
export type PriceRef = z.infer<typeof PriceRef>;

export const SourceRef = z.object({
  url: z.string(),
  retrievedAt: z.string().date(),
});
export type SourceRef = z.infer<typeof SourceRef>;

export const ModelCapabilities = z.object({
  /** Canonical registry key (an id the provider actually accepts on the wire). */
  modelKey: z.string().min(1),
  provider: z.string().min(1),
  family: z.string().optional(),
  /** Dated snapshots / aliases that resolve to this entry (provider-accepted ids). */
  aliases: z.array(z.string()).default([]),
  text: z.boolean(),
  vision: z.boolean().default(false),
  audio: z.boolean().default(false),
  toolCalling: z.boolean().default(false),
  embedding: z.boolean().default(false),
  rerank: z.boolean().default(false),
  /** Best verified structured-output tier this model supports. */
  structuredOutput: StructuredOutputTier,
  /** Explicit reasoning/thinking support declared by the platform docs. */
  reasoning: z.boolean().default(false),
  /** Verified context window in tokens (undefined = not stated by the source). */
  contextTokens: z.number().int().positive().optional(),
  /** How the context number was established — 'doc' (official statement) | 'billing-tier' (inferred from pricing tiers, weaker). */
  contextBasis: z.enum(['doc', 'billing-tier']).optional(),
  streaming: z.boolean().default(true),
  batch: z.boolean().default(false),
  latencyClass: LatencyClass,
  /** Reference pricing (see module doc: never used for cost accounting). */
  priceRef: PriceRef.optional(),
  region: z.array(z.string()).default([]),
  /** Official QPM/TPM when the provider publishes them (unset = unpublished). */
  rateLimits: z.object({ qpm: z.number().int().positive().optional(), tpm: z.number().int().positive().optional() }).optional(),
  knownLimitations: z.array(z.string()).default([]),
  /** Wire/interface requirements that change HOW the model must be called. */
  interfaceNotes: z.array(z.string()).default([]),
  sourceRefs: z.array(SourceRef),
});
export type ModelCapabilities = z.infer<typeof ModelCapabilities>;

const ALIYUN_MODELS = 'https://help.aliyun.com/zh/model-studio/models';
const ALIYUN_SO = 'https://help.aliyun.com/zh/model-studio/qwen-structured-output';
const ALIYUN_BILLING = 'https://help.aliyun.com/zh/model-studio/billing-for-model-studio';
const RETRIEVED = '2026-08-24';
const src = (url: string): SourceRef[] => [{ url, retrievedAt: RETRIEVED }];

const NO_MAX_TOKENS_WITH_SO =
  '官方结构化输出文档：开启结构化输出时勿设 max_tokens（截断产生无效 JSON）—— plane strips it on this route';
const THINKING_NEEDS_STREAMING =
  '思考模式与结构化输出兼容但思考模式必须开流式；本 plane 结构化调用非流式—— 禁止组合（registry known-limitation）';
/**
 * Official FAQ fact (qwen-structured-output doc, re-verified 2026-08-25): on models
 * whose json_object tier is served "非思考模式", enabling thinking while using
 * response_format json_object "结构化输出可能失效" (may silently fail). The doc's own
 * remediation: parse the thinking model's raw output; if json.loads fails, re-ask a
 * cheap json-mode model with enable_thinking:false to repair. FAR-Lab's equivalent is
 * the bounded corrective re-ask chain (http.ts) — the registry records the platform
 * fact so callers never assume json_object+thinking is reliable.
 */
const THINKING_JSON_OBJECT_MAY_FAIL =
  '官方 FAQ：json_object 档开思考「结构化输出可能失效」—— 组合不可靠，需 corrective re-ask 兜底（官方修复法=用廉价 json 模式模型 enable_thinking:false 复解析）';

/**
 * Curated catalog — Qwen family on Bailian (competition-mandated base, §A1 of
 * work/model-plane/RESEARCH-competition-2026-08-24.md) + the zai dev route.
 * Every fact traced to the cited page; see the research doc for verbatim quotes.
 * Parsed through the schema at module load — a catalog typo fails fast, never ships.
 */
const RAW_CATALOG: Array<z.input<typeof ModelCapabilities>> = [
  {
    modelKey: 'qwen3.8-max', provider: 'dashscope', family: 'qwen',
    aliases: [],
    text: true, vision: true, toolCalling: true,
    structuredOutput: 'json_schema_strict', reasoning: true,
    contextTokens: 1_000_000, contextBasis: 'billing-tier',
    streaming: true, batch: true,
    latencyClass: 'deep',
    priceRef: { currency: 'CNY', inputPerMTok: 12, outputPerMTok: 36, url: ALIYUN_BILLING },
    region: ['cn-beijing'],
    knownLimitations: [THINKING_NEEDS_STREAMING, '精确上下文上限未由文档直接给出（按计费档 ≤1M 推断）'],
    interfaceNotes: ['必须走多模态接口（文本路径调用报 url error）', NO_MAX_TOKENS_WITH_SO],
    sourceRefs: src(ALIYUN_MODELS),
  },
  {
    modelKey: 'qwen3.7-plus', provider: 'dashscope', family: 'qwen',
    aliases: ['qwen3.7-plus-2026-05-26'],
    text: true, vision: true, toolCalling: true,
    structuredOutput: 'json_schema_strict', reasoning: true,
    contextTokens: 1_000_000, contextBasis: 'billing-tier',
    streaming: true, batch: true,
    latencyClass: 'balanced',
    priceRef: { currency: 'CNY', inputPerMTok: 2, outputPerMTok: 8, pricingNote: '≤256K 档；256K–1M 为 6/24；快照 qwen3.7-plus-2026-05-26 限时 8 折', url: ALIYUN_BILLING },
    region: ['cn-beijing'],
    knownLimitations: [THINKING_NEEDS_STREAMING],
    interfaceNotes: [NO_MAX_TOKENS_WITH_SO],
    sourceRefs: src(ALIYUN_MODELS),
  },
  {
    modelKey: 'qwen3.7-flash', provider: 'dashscope', family: 'qwen',
    aliases: ['qwen3.7-flash-2026-07-15'],
    text: true, toolCalling: true,
    structuredOutput: 'json_object', reasoning: true,
    contextTokens: 1_000_000, contextBasis: 'billing-tier',
    streaming: true, batch: true,
    latencyClass: 'fast',
    priceRef: { currency: 'CNY', inputPerMTok: 0.2, outputPerMTok: 0.8, pricingNote: '≤32K 档；≤256K 0.6/2.4；≤1M 1.2/4.8', url: ALIYUN_BILLING },
    region: ['cn-beijing'],
    knownLimitations: ['不支持 json_schema strict（仅 json_object）', THINKING_JSON_OBJECT_MAY_FAIL],
    interfaceNotes: [NO_MAX_TOKENS_WITH_SO],
    sourceRefs: src(ALIYUN_MODELS),
  },
  {
    // Catalog listing verified 2026-09-02 (help.aliyun.com models page, 文本生成);
    // capability details NOT yet doc-verified — every live-observed fact below cites
    // the B-QWEN/EV1 receipts. Unverified fields stay at schema defaults.
    modelKey: 'qwen3.8-flash', provider: 'dashscope', family: 'qwen',
    aliases: [],
    text: true,
    structuredOutput: 'json_object',
    reasoning: true,
    contextTokens: undefined,
    streaming: true,
    latencyClass: 'fast',
    region: ['cn-beijing'],
    knownLimitations: [
      '默认开启思考（live 实测 2026-09-03：无思考字段时 34/35 调用返回 reasoning tokens，p50 65s / p90 188s——管线须显式 FARLAB_DASHSCOPE_THINKING=off）',
      '不支持 json_schema strict（模型卡未核验；json_object 档 live 实测 plan-revision 前缀 id schema 三连矫正失败 2026-09-03）',
      THINKING_JSON_OBJECT_MAY_FAIL,
    ],
    interfaceNotes: [NO_MAX_TOKENS_WITH_SO],
    sourceRefs: [
      { url: ALIYUN_MODELS, retrievedAt: '2026-09-02' },
      { url: 'evidence/b-qwen/report.md', retrievedAt: '2026-09-03' },
    ],
  },
  {
    modelKey: 'qwen3.7-max', provider: 'dashscope', family: 'qwen',
    aliases: ['qwen3.7-max-2026-05-20', 'qwen3.7-max-2026-06-08'],
    text: true, toolCalling: true,
    structuredOutput: 'json_schema_strict', reasoning: true,
    contextTokens: undefined,
    streaming: true, batch: true,
    latencyClass: 'deep',
    priceRef: { currency: 'CNY', inputPerMTok: 0, outputPerMTok: 0, pricingNote: '见计费页（本 registry 不抄录未取到实价的数字）', url: ALIYUN_BILLING },
    region: ['cn-beijing'],
    knownLimitations: [THINKING_NEEDS_STREAMING, 'rank 拒评（live 实测 2026-09-03：9 候选假设时三连返回空 assessments 触发 min(1) 校验失败——模型拒绝/无法产出排序，非 schema 死锁）'],
    interfaceNotes: ['仅文本接口（多模态接口不含此系列）', 'qwen3.7-max-2026-06-08 走多模态接口', NO_MAX_TOKENS_WITH_SO],
    sourceRefs: src(ALIYUN_MODELS),
  },
  {
    modelKey: 'qwen3.8-27b', provider: 'dashscope', family: 'qwen',
    aliases: [],
    text: true, toolCalling: true,
    structuredOutput: 'json_object',
    contextTokens: undefined,
    streaming: true,
    latencyClass: 'balanced',
    region: ['cn-beijing'],
    knownLimitations: ['开源权重系；不支持 json_schema strict'],
    interfaceNotes: ['必须走多模态接口', NO_MAX_TOKENS_WITH_SO],
    sourceRefs: src(ALIYUN_MODELS),
  },
  {
    modelKey: 'qwen3.8-2.4t-a95b', provider: 'dashscope', family: 'qwen',
    aliases: [],
    text: true, toolCalling: true,
    structuredOutput: 'json_object',
    contextTokens: undefined,
    streaming: true,
    latencyClass: 'deep',
    region: ['cn-beijing'],
    interfaceNotes: ['仅文本接口', NO_MAX_TOKENS_WITH_SO],
    sourceRefs: src(ALIYUN_MODELS),
  },
  {
    modelKey: 'qwen3.6-max-preview', provider: 'dashscope', family: 'qwen',
    aliases: [],
    text: true, toolCalling: true,
    structuredOutput: 'json_object',
    contextTokens: undefined,
    streaming: true,
    latencyClass: 'deep',
    region: ['cn-beijing'],
    interfaceNotes: ['仅文本接口', NO_MAX_TOKENS_WITH_SO],
    sourceRefs: src(ALIYUN_MODELS),
  },
  {
    modelKey: 'qwen-plus', provider: 'dashscope', family: 'qwen',
    aliases: ['qwen-plus-2025-12-01'],
    text: true, toolCalling: true,
    structuredOutput: 'json_object', reasoning: true,
    contextTokens: 1_000_000, contextBasis: 'billing-tier',
    streaming: true,
    latencyClass: 'balanced',
    priceRef: { currency: 'CNY', inputPerMTok: 0.8, outputPerMTok: 2, pricingNote: '≤128K 档；思考输出 8；高档至 4.8/64', url: ALIYUN_BILLING },
    region: ['cn-beijing'],
    knownLimitations: ['旧别名仍可路由；新工作建议 qwen3.7-plus', '不支持 json_schema strict', THINKING_JSON_OBJECT_MAY_FAIL],
    interfaceNotes: [NO_MAX_TOKENS_WITH_SO],
    sourceRefs: src(ALIYUN_MODELS),
  },
  {
    modelKey: 'qwen-turbo', provider: 'dashscope', family: 'qwen',
    aliases: [],
    text: true, toolCalling: true,
    structuredOutput: 'json_object',
    contextTokens: undefined,
    streaming: true,
    latencyClass: 'fast',
    region: ['cn-beijing'],
    knownLimitations: ['不支持 json_schema strict'],
    interfaceNotes: [NO_MAX_TOKENS_WITH_SO],
    sourceRefs: src(ALIYUN_SO),
  },
  {
    modelKey: 'qwen3-coder', provider: 'dashscope', family: 'qwen',
    aliases: [],
    text: true, toolCalling: true,
    structuredOutput: 'json_object',
    contextTokens: undefined,
    streaming: true,
    latencyClass: 'balanced',
    region: ['cn-beijing'],
    knownLimitations: ['不支持 json_schema strict'],
    interfaceNotes: [NO_MAX_TOKENS_WITH_SO],
    sourceRefs: src(ALIYUN_SO),
  },
  {
    modelKey: 'qwen-long', provider: 'dashscope', family: 'qwen',
    aliases: [],
    text: true,
    structuredOutput: 'json_object',
    contextTokens: undefined,
    streaming: true,
    latencyClass: 'balanced',
    region: ['cn-beijing'],
    knownLimitations: ['不支持 json_schema strict'],
    interfaceNotes: [NO_MAX_TOKENS_WITH_SO],
    sourceRefs: src(ALIYUN_SO),
  },
  {
    modelKey: 'qwen3-vl-plus', provider: 'dashscope', family: 'qwen-vl',
    aliases: [],
    text: true, vision: true, toolCalling: true,
    structuredOutput: 'json_object',
    contextTokens: undefined,
    streaming: true,
    latencyClass: 'balanced',
    region: ['cn-beijing'],
    knownLimitations: ['不支持 json_schema strict（官方清单仅列 json_object）'],
    interfaceNotes: [NO_MAX_TOKENS_WITH_SO],
    sourceRefs: src(ALIYUN_SO),
  },
  {
    modelKey: 'qwen3-vl-flash', provider: 'dashscope', family: 'qwen-vl',
    aliases: [],
    text: true, vision: true,
    structuredOutput: 'json_object',
    contextTokens: undefined,
    streaming: true,
    latencyClass: 'fast',
    region: ['cn-beijing'],
    knownLimitations: ['不支持 json_schema strict'],
    interfaceNotes: [NO_MAX_TOKENS_WITH_SO],
    sourceRefs: src(ALIYUN_SO),
  },
  {
    modelKey: 'qwen3.5-omni-plus', provider: 'dashscope', family: 'qwen-omni',
    aliases: [],
    text: true, vision: true, audio: true,
    structuredOutput: 'json_object',
    contextTokens: undefined,
    streaming: true,
    latencyClass: 'balanced',
    region: ['cn-beijing'],
    knownLimitations: ['不支持 json_schema strict', 'realtime 语音为独立接口'],
    interfaceNotes: [NO_MAX_TOKENS_WITH_SO],
    sourceRefs: src(ALIYUN_MODELS),
  },
  {
    modelKey: 'text-embedding-v4', provider: 'dashscope', family: 'qwen-embedding',
    aliases: [],
    text: false, embedding: true,
    structuredOutput: 'prompt_contract',
    contextTokens: undefined,
    streaming: false, batch: true,
    latencyClass: 'fast',
    region: ['cn-beijing'],
    knownLimitations: ['单价未取到（计费页截断）—— UNVERIFIED'],
    sourceRefs: src(ALIYUN_MODELS),
  },
  {
    modelKey: 'qwen3.7-text-embedding', provider: 'dashscope', family: 'qwen-embedding',
    aliases: [],
    text: false, embedding: true,
    structuredOutput: 'prompt_contract',
    contextTokens: undefined,
    streaming: false, batch: true,
    latencyClass: 'fast',
    region: ['cn-beijing'],
    knownLimitations: ['单价未取到（计费页截断）—— UNVERIFIED'],
    sourceRefs: src(ALIYUN_MODELS),
  },
  {
    modelKey: 'qwen3-rerank', provider: 'dashscope', family: 'qwen-rerank',
    aliases: [],
    text: false, rerank: true,
    structuredOutput: 'prompt_contract',
    contextTokens: undefined,
    streaming: false,
    latencyClass: 'fast',
    region: ['cn-beijing'],
    knownLimitations: ['单价未取到（计费页截断）—— UNVERIFIED', 'gte-rerank 已属历史版本（如遇旧引用应迁移）'],
    sourceRefs: src(ALIYUN_MODELS),
  },
  {
    // Dev route (funded key, Anthropic wire). NOT competition-compliant (non-Qwen base)
    // — the competition routing policy rejects it with a visible reason.
    modelKey: 'glm-4.6', provider: 'zai', family: 'glm',
    aliases: [],
    text: true, toolCalling: false,
    structuredOutput: 'prompt_contract',
    contextTokens: 200_000, contextBasis: 'doc',
    streaming: true,
    latencyClass: 'balanced',
    region: ['cn'],
    knownLimitations: ['非千问基座 — 竞赛合规路线不得使用（competition policy 拒绝）', 'Anthropic Messages wire 无 response_format/tools——结构化契约靠系统提示'],
    interfaceNotes: ['x-api-key 或 Bearer 均可（probe 2026-08-22）'],
    sourceRefs: src('https://open.bigmodel.cn/api/anthropic'),
  },
];

export const CATALOG: readonly ModelCapabilities[] = RAW_CATALOG.map((e) => ModelCapabilities.parse(e));

/** modelKey + alias → entry (first match wins; aliases are provider-accepted wire ids). */
const lookupIndex: Map<string, ModelCapabilities> = (() => {
  const m = new Map<string, ModelCapabilities>();
  for (const entry of CATALOG) {
    m.set(entry.modelKey, entry);
    for (const alias of entry.aliases) m.set(alias, entry);
  }
  return m;
})();

const keyOf = (provider: string, modelId: string): string => `${provider}::${modelId}`;
const providerIndex: Map<string, ModelCapabilities> = new Map(
  CATALOG.map((e) => [keyOf(e.provider, e.modelKey), e] as const),
);

/**
 * Resolve capabilities for a (provider, modelId) pair.
 * Exact provider-scoped match first; then a bare model id match for KNOWN providers
 * (alias/snapshot ids like qwen3.7-plus-2026-05-26 resolve to their family entry —
 * works for builtin provider names AND custom configs pointing at the same platform).
 * Everything else → undefined (capabilities UNVERIFIED — never guessed).
 */
export const capabilitiesForModel = (provider: string, modelId: string): ModelCapabilities | undefined => {
  const scoped = providerIndex.get(keyOf(provider, modelId));
  if (scoped !== undefined) return scoped;
  // Alias/snapshot resolution (qwen3.7-plus-2026-05-26 → qwen3.7-plus): valid when the
  // asking provider owns the entry, or for custom configs (endpoint-agnostic ids).
  // A cross-provider id match (zai + qwen id) stays undefined — honest, never guessed.
  const byBareId = lookupIndex.get(modelId);
  return byBareId !== undefined && (byBareId.provider === provider || provider.startsWith('custom'))
    ? byBareId
    : undefined;
};

/** Is this model id a Qwen-family id (competition base-model rule)? 'qwen' not followed by another letter. */
export const isQwenFamily = (modelId: string): boolean => /^qwen(?![a-z])/i.test(modelId.trim());

/**
 * Bailian (Model Studio) serving-endpoint fact: the DashScope global/international
 * endpoints and the current per-workspace MaaS form ({WorkspaceId}.{region}.maas.
 * aliyuncs.com/compatible-mode/v1) all live under *.aliyuncs.com (competition-route
 * research §B1, re-verified 2026-08-25). Anything else — open.bigmodel.cn,
 * api.deepseek.com, local runtimes, third-party proxies fronting Bailian — is NOT
 * the sanctioned competition calling route; a fronting proxy can be re-admitted by
 * the researcher by turning competition route mode off (documented trade-off).
 */
export const isBailianEndpoint = (baseUrl: string): boolean => {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host === 'aliyuncs.com' || host.endsWith('.aliyuncs.com');
  } catch {
    return false;
  }
};

/**
 * Registry catalog view for discovery/UI: all curated entries for a provider
 * (or all), sorted by modelKey — no secrets, reference prices included.
 */
export const listRegistry = (provider?: string): ModelCapabilities[] =>
  CATALOG.filter((e) => provider === undefined || e.provider === provider)
    .slice()
    .sort((a, b) => a.modelKey.localeCompare(b.modelKey));

/**
 * Structured-output transport negotiation for a route (the dashscope strict-JSON gate).
 * Returns which wire mode the plane may use: server-enforced json_schema strict ONLY
 * when the registry VERIFIED the model supports it; json_object otherwise; a schema the
 * caller could not project (strictSchemaOrUndefined → undefined) always degrades to
 * json_object regardless of model capability.
 */
export const negotiateStructuredOutput = (
  caps: ModelCapabilities | undefined,
  projectedSchema: unknown,
): { mode: 'json_schema_strict' | 'json_object'; schema?: unknown } =>
  caps !== undefined && caps.structuredOutput === 'json_schema_strict' && projectedSchema !== undefined
    ? { mode: 'json_schema_strict', schema: projectedSchema }
    : { mode: 'json_object' };

/** Re-export the canonical interface-note constant for provider adapters. */
export const STRUCTURED_OUTPUT_NO_MAX_TOKENS_NOTE = NO_MAX_TOKENS_WITH_SO;
