/**
 * Typed endpoint functions for the agreed /api/v1 contract (W3, parallel API group).
 *
 *   GET  /api/v1/runs                                list
 *   GET  /api/v1/runs/:id                            detail incl. stages
 *   GET  /api/v1/runs/:id/events?afterSeq=N          incremental event feed
 *   GET  /api/v1/runs/:id/question|sources|evidence|hypotheses|plan|revisions|receipts
 *   GET  /api/v1/runs/:id/report                     markdown text
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
import type { BundleSummary, CorpusSnapshotInfo, FeedbackSourceKind, HealthReport, ResearchRun, RunEvent, RunSummary, ScientificGoalType, SearchResponse, VerificationReport } from './types';

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

// ---- small helper (local, avoids repeating the 404-passthrough pattern) ----

function normalizeWrap<T>(
  resource: 'question' | 'plan',
  normalize: (data: unknown) => T,
): (runId: string, signal?: AbortSignal) => Promise<T> {
  return async (runId: string, signal?: AbortSignal): Promise<T> =>
    normalize(await api.getJson(`${BASE}/runs/${encodeURIComponent(runId)}/${resource}`, signal));
}
