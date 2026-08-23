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
import type { BundleSummary, CorpusSnapshotInfo, FeedbackSourceKind, HealthReport, ModelConfigsResponse, ModelConfigInput, ModelConfigSummary, ModelConfigTestInput, ModelConfigTestResult, ResearchActionResponse, ResearchRun, RunEvent, RunSummary, ScientificGoalType, SearchResponse, UsageAggregate, VerificationReport, ZoteroLibraryResponse } from './types';

const BASE = '/api/v1';

// ---- GET resources ----

/** Zotero local-library bridge (server proxies http://localhost:23119 — browser CORS cannot). */
export const getZoteroLibrary = async (signal?: AbortSignal): Promise<ZoteroLibraryResponse> => {
  const data = await api.getJson(`${BASE}/zotero/library`, signal);
  if (typeof data !== 'object' || data === null) throw new Error('malformed zotero library response');
  return data as ZoteroLibraryResponse;
};

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
