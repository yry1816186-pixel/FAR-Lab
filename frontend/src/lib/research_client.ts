/**
 * research_client — TanStack Query hooks for the Track-1A research workbench.
 *
 * POST /api/v1/research is ASYNCHRONOUS (202 Accepted): it returns a run handle
 * (runId + statusUrl + eventsUrl), the run lifecycle is observed via
 *   GET  /research/:runId/status   (polling source of truth)
 *   GET  /research/:runId/events   (SSE live events; component-managed subscription)
 *   POST /research/:runId/cancel   (user-initiated cancellation)
 * and the frozen ResearchRun is only readable at GET /research/:runId once the
 * run reaches a terminal state (409 research_run_not_completed while running).
 *
 * DTO contract: backend field names consumed VERBATIM (camelCase, api_client
 * conventions). The ResearchRun DTO below mirrors src/research/types.ts.
 */

import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { buildApiUrl, fetchJson, parseV1Response } from './api_client';

// ---------- DTO types (backend contract, verbatim field names) ----------

export type ComponentMode =
  | 'LIVE'
  | 'RECORDED_REPLAY'
  | 'SYNTHETIC_TEST'
  | 'OFFLINE_DEVELOPMENT'
  | 'NOT_EXECUTED';

export type RunMode = 'LIVE' | 'MIXED' | 'RECORDED_REPLAY' | 'SYNTHETIC_TEST' | 'OFFLINE_DEVELOPMENT';

export interface ResearchScorecardDimensionDto {
  readonly name: string;
  readonly grade: string;
  readonly rationale: string;
  readonly source: 'deterministic' | 'model' | 'human';
}

export interface ResearchHypothesisDto {
  readonly id: string;
  readonly statement: string;
  readonly mechanism: string;
  readonly falsificationMethod: {
    readonly prediction: string;
    readonly metric: string;
    readonly comparator: string;
    readonly value?: number;
    readonly lower?: number;
    readonly upper?: number;
  };
  readonly supportingCitations: readonly string[];
  readonly counterEvidenceCitations: readonly string[];
  readonly relationToExistingTheory: string;
  readonly alternativeExplanations: readonly string[];
  readonly observablePredictions: readonly string[];
  readonly distinguishingObservations: readonly string[];
  readonly noveltyRelativeToCorpus: string;
  readonly assumptions: readonly string[];
  readonly risks: readonly string[];
}

export interface ResearchBindingDto {
  readonly allBound: boolean;
  readonly unbound: readonly string[];
}

export interface ResearchScorecardDto {
  readonly hypothesisId: string;
  readonly dimensions: readonly ResearchScorecardDimensionDto[];
  readonly paretoOptimal: boolean;
  readonly keyEvidenceToChangeConclusion: string;
}

export interface ResearchPlanDto {
  readonly objectives: readonly string[];
  readonly primaryHypothesisId: string;
  readonly alternativeHypothesisIds: readonly string[];
  readonly preregisteredPredictions: readonly string[];
  readonly dataRequirements: readonly string[];
  readonly inclusionExclusionCriteria: readonly string[];
  readonly variables: readonly string[];
  readonly design: string;
  readonly analysisDag: readonly string[];
  readonly tools: readonly string[];
  readonly statisticalMethods: readonly string[];
  readonly sampleSizeRationale: string;
  readonly multiplicityHandling: string;
  readonly missingOutlierStrategy: string;
  readonly stoppingConditions: readonly string[];
  readonly checkpoints: readonly string[];
  readonly budget: string;
  readonly risks: readonly string[];
  readonly reproducibility: readonly string[];
  readonly nextRoundDecisionRules: readonly string[];
  readonly humanApprovalRequired: readonly string[];
}

export interface ResearchRevisionDto {
  readonly id: string;
  readonly number: number;
  readonly feedback: { readonly source: string; readonly actor: string; readonly text: string };
  readonly planChanges: readonly string[];
  readonly metricChanges: readonly string[];
  readonly unresolvedConflicts: readonly string[];
}

export interface ResearchObservationDto {
  readonly id: string;
  readonly adapter: string;
  readonly mode: ComponentMode;
  readonly result: {
    readonly status: string;
    readonly n: number;
    readonly pearsonR: number | null;
    readonly pValue: number | null;
    readonly significantAt05: boolean;
    readonly summary: string;
  };
}

export interface ResearchRunDto {
  readonly runId: string;
  readonly question: string;
  readonly gateReport: {
    readonly verdict: string;
    readonly reasons: readonly string[];
    readonly safetyRisks: readonly string[];
    readonly scope: { readonly domain: string | null };
    readonly requiresEthicsGate: boolean;
  };
  readonly corpus: { readonly documentCount: number; readonly snapshotId: string };
  readonly hypotheses: readonly ResearchHypothesisDto[];
  readonly bindings: Readonly<Record<string, ResearchBindingDto>>;
  readonly scorecards: Readonly<Record<string, ResearchScorecardDto>>;
  readonly plan: ResearchPlanDto;
  readonly revisions: readonly ResearchRevisionDto[];
  readonly observations: readonly ResearchObservationDto[];
  readonly stageReceipts: readonly { readonly stageId: string; readonly provenanceStatus: string }[];
  readonly modes: {
    readonly modelExecutionMode: ComponentMode;
    readonly retrievalExecutionMode: ComponentMode;
    readonly experimentExecutionMode: ComponentMode;
  };
  readonly runMode: RunMode;
  readonly schemaVersion: number;
}

export interface EvaluationReportDto {
  readonly deterministicRecompute: 'PASS' | 'FAIL' | 'NOT_RUN';
  readonly metrics: readonly { readonly name: string; readonly value: number | boolean | null }[];
  readonly humanRubricMetrics: readonly string[];
}

// ---------- Async run lifecycle DTOs (202 contract, verbatim field names) ----------

/** Run lifecycle states (CREATED → … → COMPLETED | FAILED | CANCELLED). */
export type ResearchRunState =
  | 'CREATED'
  | 'VALIDATING'
  | 'RETRIEVING'
  | 'GENERATING_HYPOTHESES'
  | 'REVIEWING'
  | 'PLANNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

const TERMINAL_RUN_STATES: readonly ResearchRunState[] = ['COMPLETED', 'FAILED', 'CANCELLED'];

/** Terminal = no further transitions; polling stops and the frozen run becomes readable. */
export function isTerminalRunState(state: ResearchRunState): boolean {
  return TERMINAL_RUN_STATES.includes(state);
}

/** Structured failure category (null while the run has not failed). */
export type ResearchErrorKind = 'gate_refused' | 'pipeline' | 'aborted' | null;

/** POST /api/v1/research → 202 body (data payload of the { ok:true } envelope). */
export interface StartResearchAcceptedDto {
  readonly runId: string;
  readonly state: ResearchRunState;
  readonly statusUrl: string;
  readonly eventsUrl: string;
}

/** GET /api/v1/research/:runId/status — live run status (polling source of truth). */
export interface ResearchStatusDto {
  readonly runId: string;
  readonly question: string;
  readonly profile: string;
  readonly state: ResearchRunState;
  readonly completedStages: readonly string[];
  readonly remainingStages: readonly string[];
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly error: string | null;
  readonly errorKind: ResearchErrorKind;
  readonly runReady: boolean;
}

/** GET /api/v1/research — one summary row per run. */
export interface ResearchRunSummaryDto {
  readonly runId: string;
  readonly question: string;
  readonly state: ResearchRunState;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly error: string | null;
}

/** GET /api/v1/research response. */
export interface ResearchRunsResponseDto {
  readonly runs: readonly ResearchRunSummaryDto[];
}

/** POST /api/v1/research/:runId/cancel response. */
export interface CancelResearchResponseDto {
  readonly runId: string;
  readonly cancelled: boolean;
  readonly state: ResearchRunState;
}

/** SSE `event: research` lifecycle event types. */
export type ResearchLifecycleEventType =
  | 'run_started'
  | 'run_resumed'
  | 'state_changed'
  | 'stage_started'
  | 'stage_completed'
  | 'run_completed'
  | 'run_failed'
  | 'run_cancelled';

/**
 * SSE lifecycle event payload. Only the four invariants (type/runId/at/seq) are
 * guaranteed; the optional fields cover the per-type extras the workbench renders
 * (stage id, state transitions, failure detail).
 */
export interface ResearchLifecycleEventDto {
  readonly type: ResearchLifecycleEventType;
  readonly runId: string;
  readonly at: string;
  readonly seq: number;
  readonly stageId?: string;
  readonly fromState?: ResearchRunState;
  readonly toState?: ResearchRunState;
  readonly error?: string;
  readonly errorKind?: ResearchErrorKind;
  readonly reason?: string;
}

const TERMINAL_EVENT_TYPES: readonly ResearchLifecycleEventType[] = [
  'run_completed',
  'run_failed',
  'run_cancelled',
];

/** True when the SSE event ends the run (used to trigger an immediate status refetch). */
export function isTerminalLifecycleEvent(type: ResearchLifecycleEventType): boolean {
  return TERMINAL_EVENT_TYPES.includes(type);
}

/** One decoded SSE frame off /research/:runId/events (first `state`, then `research`). */
export type ResearchStreamFrame =
  | { readonly kind: 'state'; readonly status: ResearchStatusDto }
  | { readonly kind: 'research'; readonly event: ResearchLifecycleEventDto };

// ---------- Request bodies ----------

export interface StartResearchRequest {
  readonly question: string;
  readonly profile: 'offline_replay' | 'competition_aliyun_qwen';
  readonly sources?: readonly string[];
  readonly maxPerQuery?: number;
  readonly target?: number;
}

export interface ResearchFeedbackRequest {
  readonly source: 'human' | 'literature' | 'tool' | 'analysis';
  readonly actor: string;
  readonly text: string;
  readonly affectsHypothesisIds?: readonly string[];
  readonly changesScore?: boolean;
  readonly triggers?: readonly string[];
}

// ---------- Query keys ----------

export const researchKeys = {
  run: (runId: string) => ['research', 'run', runId] as const,
  evaluate: (runId: string) => ['research', 'evaluate', runId] as const,
  status: (runId: string) => ['research', 'status', runId] as const,
  runs: ['research', 'runs'] as const,
} as const;

/** Status poll cadence while the run is in a non-terminal state (ms). */
export const RESEARCH_STATUS_POLL_MS = 1500;

// ---------- Queries ----------

/** GET /api/v1/research — the run list (summaries). */
export function useResearchRuns(
  options?: Omit<UseQueryOptions<ResearchRunsResponseDto, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<ResearchRunsResponseDto, Error>({
    queryKey: researchKeys.runs,
    queryFn: async () =>
      parseV1Response<ResearchRunsResponseDto>(
        await fetchJson<unknown>('/api/v1/research'),
        'GET /research',
      ),
    ...options,
  });
}

/**
 * GET /api/v1/research/:runId/status — live status, polled every
 * RESEARCH_STATUS_POLL_MS while non-terminal. The refetchInterval function
 * returns false once a terminal state is observed, so polling stops for good.
 */
export function useResearchStatus(runId: string, enabled: boolean) {
  return useQuery<ResearchStatusDto, Error>({
    queryKey: researchKeys.status(runId),
    queryFn: async () =>
      parseV1Response<ResearchStatusDto>(
        await fetchJson<unknown>(`/api/v1/research/${encodeURIComponent(runId)}/status`),
        'GET /research/:runId/status',
      ),
    enabled: enabled && runId.length > 0,
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state !== undefined && isTerminalRunState(state) ? false : RESEARCH_STATUS_POLL_MS;
    },
  });
}

/** GET /api/v1/research/:runId — the frozen ResearchRun. */
export function useResearchRun(
  runId: string,
  options?: Omit<UseQueryOptions<ResearchRunDto, Error>, 'queryKey' | 'queryFn' | 'enabled'>,
) {
  return useQuery<ResearchRunDto, Error>({
    queryKey: researchKeys.run(runId),
    queryFn: async () =>
      parseV1Response<ResearchRunDto>(
        await fetchJson<unknown>(`/api/v1/research/${encodeURIComponent(runId)}`),
        'GET /research/:runId',
      ),
    enabled: runId.length > 0,
    ...options,
  });
}

/** GET /api/v1/research/:runId/evaluate — program-computed metrics. */
export function useEvaluateResearch(
  runId: string,
  options?: Omit<UseQueryOptions<EvaluationReportDto, Error>, 'queryKey' | 'queryFn' | 'enabled'>,
) {
  return useQuery<EvaluationReportDto, Error>({
    queryKey: researchKeys.evaluate(runId),
    queryFn: async () =>
      parseV1Response<EvaluationReportDto>(
        await fetchJson<unknown>(`/api/v1/research/${encodeURIComponent(runId)}/evaluate`),
        'GET /research/:runId/evaluate',
      ),
    enabled: runId.length > 0,
    ...options,
  });
}

// ---------- Mutations ----------

/**
 * POST /api/v1/research — asynchronous start (202 Accepted). Returns the run
 * handle (runId + status/events URLs); the frozen run is NOT part of the
 * response. Observe the lifecycle via useResearchStatus / subscribeResearchEvents.
 */
export function useStartResearch() {
  const queryClient = useQueryClient();
  return useMutation<StartResearchAcceptedDto, Error, StartResearchRequest>({
    mutationFn: async (body) =>
      parseV1Response<StartResearchAcceptedDto>(
        await fetchJson<unknown>('/api/v1/research', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
        'POST /research',
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: researchKeys.runs });
    },
  });
}

/** POST /api/v1/research/:runId/cancel — user-initiated cancellation. */
export function useCancelResearch(runId: string) {
  const queryClient = useQueryClient();
  return useMutation<CancelResearchResponseDto, Error, void>({
    mutationFn: async () =>
      parseV1Response<CancelResearchResponseDto>(
        await fetchJson<unknown>(`/api/v1/research/${encodeURIComponent(runId)}/cancel`, {
          method: 'POST',
        }),
        'POST /research/:runId/cancel',
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: researchKeys.status(runId) });
      await queryClient.invalidateQueries({ queryKey: researchKeys.runs });
    },
  });
}

// ---------- SSE subscription (plain helper, not a hook) ----------

/**
 * Subscribe to GET /api/v1/research/:runId/events (SSE).
 *
 * Stream shape: the first `event: state` frame carries the full status payload,
 * then `event: research` frames carry lifecycle events; the stream closes after
 * the terminal event. The caller owns the subscription: keep the returned
 * unsubscribe function and call it on unmount / run switch.
 *
 * `onError` fires on EventSource connection errors (native auto-reconnect still
 * applies; the caller decides when to give up on live events and poll instead).
 * When EventSource is unavailable at all (older runtimes / test DOMs), onError
 * fires once immediately and the returned unsubscribe is a no-op — honest
 * degradation, polling remains the source of truth.
 *
 * Malformed (non-JSON) frames are ignored rather than thrown: the poll channel
 * keeps the displayed state correct, so a bad live frame must not kill the panel.
 */
export function subscribeResearchEvents(
  runId: string,
  onEvent: (frame: ResearchStreamFrame) => void,
  onError?: () => void,
): () => void {
  if (typeof EventSource === 'undefined') {
    onError?.();
    return () => {
      // nothing to close — no native EventSource in this runtime
    };
  }
  const source = new EventSource(buildApiUrl(`/api/v1/research/${encodeURIComponent(runId)}/events`));

  const handleState = (evt: MessageEvent<string>): void => {
    try {
      onEvent({ kind: 'state', status: JSON.parse(evt.data as string) as ResearchStatusDto });
    } catch {
      // non-JSON frame — see doc comment
    }
  };
  const handleResearch = (evt: MessageEvent<string>): void => {
    try {
      onEvent({ kind: 'research', event: JSON.parse(evt.data as string) as ResearchLifecycleEventDto });
    } catch {
      // non-JSON frame — see doc comment
    }
  };
  const handleError = (): void => {
    onError?.();
  };

  source.addEventListener('state', handleState);
  source.addEventListener('research', handleResearch);
  source.addEventListener('error', handleError);

  return () => {
    source.removeEventListener('state', handleState);
    source.removeEventListener('research', handleResearch);
    source.removeEventListener('error', handleError);
    source.close();
  };
}

/** POST /api/v1/research/:runId/feedback — apply feedback → revision. */
export function useApplyResearchFeedback(runId: string) {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, ResearchFeedbackRequest>({
    mutationFn: async (body) =>
      parseV1Response<unknown>(
        await fetchJson<unknown>(`/api/v1/research/${encodeURIComponent(runId)}/feedback`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
        'POST /research/:runId/feedback',
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: researchKeys.run(runId) });
    },
  });
}

/** POST /api/v1/research/:runId/analyze — real-data analysis step. */
export function useAnalyzeResearch(runId: string) {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, { live: boolean }>({
    mutationFn: async (body) =>
      parseV1Response<unknown>(
        await fetchJson<unknown>(`/api/v1/research/${encodeURIComponent(runId)}/analyze`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
        'POST /research/:runId/analyze',
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: researchKeys.run(runId) });
    },
  });
}
