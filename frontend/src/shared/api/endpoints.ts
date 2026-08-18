/**
 * shared/api/endpoints — every backend endpoint as a typed TanStack Query
 * hook or mutation. One data layer: query keys, error model, envelope
 * parsing, and cache invalidation live here and nowhere else.
 *
 * Honesty rules encoded at the data layer:
 *   - No hook fabricates data: an endpoint error or an empty payload reaches
 *     the UI as-is (loading / error / empty are first-class states).
 *   - `parseV1Response` / `parseV2Response` validate the success envelope on
 *     every call; schema drift throws RESPONSE_SCHEMA_MISMATCH.
 *   - The frozen ResearchRun endpoint legitimately answers 409 while a run is
 *     not COMPLETED — callers treat that as a real state, not a failure.
 */

import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';

import type {
  AgentEventDto,
  AnalyzeResponse,
  ArenaLiveRequest,
  ArenaResultDto,
  BenchmarkReportDto,
  CancelResearchResponse,
  CourtCertificateDto,
  CourtLiveRequest,
  CreateResearchRequest,
  CreateResearchResponse,
  EvaluateResponse,
  EvidenceChainResponse,
  EvidenceResponse,
  FeedbackRequest,
  FeedbackResponse,
  HealthResponse,
  HonestVerdictDto,
  HypothesizeRequest,
  HypothesizeResponse,
  IntegrityProofDto,
  IntegrityRootDto,
  LifecycleEventsResponse,
  LlmStatusDto,
  ReadyResponse,
  ReproReceipt,
  ResearchRunDto,
  ResearchRunListResponse,
  ResearchRunStatusSummary,
  V2DemoReceiptResponse,
  V2PersistReceiptRequest,
  V2PersistReceiptResponse,
  V2ReceiptDetailResponse,
  V2ReceiptListResponse,
  V2VerificationResult,
  V2VerifyEnvelopeResponse,
  VerdictListResponse,
} from '@/entities/dtos.ts';
import { ApiError, fetchJson, fnvIdempotencyKey, parseV1Response, parseV2Response } from './http.ts';
import {
  CreateReceiptDataSchema,
  DemoReceiptDataSchema,
  ReceiptDetailDataSchema,
  ReceiptListDataSchema,
  ReVerifyDataSchema,
  VerifyEnvelopeDataSchema,
} from '@/features/verify/schemas.ts';

// ---------- Query keys ----------

export const queryKeys = {
  health: ['health'] as const,
  ready: ['ready'] as const,
  llmStatus: ['llm-status'] as const,
  researchList: ['research', 'list'] as const,
  researchStatus: (runId: string) => ['research', 'status', runId] as const,
  researchRun: (runId: string) => ['research', 'run', runId] as const,
  researchEvaluate: (runId: string) => ['research', 'evaluate', runId] as const,
  verdictList: (limit: number, offset: number) => ['verdict', 'list', limit, offset] as const,
  verdict: (id: string) => ['verdict', id] as const,
  evidence: (id: string) => ['evidence', id] as const,
  evidenceChain: (headHash: string) => ['evidence', 'chain', headHash] as const,
  integrityRoot: ['integrity', 'root'] as const,
  integrityProof: (seq: number) => ['integrity', 'proof', seq] as const,
  reproReceipt: ['integrity', 'receipt'] as const,
  benchmark: ['benchmark'] as const,
  lifecycleEvents: (targetId: string) => ['lifecycle', 'events', targetId] as const,
  v2Demo: ['v2', 'receipts', 'demo'] as const,
  v2List: (limit: number, offset: number) => ['v2', 'receipts', 'list', limit, offset] as const,
  v2Detail: (receiptId: string) => ['v2', 'receipts', 'detail', receiptId] as const,
} as const;

// ---------- Probes ----------

export function useHealth(options?: Omit<UseQueryOptions<HealthResponse, Error>, 'queryKey' | 'queryFn'>) {
  return useQuery<HealthResponse, Error>({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => fetchJson<HealthResponse>('/health', { signal }),
    refetchInterval: 30_000,
    ...options,
  });
}

export function useReady(options?: Omit<UseQueryOptions<ReadyResponse, Error>, 'queryKey' | 'queryFn'>) {
  return useQuery<ReadyResponse, Error>({
    queryKey: queryKeys.ready,
    queryFn: ({ signal }) => fetchJson<ReadyResponse>('/ready', { signal }),
    refetchInterval: 30_000,
    ...options,
  });
}

/** GET /api/v1/llm-status — runtime LLM state; null profile = no key configured. */
export function useLlmStatus(options?: Omit<UseQueryOptions<LlmStatusDto, Error>, 'queryKey' | 'queryFn'>) {
  return useQuery<LlmStatusDto, Error>({
    queryKey: queryKeys.llmStatus,
    queryFn: async ({ signal }) =>
      parseV1Response<LlmStatusDto>(await fetchJson<unknown>('/api/v1/llm-status', { signal }), 'GET /llm-status'),
    ...options,
  });
}

// ---------- Research missions ----------

/** GET /api/v1/research — every run in the store (summary rows). */
export function useResearchList(options?: Omit<UseQueryOptions<ResearchRunListResponse, Error>, 'queryKey' | 'queryFn'>) {
  return useQuery<ResearchRunListResponse, Error>({
    queryKey: queryKeys.researchList,
    queryFn: async ({ signal }) =>
      parseV1Response<ResearchRunListResponse>(await fetchJson<unknown>('/api/v1/research', { signal }), 'GET /research'),
    refetchInterval: 15_000,
    ...options,
  });
}

/** POST /api/v1/research — start a mission in the background (202). */
export function useCreateResearch() {
  const queryClient = useQueryClient();
  return useMutation<CreateResearchResponse, Error, CreateResearchRequest>({
    mutationFn: async (body) =>
      parseV1Response<CreateResearchResponse>(
        await fetchJson<unknown>('/api/v1/research', { method: 'POST', body: JSON.stringify(body) }),
        'POST /research',
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.researchList });
    },
  });
}

/** GET /research/:runId/status — checkpoint summary; polls while not terminal. */
export function useResearchStatus(
  runId: string,
  options?: Omit<UseQueryOptions<ResearchRunStatusSummary, Error>, 'queryKey' | 'queryFn' | 'enabled'>,
) {
  return useQuery<ResearchRunStatusSummary, Error>({
    queryKey: queryKeys.researchStatus(runId),
    queryFn: async ({ signal }) =>
      parseV1Response<ResearchRunStatusSummary>(
        await fetchJson<unknown>(`/api/v1/research/${encodeURIComponent(runId)}/status`, { signal }),
        'GET /research/:runId/status',
      ),
    enabled: runId.length > 0,
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      if (state === 'COMPLETED' || state === 'FAILED' || state === 'CANCELLED') return false;
      return 2_000;
    },
    ...options,
  });
}

/**
 * GET /research/:runId — the frozen run. 200 only when COMPLETED; the backend
 * answers 409 (research_run_not_completed) while running — that is a real
 * lifecycle state surfaced by callers, never an error banner.
 */
export function useResearchRun(
  runId: string,
  options?: Omit<UseQueryOptions<ResearchRunDto, Error>, 'queryKey' | 'queryFn' | 'retry'>,
) {
  return useQuery<ResearchRunDto, Error>({
    queryKey: queryKeys.researchRun(runId),
    queryFn: async ({ signal }) =>
      parseV1Response<ResearchRunDto>(
        await fetchJson<unknown>(`/api/v1/research/${encodeURIComponent(runId)}`, { signal }),
        'GET /research/:runId',
      ),
    enabled: runId.length > 0,
    retry: (failureCount, error) => {
      // 404/409 are answers, not transient failures.
      if (error instanceof ApiError && (error.httpStatus === 404 || error.httpStatus === 409)) return false;
      return failureCount < 1;
    },
    ...options,
  });
}

/** POST /research/:runId/cancel — request cancellation of an active run. */
export function useCancelResearch(runId: string) {
  const queryClient = useQueryClient();
  return useMutation<CancelResearchResponse, Error, void>({
    mutationFn: async () =>
      parseV1Response<CancelResearchResponse>(
        await fetchJson<unknown>(`/api/v1/research/${encodeURIComponent(runId)}/cancel`, { method: 'POST' }),
        'POST /research/:runId/cancel',
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.researchStatus(runId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.researchList });
    },
  });
}

/** POST /research/:runId/feedback — structured feedback → immutable revision. */
export function useResearchFeedback(runId: string) {
  const queryClient = useQueryClient();
  return useMutation<FeedbackResponse, Error, FeedbackRequest>({
    mutationFn: async (body) =>
      parseV1Response<FeedbackResponse>(
        await fetchJson<unknown>(`/api/v1/research/${encodeURIComponent(runId)}/feedback`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
        'POST /research/:runId/feedback',
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.researchRun(runId) });
    },
  });
}

/** POST /research/:runId/analyze — real-data analysis step (live or committed sample replay). */
export function useResearchAnalyze(runId: string) {
  const queryClient = useQueryClient();
  return useMutation<AnalyzeResponse, Error, { readonly live: boolean }>({
    mutationFn: async (body) =>
      parseV1Response<AnalyzeResponse>(
        await fetchJson<unknown>(`/api/v1/research/${encodeURIComponent(runId)}/analyze`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
        'POST /research/:runId/analyze',
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.researchRun(runId) });
    },
  });
}

/** GET /research/:runId/evaluate — program-computed metrics + deterministic recompute. */
export function useResearchEvaluate(
  runId: string,
  options?: Omit<UseQueryOptions<EvaluateResponse, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<EvaluateResponse, Error>({
    queryKey: queryKeys.researchEvaluate(runId),
    queryFn: async ({ signal }) =>
      parseV1Response<EvaluateResponse>(
        await fetchJson<unknown>(`/api/v1/research/${encodeURIComponent(runId)}/evaluate`, { signal }),
        'GET /research/:runId/evaluate',
      ),
    enabled: runId.length > 0,
    ...options,
  });
}

// ---------- Claim assay (hypothesize / court / arena) ----------

/** POST /api/v1/hypothesize — run the claim-verification loop. */
export function useHypothesize() {
  const queryClient = useQueryClient();
  return useMutation<HypothesizeResponse, Error, HypothesizeRequest>({
    mutationFn: async (body) => {
      const idempotencyKey = fnvIdempotencyKey(
        [body.researchInput, body.mode ?? '', body.dialogueMode ?? ''],
        'v1',
      );
      return parseV1Response<HypothesizeResponse>(
        await fetchJson<unknown>('/api/v1/hypothesize', {
          method: 'POST',
          body: JSON.stringify({ ...body, idempotencyKey }),
        }),
        'POST /hypothesize',
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['verdict', 'list'] });
    },
  });
}

/** POST /api/v1/court — live cross-model court (503 fail-closed without a key). */
export function useCourtLive() {
  return useMutation<CourtCertificateDto, Error, CourtLiveRequest>({
    mutationFn: async (body) =>
      parseV1Response<CourtCertificateDto>(
        await fetchJson<unknown>('/api/v1/court', { method: 'POST', body: JSON.stringify(body) }),
        'POST /court',
      ),
  });
}

/** POST /api/v1/arena — live adversarial arena (503 fail-closed without a key). */
export function useArenaLive() {
  return useMutation<ArenaResultDto, Error, ArenaLiveRequest>({
    mutationFn: async (body) =>
      parseV1Response<ArenaResultDto>(
        await fetchJson<unknown>('/api/v1/arena', { method: 'POST', body: JSON.stringify(body) }),
        'POST /arena',
      ),
  });
}

// ---------- Verdicts & evidence ----------

/** GET /api/v1/verdict — paginated verdict ledger (the honesty surface). */
export function useVerdictList(
  limit = 50,
  offset = 0,
  options?: Omit<UseQueryOptions<VerdictListResponse, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<VerdictListResponse, Error>({
    queryKey: queryKeys.verdictList(limit, offset),
    queryFn: async ({ signal }) =>
      parseV1Response<VerdictListResponse>(
        await fetchJson<unknown>(`/api/v1/verdict?limit=${String(limit)}&offset=${String(offset)}`, { signal }),
        'GET /verdict',
      ),
    ...options,
  });
}

/** GET /api/v1/verdict/:id — one verdict node. */
export function useVerdict(
  verdictId: string,
  options?: Omit<UseQueryOptions<HonestVerdictDto, Error>, 'queryKey' | 'queryFn' | 'enabled'>,
) {
  return useQuery<HonestVerdictDto, Error>({
    queryKey: queryKeys.verdict(verdictId),
    queryFn: async ({ signal }) =>
      parseV1Response<HonestVerdictDto>(
        await fetchJson<unknown>(`/api/v1/verdict/${encodeURIComponent(verdictId)}`, { signal }),
        'GET /verdict/:id',
      ),
    enabled: verdictId.length > 0,
    ...options,
  });
}

/** GET /api/v1/evidence/:id — one evidence-log entry (+ associated verdict). */
export function useEvidence(
  evidenceId: string,
  options?: Omit<UseQueryOptions<EvidenceResponse, Error>, 'queryKey' | 'queryFn' | 'enabled'>,
) {
  return useQuery<EvidenceResponse, Error>({
    queryKey: queryKeys.evidence(evidenceId),
    queryFn: async ({ signal }) =>
      parseV1Response<EvidenceResponse>(
        await fetchJson<unknown>(`/api/v1/evidence/${encodeURIComponent(evidenceId)}`, { signal }),
        'GET /evidence/:id',
      ),
    enabled: evidenceId.length > 0,
    ...options,
  });
}

/** GET /api/v1/evidence/chain/:headHash — chain head call-record + subtree. */
export function useEvidenceChain(
  headHash: string,
  options?: Omit<UseQueryOptions<EvidenceChainResponse, Error>, 'queryKey' | 'queryFn' | 'enabled'>,
) {
  return useQuery<EvidenceChainResponse, Error>({
    queryKey: queryKeys.evidenceChain(headHash),
    queryFn: async ({ signal }) =>
      parseV1Response<EvidenceChainResponse>(
        await fetchJson<unknown>(`/api/v1/evidence/chain/${encodeURIComponent(headHash)}`, { signal }),
        'GET /evidence/chain/:headHash',
      ),
    enabled: headHash.length > 0,
    ...options,
  });
}

/** GET /api/v1/lifecycle/events — correction/revision notices for a claim. */
export function useLifecycleEvents(
  targetId: string,
  options?: Omit<UseQueryOptions<LifecycleEventsResponse, Error>, 'queryKey' | 'queryFn' | 'enabled'>,
) {
  return useQuery<LifecycleEventsResponse, Error>({
    queryKey: queryKeys.lifecycleEvents(targetId),
    queryFn: async ({ signal }) =>
      parseV1Response<LifecycleEventsResponse>(
        await fetchJson<unknown>(
          `/api/v1/lifecycle/events?targetKind=claim&targetId=${encodeURIComponent(targetId)}`,
          { signal },
        ),
        'GET /lifecycle/events',
      ),
    enabled: targetId.length > 0,
    ...options,
  });
}

// ---------- Integrity trust root ----------

/** GET /api/v1/integrity/root — whole-chain Merkle root + chain head locator. */
export function useIntegrityRoot(options?: Omit<UseQueryOptions<IntegrityRootDto, Error>, 'queryKey' | 'queryFn'>) {
  return useQuery<IntegrityRootDto, Error>({
    queryKey: queryKeys.integrityRoot,
    queryFn: async ({ signal }) =>
      parseV1Response<IntegrityRootDto>(await fetchJson<unknown>('/api/v1/integrity/root', { signal }), 'GET /integrity/root'),
    ...options,
  });
}

/** GET /api/v1/integrity/proof/:seq — Merkle inclusion proof for one record. */
export function useIntegrityProof(
  seq: number,
  options?: Omit<UseQueryOptions<IntegrityProofDto, Error>, 'queryKey' | 'queryFn' | 'enabled'>,
) {
  return useQuery<IntegrityProofDto, Error>({
    queryKey: queryKeys.integrityProof(seq),
    queryFn: async ({ signal }) =>
      parseV1Response<IntegrityProofDto>(
        await fetchJson<unknown>(`/api/v1/integrity/proof/${String(seq)}`, { signal }),
        'GET /integrity/proof/:seq',
      ),
    enabled: Number.isInteger(seq) && seq > 0,
    ...options,
  });
}

/** GET /api/v1/integrity/receipt — portable whole-chain trust-root snapshot. */
export function useReproReceipt(options?: Omit<UseQueryOptions<ReproReceipt, Error>, 'queryKey' | 'queryFn'>) {
  return useQuery<ReproReceipt, Error>({
    queryKey: queryKeys.reproReceipt,
    queryFn: async ({ signal }) =>
      parseV1Response<ReproReceipt>(await fetchJson<unknown>('/api/v1/integrity/receipt', { signal }), 'GET /integrity/receipt'),
    ...options,
  });
}

// ---------- Benchmark ----------

/** GET /api/v1/benchmark — pre-generated Science-125 suite report (offline). */
export function useBenchmark(options?: Omit<UseQueryOptions<BenchmarkReportDto, Error>, 'queryKey' | 'queryFn'>) {
  return useQuery<BenchmarkReportDto, Error>({
    queryKey: queryKeys.benchmark,
    queryFn: async ({ signal }) =>
      parseV1Response<BenchmarkReportDto>(await fetchJson<unknown>('/api/v1/benchmark', { signal }), 'GET /benchmark'),
    ...options,
  });
}

// ---------- V2 receipts ----------

/** GET /api/v2/receipts/demo — fixture demo receipt (labeled as such in UI). */
export function useDemoReceipt(options?: Omit<UseQueryOptions<V2DemoReceiptResponse, Error>, 'queryKey' | 'queryFn'>) {
  return useQuery<V2DemoReceiptResponse, Error>({
    queryKey: queryKeys.v2Demo,
    queryFn: async ({ signal }) =>
      parseV2Response(DemoReceiptDataSchema, await fetchJson<unknown>('/api/v2/receipts/demo', { signal }), 'GET /receipts/demo'),
    ...options,
  });
}

/** GET /api/v2/receipts — persisted receipts (limit/offset pagination). */
export function useReceiptList(
  limit = 20,
  offset = 0,
  options?: Omit<UseQueryOptions<V2ReceiptListResponse, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<V2ReceiptListResponse, Error>({
    queryKey: queryKeys.v2List(limit, offset),
    queryFn: async ({ signal }) =>
      parseV2Response(
        ReceiptListDataSchema,
        await fetchJson<unknown>(`/api/v2/receipts?limit=${String(limit)}&offset=${String(offset)}`, { signal }),
        'GET /receipts',
      ),
    ...options,
  });
}

/** GET /api/v2/receipts/:id — receipt detail + manifest + latest verification. */
export function useReceipt(
  receiptId: string,
  options?: Omit<UseQueryOptions<V2ReceiptDetailResponse, Error>, 'queryKey' | 'queryFn' | 'enabled'>,
) {
  return useQuery<V2ReceiptDetailResponse, Error>({
    queryKey: queryKeys.v2Detail(receiptId),
    queryFn: async ({ signal }) =>
      parseV2Response(
        ReceiptDetailDataSchema,
        await fetchJson<unknown>(`/api/v2/receipts/${encodeURIComponent(receiptId)}`, { signal }),
        'GET /receipts/:id',
      ),
    enabled: receiptId.length > 0,
    ...options,
  });
}

/** POST /api/v2/receipts/verify — verify a proof envelope (six dimensions). */
export function useVerifyEnvelope() {
  return useMutation<V2VerifyEnvelopeResponse, Error, string>({
    mutationFn: async (envelopeJson: string) =>
      parseV2Response(
        VerifyEnvelopeDataSchema,
        await fetchJson<unknown>('/api/v2/receipts/verify', { method: 'POST', body: envelopeJson }),
        'POST /receipts/verify',
      ),
  });
}

/** POST /api/v2/receipts — persist a receipt (idempotent by proofHash). */
export function usePersistReceipt() {
  const queryClient = useQueryClient();
  return useMutation<V2PersistReceiptResponse, Error, V2PersistReceiptRequest>({
    mutationFn: async (body) =>
      parseV2Response(
        CreateReceiptDataSchema,
        await fetchJson<unknown>('/api/v2/receipts', { method: 'POST', body: JSON.stringify(body) }),
        'POST /receipts',
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['v2', 'receipts', 'list'] });
    },
  });
}

/** GET /api/v2/receipts/:id/verify — re-run six-dimension verification, persisted. */
export function useVerifyReceiptById() {
  const queryClient = useQueryClient();
  return useMutation<V2VerificationResult, Error, string>({
    mutationFn: async (receiptId: string) => {
      const raw = await fetchJson<unknown>(`/api/v2/receipts/${encodeURIComponent(receiptId)}/verify`);
      const data = parseV2Response(ReVerifyDataSchema, raw, 'GET /receipts/:id/verify');
      return data.verification;
    },
    onSuccess: (_data, receiptId) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.v2Detail(receiptId) });
    },
  });
}

// ---------- Global SSE event stream (agent loop) ----------

export type { AgentEventDto };
