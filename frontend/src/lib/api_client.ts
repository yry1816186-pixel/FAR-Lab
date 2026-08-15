/**
 * API client — TanStack Query 5 hooks for the FAR-Lab backend (spec 24 API gateway).
 *
 * Base URL resolution (same-origin first):
 *   1. VITE_API_BASE_URL env override wins — for production deployments that
 *      serve the API on a different origin (CORS applies).
 *   2. Otherwise the base is '' (RELATIVE): requests resolve against the page
 *      origin — the vite dev proxy (vite.config.ts proxies /api/v1 + /health +
 *      /ready to :3000) in dev, and a reverse proxy in production. Same-origin
 *      keeps LAN/mobile access working (no hardcoded localhost origin).
 *
 * Path layout (§0#2): ALL app endpoints live under the /api/v1/ prefix.
 * Only the liveness + readiness probes (§0#3) live on the bare root (/health, /ready).
 *
 * Field contract: the frontend consumes backend field names VERBATIM (camelCase ·
 * §0 casing rule). No aliasing, no obfuscation. The backend DTO is the
 * contract of record (§5.3 leaves most response bodies unspecified, so the
 * implementation defines the shape).
 *
 * NOTE on `verdict` path segments: the URL paths `/verdict/...` are an API contract
 * (§5.3). They are URL segments, not source identifiers — exempt from any
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
  V2DemoReceiptResponse,
  V2PersistReceiptRequest,
  V2PersistReceiptResponse,
  V2ReceiptDetailResponse,
  V2ReceiptListResponse,
  V2VerifyByIdResponse,
  V2VerifyEnvelopeResponse,
  VerdictListResponse,
} from './types';
import type { ZodType } from 'zod';
import {
  CreateReceiptDataSchema,
  DemoReceiptDataSchema,
  ReceiptDetailDataSchema,
  ReceiptListDataSchema,
  ReVerifyDataSchema,
  VerifyEnvelopeDataSchema,
} from './schemas/v2_receipts';

// ---------- Structured API error ----------

/**
 * Structured API error carrying backend error details (RFC 7807 Problem Details subset,
 * §0.6).
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

  /**
   * detail.guidance 提取：后端在 fail-closed 错误（如 503 research_live_profile_unavailable）
   * 的 detail 中附带可操作指引。UI 在原始 message 之外如实展示该指引（不吞不改）；
   * detail 缺失或 guidance 非字符串时返回 null。
   */
  guidance(): string | null {
    if (typeof this.detail !== 'object' || this.detail === null) {
      return null;
    }
    const value = (this.detail as { guidance?: unknown }).guidance;
    return typeof value === 'string' && value.length > 0 ? value : null;
  }
}

// ---------- Config ----------

/**
 * '' = same-origin relative base (default): the vite dev proxy / a production
 * reverse proxy owns API routing. VITE_API_BASE_URL (absolute URL) overrides it
 * for cross-origin deployments.
 */
const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

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
 * 构造 API URL：以 baseUrl 为基准，正确合并其 origin/pathname 前缀与自带 query，
 * 再追加 path 段与业务 query 参数。
 *
 * 解决 `${baseUrl}${path}` 字符串拼接的退化：
 * 1. baseUrl 含 query（如 `?token=abc`）时，path 会被吞入 query string；
 * 2. 业务参数需手工拼 `?` 与 `&`，易产生 `??` 或漏 `?`。
 *
 * 优先级（从低到高）：baseUrl 自带 query < path 内 query < extraParams。
 * base 的 pathname 前缀会被保留（去尾斜杠避免双斜杠）。
 *
 * baseUrl 为 ''（默认·same-origin）时：URL 构造需要一个绝对基准，故先挂在占位
 * origin 上复用同一套合并逻辑，再把占位前缀切掉——返回相对 URL（fetch 与
 * EventSource 均接受相对 URL，由页面 origin 解析：dev 走 vite proxy，
 * 生产走反向代理）。
 *
 * @param baseUrl API 基址：''（same-origin）或含 pathname 前缀与 query 的绝对 URL
 * @param path API 路径，可含 query string（如 `/api/v1/verdict?limit=100`）
 * @param extraParams 业务参数，优先级最高（覆盖同名参数）
 */
const SAME_ORIGIN_PLACEHOLDER_ORIGIN = 'http://same-origin.invalid';

function composeApiUrl(
  baseUrl: string,
  path: string,
  extraParams?: Record<string, string>,
): string {
  const sameOrigin = baseUrl === '';
  const base = new URL(sameOrigin ? SAME_ORIGIN_PLACEHOLDER_ORIGIN : baseUrl);
  const basePath = base.pathname.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  // 拼成完整字符串后整体解析：path 内的 query 会自动分离到 url.searchParams
  const url = new URL(`${base.origin}${basePath}${normalizedPath}`);
  // base 自带 query 以"不覆盖"语义合并（path 的同名参数优先于 base）
  base.searchParams.forEach((value, key) => {
    if (!url.searchParams.has(key)) {
      url.searchParams.set(key, value);
    }
  });
  // extraParams 优先级最高
  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      url.searchParams.set(key, value);
    }
  }
  if (sameOrigin) {
    // 切掉占位 origin，保留相对路径 + query（由页面 origin 解析）。
    return url.href.slice(SAME_ORIGIN_PLACEHOLDER_ORIGIN.length);
  }
  return url.href;
}

/** 构造 API URL：以 API_BASE_URL 为基准。 */
export function buildApiUrl(path: string, extraParams?: Record<string, string>): string {
  return composeApiUrl(API_BASE_URL, path, extraParams);
}

/**
 * fetch + 超时中止（审计 P1-5：无 AbortController 时拖尾请求可无限挂起）。
 * 默认 60s——与后端 LLM 单次调用超时对齐；超时抛 DOMException AbortError（调用方可按需捕获）。
 */
const FETCH_TIMEOUT_MS = 60_000;

export async function fetchJson<T>(path: string, init?: RequestInit, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<T> {
  const url = buildApiUrl(path);
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
  const url = buildApiUrl(path);
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

/**
 * V2 receipts 端点边界解码器:校验统一信封 { ok: true, data: T } + zod parse data
 * (engineering-taste Axis 1 · decode-once-at-boundary · counter-case 2/3)。
 *
 * 后端 R-05 已统一所有 v2_receipts 端点为 { ok: true, data: T } 信封 + RFC 7807 错误。
 * 旧的 unwrapV2Response 平铺回退分支已删除(counter-case 2:死代码清理)——
 * 后端不再返回 { ok: true, ...fields } 平铺形态,保留回退只会掩盖契约漂移。
 *
 * 此函数在边界做运行时 zod parse(counter-case 3),消除"TS <T> 类型断言
 * 无运行时校验"的 ReceiptUploader bug 模式。parse 失败抛 ApiError
 * (RESPONSE_SCHEMA_MISMATCH),携带端点名 + zod issue 摘要,便于前端展示
 * 专业化错误信息(R-07:错误代码 + 文档链接)。
 *
 * @param dataSchema  data 字段的 zod schema(来自 schemas/v2_receipts.ts)
 * @param raw         fetchJson 返回的原始 JSON(unknown)
 * @param endpoint    端点标识(错误信息用,如 "GET /receipts/demo")
 * @returns           zod parse 后的 data(类型安全)
 */
function parseV2Response<T>(
  dataSchema: ZodType<T>,
  raw: unknown,
  endpoint: string,
): T {
  // 1. 信封结构校验
  if (typeof raw !== 'object' || raw === null) {
    throw new ApiError(
      502,
      `Verification service returned a non-object response from ${endpoint}.`,
      'RESPONSE_SCHEMA_MISMATCH',
    );
  }
  const obj = raw as Record<string, unknown>;

  // 2. ok 字段校验(必须是字面量 true;失败响应由 throwForStatus 在非 2xx 时处理)
  if (obj.ok !== true) {
    throw new ApiError(
      502,
      `Verification service response from ${endpoint} is missing the success envelope (ok: true).`,
      'RESPONSE_SCHEMA_MISMATCH',
    );
  }

  // 3. data 字段校验(必须存在且为对象)
  if (typeof obj.data !== 'object' || obj.data === null) {
    throw new ApiError(
      502,
      `Verification service response from ${endpoint} is missing the data payload.`,
      'RESPONSE_SCHEMA_MISMATCH',
    );
  }

  // 4. zod parse data(运行时契约校验)
  const result = dataSchema.safeParse(obj.data);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.length > 0 ? i.path.join('.') : '(root)'}: ${i.message}`)
      .join('; ');
    throw new ApiError(
      502,
      `Verification service response from ${endpoint} does not match the expected schema: ${issues}`,
      'RESPONSE_SCHEMA_MISMATCH',
      null,
      { issues: result.error.issues, endpoint },
    );
  }

  return result.data;
}

/**
 * V1 端点边界解码器（P1-3 契约统一收尾）：解包统一信封 { ok: true, data: T }。
 *
 * 后端 server.ts v1 子应用 onSend hook 已统一 v1 成功响应为
 * { ok: true, data: T }（R-05 收尾；错误响应仍为 RFC 7807，非 2xx 由
 * throwForStatus 处理）。此函数在边界做信封校验，保持 v2 同构：
 * 结构非法 → 抛 ApiError（RESPONSE_SCHEMA_MISMATCH），不静默透传。
 *
 * @param raw      fetchJson 返回的原始 JSON（应为 { ok: true, data: T }）
 * @param endpoint 端点标识（错误信息用，如 "GET /evidence/chain/:headHash"）
 * @returns        信封内的 data
 */
export function parseV1Response<T>(raw: unknown, endpoint: string): T {
  if (typeof raw !== 'object' || raw === null) {
    throw new ApiError(
      502,
      `Service returned a non-object response from ${endpoint}.`,
      'RESPONSE_SCHEMA_MISMATCH',
    );
  }
  const obj = raw as Record<string, unknown>;
  if (obj.ok !== true) {
    throw new ApiError(
      502,
      `Service response from ${endpoint} is missing the success envelope (ok: true).`,
      'RESPONSE_SCHEMA_MISMATCH',
    );
  }
  if (obj.data === undefined) {
    throw new ApiError(
      502,
      `Service response from ${endpoint} is missing the data payload.`,
      'RESPONSE_SCHEMA_MISMATCH',
    );
  }
  return obj.data as T;
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
  llmStatus: ['llm-status'] as const,
  lifecycleEvents: (targetKind: string, targetId: string) =>
    ['lifecycle', 'events', targetKind, targetId] as const,
} as const;

/** V2 receipts query keys。 */
export const v2QueryKeys = {
  demo: ['v2', 'receipts', 'demo'] as const,
  list: (limit: number, offset: number, claimId?: string) =>
    ['v2', 'receipts', 'list', limit, offset, claimId ?? 'all'] as const,
  detail: (receiptId: string) => ['v2', 'receipts', 'detail', receiptId] as const,
} as const;

// ---------- Probes (bare root, no /api/v1 prefix — §0#3) ----------

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

// ---------- App endpoints (all under /api/v1 — §0#2) ----------

/** GET /api/v1/evidence/:id — single evidence-log entry. */
export function useEvidence(
  evidenceId: string,
  options?: Omit<UseQueryOptions<EvidenceResponse, Error>, 'queryKey' | 'queryFn' | 'enabled'>,
) {
  return useQuery<EvidenceResponse, Error>({
    queryKey: queryKeys.evidence(evidenceId),
    queryFn: async () =>
      parseV1Response<EvidenceResponse>(
        await fetchJson<unknown>(`/api/v1/evidence/${encodeURIComponent(evidenceId)}`),
        'GET /evidence/:id',
      ),
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
    queryFn: async () =>
      parseV1Response<EvidenceChainResponse>(
        await fetchJson<unknown>(`/api/v1/evidence/chain/${encodeURIComponent(headHash)}`),
        'GET /evidence/chain/:headHash',
      ),
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
    queryFn: async () =>
      parseV1Response<HonestVerdictDto>(
        await fetchJson<unknown>(`/api/v1/verdict/by_hypothesis/${encodeURIComponent(hypoId)}`),
        'GET /verdict/by_hypothesis/:hypoId',
      ),
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
    queryFn: async () =>
      parseV1Response<HonestVerdictDto>(
        await fetchJson<unknown>(`/api/v1/verdict/${encodeURIComponent(verdictId)}`),
        'GET /verdict/:id',
      ),
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
    queryFn: async () =>
      parseV1Response<VerdictListResponse>(
        await fetchJson<unknown>(`/api/v1/verdict?limit=${limit}&offset=${offset}`),
        'GET /verdict',
      ),
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

// ---------- Integrity trust-root endpoints (§4 / 23 §5.2) ----------

/**
 * GET /api/v1/integrity/root — whole-chain Merkle root + chain head locator.
 * The chain folded into a single 64-hex digest — the portable whole-chain fingerprint.
 */
export function useIntegrityRoot(
  options?: Omit<UseQueryOptions<IntegrityRootDto, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<IntegrityRootDto, Error>({
    queryKey: queryKeys.integrityRoot,
    queryFn: async () =>
      parseV1Response<IntegrityRootDto>(
        await fetchJson<unknown>('/api/v1/integrity/root'),
        'GET /integrity/root',
      ),
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
    queryFn: async () =>
      parseV1Response<IntegrityProofDto>(
        await fetchJson<unknown>(`/api/v1/integrity/proof/${seq}`),
        'GET /integrity/proof/:seq',
      ),
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
    queryFn: async () =>
      parseV1Response<ReproReceipt>(
        await fetchJson<unknown>('/api/v1/integrity/receipt'),
        'GET /integrity/receipt',
      ),
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
    queryFn: async () =>
      parseV1Response<BenchmarkReportDto>(
        await fetchJson<unknown>('/api/v1/benchmark'),
        'GET /benchmark',
      ),
    ...options,
  });
}

// ---------- WS-A/B live LLM hooks：让前端能跑真实推理 ----------
// /llm-status 暴露运行期 LLM profile + keyConfigured（不泄漏 key）。
// 前端据此显示「live 模式」徽章或「offline replay」诚实横幅——治「每个问题同一裁决」感知。
// POST /court + POST /arena live：用户提交任意 claim/hypothesis + models/refuters，透传真实 gateway。

/** GET /api/v1/llm-status 响应——运行期 LLM 状态（profile + keyConfigured）。 */
export interface LlmStatusDto {
  /** null = 未配置 key（LLM 依赖端点 fail-closed·无静默回放）。 */
  readonly profile: string | null;
  readonly keyConfigured: boolean;
}

/** POST /api/v1/court 请求体（WS-A.2 live）。 */
export interface CourtLiveRequest {
  readonly claim: string;
  readonly models: readonly string[];
}

/** POST /api/v1/arena 请求体（WS-A.3 live）。 */
export interface ArenaLiveRequest {
  readonly hypothesis: string;
  readonly refuters: readonly string[];
}

/** GET /api/v1/llm-status — 运行期 LLM 状态（profile + keyConfigured）。 */
export function useLlmStatus(
  options?: Omit<UseQueryOptions<LlmStatusDto, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<LlmStatusDto, Error>({
    queryKey: queryKeys.llmStatus,
    queryFn: async () =>
      parseV1Response<LlmStatusDto>(
        await fetchJson<unknown>('/api/v1/llm-status'),
        'GET /llm-status',
      ),
    ...options,
  });
}

/** POST /api/v1/court — live 跨模型法庭（用户提交 claim + models）。 */
export function useCourtLive() {
  return useMutation<CourtCertificateDto, Error, CourtLiveRequest>({
    mutationFn: async (body: CourtLiveRequest) =>
      parseV1Response<CourtCertificateDto>(
        await fetchJson<unknown>('/api/v1/court', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
        'POST /court',
      ),
  });
}

/** POST /api/v1/arena — live 对抗竞技场（用户提交 hypothesis + refuters）。 */
export function useArenaLive() {
  return useMutation<ArenaResultDto, Error, ArenaLiveRequest>({
    mutationFn: async (body: ArenaLiveRequest) =>
      parseV1Response<ArenaResultDto>(
        await fetchJson<unknown>('/api/v1/arena', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
        'POST /arena',
      ),
  });
}

/** 生命周期事件响应（BA3-3 · GET /api/v1/lifecycle/events）。 */
export interface LifecycleEventsResponse {
  readonly targetKind: string;
  readonly targetId: string;
  readonly events: readonly {
    readonly eventId: string;
    readonly targetKind: string;
    readonly targetId: string;
    readonly fromState: string;
    readonly toState: string;
    readonly actor: string;
    readonly reason: string;
    readonly prevHash: string;
    readonly currentHash: string;
    readonly createdAt: string;
  }[];
}

/**
 * GET /api/v1/lifecycle/events — 生命周期事件（修正通知·BA3-3）。
 * @param targetId hypothesis/claim id（targetKind 固定 claim——追溯页语义）。
 */
export function useLifecycleEvents(
  targetId: string,
  options?: Omit<UseQueryOptions<LifecycleEventsResponse, Error>, 'queryKey' | 'queryFn' | 'enabled'>,
) {
  return useQuery<LifecycleEventsResponse, Error>({
    queryKey: queryKeys.lifecycleEvents('claim', targetId),
    queryFn: async () =>
      parseV1Response<LifecycleEventsResponse>(
        await fetchJson<unknown>(
          `/api/v1/lifecycle/events?targetKind=claim&targetId=${encodeURIComponent(targetId)}`,
        ),
        'GET /lifecycle/events',
      ),
    enabled: targetId.length > 0,
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
    mutationFn: async (body: HypothesizeRequest) => {
      const idempotencyKey = hypothesizeIdempotencyKey(body);
      return parseV1Response<HypothesizeResponse>(
        await fetchJson<unknown>('/api/v1/hypothesize', {
          method: 'POST',
          body: JSON.stringify({ ...body, idempotencyKey }),
        }),
        'POST /hypothesize',
      );
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

// ---------- V2 Receipts (spec doc19 §5) ----------
//
// 所有 v2_receipts 端点经 parseV2Response 在边界做信封校验 + zod parse
// (counter-case 2/3:删除平铺回退死代码 + 运行时 zod 校验落地)。
// 应然契约(后端 R-05 已统一):
//   GET  /receipts/demo      → { ok: true, data: { receipt, verification } }
//   GET  /receipts (list)    → { ok: true, data: { receipts, total, limit, offset } }
//   GET  /receipts/:id       → { ok: true, data: { receipt, manifestMembers, latestVerification } }
//   POST /receipts/verify    → { ok: true, data: { verification, display } }
//   POST /receipts           → { ok: true, data: { receiptId, idempotent } }
//   GET  /receipts/:id/verify → { ok: true, data: { verification, display, allPass } }

/** GET /api/v2/receipts/demo — 示例收据验证结果(示例数据,非用户持久化)。 */
export function useDemoReceipt(
  options?: Omit<UseQueryOptions<V2DemoReceiptResponse, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<V2DemoReceiptResponse, Error>({
    queryKey: v2QueryKeys.demo,
    queryFn: async () => {
      const raw = await fetchJson<unknown>('/api/v2/receipts/demo');
      return parseV2Response(DemoReceiptDataSchema, raw, 'GET /receipts/demo');
    },
    ...options,
  });
}

/** GET /api/v2/receipts — 持久化收据分页列表(用户已保存的 receipts)。claimId 可选过滤(分享链接 runId)。 */
export function useReceiptList(
  limit = 20,
  offset = 0,
  claimId?: string,
  options?: Omit<UseQueryOptions<V2ReceiptListResponse, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<V2ReceiptListResponse, Error>({
    queryKey: v2QueryKeys.list(limit, offset, claimId),
    queryFn: async () => {
      const qs = claimId !== undefined ? `&claimId=${encodeURIComponent(claimId)}` : '';
      const raw = await fetchJson<unknown>(`/api/v2/receipts?limit=${limit}&offset=${offset}${qs}`);
      return parseV2Response(ReceiptListDataSchema, raw, 'GET /receipts');
    },
    ...options,
  });
}

/** GET /api/v2/receipts/:id — 单收据详情 + manifest + 最新验证。 */
export function useReceipt(
  receiptId: string,
  options?: Omit<UseQueryOptions<V2ReceiptDetailResponse, Error>, 'queryKey' | 'queryFn' | 'enabled'>,
) {
  return useQuery<V2ReceiptDetailResponse, Error>({
    queryKey: v2QueryKeys.detail(receiptId),
    queryFn: async () => {
      const raw = await fetchJson<unknown>(`/api/v2/receipts/${encodeURIComponent(receiptId)}`);
      return parseV2Response(ReceiptDetailDataSchema, raw, 'GET /receipts/:id');
    },
    enabled: receiptId.length > 0,
    ...options,
  });
}

/** POST /api/v2/receipts/verify — 验证 envelope,返回六维结果 + display。 */
export function useVerifyEnvelope() {
  return useMutation<V2VerifyEnvelopeResponse, Error, string>({
    mutationFn: async (envelopeJson: string) => {
      const raw = await fetchJson<unknown>('/api/v2/receipts/verify', {
        method: 'POST',
        body: envelopeJson,
      });
      return parseV2Response(VerifyEnvelopeDataSchema, raw, 'POST /receipts/verify');
    },
  });
}

/** POST /api/v2/receipts — 持久化收据(幂等 by proofHash)。成功后失效列表缓存。 */
export function usePersistReceipt() {
  const queryClient = useQueryClient();
  return useMutation<V2PersistReceiptResponse, Error, V2PersistReceiptRequest>({
    mutationFn: async (body: V2PersistReceiptRequest) => {
      const raw = await fetchJson<unknown>('/api/v2/receipts', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return parseV2Response(CreateReceiptDataSchema, raw, 'POST /receipts');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['v2', 'receipts', 'list'] });
    },
  });
}

/**
 * GET /api/v2/receipts/:id/verify — UI 内复检(运行六维验证 + 持久化结果)。
 *
 * 后端返回 { ok: true, data: { verification, display, allPass } }。
 * 前端只需要 verification(V2VerifyByIdResponse = V2VerificationResult),
 * 从 data 中提取 verification 返回。zod parse 确保契约不漂移。
 */
export function useVerifyReceiptById() {
  return useMutation<V2VerifyByIdResponse, Error, string>({
    mutationFn: async (receiptId: string) => {
      const raw = await fetchJson<unknown>(`/api/v2/receipts/${encodeURIComponent(receiptId)}/verify`);
      const data = parseV2Response(ReVerifyDataSchema, raw, 'GET /receipts/:id/verify');
      return data.verification as V2VerifyByIdResponse;
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
    // 业务参数通过 extraParams 传入，由 buildApiUrl 统一处理：
    // ① API_BASE_URL 自带 query（如 token）会被保留合并；
    // ② API_BASE_URL 的 pathname 前缀会被保留；
    // ③ `?` 与 `&` 分隔符由 URL 实现管理，避免手工拼接退化。
    const extraParams: Record<string, string> = {};
    if (runId !== undefined && runId.length > 0) {
      extraParams['runId'] = runId;
    }
    if (replay) {
      extraParams['replay'] = 'true';
    }
    const eventSourceUrl = buildApiUrl('/api/v1/events/stream', extraParams);

    const es = new EventSource(eventSourceUrl);
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

// ---------- Planning gates (planning-gate methodology · /api/v1/planning/*) ----------

export interface PlanningRiskSignals {
  readonly readOnly: boolean;
  readonly docOnly: boolean;
  readonly boundedWrite: boolean;
  readonly touchesTrustKernel: boolean;
  readonly newCliOrApi: boolean;
  readonly crossModule: boolean;
  readonly destructive: boolean;
  readonly irreversible: boolean;
  readonly ambiguous: boolean;
}

export type PlanningRiskLevel = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';

export interface PlanningRiskResult {
  readonly level: PlanningRiskLevel;
  readonly reasons: readonly string[];
}

export interface PlanningViolation {
  readonly stepId: string;
  readonly code: string;
  readonly message: string;
}

export interface PlanningPlanResult {
  readonly ok: boolean;
  readonly violations: readonly PlanningViolation[];
  readonly executionOrder: readonly string[];
}

export interface PlanningSpecResult {
  readonly ok: boolean;
  readonly violations: readonly { readonly code: string; readonly message: string }[];
}

export type GateConclusion = 'DONE' | 'IMPLEMENTED_UNVERIFIED' | 'BLOCKED';

export interface PlanningGateResult {
  readonly conclusion: GateConclusion;
  readonly passed: readonly string[];
  readonly failed: readonly string[];
  readonly notRun: readonly string[];
  readonly rationale: string;
}

/** POST 一个 planning 端点（v1 信封 { ok: true, data } 由 parseV1Response 解包）。 */
function postPlanning<T>(path: string, body: unknown): Promise<T> {
  return fetchJson<unknown>(path, { method: 'POST', body: JSON.stringify(body) }).then((raw) =>
    parseV1Response<T>(raw, `POST ${path}`),
  );
}

/** POST /api/v1/planning/risk — P0-P4 确定性风险分级。 */
export function usePlanningRisk() {
  return useMutation<PlanningRiskResult, Error, PlanningRiskSignals>({
    mutationFn: (signals) => postPlanning<PlanningRiskResult>('/api/v1/planning/risk', signals),
  });
}

/** POST /api/v1/planning/plan — Plan DAG 校验（环/依赖/可验证 → 拓扑序）。 */
export function usePlanningPlan() {
  return useMutation<PlanningPlanResult, Error, unknown>({
    mutationFn: (plan) => postPlanning<PlanningPlanResult>('/api/v1/planning/plan', plan),
  });
}

/** POST /api/v1/planning/spec — Spec 可验证规格校验。 */
export function usePlanningSpec() {
  return useMutation<PlanningSpecResult, Error, unknown>({
    mutationFn: (spec) => postPlanning<PlanningSpecResult>('/api/v1/planning/spec', spec),
  });
}

/** POST /api/v1/planning/gate — 四步门函数验证报告。 */
export function usePlanningGate() {
  return useMutation<PlanningGateResult, Error, { items: readonly { id: string; name: string; command: string; expected: string }[]; results: Record<string, { status: 'pass' | 'fail' | 'not_run'; actual: string }> }>({
    mutationFn: (body) => postPlanning<PlanningGateResult>('/api/v1/planning/gate', body),
  });
}

// ---------- Exported internals (for unit tests) ----------

export const __testables = {
  API_BASE_URL,
  ApiError,
  composeApiUrl,
  fetchJson,
  fetchText,
  throwForStatus,
  hypothesizeIdempotencyKey,
};
