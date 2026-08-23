import { ResearchRun, RunStatus, RunStageName, ProvenanceReceipt, newId } from '../domain/index.js';
import { randomBytes } from 'node:crypto';
import type { Store } from '../persistence/store.js';
import type { StageHandler, StageContext } from '../pipeline/types.js';
import { STAGE_ORDER } from '../domain/run.js';
import { canonicalJson } from '../shared/crypto.js';
import type { ArtifactStore, ModelProvider, SourceAdapter } from '../shared/ports.js';
import type { SourceFamily } from '../domain/source.js';
import { RunBudgetExhaustedError, makeRunBudget, type RunBudgetView } from './run-budget.js';
import { evaluateQualityGate, MAX_QUALITY_ROUNDS } from './quality-gate.js';
import { receiptEventDetail } from '../pipeline/llm.js';

/** Meta key for the persisted quality-gate round counter (round 1 = initial generation). */
const qgRoundKey = (runId: string) => `qg:round:${runId}`;
/** Skip-reason marker persisted on stages skipped for budget exhaustion (resume re-opens these). */
export const BUDGET_EXHAUSTED_REASON = 'budget_exhausted';

export interface OrchestratorDeps {
  store: Store;
  artifacts: ArtifactStore;
  provider: ModelProvider;
  /** Per-run provider override (user model-config layer); null/absent -> deps.provider (env chain). */
  providerFor?: (run: ResearchRun) => ModelProvider | null;
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

  private makeContext(run: ResearchRun, lease?: string, budget?: RunBudgetView): StageContext {
    const { store, signals } = this.deps;
    const signal = signals.get(run.id) ?? { cancelled: false };
    signals.set(run.id, signal);
    return {
      run,
      store,
      artifacts: this.deps.artifacts,
      provider: this.deps.providerFor?.(run) ?? this.deps.provider,
      budget,
      sourceFor: this.deps.sourceFor,
      recordReceipt: (partial) => {
        const receipt = ProvenanceReceipt.parse({
          ...partial, id: newId('rcp'), runId: run.id, at: partial.at ?? new Date().toISOString(),
        });
        store.putObject('receipt', receipt);
        // every persisted write is a lease heartbeat (W8 S1): a live worker keeps its lease warm
        if (lease !== undefined) store.renewLease(run.id, lease, new Date(Date.now() + LEASE_TTL_MS).toISOString());
        // B3: the event carries the facts the wait-time narrative renders — one shared
        // detail shape with the store-backed recorder (src/pipeline/llm.ts receiptEventDetail).
        store.appendEvent(run.id, {
          type: 'receipt_recorded', stage: partial.stage,
          detail: receiptEventDetail(receipt), receiptId: receipt.id,
        });
      },
      progress: (done, total, note) => {
        // B3 sub-stage granularity: update the CURRENT stage record's subtasks
        // (known totals only — callers pass real domain counts) and append the
        // milestone note. Reads a FRESH run doc first (B3-critique P0-2): the
        // stage closure's `run` can be stale relative to other writers
        // (adoption, watchdog), and updateRun must never roll the row back.
        if (total > 0) {
          const fresh = store.getRun(run.id);
          if (fresh !== null) {
            const rec = fresh.stages.find((s) => s.stage === fresh.currentStage);
            if (rec !== undefined) {
              rec.subtasks = { known: true, done: Math.max(0, Math.min(done, total)), total };
              store.updateRun(fresh);
            }
          }
        }
        if (note !== undefined) {
          store.appendEvent(run.id, { type: 'note', stage: run.currentStage, detail: { reason: note.reason, ...note.detail } });
        }
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
      // W-C bilingual display: default ON in production (FARLAB_ZH_DISPLAY=0 opts out);
      // tests construct contexts directly and stay English-only by omission.
      zhDisplay: process.env.FARLAB_ZH_DISPLAY !== '0',
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

    // BP-1 budget governance: one view per execution, spend re-derived from receipts
    // (resume after a raised cap re-derives honestly). Budget-exhaustion skips from a
    // previous execution are operational pauses, not domain skips — reopen them so a
    // resume with budget actually continues the research.
    const budget = makeRunBudget(this.deps.store, runId);
    const exhaustedSkips = run.stages.filter((s) => s.state === 'skipped' && (s.error ?? '').startsWith(BUDGET_EXHAUSTED_REASON));
    if (exhaustedSkips.length > 0) {
      run = await this.transition(runId, (r) => {
        for (const s of exhaustedSkips) {
          const rec = r.stages.find((x) => x.stage === s.stage);
          if (rec !== undefined) {
            rec.state = 'pending';
            delete rec.endedAt;
            delete rec.error;
          }
        }
        return r;
      }, lease);
      this.deps.store.appendEvent(runId, { type: 'note', detail: { reason: 'budget_skip_reopened', stages: exhaustedSkips.map((s) => s.stage) } });
    }
    let budgetWarned = budget.nearLimit();

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

    // Index-based cursor (not for-of): the BP-1 quality gate may jump the cursor BACK to
    // generate_hypotheses for one bounded regeneration round — adaptive sequencing, still
    // fully auditable through stage attempts + events.
    let cursor = 0;
    while (cursor < STAGE_ORDER.length) {
      const stage = STAGE_ORDER[cursor]!;
      if (opts?.stopAfter && stage === opts.stopAfter) break;
      const rec = this.stageRecord(run, stage);
      if (rec?.state === 'done' || rec?.state === 'skipped') { cursor += 1; continue; }

      // Budget boundary: once the cap is spent, remaining model/retrieval stages are
      // skipped with the marker reason (resume with a raised cap reopens them). export
      // is never budget-gated — the honest partial bundle must still be produced.
      if (stage !== 'export' && !budget.hasRemaining()) {
        run = await this.transition(runId, (r) => {
          this.setStage(r, stage, { state: 'skipped', endedAt: new Date().toISOString(), error: `${BUDGET_EXHAUSTED_REASON}: spent ${budget.spent} of cap ${budget.cap}` });
          return r;
        }, lease);
        this.deps.store.appendEvent(runId, { type: 'stage_skipped', stage, detail: { reason: BUDGET_EXHAUSTED_REASON, spent: budget.spent, cap: budget.cap } });
        cursor += 1;
        continue;
      }

      const handler = this.deps.stages.get(stage);
      if (!handler) { cursor += 1; continue; } // not implemented in this build — stays pending and visible

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

      const ctx = this.makeContext(run, lease, budget);
      try {
        if (await handler.applicable(ctx)) {
          if (signal.cancelled || (this.deps.store.getRun(run.id)?.cancelRequested ?? false)) throw new Error('cancelled by user');
          const outcome = await handler.execute(ctx);
          if (outcome.kind === 'skipped') {
            // W-E truth fix: a handler that legitimately has nothing to do returns
            // {kind:'skipped', reason} — persisting that as 'done' erased the
            // distinction and let the UI claim a closed loop ("研究已完成") over an
            // open one (e.g. execute's honest no-applicable-experiment skip).
            run = await this.transition(runId, (r) => {
              this.setStage(r, stage, { state: 'skipped', endedAt: new Date().toISOString(), error: outcome.reason });
              return r;
            }, lease);
            this.deps.store.appendEvent(runId, {
              type: 'stage_skipped', stage, detail: { reason: outcome.reason },
            });
          } else {
            run = await this.transition(runId, (r) => {
              // no attempt arg: keep the attempt count persisted by the running transition
              const outputs = this.deps.store.countStepOutputs(runId, stage);
              // activate the (previously unused) checkpointRef schema field as a visible pointer
              this.setStage(r, stage, { state: 'done', endedAt: new Date().toISOString(), ...(outputs > 0 ? { checkpointRef: `step_outputs:${outputs}` } : {}) });
              return r;
            }, lease);
            this.deps.store.appendEvent(runId, {
              type: 'stage_done', stage,
              detail: { summary: outcome.summary },
            });

            // ---- BP-1 quality gate: after rank, decide whether the ranked set is strong
            // enough to plan against. Weak signal + rounds remaining + budget remaining
            // => reopen generate_hypotheses..rank for ONE regeneration round with the
            // deterministic critique persisted as the audit trail.
            if (stage === 'rank' && outcome.kind === 'done') {
              const round = Number(this.deps.store.getMeta(qgRoundKey(runId)) ?? '1');
              const scorecards = this.deps.store.listObjects('scorecard', runId);
              const tournament = this.deps.store.listObjects('tournament', runId)[0] ?? null;
              const signalQg = evaluateQualityGate(scorecards, tournament);
              if (signalQg.weak && round < MAX_QUALITY_ROUNDS && budget.hasRemaining()) {
                this.deps.store.setMeta(qgRoundKey(runId), String(round + 1));
                // The reopen flag the hypotheses stage's applicable() consumes — WITHOUT it
                // the reopened stage would see existing hypotheses and legitimately skip,
                // making the whole regeneration loop dead code (red-team P0-1).
                this.deps.store.setMeta(`qg:active:${runId}`, '1');
                this.deps.store.appendEvent(runId, {
                  type: 'note', stage: 'rank',
                  detail: {
                    reason: 'quality_gate_regeneration',
                    round: round + 1,
                    signal: { metrics: signalQg.metrics, reasons: signalQg.reasons, weakDimensions: signalQg.weakDimensions },
                  },
                });
                run = await this.transition(runId, (r) => {
                  for (const s of ['generate_hypotheses', 'critique_falsify', 'rank'] as RunStageName[]) {
                    const rec2 = r.stages.find((x) => x.stage === s);
                    if (rec2 !== undefined) {
                      rec2.state = 'pending';
                      delete rec2.endedAt;
                      delete rec2.error;
                    }
                  }
                  return r;
                }, lease);
                cursor = STAGE_ORDER.indexOf('generate_hypotheses');
                continue;
              }
              if (signalQg.weak && (round >= MAX_QUALITY_ROUNDS || !budget.hasRemaining())) {
                this.deps.store.appendEvent(runId, {
                  type: 'note', stage: 'rank',
                  detail: { reason: 'quality_gate_weak_proceeding', round, budgetRemaining: budget.hasRemaining(), metrics: signalQg.metrics, reasons: signalQg.reasons },
                });
              }
            }
          }

          if (!budgetWarned && budget.nearLimit()) {
            budgetWarned = true;
            this.deps.store.appendEvent(runId, {
              type: 'note', stage,
              detail: { reason: 'budget_warning', spent: budget.spent, cap: budget.cap, note: '>=80% of run token budget spent' },
            });
          }
        } else {
          run = await this.transition(runId, (r) => {
            // no attempt arg: keep the attempt count persisted by the running transition
            this.setStage(r, stage, { state: 'skipped', endedAt: new Date().toISOString() });
            return r;
          }, lease);
          this.deps.store.appendEvent(runId, { type: 'stage_skipped', stage, detail: {} });
        }
      } catch (e) {
        if (e instanceof RunBudgetExhaustedError) {
          // Mid-stage exhaustion: the stage cannot honestly complete — record it as an
          // operational skip (marker reason), NOT a failure; downstream stages hit the
          // boundary skip above and export still runs for the honest partial bundle.
          run = await this.transition(runId, (r) => {
            this.setStage(r, stage, { state: 'skipped', endedAt: new Date().toISOString(), error: `${BUDGET_EXHAUSTED_REASON}: ${e.message}` });
            return r;
          }, lease);
          this.deps.store.appendEvent(runId, { type: 'stage_skipped', stage, detail: { reason: BUDGET_EXHAUSTED_REASON, midStage: true } });
          cursor += 1;
          continue;
        }
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
      cursor += 1;
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

      // W-E closed-loop guidance (idempotent by loop-state fingerprint): 'completed'
      // must not mask an open falsification loop. The loop is closed iff the revise
      // stage actually ran (a causal revision consumed feedback); otherwise the
      // researcher gets one event explaining each open leg and the real next actions.
      // A no-op resume re-runs this block, so the note only re-fires when the loop
      // states actually changed since the last guidance event.
      const LOOP_STAGES = ['execute', 'feedback', 'revise'] as const;
      const DEFAULT_SKIP_REASON: Record<(typeof LOOP_STAGES)[number], string> = {
        execute: 'no plan-drafted experiment applied (plan cannot map to a public tabular dataset)',
        feedback: 'no feedback signals stored for this run',
        revise: 'no unconsumed feedback signals (nothing to revise from)',
      };
      const reviseDone = run.stages.find((s) => s.stage === 'revise')?.state === 'done';
      if (!reviseDone) {
        const loop = LOOP_STAGES.map((s) => {
          const rec = run.stages.find((x) => x.stage === s);
          return {
            stage: s,
            state: rec?.state ?? 'pending',
            reason: rec?.error ?? DEFAULT_SKIP_REASON[s],
          };
        });
        const fingerprint = canonicalJson(loop);
        const lastGuidance = this.deps.store
          .listEvents(runId)
          .filter((e) => (e.detail as { reason?: unknown })?.reason === 'loop_status_guidance')
          .at(-1);
        const lastFingerprint =
          lastGuidance === undefined ? null : canonicalJson((lastGuidance.detail as { loop?: unknown }).loop);
        if (lastFingerprint !== fingerprint) {
          this.deps.store.appendEvent(runId, {
            type: 'note',
            detail: {
              reason: 'loop_status_guidance',
              closed: false,
              loop,
              nextActions: [
                'add a feedback signal (expert judgment / new literature / reviewer comment) — feedback -> revise -> export reopen automatically on the next execution',
                'materialize report + bundle files: far export <runId>',
                'literature-type questions pool published effect estimates automatically (statistical_meta); close the loop confirmatorily: far experiment approve <specId> --by <you> --hypothesis <hypId> && far experiment rerun <specId>',
              ],
            },
          });
        }
      }
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
