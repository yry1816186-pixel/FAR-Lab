/**
 * research REST routes —— Track-1A 科研纵向切片的 API 面（§12.3 最小真实子集）。
 *
 * 端点（local-first 单用户内存 registry；同一 application service，§12.1）：
 *   POST /research                   创建运行（同步执行纵向切片·fail-closed）
 *   GET  /research/:runId            获取冻结 ResearchRun
 *   POST /research/:runId/feedback   应用结构化反馈 → 不可变 revision
 *   POST /research/:runId/analyze    真实数据分析（NASA 档案·live 或真实样本 replay）
 *   GET  /research/:runId/evaluate   程序化指标 + 确定性重算
 *
 * 诚实边界：
 *   - competition profile 无凭证 → 503 fail-closed（绝不静默降级到 replay）
 *   - offline_replay profile 在响应中显式 runMode=RECORDED_REPLAY
 *   - 长任务 SSE/取消/恢复生命周期 = Phase 4 后续（此处同步执行·明示边界）
 *   - 模型中立：无 Qwen/百炼字面量（profile 名来自 env/请求）
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ApiError } from '../errors/error_handler.ts';
import { createLlmGateway, type LlmGateway } from '../../llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../llm_gateway/adapters/offline_replay/client.ts';
import { resolveRuntimeGateway, RUNTIME_PROVIDER_PROFILE } from '../../llm_gateway/runtime_gateway.ts';
import { createReplayAdapter } from '../../retrieval/index.ts';
import { runResearch } from '../../research/orchestrator.ts';
import { ResearchabilityBlockedError } from '../../research/researchability_gate.ts';
import { buildFeedbackSignal } from '../../research/revision.ts';
import { applyFeedbackToRun } from '../../research/application.ts';
import { runPlanExperiment } from '../../research/experiment.ts';
import { verifyResearchRunDeterministic } from '../../research/verification.ts';
import { computeRunMetrics } from '../../research/evaluation/metrics.ts';
import { RESEARCH_DEMO_DOCS, RESEARCH_DEMO_FIXTURES } from '../../research/research_fixtures.ts';
import { loadExoplanetReplayRows } from '../../research/adapters/exoplanet_replay.ts';
import type { ResearchRun } from '../../research/types.ts';
import type { ProviderProfile } from '../../llm_gateway/types.ts';

/** Create-research request (zod-validated at the boundary). */
const CreateResearchSchema = z.object({
  question: z.string().min(1).max(2000),
  profile: z.enum(['offline_replay', RUNTIME_PROVIDER_PROFILE]).default('offline_replay'),
  source: z.enum(['openalex', 'arxiv', 'crossref']).default('openalex'),
  maxPerQuery: z.number().int().min(1).max(25).default(5),
  target: z.number().int().min(3).max(5).default(3),
});

/** Feedback request body. */
const FeedbackSchema = z.object({
  source: z.enum(['human', 'literature', 'tool', 'analysis']),
  actor: z.string().min(1).max(64),
  text: z.string().min(1).max(4000),
  affectsHypothesisIds: z.array(z.string()).max(16).optional(),
  changesScore: z.boolean().optional(),
  triggers: z.array(z.enum(['new_retrieval', 'alternative_hypothesis', 'plan_rewrite', 'none'])).max(4).optional(),
});

/** Analyze request body (live fetch vs committed real sample). */
const AnalyzeSchema = z.object({
  live: z.boolean().default(false),
});

/** Research route config (gateway/profile injected by server for live mode). */
export interface ResearchRouteConfig {
  readonly gateway?: LlmGateway;
  readonly profile?: ProviderProfile;
}

/** Build the gateway+adapter pair for a profile (fail-closed on missing key). */
function buildPipeline(profile: 'offline_replay' | typeof RUNTIME_PROVIDER_PROFILE): {
  gateway: LlmGateway;
  providerProfile: ProviderProfile;
  replayRetrieval: boolean;
} {
  if (profile === RUNTIME_PROVIDER_PROFILE) {
    // Model-neutral runtime resolution (llm_gateway layer owns the model name;
    // src/api/ never spells it out — 24§0.1 red line).
    const gateway = resolveRuntimeGateway(process.env);
    if (gateway === null) {
      throw new ApiError({
        statusCode: 503,
        errorCode: 'research_live_profile_unavailable',
        message: `live profile needs an API key in the environment (see far doctor)`,
      });
    }
    return { gateway, providerProfile: profile, replayRetrieval: false };
  }
  return {
    gateway: createLlmGateway([createOfflineReplayAdapter({ fixtures: RESEARCH_DEMO_FIXTURES })]),
    providerProfile: profile,
    replayRetrieval: true,
  };
}

export async function registerResearchRoutes(
  app: FastifyInstance,
  _config?: ResearchRouteConfig,
): Promise<void> {
  // Local-first single-user in-memory registry (honest boundary: process-local).
  const registry = new Map<string, ResearchRun>();

  /** POST /research — run the full Track-1A vertical slice once. */
  app.post('/research', async (request, reply) => {
    const body = CreateResearchSchema.parse(request.body);
    const pipeline = buildPipeline(body.profile);

    let run: ResearchRun;
    try {
      run = await runResearch({
        question: body.question,
        gateway: pipeline.gateway,
        profile: pipeline.providerProfile,
        grounding: {
          source: body.source,
          maxPerQuery: body.maxPerQuery,
          ...(pipeline.replayRetrieval
            ? { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) }
            : {}),
        },
        targetHypothesisCount: body.target,
        sameModelAsGenerator: true,
      });
    } catch (err) {
      if (err instanceof ResearchabilityBlockedError) {
        throw new ApiError({ statusCode: 422, errorCode: 'researchability_gate_refused', message: err.message, detail: { verdict: err.report.verdict, reasons: [...err.report.reasons] } });
      }
      throw new ApiError({ statusCode: 500, errorCode: 'research_pipeline_failed', message: err instanceof Error ? err.message : String(err) });
    }

    registry.set(run.runId, run);
    reply.code(201);
    return run;
  });

  /** GET /research/:runId — frozen run (404 when unknown). */
  app.get('/research/:runId', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = registry.get(runId);
    if (run === undefined) {
      throw new ApiError({ statusCode: 404, errorCode: 'research_run_not_found', message: `no research run with id ${runId}` });
    }
    reply.code(200);
    return run;
  });

  /** POST /research/:runId/feedback — structured feedback → immutable revision. */
  app.post('/research/:runId/feedback', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = registry.get(runId);
    if (run === undefined) {
      throw new ApiError({ statusCode: 404, errorCode: 'research_run_not_found', message: `no research run with id ${runId}` });
    }
    const body = FeedbackSchema.parse(request.body);
    const feedback = buildFeedbackSignal({
      source: body.source,
      actor: body.actor,
      text: body.text,
      ...(body.affectsHypothesisIds !== undefined ? { affectsHypothesisIds: body.affectsHypothesisIds } : {}),
      ...(body.changesScore !== undefined ? { changesScore: body.changesScore } : {}),
      ...(body.triggers !== undefined ? { triggers: body.triggers } : {}),
    });

    const gateway = createLlmGateway([createOfflineReplayAdapter({ fixtures: RESEARCH_DEMO_FIXTURES })]);
    const result = await applyFeedbackToRun({
      run,
      feedback,
      gateway,
      profile: 'offline_replay',
    });
    registry.set(runId, result.updated);
    reply.code(200);
    return {
      runId,
      revision: result.revision,
      planChanges: [...result.planChanges],
      unresolvedConflicts: [...result.unresolvedConflicts],
    };
  });

  /** POST /research/:runId/analyze — real-data analysis step (Phase 3 loop). */
  app.post('/research/:runId/analyze', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = registry.get(runId);
    if (run === undefined) {
      throw new ApiError({ statusCode: 404, errorCode: 'research_run_not_found', message: `no research run with id ${runId}` });
    }
    const body = AnalyzeSchema.parse(request.body);

    let experiment;
    try {
      if (body.live) {
        experiment = await runPlanExperiment({ run });
      } else {
        const replay = loadExoplanetReplayRows();
        experiment = await runPlanExperiment({
          run,
          replayRows: replay.rows,
          replayCard: replay.card,
        });
      }
    } catch (err) {
      throw new ApiError({ statusCode: 500, errorCode: 'research_analyze_failed', message: err instanceof Error ? err.message : String(err) });
    }

    const { updatedRun, observation, feedback } = experiment;
    const applied = await applyFeedbackToRun({
      run: updatedRun,
      feedback,
      gateway: createLlmGateway([createOfflineReplayAdapter({ fixtures: RESEARCH_DEMO_FIXTURES })]),
      profile: 'offline_replay',
    });
    registry.set(runId, applied.updated);
    reply.code(200);
    return {
      runId,
      observation,
      feedback,
      revision: applied.revision,
    };
  });

  /** GET /research/:runId/evaluate — program-computed metrics + recompute. */
  app.get('/research/:runId/evaluate', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = registry.get(runId);
    if (run === undefined) {
      throw new ApiError({ statusCode: 404, errorCode: 'research_run_not_found', message: `no research run with id ${runId}` });
    }
    const outcome = verifyResearchRunDeterministic(run);
    const report = computeRunMetrics(run, outcome.status, new Date().toISOString());
    reply.code(200);
    return { ...report, verification: outcome };
  });
}
