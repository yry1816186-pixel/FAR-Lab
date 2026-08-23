/**
 * Typed endpoint functions for the agreed /api/v1 contract (W3, parallel API group).
 *
 *   GET  /api/v1/runs                                list
 *   GET  /api/v1/runs/:id                            detail incl. stages
 *   GET  /api/v1/runs/:id/events?afterSeq=N          incremental event feed
 *   GET  /api/v1/runs/:id/question|sources|evidence|hypotheses|plan|revisions|receipts
 *   GET  /api/v1/runs/:id/report                     markdown text
 *   GET  /api/v1/runs/:id/paper                      IMRaD paper markdown (BP-3; 404 pre-BP3)
 *   POST /api/v1/runs              {text,domain?,goalType?} -> 202 {runId}
 *   POST /api/v1/runs/:id/cancel | /resume           run control
 *   POST /api/v1/runs/:id/feedback {source,content,targetKind?,targetId?} -> 201
 *   GET  /api/v1/verify/:bundleId                    bundle verification report
 */
import { api, ApiError } from './client';
import {
  normalizeEvidence, normalizeEvents, normalizeHypotheses, normalizePlan, normalizeQuestion,
  normalizeReceipts, normalizeRevisions, normalizeRun, normalizeRunSummaries, normalizeSearch, normalizeSources,
} from './normalize';
import type { Automation, BuiltinRouteSummary, BuiltinRouteUpdateInput, BuiltinRoutesResponse, BundleSummary, Conversation, CorpusSnapshotInfo, FeedbackSourceKind, HealthReport, ModelConfigsResponse, ModelConfigInput, ModelConfigSummary, ModelConfigTestInput, ModelConfigTestResult, ResearchActionResponse, ResearchRun, RunEvent, RunSummary, ScientificGoalType, SearchResponse, ToolIntegrationView, ToolTestRecord, UsageAggregate, VerificationReport, ZoteroAnnotation, ZoteroAnnotationsResponse, ZoteroLibItem, ZoteroLibraryResponse } from './types';

const BASE = '/api/v1';

// ---- GET resources ----

export const listRuns = async (signal?: AbortSignal): Promise<RunSummary[]> =>
  normalizeRunSummaries(await api.getJson(`${BASE}/runs`, signal));

export const getRun = async (runId: string, signal?: AbortSignal): Promise<ResearchRun> =>
  normalizeRun(await api.getJson(`${BASE}/runs/${encodeURIComponent(runId)}`, signal));

export const getEvents = async (runId: string, afterSeq: number, signal?: AbortSignal): Promise<RunEvent[]> => {
  const data = await api.getJson(
    `${BASE}/runs/${encodeURIComponent(runId)}/events?afterSeq=${afterSeq}`,
    signal,
  );
  return normalizeEvents(data).sort((a, b) => a.seq - b.seq);
};

export const getQuestion = normalizeWrap('question', normalizeQuestion);
export const getPlan = normalizeWrap('plan', normalizePlan);

export const getSources = async (runId: string, signal?: AbortSignal) =>
  normalizeSources(await api.getJson(`${BASE}/runs/${encodeURIComponent(runId)}/sources`, signal));

export const getEvidence = async (runId: string, signal?: AbortSignal) =>
  normalizeEvidence(await api.getJson(`${BASE}/runs/${encodeURIComponent(runId)}/evidence`, signal));

export const getHypotheses = async (runId: string, signal?: AbortSignal) =>
  normalizeHypotheses(await api.getJson(`${BASE}/runs/${encodeURIComponent(runId)}/hypotheses`, signal));

export const getRevisions = async (runId: string, signal?: AbortSignal) =>
  normalizeRevisions(await api.getJson(`${BASE}/runs/${encodeURIComponent(runId)}/revisions`, signal));

export const getReceipts = async (runId: string, signal?: AbortSignal) =>
  normalizeReceipts(await api.getJson(`${BASE}/runs/${encodeURIComponent(runId)}/receipts`, signal));

/** B2 universal search: cross-run lookup by question / hypothesis statement / claim text. */
export const searchAll = async (q: string, signal?: AbortSignal): Promise<SearchResponse> =>
  normalizeSearch(await api.getJson(`${BASE}/search?q=${encodeURIComponent(q)}`, signal));

/** EEL (D-081): executed-experiment projections — runs, result cells, stat reports. */
export interface ExperimentEvidence {
  experimentRuns: Array<Record<string, unknown>>;
  resultSets: Array<Record<string, unknown>>;
  statReports: Array<Record<string, unknown>>;
}
export const getExperiments = async (runId: string, signal?: AbortSignal): Promise<ExperimentEvidence> => {
  const data = (await api.getJson(`${BASE}/runs/${encodeURIComponent(runId)}/experiments`, signal)) as ExperimentEvidence;
  return {
    experimentRuns: Array.isArray(data?.experimentRuns) ? data.experimentRuns : [],
    resultSets: Array.isArray(data?.resultSets) ? data.resultSets : [],
    statReports: Array.isArray(data?.statReports) ? data.statReports : [],
  };
};

/** First-class bundle discovery (D-060) — replaces the event-regex scan in ProvenanceTab. */
export const getBundles = async (runId: string, signal?: AbortSignal): Promise<BundleSummary[]> => {
  const data: unknown = await api.getJson(`${BASE}/runs/${encodeURIComponent(runId)}/bundles`, signal);
  if (typeof data === 'object' && data !== null && Array.isArray((data as { bundles?: unknown }).bundles)) {
    const list = (data as { bundles: unknown[] }).bundles;
    const out: BundleSummary[] = [];
    for (const item of list) {
      if (typeof item === 'object' && item !== null) {
        const b = item as { id?: unknown; createdAt?: unknown; evidenceLevel?: unknown };
        if (typeof b.id === 'string' && typeof b.createdAt === 'string') {
          out.push({ id: b.id, createdAt: b.createdAt, evidenceLevel: typeof b.evidenceLevel === 'string' ? b.evidenceLevel : '' });
        }
      }
    }
    if (list.length > 0 && out.length === 0) {
      throw new ApiError({ code: 'unexpected_schema', message: 'bundles 列表结构与预期不符', status: 200, retryable: false, i18nKey: 'err.schema', i18nVars: { what: 'bundles list' } });
    }
    return out;
  }
  throw new ApiError({ code: 'unexpected_schema', message: 'bundles 响应缺少 bundles 数组', status: 200, retryable: false, i18nKey: 'err.schema', i18nVars: { what: 'bundles envelope' } });
};

/** Re-run the export stage for a settled run whose revision is newer than its latest bundle (server-guarded). */
export const reexportRun = async (runId: string, signal?: AbortSignal): Promise<void> => {
  await api.post(`${BASE}/runs/${encodeURIComponent(runId)}/reexport`, {}, signal);
};

/** Executed query plan with purposes (transparency panel, D-060). Server answers {corpus: null} when absent. */
export const getCorpus = async (runId: string, signal?: AbortSignal): Promise<CorpusSnapshotInfo | null> => {
  const data: unknown = await api.getJson(`${BASE}/runs/${encodeURIComponent(runId)}/corpus`, signal);
  if (typeof data === 'object' && data !== null && 'corpus' in data) {
    const corpus = (data as { corpus?: unknown }).corpus;
    if (corpus === null) return null;
    if (typeof corpus === 'object' && corpus !== null && Array.isArray((corpus as { queries?: unknown }).queries)) {
      return corpus as CorpusSnapshotInfo;
    }
  }
  throw new ApiError({ code: 'unexpected_schema', message: 'corpus 响应结构与预期不符', status: 200, retryable: false, i18nKey: 'err.schema', i18nVars: { what: 'corpus envelope' } });
};

export const getReport = async (runId: string, signal?: AbortSignal): Promise<string> => {
  const text = await api.getText(`${BASE}/runs/${encodeURIComponent(runId)}/report`, signal);
  return typeof text === 'string' ? text : String(text);
};

/**
 * BP-3 research-product artifact: the deterministic IMRaD paper markdown. 404 on runs
 * whose latest bundle predates BP-3 (no paperOutlineRef) — callers treat that as absent.
 */
export const getPaper = async (runId: string, signal?: AbortSignal): Promise<string> => {
  const text = await api.getText(`${BASE}/runs/${encodeURIComponent(runId)}/paper`, signal);
  return typeof text === 'string' ? text : String(text);
};

export const verifyBundle = async (bundleId: string, signal?: AbortSignal): Promise<VerificationReport> => {
  const data = await api.getJson(`${BASE}/verify/${encodeURIComponent(bundleId)}`, signal);
  if (
    typeof data === 'object' && data !== null && 'verdict' in data &&
    'checks' in data && Array.isArray((data as { checks: unknown }).checks)
  ) {
    return data as VerificationReport;
  }
  throw new ApiError({
    code: 'unexpected_schema',
    message: '验证报告结构与预期不符（缺少 verdict/checks）',
    status: 200,
    retryable: false,
    i18nKey: 'err.verifySchema',
  });
};

// ---- mutations ----

export interface CreateRunInput {
  text: string;
  domain?: string;
  goalType?: ScientificGoalType;
  /** Optional user-defined model route for this run (mcfg_… id). */
  providerConfigId?: string;
  /** R1: user-provided seed sources (PDF text / parsed citations / Zotero picks). */
  seeds?: import('../utils/ingest').SeedInput[];
}

export const createRun = async (input: CreateRunInput, signal?: AbortSignal): Promise<string> => {
  const data = await api.post(`${BASE}/runs`, input, signal);
  const runId = typeof data === 'object' && data !== null && 'runId' in data
    ? (data as { runId?: unknown }).runId
    : undefined;
  if (typeof runId === 'string' && runId.length > 0) return runId;
  throw new ApiError({
    code: 'unexpected_schema',
    message: '创建 run 的响应缺少 runId（期望 202 响应含 runId 字段）',
    status: 202,
    retryable: false,
    i18nKey: 'err.createRunShape',
  });
};

export const cancelRun = async (runId: string, signal?: AbortSignal): Promise<void> => {
  await api.post(`${BASE}/runs/${encodeURIComponent(runId)}/cancel`, {}, signal);
};

/** Researcher lifecycle (gap R1): hard-delete a settled run + everything it owns.
 *  Server refuses (409 run_active) while the run is executing or status==='running'. */
export const deleteRun = async (runId: string, signal?: AbortSignal): Promise<void> => {
  await api.del(`${BASE}/runs/${encodeURIComponent(runId)}`, signal);
};

export const resumeRun = async (runId: string, signal?: AbortSignal): Promise<void> => {
  await api.post(`${BASE}/runs/${encodeURIComponent(runId)}/resume`, {}, signal);
};

/** Workbench health strip (P-IA) — fail-visible: schema drift surfaces as ApiError, never as fake-ok. */
export const getHealth = async (signal?: AbortSignal): Promise<HealthReport> => {
  const data: unknown = await api.getJson(`${BASE}/health`, signal);
  if (
    typeof data === 'object' && data !== null &&
    'status' in data && 'db' in data && 'watchdog' in data && 'providers' in data &&
    Array.isArray((data as { providers: unknown }).providers)
  ) {
    return data as HealthReport;
  }
  throw new ApiError({
    code: 'unexpected_schema',
    message: '健康检查响应结构与预期不符（缺少 status/db/watchdog/providers）',
    status: 200,
    retryable: false,
    i18nKey: 'err.healthShape',
  });
};

export interface FeedbackInput {
  source: FeedbackSourceKind;
  content: string;
  targetKind?: string;
  targetId?: string;
}

export const postFeedback = async (runId: string, input: FeedbackInput, signal?: AbortSignal): Promise<void> => {
  await api.post(`${BASE}/runs/${encodeURIComponent(runId)}/feedback`, input, signal);
};

// ---- user-defined model configurations (custom model routes) ----

const modelConfigOf = (data: unknown): ModelConfigSummary => {
  if (typeof data === 'object' && data !== null) {
    const c = data as Record<string, unknown>;
    if (typeof c.id === 'string' && typeof c.label === 'string' && (c.wire === 'openai' || c.wire === 'anthropic')
      && typeof c.baseUrl === 'string' && typeof c.modelId === 'string') {
      return {
        id: c.id,
        label: c.label,
        wire: c.wire,
        baseUrl: c.baseUrl,
        modelId: c.modelId,
        apiKeySet: c.apiKeySet === true,
        apiKeyMasked: typeof c.apiKeyMasked === 'string' ? c.apiKeyMasked : '',
        active: c.active === true,
        createdAt: typeof c.createdAt === 'string' ? c.createdAt : '',
        updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : '',
      };
    }
  }
  throw new ApiError({ code: 'unexpected_schema', message: '模型配置结构与预期不符', status: 200, retryable: false, i18nKey: 'err.schema', i18nVars: { what: 'model config' } });
};

export const listModelConfigs = async (signal?: AbortSignal): Promise<ModelConfigsResponse> => {
  const data: unknown = await api.getJson(`${BASE}/model-configs`, signal);
  if (typeof data === 'object' && data !== null && Array.isArray((data as { configs?: unknown }).configs)) {
    const env = (data as { envDefault?: unknown }).envDefault;
    return {
      configs: ((data as { configs: unknown[] }).configs).map(modelConfigOf),
      activeModelConfigId: typeof (data as { activeModelConfigId?: unknown }).activeModelConfigId === 'string'
        ? (data as { activeModelConfigId: string }).activeModelConfigId
        : null,
      envDefault: typeof env === 'object' && env !== null
        ? env as ModelConfigsResponse['envDefault']
        : null,
    };
  }
  throw new ApiError({ code: 'unexpected_schema', message: '模型配置列表响应缺少 configs 数组', status: 200, retryable: false, i18nKey: 'err.schema', i18nVars: { what: 'model configs envelope' } });
};

export const createModelConfig = async (input: ModelConfigInput, signal?: AbortSignal): Promise<ModelConfigSummary> =>
  modelConfigOf((await api.post(`${BASE}/model-configs`, input, signal) as { config?: unknown }).config);

/** Full update; omit `apiKey` to keep the stored key (the server treats absence as keep). */
export const updateModelConfig = async (
  id: string,
  input: Omit<ModelConfigInput, 'apiKey'> & { apiKey?: string },
  signal?: AbortSignal,
): Promise<ModelConfigSummary> =>
  modelConfigOf((await api.put(`${BASE}/model-configs/${encodeURIComponent(id)}`, input, signal) as { config?: unknown }).config);

export const deleteModelConfig = async (id: string, signal?: AbortSignal): Promise<void> => {
  await api.del(`${BASE}/model-configs/${encodeURIComponent(id)}`, signal);
};

/** Set (id) or clear (null) the workspace default model config. */
export const setActiveModelConfig = async (id: string | null, signal?: AbortSignal): Promise<void> => {
  await api.put(`${BASE}/model-configs/active`, { id }, signal);
};

// ---- built-in env routes (zai/dashscope): modelId override + pricing + default switch ----

const builtinRouteOf = (data: unknown): BuiltinRouteSummary => {
  if (typeof data === 'object' && data !== null) {
    const r = data as Record<string, unknown>;
    if (typeof r.name === 'string' && (r.kind === 'live' || r.kind === 'archived')
      && typeof r.envModelId === 'string' && typeof r.effectiveModelId === 'string') {
      return {
        name: r.name,
        kind: r.kind,
        liveReady: r.liveReady === true,
        baseUrl: typeof r.baseUrl === 'string' ? r.baseUrl : '',
        apiKeyEnvVar: typeof r.apiKeyEnvVar === 'string' ? r.apiKeyEnvVar : '',
        envModelId: r.envModelId,
        effectiveModelId: r.effectiveModelId,
        ...(typeof r.pricing === 'object' && r.pricing !== null ? { pricing: r.pricing as BuiltinRouteSummary['pricing'] } : {}),
        isBuiltinDefault: r.isBuiltinDefault === true,
      };
    }
  }
  throw new ApiError({ code: 'unexpected_schema', message: '内置路由结构与预期不符', status: 200, retryable: false, i18nKey: 'err.schema', i18nVars: { what: 'built-in route' } });
};

const builtinRoutesOf = (data: unknown): BuiltinRoutesResponse => {
  if (typeof data === 'object' && data !== null && Array.isArray((data as { routes?: unknown }).routes)) {
    const d = data as { routes: unknown[]; defaultSource?: unknown };
    return {
      routes: d.routes.map(builtinRouteOf),
      defaultSource: d.defaultSource === 'ui' ? 'ui' : 'env',
    };
  }
  throw new ApiError({ code: 'unexpected_schema', message: '内置路由列表响应缺少 routes 数组', status: 200, retryable: false, i18nKey: 'err.schema', i18nVars: { what: 'built-in routes envelope' } });
};

export const listBuiltinRoutes = async (signal?: AbortSignal): Promise<BuiltinRoutesResponse> =>
  builtinRoutesOf(await api.getJson(`${BASE}/model-configs/builtin-routes`, signal));

export const updateBuiltinRoute = async (
  name: string,
  input: BuiltinRouteUpdateInput,
  signal?: AbortSignal,
): Promise<BuiltinRoutesResponse> =>
  builtinRoutesOf(await api.put(`${BASE}/model-configs/builtin-routes/${encodeURIComponent(name)}`, input, signal));

/** Switch the built-in default route (applies to the next call; the env chain stays untouched). */
export const setBuiltinDefaultRoute = async (name: string, signal?: AbortSignal): Promise<BuiltinRoutesResponse> =>
  builtinRoutesOf(await api.put(`${BASE}/model-configs/builtin-routes`, { name }, signal));

/** ONE tiny live call against the route (stored config by id, or an unsaved draft with its key). */
export const testModelConfig = async (input: ModelConfigTestInput, signal?: AbortSignal): Promise<ModelConfigTestResult> => {
  const data: unknown = await api.post(`${BASE}/model-configs/test`, input, signal);
  if (typeof data === 'object' && data !== null && typeof (data as { ok?: unknown }).ok === 'boolean') {
    const r = data as Record<string, unknown>;
    return {
      ok: r.ok === true,
      modelId: typeof r.modelId === 'string' ? r.modelId : '',
      latencyMs: typeof r.latencyMs === 'number' ? r.latencyMs : 0,
      ...(r.sample !== undefined ? { sample: r.sample } : {}),
      ...(typeof r.error === 'object' && r.error !== null ? { error: r.error as ModelConfigTestResult['error'] } : {}),
    };
  }
  throw new ApiError({ code: 'unexpected_schema', message: '连接测试响应结构与预期不符', status: 200, retryable: false, i18nKey: 'err.schema', i18nVars: { what: 'model config test result' } });
};

// ---- BP-4 model control plane v2: usage ledger + model discovery ----

export interface DiscoveredModel {
  id: string;
  ownedBy?: string;
  displayName?: string;
  createdAt?: string;
}

/** Workspace-wide usage aggregates (GET /model-configs/usage). */
export const getUsage = async (signal?: AbortSignal): Promise<{ aggregates: UsageAggregate[] }> => {
  const data: unknown = await api.getJson(`${BASE}/model-configs/usage`, signal);
  if (typeof data !== 'object' || data === null || !Array.isArray((data as { aggregates?: unknown }).aggregates)) {
    throw new ApiError({ code: 'unexpected_schema', message: '用量响应结构与预期不符', status: 200, retryable: false, i18nKey: 'err.schema', i18nVars: { what: 'usage aggregates' } });
  }
  return { aggregates: (data as { aggregates: UsageAggregate[] }).aggregates };
};

/** Gap R5: workspace USD spend ceiling (null = unlimited). SpentUsd counts only
 *  routes with declared pricing; unpriced calls are reported, never guessed. */
export interface SpendLimitStatus {
  limitUsd: number | null;
  spentUsd: number;
  unpricedCalls: number;
}

export const getSpendLimit = async (signal?: AbortSignal): Promise<SpendLimitStatus> => {
  const data: unknown = await api.getJson(`${BASE}/model-configs/spend-limit`, signal);
  if (typeof data === 'object' && data !== null && typeof (data as { spentUsd?: unknown }).spentUsd === 'number'
    && typeof (data as { unpricedCalls?: unknown }).unpricedCalls === 'number') {
    const limit = (data as { limitUsd?: unknown }).limitUsd;
    return {
      limitUsd: typeof limit === 'number' ? limit : null,
      spentUsd: (data as { spentUsd: number }).spentUsd,
      unpricedCalls: (data as { unpricedCalls: number }).unpricedCalls,
    };
  }
  throw new ApiError({ code: 'unexpected_schema', message: '支出上限响应结构与预期不符', status: 200, retryable: false, i18nKey: 'err.schema', i18nVars: { what: 'spend limit' } });
};

export const setSpendLimit = async (limitUsd: number | null, signal?: AbortSignal): Promise<SpendLimitStatus> => {
  const data: unknown = await api.put(`${BASE}/model-configs/spend-limit`, { limitUsd }, signal);
  if (typeof data === 'object' && data !== null && typeof (data as { spentUsd?: unknown }).spentUsd === 'number') {
    const limit = (data as { limitUsd?: unknown }).limitUsd;
    return {
      limitUsd: typeof limit === 'number' ? limit : null,
      spentUsd: (data as { spentUsd: number }).spentUsd,
      unpricedCalls: typeof (data as { unpricedCalls?: unknown }).unpricedCalls === 'number' ? (data as { unpricedCalls: number }).unpricedCalls : 0,
    };
  }
  throw new ApiError({ code: 'unexpected_schema', message: '支出上限保存响应结构与预期不符', status: 200, retryable: false, i18nKey: 'err.schema', i18nVars: { what: 'spend limit response' } });
};

/** List the models an endpoint serves (POST /model-configs/discover). */
export const discoverModels = async (
  input: { configId?: string; wire?: string; baseUrl?: string; apiKey?: string },
  signal?: AbortSignal,
): Promise<{ models: DiscoveredModel[] }> => {
  const data: unknown = await api.post(`${BASE}/model-configs/discover`, input, signal);
  if (typeof data !== 'object' || data === null || !Array.isArray((data as { models?: unknown }).models)) {
    throw new ApiError({ code: 'unexpected_schema', message: '模型发现响应结构与预期不符', status: 200, retryable: false, i18nKey: 'err.schema', i18nVars: { what: 'discovered models' } });
  }
  return { models: (data as { models: DiscoveredModel[] }).models };
};

// ---- Zotero local library (server bridge; the page cannot call 23119 directly) ----

const zoteroItemOf = (data: unknown): ZoteroLibItem => {
  if (typeof data === 'object' && data !== null) {
    const c = data as Record<string, unknown>;
    if (typeof c.key === 'string' && typeof c.title === 'string' && typeof c.itemType === 'string') {
      return {
        key: c.key,
        title: c.title,
        itemType: c.itemType,
        ...(typeof c.year === 'number' ? { year: c.year } : {}),
        creators: Array.isArray(c.creators) ? c.creators.filter((x): x is string => typeof x === 'string') : [],
        ...(typeof c.doi === 'string' ? { doi: c.doi } : {}),
        ...(typeof c.url === 'string' ? { url: c.url } : {}),
        tags: Array.isArray(c.tags) ? c.tags.filter((x): x is string => typeof x === 'string') : [],
        collections: Array.isArray(c.collections) ? c.collections.filter((x): x is string => typeof x === 'string') : [],
        relatedKeys: Array.isArray(c.relatedKeys) ? c.relatedKeys.filter((x): x is string => typeof x === 'string') : [],
      };
    }
  }
  throw new ApiError({ code: 'unexpected_schema', message: 'Zotero 文献条目结构与预期不符', status: 200, retryable: false, i18nKey: 'err.schema', i18nVars: { what: 'zotero item' } });
};

/** Full local-library snapshot via GET /zotero/library; 503 when Zotero is not running. */
export const getZoteroLibrary = async (signal?: AbortSignal): Promise<ZoteroLibraryResponse> => {
  const data: unknown = await api.getJson(`${BASE}/zotero/library`, signal);
  if (typeof data === 'object' && data !== null && Array.isArray((data as { items?: unknown }).items)) {
    const r = data as Record<string, unknown>;
    return {
      items: (r.items as unknown[]).map(zoteroItemOf),
      total: typeof r.total === 'number' ? r.total : 0,
      fetchedAt: typeof r.fetchedAt === 'string' ? r.fetchedAt : '',
    };
  }
  throw new ApiError({ code: 'unexpected_schema', message: 'Zotero 文库响应缺少 items 数组', status: 200, retryable: false, i18nKey: 'err.schema', i18nVars: { what: 'zotero library' } });
};

/** Researcher annotations (highlights/notes) via GET /zotero/annotations — the
 *  researcher's own critical reading, imported as seed text. 503 when Zotero is down. */
export const getZoteroAnnotations = async (signal?: AbortSignal): Promise<ZoteroAnnotationsResponse> => {
  const data: unknown = await api.getJson(`${BASE}/zotero/annotations`, signal);
  if (typeof data === 'object' && data !== null && Array.isArray((data as { annotations?: unknown }).annotations)) {
    const r = data as Record<string, unknown>;
    return {
      annotations: (r.annotations as unknown[]).filter((a): a is ZoteroAnnotation =>
        typeof a === 'object' && a !== null && typeof (a as { key?: unknown }).key === 'string'),
      total: typeof r.total === 'number' ? r.total : 0,
      fetchedAt: typeof r.fetchedAt === 'string' ? r.fetchedAt : '',
    };
  }
  throw new ApiError({ code: 'unexpected_schema', message: 'Zotero 注释响应缺少 annotations 数组', status: 200, retryable: false, i18nKey: 'err.schema', i18nVars: { what: 'zotero annotations' } });
};

// ---- conversations (conversation-first research flow) ----

const conversationOf = (data: unknown): Conversation => {
  if (typeof data !== 'object' || data === null || !Array.isArray((data as { messages?: unknown }).messages)) {
    throw new ApiError({ code: 'unexpected_schema', message: '对话响应结构与预期不符', status: 200, retryable: false, i18nKey: 'err.schema', i18nVars: { what: 'conversation' } });
  }
  return data as Conversation;
};

export const listConversations = async (signal?: AbortSignal): Promise<Conversation[]> => {
  const data: unknown = await api.getJson(`${BASE}/conversations`, signal);
  if (typeof data === 'object' && data !== null && Array.isArray((data as { conversations?: unknown }).conversations)) {
    return (data as { conversations: Conversation[] }).conversations;
  }
  throw new ApiError({ code: 'unexpected_schema', message: '对话列表响应缺少 conversations 数组', status: 200, retryable: false, i18nKey: 'err.schema', i18nVars: { what: 'conversations envelope' } });
};

export const getConversation = async (id: string, signal?: AbortSignal): Promise<Conversation> =>
  conversationOf((await api.getJson(`${BASE}/conversations/${encodeURIComponent(id)}`, signal) as { conversation?: unknown }).conversation);

export const createConversation = async (input: { title?: string; providerConfigId?: string }, signal?: AbortSignal): Promise<Conversation> =>
  conversationOf((await api.post(`${BASE}/conversations`, input, signal) as { conversation?: unknown }).conversation);

/** One dialogue turn: researcher message (with materials) → the agent's real reply. */
export const postConversationMessage = async (
  id: string,
  input: { text: string; seeds?: unknown },
  signal?: AbortSignal,
): Promise<Conversation> =>
  conversationOf((await api.post(`${BASE}/conversations/${encodeURIComponent(id)}/messages`, input, signal) as { conversation?: unknown }).conversation);

/** Re-run the resident agent's reply for the conversation's last (unanswered)
 * researcher message — the failed-turn retry path; the message itself is
 * already durable history and never re-sent. */
export const retryConversationTurn = async (id: string, messageId: string, signal?: AbortSignal): Promise<Conversation> =>
  conversationOf((await api.post(`${BASE}/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}/retry`, {}, signal) as { conversation?: unknown }).conversation);

/** The conversation's reasoning-capability view (route-declared) and current gear. */
export interface ConversationReasoningInfo {
  supported: boolean;
  style?: 'reasoning_effort' | 'enable_thinking' | 'thinking_budget';
  defaultGear?: 'low' | 'medium' | 'high';
  gear?: 'low' | 'medium' | 'high' | null;
  effectiveGear?: 'low' | 'medium' | 'high';
}

/** Read the reasoning capability/gear view for a conversation. */
export const getConversationReasoning = async (id: string, signal?: AbortSignal): Promise<ConversationReasoningInfo> => {
  const data = await api.getJson(`${BASE}/conversations/${encodeURIComponent(id)}/reasoning-gear`, signal);
  if (typeof data === 'object' && data !== null && typeof (data as { supported?: unknown }).supported === 'boolean') {
    return data as ConversationReasoningInfo;
  }
  throw new ApiError({ code: 'unexpected_schema', message: '思考档位响应结构与预期不符', status: 200, retryable: false, i18nKey: 'err.schema', i18nVars: { what: 'reasoning-gear envelope' } });
};

/** Set or clear the conversation's reasoning-effort override (null = config default). */
export const setConversationReasoningGear = async (id: string, gear: 'low' | 'medium' | 'high' | null, signal?: AbortSignal): Promise<{ reasoningGear: 'low' | 'medium' | 'high' | null }> => {
  const data = await api.put(`${BASE}/conversations/${encodeURIComponent(id)}/reasoning-gear`, { gear }, signal);
  if (typeof data === 'object' && data !== null && 'reasoningGear' in (data as Record<string, unknown>)) {
    return data as { reasoningGear: 'low' | 'medium' | 'high' | null };
  }
  throw new ApiError({ code: 'unexpected_schema', message: '思考档位设置响应结构与预期不符', status: 200, retryable: false, i18nKey: 'err.schema', i18nVars: { what: 'reasoning-gear response' } });
};

/** Launch a research run from a crystallized question; all conversation materials travel with it. */
export const launchFromConversation = async (
  id: string,
  input: { text: string; providerConfigId?: string },
  signal?: AbortSignal,
): Promise<string> => {
  const data = await api.post(`${BASE}/conversations/${encodeURIComponent(id)}/launch`, input, signal);
  const runId = typeof data === 'object' && data !== null ? (data as { runId?: unknown }).runId : undefined;
  if (typeof runId === 'string' && runId.length > 0) return runId;
  throw new ApiError({ code: 'unexpected_schema', message: '启动研究的响应缺少 runId', status: 202, retryable: false, i18nKey: 'err.createRunShape' });
};

export const deleteConversation = async (id: string, signal?: AbortSignal): Promise<void> => {
  await api.del(`${BASE}/conversations/${encodeURIComponent(id)}`, signal);
};

/** Approve (optionally remembering the kind for this conversation) or reject a pending proposal. */
export const resolveConversationProposal = async (
  conversationId: string,
  proposalId: string,
  input: { approve: boolean; remember?: boolean },
): Promise<Conversation> =>
  conversationOf((await api.post(
    `${BASE}/conversations/${encodeURIComponent(conversationId)}/proposals/${encodeURIComponent(proposalId)}`,
    input,
  ) as { conversation?: unknown }).conversation);

// ---- automations (resident agent R3) ----

const automationsOf = async (data: unknown): Promise<Automation[]> => {
  if (typeof data === 'object' && data !== null && Array.isArray((data as { automations?: unknown }).automations)) {
    return (data as { automations: Automation[] }).automations;
  }
  throw new ApiError({ code: 'unexpected_schema', message: '自动化列表响应缺少 automations 数组', status: 200, retryable: false, i18nKey: 'err.schema', i18nVars: { what: 'automations envelope' } });
};

export const listConversationAutomations = async (conversationId: string, signal?: AbortSignal): Promise<Automation[]> =>
  automationsOf(await api.getJson(`${BASE}/conversations/${encodeURIComponent(conversationId)}/automations`, signal));

export const listAutomations = async (signal?: AbortSignal): Promise<Automation[]> =>
  automationsOf(await api.getJson(`${BASE}/automations`, signal));

export const setAutomationEnabled = async (id: string, enabled: boolean): Promise<Automation> => {
  const data = await api.patch(`${BASE}/automations/${encodeURIComponent(id)}`, { enabled });
  const automation = typeof data === 'object' && data !== null ? (data as { automation?: unknown }).automation : undefined;
  if (typeof automation !== 'object' || automation === null) {
    throw new ApiError({ code: 'unexpected_schema', message: '自动化更新响应缺少 automation 对象', status: 200, retryable: false, i18nKey: 'err.schema', i18nVars: { what: 'automation' } });
  }
  return automation as Automation;
};

export const deleteAutomation = async (id: string, signal?: AbortSignal): Promise<void> => {
  await api.del(`${BASE}/automations/${encodeURIComponent(id)}`, signal);
};

// ---- settings center: agent approval policy + server meta ----

export interface AgentPolicyRemembered {
  conversationId: string;
  conversationTitle: string;
  kinds: string[];
}

export interface AgentPolicy {
  defaultPolicy: 'ask_per_conversation';
  remembered: AgentPolicyRemembered[];
}

export const getAgentPolicy = async (signal?: AbortSignal): Promise<AgentPolicy> => {
  const data: unknown = await api.getJson(`${BASE}/agent-policy`, signal);
  if (typeof data === 'object' && data !== null && Array.isArray((data as { remembered?: unknown }).remembered)) {
    const d = data as { defaultPolicy?: unknown; remembered: unknown[] };
    return {
      defaultPolicy: 'ask_per_conversation',
      remembered: d.remembered.map((r): AgentPolicyRemembered => {
        const x = r as Record<string, unknown>;
        return {
          conversationId: typeof x.conversationId === 'string' ? x.conversationId : '',
          conversationTitle: typeof x.conversationTitle === 'string' ? x.conversationTitle : '',
          kinds: Array.isArray(x.kinds) ? x.kinds.filter((k): k is string => typeof k === 'string') : [],
        };
      }),
    };
  }
  throw new ApiError({ code: 'unexpected_schema', message: '审批策略响应缺少 remembered 数组', status: 200, retryable: false, i18nKey: 'err.schema', i18nVars: { what: 'agent policy' } });
};

/** Revoke a conversation's remembered approval kinds (back to ask-every-time). */
export const revokeRememberedKinds = async (conversationId: string, signal?: AbortSignal): Promise<void> => {
  await api.del(`${BASE}/agent-policy/remember/${encodeURIComponent(conversationId)}`, signal);
};

export interface ServerMeta {
  version: string;
  dataDir: string;
}

export const getServerMeta = async (signal?: AbortSignal): Promise<ServerMeta> => {
  const data: unknown = await api.getJson(`${BASE}/meta`, signal);
  if (typeof data === 'object' && data !== null
    && typeof (data as { version?: unknown }).version === 'string'
    && typeof (data as { dataDir?: unknown }).dataDir === 'string') {
    return data as ServerMeta;
  }
  throw new ApiError({ code: 'unexpected_schema', message: '服务器元信息结构与预期不符', status: 200, retryable: false, i18nKey: 'err.schema', i18nVars: { what: 'server meta' } });
};

// ---- small helper (local, avoids repeating the 404-passthrough pattern) ----

function normalizeWrap<T>(
  resource: 'question' | 'plan',
  normalize: (data: unknown) => T,
): (runId: string, signal?: AbortSignal) => Promise<T> {
  return async (runId: string, signal?: AbortSignal): Promise<T> =>
    normalize(await api.getJson(`${BASE}/runs/${encodeURIComponent(runId)}/${resource}`, signal));
}

/** B4: object-level AI research action (grounded adversarial analysis). */
export const postResearchAction = async (
  runId: string,
  input: { action: string; targetType: string; targetId: string; question?: string },
  signal?: AbortSignal,
): Promise<ResearchActionResponse> => {
  const data = await api.post(`${BASE}/runs/${encodeURIComponent(runId)}/actions`, input, signal);
  // Fail-closed shape check: the contract is fixed and every field is load-bearing.
  if (
    typeof data !== 'object' || data === null || typeof (data as ResearchActionResponse).analysis !== 'object'
    || !Array.isArray((data as ResearchActionResponse).analysis.points)
  ) {
    throw new ApiError({ code: 'unexpected_schema', message: 'research action response malformed', retryable: false });
  }
  return data as ResearchActionResponse;
};

// ---- B5: hypothesis lifecycle operations (POST /runs/:id/hypotheses/:hypId/<op>) ----

export type HypothesisOpStatus = 'active' | 'promoted' | 'rejected';
export type ClaimLinkDirection = 'supports' | 'counters';

/** Every op contract anchors on hypothesisId; the rest is op-specific. */
export interface HypothesisOpResult {
  hypothesisId: string;
  status?: HypothesisOpStatus;
  forkedFrom?: string;
  claimId?: string;
  direction?: ClaimLinkDirection;
  /** BP-2 edit op: the causal-chain ids of the applied correction. */
  version?: number;
  revisionId?: string;
  feedbackId?: string;
  predecessorArtifactRef?: string;
  changedFields?: string[];
}

/** Fail-visible response narrowing (same style as modelConfigOf): shape-checked, single assertion. */
const hypOpResultOf = (data: unknown): HypothesisOpResult => {
  if (typeof data !== 'object' || data === null) {
    throw new ApiError({ code: 'unexpected_schema', message: '假设操作响应不是对象', status: 200, retryable: false, i18nKey: 'err.schema', i18nVars: { what: 'hypothesis op result' } });
  }
  const r = data as {
    hypothesisId?: unknown;
    status?: unknown;
    forkedFrom?: unknown;
    claimId?: unknown;
    direction?: unknown;
    version?: unknown;
    revisionId?: unknown;
    feedbackId?: unknown;
    predecessorArtifactRef?: unknown;
    changedFields?: unknown;
  };
  if (typeof r.hypothesisId !== 'string' || r.hypothesisId.length === 0) {
    throw new ApiError({ code: 'unexpected_schema', message: '假设操作响应缺少 hypothesisId', status: 200, retryable: false, i18nKey: 'err.schema', i18nVars: { what: 'hypothesis op result' } });
  }
  return {
    hypothesisId: r.hypothesisId,
    ...(typeof r.status === 'string' ? { status: r.status as HypothesisOpStatus } : {}),
    ...(typeof r.forkedFrom === 'string' ? { forkedFrom: r.forkedFrom } : {}),
    ...(typeof r.claimId === 'string' ? { claimId: r.claimId } : {}),
    ...(typeof r.direction === 'string' ? { direction: r.direction as ClaimLinkDirection } : {}),
    ...(typeof r.version === 'number' ? { version: r.version } : {}),
    ...(typeof r.revisionId === 'string' ? { revisionId: r.revisionId } : {}),
    ...(typeof r.feedbackId === 'string' ? { feedbackId: r.feedbackId } : {}),
    ...(typeof r.predecessorArtifactRef === 'string' ? { predecessorArtifactRef: r.predecessorArtifactRef } : {}),
    ...(Array.isArray(r.changedFields) && r.changedFields.every((f) => typeof f === 'string') ? { changedFields: r.changedFields as string[] } : {}),
  };
};

const postHypOp = (
  runId: string,
  hypId: string,
  op: 'promote' | 'reject' | 'fork' | 'connect' | 'edit',
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<HypothesisOpResult> =>
  api
    .post(`${BASE}/runs/${encodeURIComponent(runId)}/hypotheses/${encodeURIComponent(hypId)}/${op}`, body, signal)
    .then(hypOpResultOf);

export const promoteHypothesis = (runId: string, hypId: string, signal?: AbortSignal): Promise<HypothesisOpResult> =>
  postHypOp(runId, hypId, 'promote', {}, signal);

export const rejectHypothesis = (runId: string, hypId: string, signal?: AbortSignal): Promise<HypothesisOpResult> =>
  postHypOp(runId, hypId, 'reject', {}, signal);

export const forkHypothesis = (runId: string, hypId: string, signal?: AbortSignal): Promise<HypothesisOpResult> =>
  postHypOp(runId, hypId, 'fork', {}, signal);

/** BP-2: direct researcher correction — enters the causal revision chain (feedback -> revision -> version bump). */
export const editHypothesis = (
  runId: string,
  hypId: string,
  body: { statement?: string; mechanism?: string; note: string },
  signal?: AbortSignal,
): Promise<HypothesisOpResult> =>
  postHypOp(runId, hypId, 'edit', body as Record<string, unknown>, signal);

export const connectClaim = (
  runId: string,
  hypId: string,
  claimId: string,
  direction: ClaimLinkDirection,
  signal?: AbortSignal,
): Promise<HypothesisOpResult> =>
  postHypOp(runId, hypId, 'connect', { claimId, direction }, signal);

// ---- tool integrations (TIS: researcher-wired external tools) ----

/** Defensive projection: only fields the shapes above define survive. */
const toolIntegrationOf = (data: unknown): ToolIntegrationView => {
  if (typeof data !== 'object' || data === null) throw new ApiError({ code: 'tools_malformed', message: 'tool integration: malformed response' });
  return data as ToolIntegrationView;
};

export const listToolIntegrations = async (signal?: AbortSignal): Promise<ToolIntegrationView[]> => {
  const data: unknown = await api.getJson(`${BASE}/tools`, signal);
  if (typeof data !== 'object' || data === null || !Array.isArray((data as { integrations?: unknown }).integrations)) {
    throw new ApiError({ code: 'tools_malformed', message: 'tool integrations: malformed response' });
  }
  return ((data as { integrations: unknown[] }).integrations).map(toolIntegrationOf);
};

export const createToolIntegration = async (input: Record<string, unknown>, signal?: AbortSignal): Promise<ToolIntegrationView> =>
  toolIntegrationOf((await api.post(`${BASE}/tools`, input, signal) as { integration?: unknown }).integration);

export const updateToolIntegration = async (id: string, input: Record<string, unknown>, signal?: AbortSignal): Promise<ToolIntegrationView> =>
  toolIntegrationOf((await api.put(`${BASE}/tools/${encodeURIComponent(id)}`, input, signal) as { integration?: unknown }).integration);

export const deleteToolIntegration = async (id: string, signal?: AbortSignal): Promise<void> => {
  await api.del(`${BASE}/tools/${encodeURIComponent(id)}`, signal);
};

export const testToolIntegration = async (id: string, signal?: AbortSignal): Promise<ToolTestRecord> => {
  const data = await api.post(`${BASE}/tools/${encodeURIComponent(id)}/test`, {}, signal);
  if (typeof data !== 'object' || data === null || typeof (data as { test?: unknown }).test !== 'object') {
    throw new ApiError({ code: 'tools_malformed', message: 'tool test: malformed response' });
  }
  return (data as { test: ToolTestRecord }).test;
};

export interface PluginImportResponse {
  plugin: { name: string; version: string; license: string };
  integrations: ToolIntegrationView[];
  warnings: string[];
}

export const importPluginFromDir = async (dir: string, signal?: AbortSignal): Promise<PluginImportResponse> => {
  const data = await api.post(`${BASE}/tools/import-plugin`, { dir, reviewed: true }, signal);
  if (typeof data !== 'object' || data === null || !Array.isArray((data as { integrations?: unknown }).integrations)) {
    throw new ApiError({ code: 'tools_malformed', message: 'plugin import: malformed response' });
  }
  return data as PluginImportResponse;
};
