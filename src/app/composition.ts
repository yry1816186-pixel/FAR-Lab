import path from 'node:path';
import fs from 'node:fs';
import { openDb } from '../persistence/db.js';
import { Store } from '../persistence/store.js';
import { openArtifactStore } from '../persistence/artifacts.js';
import { getProvider } from '../providers/index.js';
import { resolveBuiltinProvider } from '../providers/builtin-overrides.js';
import { sourceAdapterFor } from '../sources/index.js';
import { openResponseCacheStore, withRetractions, type ResponseCacheStore } from '../sources/response-cache.js';
import { parseRetractionWatchCsv } from '../sources/retraction-watch.js';
import { resolveRunProvider } from './provider-resolver.js';
import { withSpendGate } from './spend-limit.js';
import { Orchestrator } from './orchestrator.js';
import type { StageHandler } from '../pipeline/types.js';
import type { RunStageName } from '../domain/run.js';
import type { ModelProvider, SourceAdapter, StructuredCallRequest, StructuredCallResult } from '../shared/ports.js';

export interface AppOptions {
  /** Root for db + artifacts. Default: .far-run (gitignored local research state). */
  dataDir?: string;
  /** Provider name for the live model route. Default: no fixed name — resolved
   *  per call through the product layer (UI default route > env chain); the live
   *  set is open (zai/dashscope/deepseek/universal — see providers/index.ts). */
  providerName?: string;
  /** Test-only provider injection (tests must never hit live routes). */
  providerOverride?: ModelProvider;
  /** Test-only source-adapter injection (same rule: zero network in tests). */
  adaptersOverride?: Partial<Record<string, SourceAdapter>>;
}

export interface App {
  store: Store;
  orchestrator: Orchestrator;
  artifacts: ReturnType<typeof openArtifactStore>;
  provider: ModelProvider;
  dataDir: string;
  close(): void;
}

const stageModules = async (): Promise<Partial<Record<RunStageName, StageHandler>>> => {
  const [scope, retrieve, verify, evidence, hypotheses, falsify, rank, plan, execute, exportStage, feedbackMod, reviseMod] = await Promise.all([
    import('../pipeline/stages/scope.js'),
    import('../pipeline/stages/retrieve.js'),
    import('../pipeline/stages/verify.js'),
    import('../pipeline/stages/evidence.js'),
    import('../pipeline/stages/hypotheses.js'),
    import('../pipeline/stages/falsify.js'),
    import('../pipeline/stages/rank.js'),
    import('../pipeline/stages/plan.js'),
    import('../pipeline/stages/execute.js'),
    import('../pipeline/stages/export.js'),
    import('../pipeline/stages/feedback.js'),
    import('../pipeline/stages/revise.js'),
  ]);
  return {
    scope: scope.scopeStage,
    retrieve: retrieve.retrieveStage,
    verify_sources: verify.verifyStage,
    build_evidence: evidence.buildEvidenceStage,
    generate_hypotheses: hypotheses.generateHypothesesStage,
    critique_falsify: falsify.falsifyStage,
    rank: rank.rankStage,
    plan: plan.planStage,
    execute: execute.executeStage,
    export: exportStage.exportStage,
    feedback: feedbackMod.feedbackStage,
    revise: reviseMod.reviseStage,
  };
};

const HANDLED_STAGES: RunStageName[] = ['scope','retrieve','verify_sources','build_evidence','generate_hypotheses','critique_falsify','rank','plan','execute','feedback','revise','export'];

export const createApp = async (opts: AppOptions = {}): Promise<App> => {
  // FARLAB_DATA_DIR is a documented env override — honor it wherever createApp is
  // called without an explicit dataDir, so the CLI, the server and `far data info`
  // all agree on one data root instead of silently splitting runs across directories.
  const dataDir = path.resolve(opts.dataDir ?? process.env.FARLAB_DATA_DIR ?? '.far-run');
  fs.mkdirSync(dataDir, { recursive: true });
  const db = openDb(path.join(dataDir, 'far.db'));
  const store = new Store(db);
  const artifacts = openArtifactStore(path.join(dataDir, 'artifacts'));
  // Explicit providerName (CLI/automation) keeps pure env semantics; the default
  // route resolves through the product layer on EVERY call: UI default switch >
  // env chain, with the UI modelId override applied (builtin-overrides.ts) — so
  // settings edits apply to the next call without a restart, mirroring how mcfg
  // edits apply (provider-resolver rebuilds from SQLite on every makeContext).
  const named = opts.providerName ? getProvider(opts.providerName) : undefined;
  const resolveDefault = (): ModelProvider => resolveBuiltinProvider(store);
  const provider: ModelProvider = opts.providerOverride ?? named ?? {
    get name() { return resolveDefault().name; },
    get liveReady() { return resolveDefault().liveReady; },
    structuredCall<T>(req: StructuredCallRequest, parse: (raw: unknown) => T | Error): Promise<StructuredCallResult<T>> {
      return resolveDefault().structuredCall<T>(req, parse);
    },
  };
  const stages = await stageModules();
  const stageMap = new Map(HANDLED_STAGES.map((s) => [s, stages[s]] as [RunStageName, StageHandler]));
  // Retrieval response cache (04→12 handoff 2026-08-24): dedicated source-cache.db —
  // same own-tiny-track pattern as far-scheduler.db; the table is owned solely by
  // response-cache.ts. Absent from ctx the stages run exact legacy behavior, so the
  // cache is pure additive QoS (planned searches + citation-chase ops ride it).
  // FARLAB_RETRIEVAL_REPLAY=1 → cache-exclusive exact replay mode (planned-search
  // miss refuses the run; chase miss degrades visibly; receipts say cache=replay).
  // FARLAB_RETRACTION_WATCH_CSV=<path> → offline Retraction Watch table (manual
  // download is the no-live-API-legal integration; parser is fixture-pinned).
  const cacheDb = openDb(path.join(dataDir, 'source-cache.db'));
  let responseCache: ResponseCacheStore = openResponseCacheStore(cacheDb, process.env.FARLAB_RETRIEVAL_REPLAY === '1' ? 'replay' : 'read_through');
  const rwCsv = process.env.FARLAB_RETRACTION_WATCH_CSV;
  if (rwCsv !== undefined && rwCsv !== '') {
    responseCache = withRetractions(responseCache, parseRetractionWatchCsv(fs.readFileSync(rwCsv, 'utf8')));
  }
  // Spend gate (gap R5): every run-pipeline model call passes the workspace USD
  // ceiling check — fail-closed quota_exceeded once the declared limit is spent.
  // Re-read per call, so a settings edit applies to the next stage immediately.
  const gated = (p: ModelProvider): ModelProvider => withSpendGate(store, p);
  const orchestrator = new Orchestrator({
    store, artifacts, provider: gated(provider),
    providerFor: (run) => {
      const p = resolveRunProvider(store, run);
      return p === null ? null : gated(p);
    },
    sourceFor: (family) => opts.adaptersOverride?.[family] ?? sourceAdapterFor(family),
    stages: stageMap,
    signals: new Map(),
    responseCache,
  });
  return {
    store, orchestrator, artifacts, provider, dataDir,
    close: () => { cacheDb.close(); db.close(); },
  };
};
