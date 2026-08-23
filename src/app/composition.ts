import path from 'node:path';
import fs from 'node:fs';
import { openDb } from '../persistence/db.js';
import { Store } from '../persistence/store.js';
import { openArtifactStore } from '../persistence/artifacts.js';
import { getProvider } from '../providers/index.js';
import { resolveBuiltinProvider } from '../providers/builtin-overrides.js';
import { sourceAdapterFor } from '../sources/index.js';
import { resolveRunProvider } from './provider-resolver.js';
import { Orchestrator } from './orchestrator.js';
import type { StageHandler } from '../pipeline/types.js';
import type { RunStageName } from '../domain/run.js';
import type { ModelProvider, StructuredCallRequest, StructuredCallResult } from '../shared/ports.js';

export interface AppOptions {
  /** Root for db + artifacts. Default: .far-run (gitignored local research state). */
  dataDir?: string;
  /** Provider name for the live model route. Default: no fixed name — resolved
   *  per call through the product layer (UI default route > env chain); the live
   *  set is zai/dashscope only ('deepseek' is banned by user directive). */
  providerName?: string;
  /** Test-only provider injection (tests must never hit live routes). */
  providerOverride?: ModelProvider;
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
  const dataDir = path.resolve(opts.dataDir ?? '.far-run');
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
  const orchestrator = new Orchestrator({
    store, artifacts, provider,
    providerFor: (run) => resolveRunProvider(store, run),
    sourceFor: (family) => sourceAdapterFor(family),
    stages: stageMap,
    signals: new Map(),
  });
  return {
    store, orchestrator, artifacts, provider, dataDir,
    close: () => db.close(),
  };
};
