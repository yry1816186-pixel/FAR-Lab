/**
 * API client — TanStack Query 5 hooks for the FAR-Chain backend (spec 24 API gateway).
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

import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import type {
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

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    await throwForStatus(response, url);
  }
  return (await response.json()) as T;
}

/** Fetch a non-JSON body (e.g. the GET /report HTML response, Epic K-05b). */
async function fetchText(path: string, init?: RequestInit): Promise<string> {
  const url = `${API_BASE_URL}${path}`;
  const response = await fetch(url, init);
  if (!response.ok) {
    await throwForStatus(response, url);
  }
  return response.text();
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
export function useHypothesize() {
  const queryClient = useQueryClient();
  return useMutation<HypothesizeResponse, Error, HypothesizeRequest>({
    mutationFn: (body: HypothesizeRequest) =>
      fetchJson<HypothesizeResponse>('/api/v1/hypothesize', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
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

// ---------- Exported internals (for unit tests) ----------

export const __testables = {
  API_BASE_URL,
  ApiError,
  fetchJson,
  fetchText,
  throwForStatus,
};
