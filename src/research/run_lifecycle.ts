/**
 * research/run_lifecycle — persistent run lifecycle for the research slice.
 *
 * Directives §14/§16: research runs must be long-task-observable, cancellable,
 * resumable, and survive process restarts. This module wraps runResearch with
 * the checkpoint driver (same stage functions — no duplicated orchestration):
 *
 *   CREATED → VALIDATING → RETRIEVING → GENERATING_HYPOTHESES → REVIEWING
 *           → PLANNING → COMPLETED | FAILED | CANCELLED
 *
 * Persistence: one directory per run under the store root (default
 * `.far/research-runs/<runId>/`, gitignored) holding
 *   checkpoint.json      — lifecycle state + completed stages + serializable ctx
 *   research-run.json    — the frozen ResearchRun (written on COMPLETED)
 *
 * Honesty boundaries:
 *   - a FAILED/CANCELLED run keeps its completed-stage checkpoint; resume
 *     re-executes ONLY the incomplete stages (live retrieval is not re-fetched
 *     for completed stages — the frozen corpus is reused).
 *   - CANCELLED is only written on explicit abort (signal/SIGINT), never to
 *     mask an error; errors are FAILED with the reason recorded verbatim.
 *   - the checkpoint is internal state, not evidence; the trust layer stays
 *     the ResearchRun + stage receipts + deterministic verify.
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import type { Dirent } from 'node:fs';
import { loadCorpusSnapshotStore, resolveSnapshotStoreDir } from '../retrieval/snapshot_store.ts';
import { join, resolve } from 'node:path';
import { ulid } from 'ulid';
import type { LlmGateway } from '../llm_gateway/gateway.ts';
import type { ProviderProfile } from '../llm_gateway/types.ts';
import type { StrategyId } from '../discovery/types.ts';
import type { FanoutMeta } from '../discovery/generate.ts';
import { registerRunDiscoveries } from '../discovery/registry.ts';
import { loadResearchMemory, recordRunToMemory, type ResearchMemoryStore } from './memory.ts';
import {
  runResearch,
  STAGE_LIFECYCLE_STATE,
  hydrateCtxResolver,
  ctxToSerializable,
  RESEARCH_STAGE_IDS,
  type ResearchCtx,
  type ResearchGroundingOptions,
  type ResearchStageDriver,
  type ResearchStageId,
} from './orchestrator.ts';
import { ResearchabilityBlockedError } from './researchability_gate.ts';
import { parseCheckpoint } from './checkpoint_schema.ts';
export { parseCheckpoint } from './checkpoint_schema.ts';
export {
  CHECKPOINT_SCHEMA_VERSION,
  CHECKPOINT_MIGRATIONS,
  migrateCheckpointPayload,
} from './checkpoint_schema.ts';
import type { ResearchRun } from './types.ts';
import {
  RESEARCH_RUN_ID_PATTERN,
  assertValidResearchRunId,
  renameWithRetry,
} from './run_store_security.ts';

export {
  InvalidResearchRunIdError,
  assertValidResearchRunId,
  renameWithRetry,
} from './run_store_security.ts';

/** Lifecycle states (directive §16, hypothesis/plan subset). */
export type ResearchLifecycleState =
  | 'CREATED'
  | 'VALIDATING'
  | 'RETRIEVING'
  | 'GENERATING_HYPOTHESES'
  | 'REVIEWING'
  | 'PLANNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

/** Serialized checkpoint for one run (on-disk truth of the lifecycle). */
export interface RunCheckpoint {
  readonly runId: string;
  readonly question: string;
  readonly profile: ProviderProfile;
  readonly sources: readonly string[];
  readonly maxPerQuery: number;
  readonly target: number;
  /**
   * Hypothesis-generation strategy (discovery engine). Absent on pre-discovery
   * checkpoints = 'legacy'. Persisted so a crashed multi-strategy run resumes
   * as multi-strategy (never silently reverts).
   */
  readonly hypothesisGenerationStrategy?: 'legacy' | 'multi_strategy';
  /** Strategy subset for multi_strategy runs (absent = all registered). */
  readonly discoveryStrategies?: readonly StrategyId[];
  /** Source-failure policy (absent = 'reject'); persisted for resume-stability. */
  readonly onSourceFailure?: 'reject' | 'degrade';
  /**
   * Frozen-corpus pin (night-r8; absent = live grounding). Persisted so a
   * crashed pinned run resumes on the EXACT same evidence set — the snapshot
   * is reloaded + re-verified from the store at resume (never silently
   * re-grounded live mid-run).
   */
  readonly frozenSnapshotId?: string;
  /**
   * Discovery-registry outcome at run completion (LIVE/MIXED runs register
   * CORROBORATED-qualified hypotheses in the append-only ledger). Null error
   * = registered (or skipped-by-mode); non-null = the ledger write FAILED —
   * the run itself is valid and persisted, the failure is surfaced loudly.
   */
  readonly discoveryRegistration?: {
    readonly appendedCount: number;
    readonly skippedDuplicates: number;
    readonly notRegisteredCount: number;
    readonly error: string | null;
  };
  /**
   * Research-memory outcome at run completion (directive §2.5). Null error =
   * recorded (or skipped-by-mode); non-null = the memory write FAILED — the
   * run itself is valid and persisted, the failure is surfaced loudly. Absent
   * = memory disabled or not attempted.
   */
  readonly memoryRecording?: {
    readonly skippedMode: boolean;
    readonly negativeRecorded: number;
    readonly branchesAdded: number;
    readonly branchesSuperseded: number;
    readonly conclusionsRecorded: number;
    readonly learningsRecorded: number;
    readonly error: string | null;
  };
  readonly state: ResearchLifecycleState;
  readonly completedStages: readonly ResearchStageId[];
  readonly ctx: Record<string, unknown>;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly error: string | null;
  readonly errorKind: 'gate_refused' | 'pipeline' | 'aborted' | null;
  readonly completedAt: string | null;
}

/** Progress events (CLI rendering + API SSE share this shape). */
export type ResearchRunEvent =
  | { readonly type: 'run_started'; readonly runId: string; readonly question: string; readonly at: string; readonly seq: number }
  | { readonly type: 'run_resumed'; readonly runId: string; readonly fromStage: ResearchStageId | null; readonly at: string; readonly seq: number }
  | { readonly type: 'state_changed'; readonly runId: string; readonly from: ResearchLifecycleState; readonly to: ResearchLifecycleState; readonly at: string; readonly seq: number }
  | { readonly type: 'stage_started'; readonly runId: string; readonly stageId: ResearchStageId; readonly at: string; readonly seq: number }
  | { readonly type: 'stage_completed'; readonly runId: string; readonly stageId: ResearchStageId; readonly at: string; readonly seq: number }
  | { readonly type: 'run_completed'; readonly runId: string; readonly runMode: string; readonly at: string; readonly seq: number }
  | { readonly type: 'run_failed'; readonly runId: string; readonly error: string; readonly errorKind: string; readonly at: string; readonly seq: number }
  | { readonly type: 'run_cancelled'; readonly runId: string; readonly at: string; readonly seq: number };

/** Default on-disk root for research runs (gitignored via `.far/`). */
export const DEFAULT_RUNS_ROOT = '.far/research-runs';

/** Process-local suffix prevents concurrent atomic writers sharing one tmp path. */
let atomicWriteSequence = 0;

/** File-backed run store: one directory per run, atomic JSON writes. */
export class RunStore {
  readonly rootDir: string;

  constructor(rootDir: string = DEFAULT_RUNS_ROOT) {
    this.rootDir = rootDir;
  }

  /** Windows-portable comparison for filesystem identities. */
  private comparablePath(path: string): string {
    return process.platform === 'win32' ? path.toLowerCase() : path;
  }

  /**
   * Find the exact directory entry and reject case-fold aliases. Enforcing this
   * on every platform prevents a store created on Linux from becoming
   * ambiguous or overwriting a different run when moved to Windows.
   */
  private findExactRunEntry(runId: string): Dirent | null {
    if (!existsSync(this.rootDir)) return null;
    const folded = runId.toLowerCase();
    const aliases = readdirSync(this.rootDir, { withFileTypes: true })
      .filter((entry) => entry.name.toLowerCase() === folded);
    if (aliases.length > 1 || (aliases.length === 1 && aliases[0]!.name !== runId)) {
      throw new Error('research run id has a case-fold collision in the store');
    }
    return aliases[0] ?? null;
  }

  /** Reject symlink/junction run directories and require their canonical direct-child path. */
  private assertRunDirectorySafe(runId: string, directory: string): void {
    const metadata = lstatSync(directory);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error('research run storage entry must be a real directory, not a link or file');
    }
    const canonicalRoot = realpathSync(this.rootDir);
    const canonicalDirectory = realpathSync(directory);
    const expectedDirectory = resolve(canonicalRoot, runId);
    if (this.comparablePath(canonicalDirectory) !== this.comparablePath(expectedDirectory)) {
      throw new Error('research run storage directory escapes its configured root');
    }
  }

  /** Return an existing safe run directory, or null without creating storage. */
  private existingRunDir(runId: string): string | null {
    assertValidResearchRunId(runId);
    const entry = this.findExactRunEntry(runId);
    if (entry === null) return null;
    const directory = join(this.rootDir, entry.name);
    this.assertRunDirectorySafe(runId, directory);
    return directory;
  }

  /** Atomically claim a direct child directory, then re-check its canonical identity. */
  private ensureRunDir(runId: string): string {
    assertValidResearchRunId(runId);
    mkdirSync(this.rootDir, { recursive: true });
    let entry = this.findExactRunEntry(runId);
    const directory = join(this.rootDir, runId);
    if (entry === null) {
      try {
        mkdirSync(directory);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      }
      // Re-scan after mkdir/EEXIST: a concurrent case-fold alias must fail,
      // and an exact entry must be validated rather than assumed to be ours.
      entry = this.findExactRunEntry(runId);
    }
    if (entry === null) {
      throw new Error('research run storage directory could not be created');
    }
    this.assertRunDirectorySafe(runId, directory);
    return directory;
  }

  /** Reject file symlinks and non-files before a read or overwrite. */
  private assertSafeFileIfPresent(path: string): boolean {
    if (!existsSync(path)) return false;
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new Error('research run storage file must be a regular file, not a link or directory');
    }
    return true;
  }

  runDir(runId: string): string {
    assertValidResearchRunId(runId);
    const existing = this.existingRunDir(runId);
    return existing ?? join(this.rootDir, runId);
  }

  checkpointPath(runId: string): string {
    return join(this.runDir(runId), 'checkpoint.json');
  }

  runPath(runId: string): string {
    return join(this.runDir(runId), 'research-run.json');
  }

  /** Atomic write (tmp + rename) so a crash mid-write never corrupts state. */
  private writeAtomic(path: string, content: string): void {
    this.assertSafeFileIfPresent(path);
    atomicWriteSequence += 1;
    const temporaryPath = `${path}.${process.pid}.${atomicWriteSequence}.tmp`;
    try {
      writeFileSync(temporaryPath, content, { encoding: 'utf8', flag: 'wx' });
      this.assertSafeFileIfPresent(temporaryPath);
      renameWithRetry(temporaryPath, path);
    } finally {
      if (existsSync(temporaryPath)) rmSync(temporaryPath, { force: true });
    }
  }

  saveCheckpoint(cp: RunCheckpoint): void {
    const directory = this.ensureRunDir(cp.runId);
    this.writeAtomic(join(directory, 'checkpoint.json'), `${JSON.stringify(cp, null, 2)}\n`);
  }

  loadCheckpoint(runId: string): RunCheckpoint | null {
    const directory = this.existingRunDir(runId);
    if (directory === null) return null;
    const path = join(directory, 'checkpoint.json');
    if (!this.assertSafeFileIfPresent(path)) return null;
    const checkpoint = parseCheckpoint(readFileSync(path, 'utf8'));
    if (checkpoint.runId !== runId) {
      throw new Error('checkpoint.json runId does not match its storage directory');
    }
    return checkpoint;
  }

  saveRun(runId: string, run: ResearchRun): void {
    if (run.runId !== runId) {
      throw new Error('ResearchRun runId does not match its storage directory');
    }
    const directory = this.ensureRunDir(runId);
    this.writeAtomic(join(directory, 'research-run.json'), `${JSON.stringify(run, null, 2)}\n`);
  }

  loadRun(runId: string): ResearchRun | null {
    const directory = this.existingRunDir(runId);
    if (directory === null) return null;
    const path = join(directory, 'research-run.json');
    if (!this.assertSafeFileIfPresent(path)) return null;
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (
      typeof parsed !== 'object'
      || parsed === null
      || !('runId' in parsed)
      || parsed.runId !== runId
    ) {
      throw new Error('research-run.json runId does not match its storage directory');
    }
    return parsed as ResearchRun;
  }

  listRunIds(): readonly string[] {
    if (!existsSync(this.rootDir)) return [];
    const names = readdirSync(this.rootDir, { withFileTypes: true })
      .filter((entry) => RESEARCH_RUN_ID_PATTERN.test(entry.name))
      .map((entry) => entry.name);
    const caseFolded = new Set<string>();
    for (const name of names) {
      const folded = name.toLowerCase();
      if (caseFolded.has(folded)) {
        throw new Error('research run ids have a case-fold collision in the store');
      }
      caseFolded.add(folded);
    }
    return names
      .filter((name) => {
        const directory = this.existingRunDir(name);
        if (directory === null) return false;
        return this.assertSafeFileIfPresent(join(directory, 'checkpoint.json'));
      })
      .sort();
  }
}

/** Parse + structurally validate a checkpoint file (fail loud on corruption). */

/** In-process cancellation registry (one controller per active run). */
const activeControllers = new Map<string, AbortController>();

/** Is a run currently executing in this process? */
export function isRunActive(runId: string): boolean {
  return activeControllers.has(runId);
}

/** Request cancellation of an active run (no-op when not active). */
export function cancelRun(runId: string): boolean {
  const controller = activeControllers.get(runId);
  if (controller === undefined) return false;
  controller.abort();
  return true;
}

/** Subscribe to events for one run (in-process; the API layers SSE on top). */
type EventListener = (event: ResearchRunEvent) => void;
const listeners = new Map<string, Set<EventListener>>();

export function addRunEventListener(runId: string, listener: EventListener): () => void {
  let set = listeners.get(runId);
  if (set === undefined) {
    set = new Set();
    listeners.set(runId, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) listeners.delete(runId);
  };
}

/** Arguments for executeResearchRun (start or resume). */
export interface ExecuteResearchRunArgs {
  readonly question?: string;
  readonly gateway: LlmGateway;
  readonly profile: ProviderProfile;
  readonly grounding?: ResearchGroundingOptions;
  readonly targetHypothesisCount?: number;
  /** Discovery fan-out strategy (directive §2.1); persisted to the checkpoint for resume-stability. Default since b3: multi_strategy. */
  readonly hypothesisGenerationStrategy?: 'legacy' | 'multi_strategy';
  /** Strategy subset for multi_strategy runs. */
  readonly discoveryStrategies?: readonly StrategyId[];
  /** Receives the fan-out accounting when a multi_strategy run generates hypotheses. */
  readonly onFanoutComplete?: (meta: FanoutMeta) => void;
  /** Override the discovery-registry ledger path (tests inject temp dirs). */
  readonly discoveryRegistryPath?: string;
  /** Override the research-memory store path (tests inject temp dirs). */
  readonly researchMemoryPath?: string;
  /** Disable research-memory read+write for this run (CLI --no-memory / FAR_RESEARCH_MEMORY=0). */
  readonly disableMemory?: boolean;
  /** Existing run id → resume; omitted → new run (ULID minted). */
  readonly runId?: string;
  /**
   * Called exactly once after the initial checkpoint is durable and before the
   * first lifecycle event.  CLI/API adapters use this authoritative id instead
   * of racing the run directory to discover which checkpoint was just created.
   */
  readonly onRunPrepared?: (runId: string) => void;
  readonly store: RunStore;
  readonly signal?: AbortSignal;
  readonly now?: () => Date;
}

class AbortedRunError extends Error {
  constructor() {
    super('run aborted by cancellation signal');
    this.name = 'AbortedRunError';
  }
}

/**
 * Execute (or resume) one research run under the lifecycle driver.
 *
 * Returns the completed ResearchRun. Throws on failure AFTER recording the
 * failure in the checkpoint (completed stages are preserved for resume).
 */
export async function executeResearchRun(args: ExecuteResearchRunArgs): Promise<ResearchRun> {
  const now = args.now ?? (() => new Date());
  const store = args.store;

  // ── Resume or create. ──
  let cp: RunCheckpoint;
  let initialCtx: ResearchCtx | undefined;
  if (args.runId !== undefined) {
    const existing = store.loadCheckpoint(args.runId);
    if (existing === null) {
      throw new Error(`no checkpoint for run ${args.runId} under ${store.rootDir}`);
    }
    if (existing.state === 'COMPLETED') {
      throw new Error(`run ${args.runId} is already COMPLETED — inspect it: far research inspect ${store.runPath(args.runId)}`);
    }
    if (isRunActive(args.runId)) {
      throw new Error(`run ${args.runId} is already executing in this process`);
    }
    cp = { ...existing, updatedAt: now().toISOString() };
    // The ctx was serialized by our own ctxToSerializable (never a foreign
    // shape — parseCheckpoint validated it); the explicit `unknown` boundary
    // documents that trust as a single, deliberate assertion.
    const serializedCtx: unknown = cp.ctx;
    initialCtx = serializedCtx as ResearchCtx;
    hydrateCtxResolver(initialCtx);
  } else {
    cp = {
      runId: ulid(),
      question: args.question ?? '',
      profile: args.profile,
      sources: sourcesOf(args.grounding),
      maxPerQuery: args.grounding?.maxPerQuery ?? 5,
      target: args.targetHypothesisCount ?? 3,
      // Default since b3: multi-strategy fan-out. New checkpoints ALWAYS carry
      // the field; only pre-b3 checkpoints (absent field) resume as legacy.
      hypothesisGenerationStrategy: args.hypothesisGenerationStrategy ?? 'multi_strategy',
      ...(args.discoveryStrategies !== undefined ? { discoveryStrategies: args.discoveryStrategies } : {}),
      ...(args.grounding?.onSourceFailure !== undefined
        ? { onSourceFailure: args.grounding.onSourceFailure }
        : {}),
      ...(args.grounding?.frozenCorpus !== undefined
        ? { frozenSnapshotId: args.grounding.frozenCorpus.snapshotId }
        : {}),
      state: 'CREATED',
      completedStages: [],
      ctx: {},
      startedAt: now().toISOString(),
      updatedAt: now().toISOString(),
      error: null,
      errorKind: null,
      completedAt: null,
    };
  }
  const runId = cp.runId;

  let seq = 0;
  const nextSeq = (): number => {
    seq += 1;
    return seq;
  };
  const emit = (event: ResearchRunEvent): void => {
    const set = listeners.get(runId);
    if (set === undefined) return;
    for (const listener of set) {
      try {
        listener(event);
      } catch {
        // a broken listener must never break the run
      }
    }
  };

  const setState = (to: ResearchLifecycleState): void => {
    const from = cp.state;
    cp = { ...cp, state: to, updatedAt: now().toISOString() };
    store.saveCheckpoint(cp);
    emit({ type: 'state_changed', runId, from, to, at: now().toISOString(), seq: nextSeq() });
  };

  const controller = new AbortController();
  // An already-aborted external signal never fires the 'abort' event on
  // addEventListener — propagate the pre-aborted state explicitly.
  if (args.signal?.aborted === true) {
    controller.abort();
  }
  activeControllers.set(runId, controller);
  const onExternalAbort = (): void => {
    controller.abort();
  };
  args.signal?.addEventListener('abort', onExternalAbort, { once: true });

  const driver: ResearchStageDriver = {
    async run(stageId, fn) {
      if (cp.completedStages.includes(stageId)) {
        return; // already done in a previous execution — checkpoint replay
      }
      if (controller.signal.aborted) {
        throw new AbortedRunError();
      }
      emit({ type: 'stage_started', runId, stageId, at: now().toISOString(), seq: nextSeq() });
      const lifecycleState = STAGE_LIFECYCLE_STATE[stageId] as ResearchLifecycleState;
      if (cp.state !== lifecycleState) {
        setState(lifecycleState);
      }
      await fn();
      cp = {
        ...cp,
        completedStages: [...cp.completedStages, stageId],
        ctx: latestCtx === undefined ? {} : ctxToSerializable(latestCtx),
        updatedAt: now().toISOString(),
      };
      store.saveCheckpoint(cp);
      emit({ type: 'stage_completed', runId, stageId, at: now().toISOString(), seq: nextSeq() });

      // A stage body may resolve through an entirely synchronous replay chain.
      // Yield once so an OS SIGINT queued during that work can reach the CLI's
      // AbortController, then observe cancellation at this *durable* boundary.
      // Checking after save preserves resume semantics: completed work is never
      // repeated, including when cancellation lands after the final `plan` stage.
      await new Promise<void>((resolve) => setImmediate(resolve));
      if (controller.signal.aborted) {
        throw new AbortedRunError();
      }
    },
  };

  // The orchestrator hands its LIVE ctx to the driver via onCtxReady — the
  // driver serializes that reference after every stage (never a stale copy).
  let latestCtx: ResearchCtx | undefined;

  try {
    // Persist the initial state immediately: `far research status` and event
    // subscribers must see a CREATED/loaded checkpoint before stage 1 finishes.
    store.saveCheckpoint(cp);
    args.onRunPrepared?.(runId);
    if (cp.completedStages.length === 0 && cp.state === 'CREATED') {
      emit({ type: 'run_started', runId, question: cp.question, at: now().toISOString(), seq: nextSeq() });
    } else {
      const nextStage =
        RESEARCH_STAGE_IDS.find((s) => !cp.completedStages.includes(s)) ?? null;
      emit({ type: 'run_resumed', runId, fromStage: nextStage, at: now().toISOString(), seq: nextSeq() });
    }

    // Rebuild grounding options from the checkpoint (resume-stable). A saved
    // multi-source list (or a non-default single source) is replayed verbatim;
    // the replay adapter (offline tests) is re-injected by the caller.
    const sourcePart: Pick<ResearchGroundingOptions, 'source' | 'sources'> =
      cp.sources.length === 1 && cp.sources[0] === 'openalex'
        ? { source: 'openalex' }
        : { sources: cp.sources as NonNullable<ResearchGroundingOptions['sources']> };
    // Frozen-corpus pin: start passes the corpus directly; a RESUME reloads +
    // re-verifies it from the snapshot store via the persisted id (absent store
    // entry → hard error: a pinned run must never silently re-ground live).
    let frozenCorpusPart: Pick<ResearchGroundingOptions, 'frozenCorpus'> = {};
    if (args.grounding?.frozenCorpus !== undefined) {
      frozenCorpusPart = { frozenCorpus: args.grounding.frozenCorpus };
    } else if (cp.frozenSnapshotId !== undefined) {
      const reloaded = loadCorpusSnapshotStore(
        cp.frozenSnapshotId,
        resolveSnapshotStoreDir(),
      );
      frozenCorpusPart = { frozenCorpus: reloaded.snapshot };
    }
    const grounding: ResearchGroundingOptions = {
      ...sourcePart,
      maxPerQuery: cp.maxPerQuery,
      ...frozenCorpusPart,
      ...(cp.onSourceFailure !== undefined ? { onSourceFailure: cp.onSourceFailure } : {}),
      ...(args.grounding?.adapter !== undefined ? { adapter: args.grounding.adapter } : {}),
    };

    // Research memory (§2.5): freeze the store snapshot BEFORE the run so the
    // injection prior and dedup index are stable across resume. Offline replay
    // never reads memory (fixture byte-stability); a corrupt store is a HARD
    // error (silently skipping = faked amnesia; repair or archive the file).
    let memoryStore: ResearchMemoryStore | undefined;
    if (args.disableMemory !== true && cp.profile !== 'offline_replay') {
      memoryStore = loadResearchMemory(args.researchMemoryPath);
    }

    const run = await runResearch({
      question: cp.question,
      gateway: args.gateway,
      profile: args.profile,
      grounding,
      targetHypothesisCount: cp.target,
      // Resume-stability: a persisted strategy mode (or subset) replays on
      // resume; a pre-discovery checkpoint (absent fields) stays legacy.
      hypothesisGenerationStrategy: cp.hypothesisGenerationStrategy ?? 'legacy',
      ...(cp.discoveryStrategies !== undefined ? { discoveryStrategies: cp.discoveryStrategies } : {}),
      ...(args.onFanoutComplete !== undefined ? { onFanoutComplete: args.onFanoutComplete } : {}),
      ...(memoryStore !== undefined ? { memoryStore } : {}),
      runId,
      driver,
      onCtxReady: (ctx) => {
        latestCtx = ctx;
      },
      ...(initialCtx !== undefined ? { initialCtx } : {}),
    });

    // Covers an all-stages-complete resume and the narrow interval after the
    // final stage boundary.  No registry/memory side effect may run after an
    // accepted cancellation request.
    await new Promise<void>((resolve) => setImmediate(resolve));
    if (controller.signal.aborted) {
      throw new AbortedRunError();
    }

    cp = {
      ...cp,
      state: 'COMPLETED',
      completedAt: now().toISOString(),
      updatedAt: now().toISOString(),
      error: null,
      errorKind: null,
    };

    // Discovery Registry (directive §2.4): LIVE/MIXED runs append their
    // CORROBORATED-qualified hypotheses to the hash-chained ledger. A ledger
    // failure NEVER discards the completed run — the outcome (with the error)
    // is persisted on the checkpoint and surfaced by the CLI, loudly.
    let registration: RunCheckpoint['discoveryRegistration'] = { appendedCount: 0, skippedDuplicates: 0, notRegisteredCount: 0, error: null };
    try {
      const outcome = registerRunDiscoveries(run, {
        ...(args.discoveryRegistryPath !== undefined
          ? { ledgerPath: args.discoveryRegistryPath }
          : {}),
        ...(args.now !== undefined ? { now: args.now } : {}),
      });
      registration = {
        appendedCount: outcome.appended.length,
        skippedDuplicates: outcome.skippedDuplicates,
        notRegisteredCount: outcome.notRegistered.length,
        error: null,
      };
    } catch (err) {
      registration = {
        appendedCount: 0,
        skippedDuplicates: 0,
        notRegisteredCount: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    cp = { ...cp, discoveryRegistration: registration, updatedAt: now().toISOString() };

    // Research memory (§2.5): record the completed run's negative results,
    // branches, strategy stats and conclusions. Same failure contract as the
    // registry — a memory failure NEVER discards the completed run; the error
    // is persisted on the checkpoint and surfaced loudly.
    if (args.disableMemory !== true) {
      let recording: RunCheckpoint['memoryRecording'];
      try {
        const outcome = recordRunToMemory(run, {
          ...(args.researchMemoryPath !== undefined
            ? { memoryPath: args.researchMemoryPath }
            : {}),
          ...(args.now !== undefined ? { now: args.now } : {}),
        });
        recording = { ...outcome, error: null };
      } catch (err) {
        recording = {
          skippedMode: false,
          negativeRecorded: 0,
          branchesAdded: 0,
          branchesSuperseded: 0,
          conclusionsRecorded: 0,
          learningsRecorded: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
      cp = { ...cp, memoryRecording: recording, updatedAt: now().toISOString() };
    }
    store.saveCheckpoint(cp);
    store.saveRun(runId, run);
    emit({ type: 'run_completed', runId, runMode: run.runMode, at: now().toISOString(), seq: nextSeq() });
    return run;
  } catch (err) {
    // Cancellation is a classification of the error that crossed a durable
    // boundary, not merely of concurrent signal state. A provider/callback may
    // fail at the same moment a user aborts; masking that real failure as
    // CANCELLED would destroy the resumable checkpoint's root-cause evidence.
    if (err instanceof AbortedRunError) {
      cp = {
        ...cp,
        state: 'CANCELLED',
        error: 'cancelled by user (abort signal)',
        errorKind: 'aborted',
        updatedAt: now().toISOString(),
      };
      store.saveCheckpoint(cp);
      emit({ type: 'run_cancelled', runId, at: now().toISOString(), seq: nextSeq() });
      throw err;
    }
    if (err instanceof ResearchabilityBlockedError) {
      const gateError = `researchability gate refused (${err.report.verdict}): ${err.report.reasons.join('; ')}`;
      cp = {
        ...cp,
        state: 'FAILED',
        error: gateError,
        errorKind: 'gate_refused',
        updatedAt: now().toISOString(),
      };
      store.saveCheckpoint(cp);
      emit({
        type: 'run_failed',
        runId,
        error: gateError,
        errorKind: 'gate_refused',
        at: now().toISOString(),
        seq: nextSeq(),
      });
      throw err;
    }
    const pipelineError = err instanceof Error ? err.message : String(err);
    cp = {
      ...cp,
      state: 'FAILED',
      error: pipelineError,
      errorKind: 'pipeline',
      updatedAt: now().toISOString(),
    };
    store.saveCheckpoint(cp);
    emit({
      type: 'run_failed',
      runId,
      error: pipelineError,
      errorKind: 'pipeline',
      at: now().toISOString(),
      seq: nextSeq(),
    });
    throw err;
  } finally {
    args.signal?.removeEventListener('abort', onExternalAbort);
    activeControllers.delete(runId);
  }
}

function sourcesOf(grounding: ResearchGroundingOptions | undefined): readonly string[] {
  if (grounding?.sources !== undefined && grounding.sources.length > 0) {
    return [...grounding.sources];
  }
  return [grounding?.source ?? 'openalex'];
}
