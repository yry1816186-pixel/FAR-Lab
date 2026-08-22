import { ResearchRun, RunStatus, RunStageName, ProvenanceReceipt, newId } from '../domain/index.js';
import { randomBytes } from 'node:crypto';
import type { Store } from '../persistence/store.js';
import type { StageHandler, StageContext } from '../pipeline/types.js';
import { STAGE_ORDER } from '../domain/run.js';
import type { ArtifactStore, ModelProvider, SourceAdapter } from '../shared/ports.js';
import type { SourceFamily } from '../domain/source.js';

export interface OrchestratorDeps {
  store: Store;
  artifacts: ArtifactStore;
  provider: ModelProvider;
  sourceFor: (family: SourceFamily) => SourceAdapter;
  stages: Map<RunStageName, StageHandler>;
  signals: Map<string, { cancelled: boolean }>;
}

/** Cross-process execution ownership refused (another live executor holds the lease). */
export class RunLeaseHeldError extends Error {
  constructor(runId: string, holder: string) {
    super(`run ${runId} lease held by live executor ${holder} — one executor per run`);
    this.name = 'RunLeaseHeldError';
  }
}

/**
 * This worker lost the lease (expired + adopted elsewhere). The disowned worker must
 * abort WITHOUT writing run state — a watchdog is now owning the run's transitions.
 */
export class RunLeaseLostError extends Error {
  constructor(runId: string) {
    super(`run lease lost: ${runId} was adopted by another executor after lease expiry`);
    this.name = 'RunLeaseLostError';
  }
}

/** Lease TTL: renewed on every persisted write during execute(). Worst legit gap between writes = one callStructured chain under the provider layer's total retry budget (~120s, src/providers/http.ts); 240s gives 2x headroom above that and >4x above the measured inter-signal p99 (57.4s, evidence/W8/signal-gap.json). Operational override FARLAB_LEASE_TTL_MS (floor 5s) exists for fault-injection harnesses and tight-sla deployments. */
export const LEASE_TTL_MS = Math.max(5_000, Number(process.env.FARLAB_LEASE_TTL_MS ?? 240_000) || 240_000);

/** Stable per-process holder identity (pid + random boot nonce: pid reuse must not merge identities). */
const BOOT_NONCE = randomBytes(4).toString('hex');
export const leaseHolderId = (): string => `${process.pid}-${BOOT_NONCE}`;

/**
 * Explicit persisted stage machine (ARCHITECTURE §7). The orchestrator owns state/lifecycle;
 * handlers never mutate run state directly. Every transition is transactional + evented,
 * so a crash/resume continues from the last persisted stage boundary (checkpoint = run row).
 *
 * W8 (D-039): run leases give cross-process single-writer semantics; intra-stage step
 * checkpoints (ctx.checkpointed) make resume subtask-granular (dbos OAOO pattern).
 */
export class Orchestrator {
  constructor(private readonly deps: OrchestratorDeps) {}

  private stageRecord(run: ResearchRun, stage: RunStageName) {
    return run.stages.find((s) => s.stage === stage);
  }

  private async transition(runId: string, fn: (run: ResearchRun) => Promise<ResearchRun> | ResearchRun, lease?: string): Promise<ResearchRun> {
    if (lease !== undefined) {
      const row = this.deps.store.getRunLease(runId);
      if (row?.holder !== lease) throw new RunLeaseLostError(runId);
    }
    const run = this.deps.store.getRun(runId);
    if (!run) throw new Error(`run not found: ${runId}`);
    const next = await fn(run);
    // Re-check after the await (Wave-G WP2 hardening): transition fns are synchronous
    // today, but a future async fn would reopen an adoption window between the entry
    // check and this write — a disowned worker must never write run state.
    if (lease !== undefined) {
      const row = this.deps.store.getRunLease(runId);
      if (row?.holder !== lease) throw new RunLeaseLostError(runId);
    }
    next.updatedAt = new Date().toISOString();
    this.deps.store.updateRun(next);
    if (lease !== undefined) this.deps.store.renewLease(runId, lease, new Date(Date.now() + LEASE_TTL_MS).toISOString());
    return next;
  }

  /**
   * Patch a stage record. `attempt` is only overwritten when explicitly provided (stage
   * start increments it); done/skipped/failed transitions omit it so the attempt count
   * already persisted in the run row survives — attempts are provenance facts and must
   * never regress (audit D-3: run doc showed attempt=1 while events showed attempt=2).
   */
  private setStage(run: ResearchRun, stage: RunStageName, patch: Partial<ResearchRun['stages'][number]>, attempt?: number): ResearchRun {
    const rec = run.stages.find((s) => s.stage === stage);
    if (rec) Object.assign(rec, patch, attempt !== undefined ? { attempt } : {});
    run.currentStage = stage;
    return run;
  }

  private makeContext(run: ResearchRun, lease?: string): StageContext {
    const { store, signals } = this.deps;
    const signal = signals.get(run.id) ?? { cancelled: false };
    signals.set(run.id, signal);
    return {
      run,
      store,
      artifacts: this.deps.artifacts,
      provider: this.deps.provider,
      sourceFor: this.deps.sourceFor,
      recordReceipt: (partial) => {
        const receipt = ProvenanceReceipt.parse({
          ...partial, id: newId('rcp'), runId: run.id, at: partial.at ?? new Date().toISOString(),
        });
        store.putObject('receipt', receipt);
        // every persisted write is a lease heartbeat (W8 S1): a live worker keeps its lease warm
        if (lease !== undefined) store.renewLease(run.id, lease, new Date(Date.now() + LEASE_TTL_MS).toISOString());
        store.appendEvent(run.id, {
          type: 'receipt_recorded', stage: partial.stage,
          detail: { kind: receipt.kind, id: receipt.id }, receiptId: receipt.id,
        });
      },
      checkpointed: async <T>(stage: RunStageName, family: string, key: string, inputsFingerprint: string | undefined, fn: () => Promise<T>): Promise<T> => {
        // Inputs-fingerprint gate, per FAMILY (audit P0-1: rank's scoring and pair
        // families have different inputs and must not clear each other): a mid-run
        // upgrade that changes a family's inputs invalidates only that family's cached
        // step outputs — never replay stale results under rebuilt prompts.
        if (inputsFingerprint !== undefined) {
          const stored = store.getStepFingerprint(run.id, stage, family);
          if (stored !== null && stored !== inputsFingerprint) {
            store.clearStepOutputs(run.id, stage, family);
            store.appendEvent(run.id, {
              type: 'note',
              detail: { reason: 'step_checkpoint_invalidated', stage, family, storedFingerprint: stored, newFingerprint: inputsFingerprint },
            });
          }
          if (stored !== inputsFingerprint) store.putStepFingerprint(run.id, stage, family, inputsFingerprint);
        }
        const hit = store.getStepOutput<T>(run.id, stage, family, key);
        if (hit !== null) return hit;
        const value = await fn();
        store.putStepOutput(run.id, stage, family, key, value);
        if (lease !== undefined) store.renewLease(run.id, lease, new Date(Date.now() + LEASE_TTL_MS).toISOString());
        return value;
      },
      // Fencing surface for handler-internal loops: assertNotCancelled checkpoints call
      // this — a disowned worker stops BEFORE its next domain-object write (audit P1-3).
      disowned: () => lease === undefined ? false : store.getRunLease(run.id).holder !== lease,
      cancelled: () => signal.cancelled || (this.deps.store.getRun(run.id)?.cancelRequested ?? false),
      log: (msg) => process.stdout.write(`  [${run.id.slice(0, 12)} ${run.currentStage}] ${msg}\n`),
    };
  }

  /** Execute remaining stages in canonical order; skips already-done stages (resume semantics). */
  async execute(runId: string, opts?: { stopAfter?: RunStageName }): Promise<ResearchRun> {
    const run = this.deps.store.getRun(runId);
    if (!run) throw new Error(`run not found: ${runId}`);

    // Cross-process single-writer: claim ownership before any state transition (W8 S1).
    // Expired leases are reclaimable — that IS the frozen-run recovery path.
    const holder = leaseHolderId();
    const leaseUntil = new Date(Date.now() + LEASE_TTL_MS).toISOString();
    const existing = this.deps.store.getRunLease(runId);
    if (!this.deps.store.acquireLease(runId, holder, leaseUntil)) {
      throw new RunLeaseHeldError(runId, existing?.holder ?? 'unknown');
    }

    try {
      return await this.executeOwned(runId, holder, run, opts);
    } finally {
      // terminal or thrown: this worker no longer owns the run
      this.deps.store.releaseLease(runId, holder);
    }
  }

  private async executeOwned(runId: string, holder: string, runIn: ResearchRun, opts?: { stopAfter?: RunStageName }): Promise<ResearchRun> {
    const lease = holder;
    let run = runIn;
    if (run.status === 'completed' && this.deps.store.listObjects('feedback', runId).length > 0) {
      // A completed run reopens ONLY when new feedback signals arrived: feedback -> revise -> export
      // re-run so the revision chain and bundle reflect the feedback. Without signals, resume is a no-op.
      run = await this.transition(runId, (r) => {
        for (const stage of ['feedback', 'revise', 'export'] as RunStageName[]) {
          const rec = r.stages.find((x) => x.stage === stage);
          if (rec && (rec.state === 'done' || rec.state === 'skipped')) {
            rec.state = 'pending';
            delete rec.endedAt;
            delete rec.error;
          }
        }
        r.status = 'running';
        return r;
      }, lease);
      this.deps.store.appendEvent(runId, { type: 'run_resumed', status: 'running', detail: { reopened: 'feedback' } });
    }

    const signal = this.deps.signals.get(runId) ?? { cancelled: false };
    this.deps.signals.set(runId, signal);

    if (run.status !== 'running') {
      const prev = run.status;
      run = await this.transition(runId, (r) => {
        r.status = 'running';
        return r;
      }, lease);
      this.deps.store.appendEvent(runId, {
        type: prev === 'created' ? 'run_created' : 'run_resumed', status: 'running', detail: { previous: prev },
      });
    }

    for (const stage of STAGE_ORDER) {
      if (opts?.stopAfter && stage === opts.stopAfter) break;
      const rec = this.stageRecord(run, stage);
      if (rec?.state === 'done' || rec?.state === 'skipped') continue;

      const handler = this.deps.stages.get(stage);
      if (!handler) continue; // not implemented in this build — stays pending and visible

      // Cumulative 1-based attempt counting: a stage that has never started (no startedAt,
      // e.g. fresh pending records whose zod default attempt=1 must not act as a prior try)
      // counts from 0; a restarted stage (failed/resumed or reopened) increments from its
      // persisted attempt. Terminal transitions then preserve this value (see setStage).
      const nextAttempt = (rec && rec.startedAt !== undefined ? rec.attempt : 0) + 1;
      run = await this.transition(runId, (r) => {
        this.setStage(r, stage, { state: 'running', startedAt: new Date().toISOString(), error: undefined }, nextAttempt);
        return r;
      }, lease);
      this.deps.store.appendEvent(runId, { type: 'stage_started', stage, detail: { attempt: nextAttempt } });

      const ctx = this.makeContext(run, lease);
      try {
        if (await handler.applicable(ctx)) {
          if (signal.cancelled || (this.deps.store.getRun(run.id)?.cancelRequested ?? false)) throw new Error('cancelled by user');
          const outcome = await handler.execute(ctx);
          run = await this.transition(runId, (r) => {
            // no attempt arg: keep the attempt count persisted by the running transition
            const outputs = this.deps.store.countStepOutputs(runId, stage);
            // activate the (previously unused) checkpointRef schema field as a visible pointer
            this.setStage(r, stage, { state: 'done', endedAt: new Date().toISOString(), ...(outputs > 0 ? { checkpointRef: `step_outputs:${outputs}` } : {}) });
            return r;
          }, lease);
          this.deps.store.appendEvent(runId, {
            type: 'stage_done', stage,
            detail: { summary: outcome.kind === 'done' ? outcome.summary : outcome.reason },
          });
        } else {
          run = await this.transition(runId, (r) => {
            // no attempt arg: keep the attempt count persisted by the running transition
            this.setStage(r, stage, { state: 'skipped', endedAt: new Date().toISOString() });
            return r;
          }, lease);
          this.deps.store.appendEvent(runId, { type: 'stage_skipped', stage, detail: {} });
        }
      } catch (e) {
        if (e instanceof RunLeaseLostError || /^run lease lost/i.test(e instanceof Error ? e.message : String(e))) {
          // Disowned worker: another executor adopted this run. Abort WITHOUT touching run
          // state — the adopter owns transitions now. Audit note only.
          this.deps.store.appendEvent(runId, { type: 'note', detail: { reason: 'lease_lost_abort', holder } });
          return run;
        }
        const msg = e instanceof Error ? e.message : String(e);
        const persistedCancel = this.deps.store.getRun(runId)?.cancelRequested ?? false;
        const isCancel = signal.cancelled || persistedCancel || /^cancelled/i.test(msg);
        run = await this.transition(runId, (r) => {
          // no attempt arg: keep the attempt count persisted by the running transition
          this.setStage(r, stage, { state: 'failed', endedAt: new Date().toISOString(), error: msg });
          r.status = (isCancel ? 'cancelled' : 'partial') satisfies RunStatus;
          r.lastError = msg;
          if (isCancel) r.cancelRequested = false; // consumed; resume clears the slate
          return r;
        }, lease);
        this.deps.store.appendEvent(runId, {
          type: isCancel ? 'run_cancelled' : 'stage_failed', stage, status: run.status, detail: { error: msg },
        });
        return run; // stop pipeline on failure — resume continues from this stage
      }
    }

    const unfinished = run.stages.filter((s) => s.state === 'pending' || s.state === 'running');
    const failed = run.stages.some((s) => s.state === 'failed');
    if (unfinished.length === 0 && !failed) {
      run = await this.transition(runId, (r) => {
        r.status = 'completed' satisfies RunStatus;
        delete r.lastError; // a completed run must not keep a stale failure banner
        return r;
      }, lease);
      this.deps.store.appendEvent(runId, { type: 'run_status_changed', status: 'completed', detail: {} });
    }
    return run;
  }

  cancel(runId: string): boolean {
    // Atomic flag write (W8 audit P2-4): never a whole-doc read-modify-write that could
    // race the owning executor's stage transitions.
    const ok = this.deps.store.requestCancel(runId);
    if (!ok) return false;
    this.deps.store.appendEvent(runId, { type: 'run_cancelled', detail: { via: 'persisted-request' } });
    return true;
  }
}
