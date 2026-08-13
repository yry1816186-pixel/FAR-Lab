/**
 * research_client — TanStack Query hooks for the Track-1A research workbench
 * (POST/GET /api/v1/research + feedback/analyze/evaluate).
 *
 * DTO contract: backend field names consumed VERBATIM (camelCase, api_client
 * conventions). The ResearchRun DTO below mirrors src/research/types.ts.
 */

import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { fetchJson, parseV1Response } from './api_client';

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

// ---------- Request bodies ----------

export interface StartResearchRequest {
  readonly question: string;
  readonly profile: 'offline_replay' | 'competition_aliyun_qwen';
  readonly source?: 'openalex' | 'arxiv' | 'crossref';
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

const researchKeys = {
  run: (runId: string) => ['research', 'run', runId] as const,
  evaluate: (runId: string) => ['research', 'evaluate', runId] as const,
} as const;

// ---------- Queries ----------

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

/** POST /api/v1/research — run the full vertical slice (synchronous). */
export function useStartResearch() {
  const queryClient = useQueryClient();
  return useMutation<ResearchRunDto, Error, StartResearchRequest>({
    mutationFn: async (body) =>
      parseV1Response<ResearchRunDto>(
        await fetchJson<unknown>('/api/v1/research', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
        'POST /research',
      ),
    onSuccess: (run) => {
      queryClient.setQueryData(researchKeys.run(run.runId), run);
    },
  });
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
