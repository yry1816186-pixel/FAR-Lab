/**
 * * research REST routes —— 科研纵向切片的 API 面（异步生命周期版）。
 *
 * 端点（file-backed RunStore 为主存储；in-memory registry 仅作 write-through 缓存）：
 *   POST   /research                       202 启动后台运行（progress: status/events 端点）
 *   GET    /research                       列出全部运行（store.listRunIds + checkpoint）
 *   GET    /research/:runId/status         checkpoint 摘要（completedStages/remainingStages）
 *   GET    /research/:runId/events         SSE 实时事件流（state 快照 → research 事件 → 终态关流）
 *   POST   /research/:runId/cancel         请求取消（运行不在本进程 → cancelled:false）
 *   GET    /research/:runId                冻结 ResearchRun（未 COMPLETED → 409）
 *   POST   /research/:runId/feedback       应用结构化反馈 → 不可变 revision（回写 store）
 *   POST   /research/:runId/analyze        真实数据分析（NASA 档案·live 或真实样本 replay）
 *   GET    /research/:runId/evaluate       程序化指标 + 确定性重算
 *
 * 诚实边界：
 *   - competition profile 无凭证 → 503 fail-closed（绝不静默降级到 replay）
 *   - offline_replay profile 在响应中显式 runMode=RECORDED_REPLAY
 *   - 后台运行失败已记录进 checkpoint（FAILED + 原因）；POST 的 .catch 只记日志
 *   - 模型中立：无 Qwen/百炼字面量（profile 名来自 env/请求）
 */

import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { sseHeaders } from './sse.ts';

import { ApiError } from '../errors/error_handler.ts';
import { appendRunSummaryToChain } from '../../research/evidence_chain_bridge.ts';
import { createLlmGateway, type LlmGateway } from '../../llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../llm_gateway/adapters/offline_replay/client.ts';
import { resolveRuntimeGateway, RUNTIME_PROVIDER_PROFILE } from '../../llm_gateway/runtime_gateway.ts';
import { createReplayAdapter } from '../../retrieval/index.ts';
import {
  RunStore,
  DEFAULT_RUNS_ROOT,
  assertValidResearchRunId,
  executeResearchRun,
  addRunEventListener,
  cancelRun,
  type ExecuteResearchRunArgs,
  type RunCheckpoint,
} from '../../research/run_lifecycle.ts';
import { RESEARCH_STAGE_IDS } from '../../research/orchestrator.ts';
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
  /**
   * `auto` (default): live when an API key exists, otherwise 503 fail-closed
   * with actionable guidance — the UI/CLI never silently answers an arbitrary
   * question from synthetic fixtures. Explicit offline_replay stays available
   * for wiring demos/tests.
   */
  profile: z.enum(['auto', 'offline_replay', RUNTIME_PROVIDER_PROFILE]).default('auto'),
  /** Source families to ground across (default ['openalex']). */
  sources: z.array(z.enum(['openalex', 'arxiv', 'crossref'])).min(1).max(3).default(['openalex']),
  /** Legacy single source — merged into `sources` for back-compat. */
  source: z.enum(['openalex', 'arxiv', 'crossref']).optional(),
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
  /** SSE keepalive ping interval in ms (default 15000; lowered in tests). */
  readonly eventsPingMs?: number;
  /** File-backed lifecycle store override for embedders and failure-injection tests. */
  readonly store?: RunStore;
  /** Lifecycle executor override for deterministic concurrency/failure tests. */
  readonly executeRun?: (args: ExecuteResearchRunArgs) => Promise<ResearchRun>;
  /**
   * Evidence-chain DB handle (server injects; optional for embedders). When present,
   * a completed run's summary is anchored into call_records (evidence_chain_bridge —
   * dual-ledger unification, R3). Absent = bridge off, honestly (CLI/tests without db
   * keep the file-receipt surface only).
   */
  readonly db?: Database.Database;
}

/** Checkpoint summary served by GET /:runId/status and the SSE `state` frame. */
export interface ResearchRunStatusSummary {
  readonly runId: string;
  readonly question: string;
  readonly profile: string;
  readonly state: string;
  readonly completedStages: readonly string[];
  readonly remainingStages: readonly string[];
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly error: string | null;
  readonly errorKind: string | null;
  readonly runReady: boolean;
}

/** Build the gateway+adapter pair for a profile (fail-closed on missing key). */
function buildPipeline(profile: 'auto' | 'offline_replay' | typeof RUNTIME_PROVIDER_PROFILE): {
  gateway: LlmGateway;
  providerProfile: ProviderProfile;
  replayRetrieval: boolean;
} {
  if (profile === RUNTIME_PROVIDER_PROFILE || profile === 'auto') {
    // Model-neutral runtime resolution (llm_gateway layer owns the model name;
    // src/api/ never spells it out — 24§0.1 red line).
    const gateway = resolveRuntimeGateway(process.env);
    if (gateway === null) {
      throw new ApiError({
        statusCode: 503,
        errorCode: 'research_live_profile_unavailable',
        message: `live profile needs an API key in the environment (see far doctor)`,
        detail: {
          profile,
          guidance:
            'set the live-provider API key in the environment (see far doctor) for live runs; ' +
            'pass profile=offline_replay explicitly for synthetic-fixture wiring demos',
        },
      });
    }
    return { gateway, providerProfile: RUNTIME_PROVIDER_PROFILE, replayRetrieval: false };
  }
  return {
    gateway: createLlmGateway([createOfflineReplayAdapter({ fixtures: RESEARCH_DEMO_FIXTURES })]),
    providerProfile: profile,
    replayRetrieval: true,
  };
}

/** Terminal lifecycle states (SSE closes after reporting them). */
function isTerminalState(state: string): boolean {
  return state === 'COMPLETED' || state === 'FAILED' || state === 'CANCELLED';
}

export async function registerResearchRoutes(
  app: FastifyInstance,
  config?: ResearchRouteConfig,
): Promise<void> {
  // File-backed store is the truth (default .far/research-runs; env override
  // read once per registration so each server instance is test-pointable).
  const store = config?.store ?? new RunStore(process.env.FAR_RESEARCH_RUNS_DIR ?? DEFAULT_RUNS_ROOT);
  const executeRun = config?.executeRun ?? executeResearchRun;
  const pingMs = config?.eventsPingMs ?? 15_000;
  // Write-through cache only: lets old tests / concurrent reads resolve runs
  // without disk round-trips; the store remains the source of truth.
  const registry = new Map<string, ResearchRun>();

  /** Treat an unsafe path identifier as invalid client input, never store corruption. */
  const requireValidRunId = (runId: string): void => {
    try {
      assertValidResearchRunId(runId);
    } catch {
      throw new ApiError({
        statusCode: 400,
        errorCode: 'invalid_research_run_id',
        message: 'research run id has an invalid format',
      });
    }
  };

  /** Load a checkpoint or throw a structured error (404 unknown / 500 corrupt). */
  const requireCheckpoint = (runId: string): RunCheckpoint => {
    requireValidRunId(runId);
    let cp: RunCheckpoint | null;
    try {
      cp = store.loadCheckpoint(runId);
    } catch (err) {
      throw new ApiError({
        statusCode: 500,
        errorCode: 'research_checkpoint_corrupt',
        message: `checkpoint for ${runId} is unreadable`,
        detail: { reason: err instanceof Error ? err.message : String(err) },
      });
    }
    if (cp === null) {
      throw new ApiError({ statusCode: 404, errorCode: 'research_run_not_found', message: `no research run with id ${runId}` });
    }
    return cp;
  };

  /** Checkpoint → status summary (runReady = frozen run file exists). */
  const summarize = (cp: RunCheckpoint): ResearchRunStatusSummary => ({
    runId: cp.runId,
    question: cp.question,
    profile: cp.profile,
    state: cp.state,
    completedStages: [...cp.completedStages],
    remainingStages: RESEARCH_STAGE_IDS.filter((s) => !cp.completedStages.includes(s)),
    startedAt: cp.startedAt,
    updatedAt: cp.updatedAt,
    completedAt: cp.completedAt,
    error: cp.error,
    errorKind: cp.errorKind,
    runReady: cp.state === 'COMPLETED' && store.loadRun(cp.runId) !== null,
  });

  /** POST /research — start one research run in the background (202 + runId). */
  app.post('/research', async (request, reply) => {
    const body = CreateResearchSchema.parse(request.body);
    const pipeline = buildPipeline(body.profile);
    const sources = body.source !== undefined
      ? [...new Set([...body.sources, body.source])]
      : [...body.sources];

    // A per-request preparation handshake owns the returned id. Directory-set
    // inference is ambiguous when another worker/request creates a checkpoint
    // in the same store between observations. The real executor invokes this
    // callback synchronously after its first durable checkpoint; the Promise
    // fallback also makes pre-preparation rejection explicit and handled.
    const preparation: { runId?: string; settled: boolean } = { settled: false };
    let resolvePrepared!: (runId: string) => void;
    let rejectPrepared!: (reason: unknown) => void;
    const prepared = new Promise<string>((resolve, reject) => {
      resolvePrepared = resolve;
      rejectPrepared = reject;
    });
    const rejectPreparation = (err: unknown): void => {
      if (!preparation.settled) {
        preparation.settled = true;
        rejectPrepared(err);
      }
    };
    const logExecutionFailure = (err: unknown): void => {
      rejectPreparation(err);
      request.log.warn(`research run failed (recorded in checkpoint): ${err instanceof Error ? err.message : String(err)}`);
    };

    try {
      const execution = executeRun({
        question: body.question,
        gateway: pipeline.gateway,
        profile: pipeline.providerProfile,
        grounding: {
          ...(sources.length > 1 ? { sources } : { source: sources[0] ?? 'openalex' }),
          maxPerQuery: body.maxPerQuery,
          ...(pipeline.replayRetrieval
            ? { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) }
            : {}),
        },
        targetHypothesisCount: body.target,
        store,
        onRunPrepared: (runId) => {
          if (preparation.settled) return;
          preparation.runId = runId;
          preparation.settled = true;
          resolvePrepared(runId);
        },
      });
      // Attach the rejection observer in the same turn as executor invocation:
      // even an already-rejected async function cannot become unhandled.
      void execution
        .then((run) => {
          if (!preparation.settled) {
            rejectPreparation(new Error('research executor resolved before reporting its prepared run id'));
          }
          registry.set(run.runId, run);
          // 双账本桥（R3）：终态 COMPLETED 的运行摘要锚入 call_records 证据链。
          // 桥失败不拖垮已完成的运行——警告日志如实记录，叶缺席可由
          // verifyRunSummaryRecord 事后检出（leaf_absent）。
          if (config?.db !== undefined) {
            try {
              const cp = store.loadCheckpoint(run.runId);
              if (cp !== null && cp.state === 'COMPLETED') {
                appendRunSummaryToChain(config.db, run, {
                  completedAt: cp.completedAt ?? run.startedAt,
                  providerProfile: pipeline.providerProfile,
                });
              }
            } catch (err) {
              request.log.warn(
                `evidence-chain bridge failed for run ${run.runId} (run itself complete; leaf absent — detectable via verifyRunSummaryRecord): ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          }
        })
        .catch(logExecutionFailure);
    } catch (err) {
      // The production executor is async (so throws become rejections), but an
      // injected/alternate executor may still throw before returning a Promise.
      logExecutionFailure(err);
    }

    let runId: string;
    try {
      // No await/microtask hop on the production fast path: the callback is
      // synchronous and the response retains the existing immediate-202 timing.
      runId = preparation.runId ?? await prepared;
      assertValidResearchRunId(runId);
      const checkpoint = store.loadCheckpoint(runId);
      if (checkpoint === null) {
        throw new Error('prepared run id has no durable checkpoint');
      }
      if (checkpoint.question !== body.question || checkpoint.profile !== pipeline.providerProfile) {
        throw new Error('prepared run checkpoint does not belong to this request');
      }
    } catch (err) {
      throw new ApiError({
        statusCode: 500,
        errorCode: 'research_run_start_failed',
        message: 'run did not start with a valid request-owned checkpoint',
        cause: err,
      });
    }
    reply.code(202);
    return {
      runId,
      state: 'CREATED',
      statusUrl: `/api/v1/research/${runId}/status`,
      eventsUrl: `/api/v1/research/${runId}/events`,
    };
  });

  /** GET /research — list every run in the store (summary rows). */
  app.get('/research', async () => {
    const runs = store.listRunIds().flatMap((runId) => {
      try {
        const cp = store.loadCheckpoint(runId);
        return cp === null
          ? []
          : [{
              runId: cp.runId,
              question: cp.question,
              state: cp.state,
              startedAt: cp.startedAt,
              updatedAt: cp.updatedAt,
              error: cp.error,
            }];
      } catch {
        return []; // one corrupt checkpoint must not 500 the whole listing
      }
    });
    return { runs };
  });

  /** GET /research/:runId/status — checkpoint summary (404 when unknown). */
  app.get('/research/:runId/status', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const summary = summarize(requireCheckpoint(runId));
    reply.code(200);
    return summary;
  });

  /** GET /research/:runId/events — SSE: state snapshot → live events → close. */
  app.get('/research/:runId/events', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const cp = requireCheckpoint(runId);

    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, sseHeaders(request));
    const send = (frame: string): void => {
      if (!raw.writableEnded && !raw.destroyed) {
        raw.write(frame);
      }
    };

    // 1. Current state snapshot (lets a late subscriber orient immediately).
    send(`event: state\ndata: ${JSON.stringify(summarize(cp))}\n\n`);

    // Already terminal → nothing left to forward; close after the snapshot.
    if (isTerminalState(cp.state)) {
      raw.end();
      return;
    }

    // 2. Forward every lifecycle event; terminal event → send, then close.
    let unsubscribe: (() => void) | null = null;
    let heartbeat: NodeJS.Timeout | null = null;
    let cleaned = false;
    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      unsubscribe?.();
      if (heartbeat !== null) clearInterval(heartbeat);
      if (!raw.writableEnded && !raw.destroyed) {
        raw.end();
      }
    };
    unsubscribe = addRunEventListener(runId, (event) => {
      send(`event: research\ndata: ${JSON.stringify(event)}\n\n`);
      if (
        event.type === 'run_completed' ||
        event.type === 'run_failed' ||
        event.type === 'run_cancelled'
      ) {
        cleanup();
      }
    });

    // 3. Keepalive comment line (proxy/LB timeout defense; see events.ts).
    heartbeat = setInterval(() => {
      send(': ping\n\n');
    }, pingMs);
    heartbeat.unref();

    // Client disconnect → unsubscribe (never leak listeners).
    raw.on('close', cleanup);
    raw.on('error', cleanup);
  });

  /** POST /research/:runId/cancel — request cancellation of an active run. */
  app.post('/research/:runId/cancel', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const cp = requireCheckpoint(runId);
    const cancelled = cancelRun(runId);
    reply.code(200);
    return { runId, cancelled, state: cp.state };
  });

  /**
   * Resolve the gateway for MUTATING a stored run so it matches the run's own
   * provenance: a LIVE run's revisions must come from the live provider (503
   * fail-closed when the key is gone), never silently from replay fixtures —
   * a replay revision inside a LIVE run would be mode confusion (§3.2).
   */
  const gatewayForRun = (run: ResearchRun): { gateway: LlmGateway; profile: ProviderProfile } => {
    if (run.runMode === 'LIVE') {
      const gateway = resolveRuntimeGateway(process.env);
      if (gateway === null) {
        throw new ApiError({
          statusCode: 503,
          errorCode: 'research_live_profile_unavailable',
          message: 'this run is LIVE; mutating it needs an API key in the environment (see far doctor)',
        });
      }
      return { gateway, profile: RUNTIME_PROVIDER_PROFILE };
    }
    return {
      gateway: createLlmGateway([createOfflineReplayAdapter({ fixtures: RESEARCH_DEMO_FIXTURES })]),
      profile: 'offline_replay',
    };
  };

  /** Load a run file (corrupt → structured 500). */
  const loadRunFile = (runId: string): ResearchRun | null => {
    requireValidRunId(runId);
    try {
      return store.loadRun(runId);
    } catch (err) {
      throw new ApiError({
        statusCode: 500,
        errorCode: 'research_run_corrupt',
        message: `stored run ${runId} is unreadable`,
        detail: { reason: err instanceof Error ? err.message : String(err) },
      });
    }
  };

  /** GET /research/:runId — frozen run (409 while not COMPLETED, 404 unknown). */
  app.get('/research/:runId', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = loadRunFile(runId) ?? registry.get(runId) ?? null;
    if (run !== null) {
      reply.code(200);
      return run;
    }
    const cp: RunCheckpoint | null = (() => {
      try {
        return store.loadCheckpoint(runId);
      } catch {
        return null; // corrupt entry → fall through to 404 (loadRunFile reports corruption)
      }
    })();
    if (cp !== null) {
      throw new ApiError({
        statusCode: 409,
        errorCode: 'research_run_not_completed',
        message: `run ${runId} is ${cp.state} — the frozen ResearchRun is written on COMPLETED`,
        detail: { state: cp.state },
      });
    }
    throw new ApiError({ statusCode: 404, errorCode: 'research_run_not_found', message: `no research run with id ${runId}` });
  });

  /**
   * Resolve a run for the mutation endpoints: store first, in-memory registry
   * as back-compat fallback (older tests registered runs without a store).
   */
  const resolveRun = (runId: string): ResearchRun => {
    const run = loadRunFile(runId) ?? registry.get(runId);
    if (run === undefined) {
      throw new ApiError({ statusCode: 404, errorCode: 'research_run_not_found', message: `no research run with id ${runId}` });
    }
    return run;
  };

  /** POST /research/:runId/feedback — structured feedback → immutable revision. */
  app.post('/research/:runId/feedback', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = resolveRun(runId);
    const body = FeedbackSchema.parse(request.body);
    const feedback = buildFeedbackSignal({
      source: body.source,
      actor: body.actor,
      text: body.text,
      ...(body.affectsHypothesisIds !== undefined ? { affectsHypothesisIds: body.affectsHypothesisIds } : {}),
      ...(body.changesScore !== undefined ? { changesScore: body.changesScore } : {}),
      ...(body.triggers !== undefined ? { triggers: body.triggers } : {}),
    });

    const { gateway, profile } = gatewayForRun(run);
    const result = await applyFeedbackToRun({ run, feedback, gateway, profile });
    registry.set(runId, result.updated);
    store.saveRun(runId, result.updated);
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
    const run = resolveRun(runId);
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
    const mutationGateway = gatewayForRun(updatedRun);
    const applied = await applyFeedbackToRun({
      run: updatedRun,
      feedback,
      gateway: mutationGateway.gateway,
      profile: mutationGateway.profile,
    });
    registry.set(runId, applied.updated);
    store.saveRun(runId, applied.updated);
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
    const run = resolveRun(runId);
    const outcome = verifyResearchRunDeterministic(run);
    const report = computeRunMetrics(run, outcome.status, new Date().toISOString());
    reply.code(200);
    return { ...report, verification: outcome };
  });
}
