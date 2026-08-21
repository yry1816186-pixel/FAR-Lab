import { ResearchRun, RunStatus, RunStageName, ProvenanceReceipt, newId } from '../domain/index.js';
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

/**
 * Explicit persisted stage machine (ARCHITECTURE §7). The orchestrator owns state/lifecycle;
 * handlers never mutate run state directly. Every transition is transactional + evented,
 * so a crash/resume continues from the last persisted stage boundary (checkpoint = run row).
 */
export class Orchestrator {
  constructor(private readonly deps: OrchestratorDeps) {}

  private stageRecord(run: ResearchRun, stage: RunStageName) {
    return run.stages.find((s) => s.stage === stage);
  }

  private async transition(runId: string, fn: (run: ResearchRun) => Promise<ResearchRun> | ResearchRun): Promise<ResearchRun> {
    const run = this.deps.store.getRun(runId);
    if (!run) throw new Error(`run not found: ${runId}`);
    const next = await fn(run);
    next.updatedAt = new Date().toISOString();
    this.deps.store.updateRun(next);
    return next;
  }

  private setStage(run: ResearchRun, stage: RunStageName, patch: Partial<ResearchRun['stages'][number]>, attempt: number): ResearchRun {
    const rec = run.stages.find((s) => s.stage === stage);
    if (rec) Object.assign(rec, patch, { attempt });
    run.currentStage = stage;
    return run;
  }

  private makeContext(run: ResearchRun): StageContext {
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
        store.appendEvent(run.id, {
          type: 'receipt_recorded', stage: partial.stage,
          detail: { kind: receipt.kind, id: receipt.id }, receiptId: receipt.id,
        });
      },
      cancelled: () => signal.cancelled,
      log: (msg) => process.stdout.write(`  [${run.id.slice(0, 12)} ${run.currentStage}] ${msg}\n`),
    };
  }

  /** Execute remaining stages in canonical order; skips already-done stages (resume semantics). */
  async execute(runId: string, opts?: { stopAfter?: RunStageName }): Promise<ResearchRun> {
    let run = this.deps.store.getRun(runId);
    if (!run) throw new Error(`run not found: ${runId}`);
    if (run.status === 'completed' || run.status === 'cancelled') return run;

    const signal = this.deps.signals.get(runId) ?? { cancelled: false };
    this.deps.signals.set(runId, signal);

    if (run.status !== 'running') {
      const prev = run.status;
      run = await this.transition(runId, (r) => {
        r.status = 'running';
        return r;
      });
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

      run = await this.transition(runId, (r) => {
        this.setStage(r, stage, { state: 'running', startedAt: new Date().toISOString(), error: undefined }, (rec?.attempt ?? 0) + 1);
        return r;
      });
      this.deps.store.appendEvent(runId, { type: 'stage_started', stage, detail: { attempt: (rec?.attempt ?? 0) + 1 } });

      const ctx = this.makeContext(run);
      try {
        if (await handler.applicable(ctx)) {
          if (signal.cancelled) throw new Error('cancelled by user');
          const outcome = await handler.execute(ctx);
          run = await this.transition(runId, (r) => {
            this.setStage(r, stage, { state: 'done', endedAt: new Date().toISOString() }, rec?.attempt ?? 1);
            return r;
          });
          this.deps.store.appendEvent(runId, {
            type: 'stage_done', stage,
            detail: { summary: outcome.kind === 'done' ? outcome.summary : outcome.reason },
          });
        } else {
          run = await this.transition(runId, (r) => {
            this.setStage(r, stage, { state: 'skipped', endedAt: new Date().toISOString() }, rec?.attempt ?? 1);
            return r;
          });
          this.deps.store.appendEvent(runId, { type: 'stage_skipped', stage, detail: {} });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const isCancel = signal.cancelled || /^cancelled/i.test(msg);
        run = await this.transition(runId, (r) => {
          this.setStage(r, stage, { state: 'failed', endedAt: new Date().toISOString(), error: msg }, rec?.attempt ?? 1);
          r.status = (isCancel ? 'cancelled' : 'partial') satisfies RunStatus;
          r.lastError = msg;
          return r;
        });
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
      });
      this.deps.store.appendEvent(runId, { type: 'run_status_changed', status: 'completed', detail: {} });
    }
    return run;
  }

  cancel(runId: string): boolean {
    const signal = this.deps.signals.get(runId);
    if (!signal) return false;
    signal.cancelled = true;
    return true;
  }
}
