/**
 * API client — TanStack Query 5 hooks for the FAR-Lab backend (spec 24 API gateway).
 *
 * Default base URL: http://localhost:3000 (spec 24). Override via VITE_API_BASE_URL.
 *
 * Path layout (spec 24 §0#2): ALL app endpoints live under the /api/v1/ prefix.
 * Only the liveness + readiness probes (§0#3) live on the bare root (/health, /ready).
 *
 * Field contract: the frontend consumes backend field names VERBATIM (camelCase ·
 * spec 24 §0 casing rule). No aliasing, no obfuscation. The backend DTO is the
 * contract of record (spec 24 §5.3 leaves most response bodies unspecified, so the
 * implementation defines the shape).
 *
 * NOTE on `verdict` path segments: the URL paths `/verdict/...` are an API contract
 * (spec 24 §5.3). They are URL segments, not source identifiers — exempt from any
 * source-level naming convention. Frontend code freely uses `verdict` as a field/
 * type name here because no rule constrains the frontend source (the red-line grep
 * at tests/dialogue/red_line_grep.test.ts scans src/dialogue/ only).
 */

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import type {
  AgentEventDto,
  ApiErrorResponse,
  BenchmarkReportDto,
  CourtCertificateDto,
  ArenaResultDto,
  EvidenceChainResponse,
  EvidenceResponse,
  HealthResponse,
  HonestVerdictDto,
  HypothesizeRequest,
  HypothesizeResponse,
  IntegrityProofDto,
  IntegrityRootDto,
  ReadyResponse,
  ReportResponse,
  ReproReceipt,
  VerdictListResponse,
} from './types';

// ---------- Structured API error ----------

/**
 * Structured API error carrying backend error details (RFC 7807 Problem Details subset,
 * spec 24 §0.6).
 *
 * Unlike a plain Error, ApiError carries:
 *   - httpStatus: HTTP status code
 *   - errorCode: machine-readable error code (e.g. "EVIDENCE_NOT_FOUND")
 *   - sourceAnchor: fileId/stageId/callRecordId triple for debugging
 *   - detail: optional extra payload
 */
export class ApiError extends Error {
  public readonly httpStatus: number;
  public readonly errorCode: string;
  public readonly sourceAnchor: ApiErrorResponse['source_anchor'] | null;
  public readonly detail: unknown;

  constructor(
    httpStatus: number,
    message: string,
    errorCode = 'UNKNOWN',
    sourceAnchor: ApiErrorResponse['source_anchor'] | null = null,
    detail: unknown = undefined,
  ) {
    super(message);
    this.name = 'ApiError';
    this.httpStatus = httpStatus;
    this.errorCode = errorCode;
    this.sourceAnchor = sourceAnchor;
    this.detail = detail;
  }

  /** Try to parse a backend ApiErrorResponse JSON body; returns null if not parseable. */
  static tryParse(status: number, bodyText: string): ApiError | null {
    try {
      const parsed: unknown = JSON.parse(bodyText);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'error_code' in parsed &&
        'message' in parsed
      ) {
        const apiErr = parsed as ApiErrorResponse;
        return new ApiError(
          status,
          apiErr.message,
          apiErr.error_code,
          apiErr.source_anchor ?? null,
          apiErr.detail,
        );
      }
    } catch {
      // Not JSON — use raw body text
    }
    return null;
  }
}

// ---------- Config ----------

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3000';

// ---------- Fetch helpers ----------

/** Structured error from a non-2xx fetch response: tries ApiError first, falls back to plain Error. */
async function throwForStatus(response: Response, url: string): Promise<never> {
  const bodyText = await response.text().catch(() => '');
  const apiError = ApiError.tryParse(response.status, bodyText);
  if (apiError !== null) {
    throw apiError;
  }
  throw new ApiError(
    response.status,
    `API ${response.status} ${response.statusText} for ${url}: ${bodyText}`,
  );
}

/**
 * fetch + 超时中止（审计 P1-5：无 AbortController 时拖尾请求可无限挂起）。
 * 默认 60s——与后端 LLM 单次调用超时对齐；超时抛 DOMException AbortError（调用方可按需捕获）。
 */
const FETCH_TIMEOUT_MS = 60_000;

async function fetchJson<T>(path: string, init?: RequestInit, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) {
      await throwForStatus(response, url);
    }
    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timer);
  }
}

/** Fetch a non-JSON body (e.g. the GET /report HTML response, Epic K-05b). */
async function fetchText(path: string, init?: RequestInit, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<string> {
  const url = `${API_BASE_URL}${path}`;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      await throwForStatus(response, url);
    }
    return response.text();
  } finally {
    window.clearTimeout(timer);
  }
}

// ---------- Query keys ----------

export const queryKeys = {
  health: ['health'] as const,
  ready: ['ready'] as const,
  evidence: (id: string) => ['evidence', id] as const,
  evidenceChain: (headHash: string) => ['evidence', 'chain', headHash] as const,
  verdict: (id: string) => ['verdict', id] as const,
  verdictByHypothesis: (hypoId: string) => ['verdict', 'by_hypothesis', hypoId] as const,
  verdictList: (limit: number, offset: number) => ['verdict', 'list', limit, offset] as const,
  report: (runId: string) => ['report', runId] as const,
  integrityRoot: ['integrity', 'root'] as const,
  integrityProof: (seq: number) => ['integrity', 'proof', seq] as const,
  reproReceipt: ['integrity', 'receipt'] as const,
  benchmark: ['benchmark'] as const,
  court: ['court'] as const,
  arena: ['arena'] as const,
} as const;

// ---------- Probes (bare root, no /api/v1 prefix — spec 24 §0#3) ----------

/** GET /health — liveness probe. */
export function useHealth(
  options?: Omit<UseQueryOptions<HealthResponse, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<HealthResponse, Error>({
    queryKey: queryKeys.health,
    queryFn: () => fetchJson<HealthResponse>('/health'),
    refetchInterval: 30_000,
    ...options,
  });
}

/** GET /ready — readiness probe (DB ping; backend returns 503 when DB is down). */
export function useReady(
  options?: Omit<UseQueryOptions<ReadyResponse, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<ReadyResponse, Error>({
    queryKey: queryKeys.ready,
    queryFn: () => fetchJson<ReadyResponse>('/ready'),
    refetchInterval: 30_000,
    ...options,
  });
}

// ---------- App endpoints (all under /api/v1 — spec 24 §0#2) ----------

/** GET /api/v1/evidence/:id — single evidence-log entry. */
export function useEvidence(
  evidenceId: string,
  options?: Omit<UseQueryOptions<EvidenceResponse, Error>, 'queryKey' | 'queryFn' | 'enabled'>,
) {
  return useQuery<EvidenceResponse, Error>({
    queryKey: queryKeys.evidence(evidenceId),
    queryFn: () => fetchJson<EvidenceResponse>(`/api/v1/evidence/${encodeURIComponent(evidenceId)}`),
    enabled: evidenceId.length > 0,
    ...options,
  });
}

/** GET /api/v1/evidence/chain/:headHash — chain head call-record + graph subtree. */
export function useEvidenceChain(
  headHash: string,
  options?: Omit<UseQueryOptions<EvidenceChainResponse, Error>, 'queryKey' | 'queryFn' | 'enabled'>,
) {
  return useQuery<EvidenceChainResponse, Error>({
    queryKey: queryKeys.evidenceChain(headHash),
    queryFn: () =>
      fetchJson<EvidenceChainResponse>(`/api/v1/evidence/chain/${encodeURIComponent(headHash)}`),
    enabled: headHash.length > 0,
    ...options,
  });
}

/**
 * GET /api/v1/verdict/by_hypothesis/:hypoId — the SINGLE verdict node for a hypothesis.
 * The backend returns one HonestVerdictDto (not an array); 404 when none is associated.
 */
export function useVerdictByHypothesis(
  hypoId: string,
  options?: Omit<UseQueryOptions<HonestVerdictDto, Error>, 'queryKey' | 'queryFn' | 'enabled'>,
) {
  return useQuery<HonestVerdictDto, Error>({
    queryKey: queryKeys.verdictByHypothesis(hypoId),
    queryFn: () =>
      fetchJson<HonestVerdictDto>(`/api/v1/verdict/by_hypothesis/${encodeURIComponent(hypoId)}`),
    enabled: hypoId.length > 0,
    ...options,
  });
}

/** GET /api/v1/verdict/:id — single verdict node (HonestVerdictDto). */
export function useVerdict(
  verdictId: string,
  options?: Omit<UseQueryOptions<HonestVerdictDto, Error>, 'queryKey' | 'queryFn' | 'enabled'>,
) {
  return useQuery<HonestVerdictDto, Error>({
    queryKey: queryKeys.verdict(verdictId),
    queryFn: () => fetchJson<HonestVerdictDto>(`/api/v1/verdict/${encodeURIComponent(verdictId)}`),
    enabled: verdictId.length > 0,
    ...options,
  });
}

/** GET /api/v1/verdict — paginated verdict list. */
export function useVerdictList(
  limit = 100,
  offset = 0,
  options?: Omit<UseQueryOptions<VerdictListResponse, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<VerdictListResponse, Error>({
    queryKey: queryKeys.verdictList(limit, offset),
    queryFn: () =>
      fetchJson<VerdictListResponse>(`/api/v1/verdict?limit=${limit}&offset=${offset}`),
    ...options,
  });
}

/**
 * GET /api/v1/report/:runId — HTML report (Epic K-05b, Content-Type text/html).
 * Returns the raw HTML string. Render via a sandboxed iframe, never dangerouslySetInnerHTML.
 */
export function useReport(
  runId: string,
  options?: Omit<UseQueryOptions<ReportResponse, Error>, 'queryKey' | 'queryFn' | 'enabled'>,
) {
  return useQuery<ReportResponse, Error>({
    queryKey: queryKeys.report(runId),
    queryFn: () => fetchText(`/api/v1/report/${encodeURIComponent(runId)}`),
    enabled: runId.length > 0,
    ...options,
  });
}

// ---------- Integrity trust-root endpoints (spec 09 §4 / 23 §5.2) ----------

/**
 * GET /api/v1/integrity/root — whole-chain Merkle root + chain head locator.
 * The chain folded into a single 64-hex digest — the portable whole-chain fingerprint.
 */
export function useIntegrityRoot(
  options?: Omit<UseQueryOptions<IntegrityRootDto, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<IntegrityRootDto, Error>({
    queryKey: queryKeys.integrityRoot,
    queryFn: () => fetchJson<IntegrityRootDto>('/api/v1/integrity/root'),
    ...options,
  });
}

/**
 * GET /api/v1/integrity/proof/:seq — Merkle inclusion proof (audit path) for one call_record.
 * A third-party auditor holds this proof + the run's merkleRoot to verify membership
 * WITHOUT downloading every call_record.
 */
export function useIntegrityProof(
  seq: number,
  options?: Omit<UseQueryOptions<IntegrityProofDto, Error>, 'queryKey' | 'queryFn' | 'enabled'>,
) {
  return useQuery<IntegrityProofDto, Error>({
    queryKey: queryKeys.integrityProof(seq),
    queryFn: () => fetchJson<IntegrityProofDto>(`/api/v1/integrity/proof/${seq}`),
    enabled: Number.isInteger(seq) && seq > 0,
    ...options,
  });
}

/**
 * GET /api/v1/integrity/receipt — portable whole-chain trust-root snapshot (Repro Receipt).
 * Pin into a paper appendix / CI artifact: holder + recomputable root ⇒ chain untampered.
 */
export function useReproReceipt(
  options?: Omit<UseQueryOptions<ReproReceipt, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<ReproReceipt, Error>({
    queryKey: queryKeys.reproReceipt,
    queryFn: () => fetchJson<ReproReceipt>('/api/v1/integrity/receipt'),
    ...options,
  });
}

/**
 * GET /api/v1/benchmark — Science-125 完整性广度套件报告。
 * 含套件级聚合 Merkle 根（suiteIntegrityRoot·各 problem 单链根再折叠）+ leaderboard 条目。
 * 报告由 generate 脚本预生成（确定性·CI golden 锚 suiteIntegrityRoot）。
 */
export function useBenchmark(
  options?: Omit<UseQueryOptions<BenchmarkReportDto, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<BenchmarkReportDto, Error>({
    queryKey: queryKeys.benchmark,
    queryFn: () => fetchJson<BenchmarkReportDto>('/api/v1/benchmark'),
    ...options,
  });
}

/** GET /api/v1/arena/demo — 对抗竞技场 demo 结果（offline_replay proponent + 3 refuter）。 */
export function useArenaDemo(
  options?: Omit<UseQueryOptions<ArenaResultDto, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<ArenaResultDto, Error>({
    queryKey: queryKeys.arena,
    queryFn: () => fetchJson<ArenaResultDto>('/api/v1/arena/demo'),
    ...options,
  });
}

/** GET /api/v1/court/demo — 跨模型可靠性法庭 demo 证书（offline_replay 3 模型）。 */
export function useCourtDemo(
  options?: Omit<UseQueryOptions<CourtCertificateDto, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<CourtCertificateDto, Error>({
    queryKey: queryKeys.court,
    queryFn: () => fetchJson<CourtCertificateDto>('/api/v1/court/demo'),
    ...options,
  });
}

/** POST /api/v1/hypothesize — kick off a research loop. Returns loopState + graph + verdict + reproHash. */
/**
 * 审计 P0-2：生成客户端确定性幂等键（同输入 → 同 key → 服务端幂等重放）。
 * FNV-1a 64-bit——**同步**（异步 crypto.subtle.digest 完成顺序不保证，会打乱并行
 * mutation 的 fetch 顺序导致 mock/实际响应错位）；跨环境确定性。
 * 幂等键非安全边界（客户端可自选 key·服务端仅按 key 去重），无需密码学强度。
 */
function hypothesizeIdempotencyKey(body: HypothesizeRequest): string {
  const text = `${body.researchInput}|${body.mode ?? ''}|${body.dialogueMode ?? ''}`;
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i += 1) {
    h ^= BigInt(text.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return `v1-${h.toString(16).padStart(16, '0')}`;
}

export function useHypothesize() {
  const queryClient = useQueryClient();
  return useMutation<HypothesizeResponse, Error, HypothesizeRequest>({
    mutationFn: (body: HypothesizeRequest) => {
      const idempotencyKey = hypothesizeIdempotencyKey(body);
      return fetchJson<HypothesizeResponse>('/api/v1/hypothesize', {
        method: 'POST',
        body: JSON.stringify({ ...body, idempotencyKey }),
      });
    },
    onSuccess: (data) => {
      // `data.honestVerdict` is the raw VerdictNode shape (parentVerdictId/verdict/replayProver),
      // which is NOT interchangeable with the HonestVerdictDto shape served by GET /verdict/:id
      // (parentNodeId/decision). To avoid cache-shape pollution we do NOT seed the verdict query
      // cache here; consumers that need the canonical DTO must fetch /api/v1/verdict/:id.
      // Invalidate verdict list so the honesty wall picks up new verdicts.
      void queryClient.invalidateQueries({ queryKey: ['verdict', 'list'] });
      void data;
    },
  });
}

// ---------- Runtime event stream (SSE · P0-4 /api/v1/events/stream) ----------

/** SSE 连接状态：connecting=连接中/重连中 · live=已连接 · closed=已关闭。 */
export type EventStreamStatus = 'connecting' | 'live' | 'closed';

/** useAgentEventStream 返回值：状态 + 事件历史 + 最近事件 + 解析错误。 */
export interface AgentEventStreamState {
  readonly status: EventStreamStatus;
  readonly events: readonly AgentEventDto[];
  readonly lastEvent: AgentEventDto | null;
  readonly error: string | null;
}

/** SSE 事件类型列表（与 src/agent_loop/events.ts AgentLoopEvent.type 判别联合对齐）。 */
const SSE_EVENT_TYPES: readonly string[] = [
  'run_started',
  'stage_started',
  'stage_completed',
  'iteration_completed',
  'run_completed',
  'run_error',
  'stage_held',
  'stage_resumed',
];

/**
 * 订阅 GET /api/v1/events/stream（SSE·P0-4）。
 *
 * - replay=true（默认）：连接后先重放该 run（或全部）历史快照，再实时推送
 * - runId：仅订阅该 run 的事件
 * - maxEvents：内存事件上限（防长期运行膨胀）
 *
 * EventSource 原生自动重连；error 事件 → status='connecting'（无 server / 掉线）。
 * 组件卸载时 close() 并终止状态更新（防 setState on unmounted）。
 */
export function useAgentEventStream(
  options?: { readonly runId?: string; readonly replay?: boolean; readonly maxEvents?: number },
): AgentEventStreamState {
  const runId = options?.runId ?? undefined;
  const replay = options?.replay ?? true;
  const maxEvents = options?.maxEvents ?? 500;

  const [status, setStatus] = useState<EventStreamStatus>('connecting');
  const [events, setEvents] = useState<readonly AgentEventDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (runId !== undefined && runId.length > 0) {
      params.set('runId', runId);
    }
    if (replay) {
      params.set('replay', 'true');
    }
    const query = params.toString();
    const url = `${API_BASE_URL}/api/v1/events/stream${query.length > 0 ? `?${query}` : ''}`;

    const es = new EventSource(url);
    let active = true;

    const handleFrame = (evt: MessageEvent<string>): void => {
      if (!active) {
        return;
      }
      try {
        const parsed = JSON.parse(evt.data as string) as AgentEventDto;
        setEvents((prev) => [...prev, parsed].slice(-maxEvents));
        setStatus('live');
      } catch {
        // 非 JSON 帧（如心跳注释行不触发 message；此处仅防御畸形 payload）
        setError('SSE frame parse failed');
      }
    };

    const handleOpen = (): void => {
      if (active) {
        setStatus('live');
        setError(null);
      }
    };
    const handleError = (): void => {
      // EventSource 自动重连；短暂掉线视为 connecting，不丢已收事件
      if (active) {
        setStatus('connecting');
      }
    };

    es.addEventListener('open', handleOpen);
    es.addEventListener('error', handleError);
    for (const type of SSE_EVENT_TYPES) {
      es.addEventListener(type, handleFrame);
    }

    return () => {
      active = false;
      es.close();
      setStatus('closed');
    };
  }, [runId, replay, maxEvents]);

  return {
    status,
    events,
    lastEvent: events.length > 0 ? events[events.length - 1] ?? null : null,
    error,
  };
}

// ---------- Exported internals (for unit tests) ----------

export const __testables = {
  API_BASE_URL,
  ApiError,
  fetchJson,
  fetchText,
  throwForStatus,
  hypothesizeIdempotencyKey,
};
