import { ResearchRun, RunStatus, RunStageName, ProvenanceReceipt, newId } from '../domain/index.js';
import { randomBytes } from 'node:crypto';
import type { Store } from '../persistence/store.js';
import type { StageHandler, StageContext } from '../pipeline/types.js';
import { defaultWorkflow, nextWorkflowStep, type WorkflowPlan } from '../domain/workflow-plan.js';
import type { KernelCapabilityPlane } from '../kernel/capability-plane.js';
import { kernelPlanRevisionFor } from '../kernel/planner.js';
import { canonicalJson } from '../shared/crypto.js';
import { totalBudgetFromEnv } from '../providers/http.js';
import type { ArtifactStore, ModelProvider, SourceAdapter } from '../shared/ports.js';
import type { SourceFamily } from '../domain/source.js';
import { RunBudgetExhaustedError, makeRunBudget, type RunBudgetView } from './run-budget.js';
import { latestBundleTemplateTainted } from '../pipeline/stages/export.js';
import { TEMPLATE_REFUSAL_REASON } from '../pipeline/stages/shared.js';
import { evaluateQualityGate, MAX_QUALITY_ROUNDS } from './quality-gate.js';
import { evaluateIteration, iterationRoundKey, iterationFingerprintKey } from './iteration.js';
import { analyzeTrajectory } from './supervisor.js';
import { resolveRunReasoningRoute } from './provider-resolver.js';
import { consolidateRun } from './memory.js';
import { receiptEventDetail } from '../pipeline/llm.js';
import type { ResponseCacheStore } from '../sources/response-cache.js';

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
  /** Retrieval response cache (composition-wired; absent = legacy uncached behavior). */
  responseCache?: ResponseCacheStore;
  /**
   * Ω ADR D5 capability plane factory: one plane per execution, bound to the run's
   * provider/budget/receipt governance. Absent (tests/minimal harnesses) = agent-kind
   * workflow steps are skipped honestly with an audit event, never silently faked.
   */
  kernelPlane?: (args: {
    run: ResearchRun;
    budget: RunBudgetView;
    recordReceipt: StageContext['recordReceipt'];
  }) => KernelCapabilityPlane;
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

/** Lease TTL: renewed on every persisted write during execute(). Worst legit gap between writes = one callStructured chain under the provider layer's total retry budget (300s, src/providers/http.ts — raised 2026-08-28 from 120s after live receipts measured single zai calls at up to 121s); 660s keeps >2x headroom above that and >10x above the measured inter-signal p99 (57.4s, evidence/W8/signal-gap.json). The invariant TTL > worst inter-write gap is what stops the watchdog adopting (and re-executing, double-charging) a run whose worker is merely inside one long model call. Operational override FARLAB_LEASE_TTL_MS (floor 5s) exists for fault-injection harnesses and tight-sla deployments. */
export const LEASE_TTL_MS = Math.max(5_000, Number(process.env.FARLAB_LEASE_TTL_MS ?? 660_000) || 660_000);

/**
 * Belt-and-braces (audit follow-up 2026-08-29): the invariant TTL > worst
 * inter-write gap is documented above, but env overrides can silently break it
 * (an operator raising FARLAB_TOTAL_BUDGET_MS without the lease). A warn-once at
 * first orchestrator construction makes the invariant self-announcing instead of
 * self-documenting — a warning, not a clamp: fault-injection harnesses legitimately
 * run tight pairings.
 */
export const warnIfLeaseBudgetInvariantBroken = (): void => {
  if (LEASE_TTL_MS < 2 * totalBudgetFromEnv()) {
    console.warn(
      `[far-lab] LEASE_TTL_MS (${LEASE_TTL_MS}ms) < 2x model-call budget (${totalBudgetFromEnv()}ms): a single long ` +
      'call can expire the lease mid-flight and the watchdog may adopt (and re-execute, double-charging) the run. ' +
      'Raise FARLAB_LEASE_TTL_MS to >= 2x FARLAB_TOTAL_BUDGET_MS unless this is a fault-injection harness.',
    );
  }
};

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
  /**
   * Wire-level cancellation registry (2026-08-29): one AbortController per
   * executing run. cancel() aborts it so the in-flight provider call dies at the
   * transport within ms — a user cancel no longer waits out the stage boundary
   * (up to a 300s model call). Stage handlers get the signal injected via a
   * provider wrapper built in makeContext (zero per-stage plumbing). The signal
   * covers in-process cancels only; a persisted cancel from another process is
   * still honored at the next stage/subtask boundary (disclosed).
   */
  private readonly wireCancels = new Map<string, AbortController>();

  constructor(private readonly deps: OrchestratorDeps) {
    warnIfLeaseBudgetInvariantBroken();
  }

  private stageRecord(run: ResearchRun, stage: RunStageName) {
    return run.stages.find((s) => s.stage === stage);
  }

  /** Persist and announce the canonical linear plan when a run has none yet (first execution). */
  private adoptDefaultPlan(runId: string): WorkflowPlan {
    const plan = defaultWorkflow(runId);
    this.deps.store.putObject('workflow_plan', plan);
    this.deps.store.appendEvent(runId, {
      type: 'note',
      detail: { reason: 'workflow_plan_adopted', origin: 'default', version: plan.version, steps: plan.steps.length },
    });
    return plan;
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

  /** Shared receipt sink (stage machine + kernel capability plane ride the same governance). */
  private receiptSink(run: ResearchRun, lease?: string): StageContext['recordReceipt'] {
    const store = this.deps.store;
    return (partial) => {
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
    };
  }

  private makeContext(run: ResearchRun, lease?: string, budget?: RunBudgetView, kernel?: KernelCapabilityPlane): StageContext {
    const { store, signals } = this.deps;
    const signal = signals.get(run.id) ?? { cancelled: false };
    signals.set(run.id, signal);
    const baseProvider = this.deps.providerFor?.(run) ?? this.deps.provider;
    const wireCancel = this.wireCancels.get(run.id);
    // Provider wrapper = the ONE seam for wire-level cancel: every stage call rides
    // ctx.provider, so injecting the run's AbortSignal here cancels in-flight calls
    // without touching a single stage implementation (zero half-refactor risk).
    const provider: ModelProvider = wireCancel === undefined ? baseProvider : {
      name: baseProvider.name,
      liveReady: baseProvider.liveReady,
      structuredCall: (req, parse) => baseProvider.structuredCall({ ...req, signal: wireCancel.signal }, parse),
    };
    return {
      run,
      store,
      artifacts: this.deps.artifacts,
      provider,
      // Real-content discipline: every researcher-facing execution (web/CLI/
      // desktop, and the E2E servers that ride the real orchestrator) refuses
      // deterministic-wire scientific output (see StageContext.productRun).
      productRun: true,
      // RU-9 GO2 effort plane: declared-capability routes derive per-stage gears
      // (table + model clamps) inside invokeStructured; absent = legacy zero-field.
      ...(resolveRunReasoningRoute(store, run) ?? {}),
      budget,
      ...(kernel !== undefined ? { kernel } : {}),
      sourceFor: this.deps.sourceFor,
      ...(this.deps.responseCache !== undefined ? { responseCache: this.deps.responseCache } : {}),
      recordReceipt: this.receiptSink(run, lease),
      progress: (done, total, note) => {
        // B3 sub-stage granularity: update the CURRENT stage record's subtasks
        // (known totals only — callers pass real domain counts) and append the
        // milestone note. Reads a FRESH run doc first (B3-critique P0-2): the
        // stage closure's `run` can be stale relative to other writers
        // (adoption, watchdog), and updateRun must never roll the row back.
        // Lease fence (adversarial round-2 REL-4): the design invariant says a
        // disowned worker must never write run state — an unfenced updateRun
        // here could roll back the adopter's transition after mid-call adoption.
        if (lease !== undefined && this.deps.store.getRunLease(run.id).holder !== lease) return;
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

    const wireCancel = new AbortController();
    this.wireCancels.set(runId, wireCancel);
    try {
      return await this.executeOwned(runId, holder, run, opts);
    } finally {
      // terminal or thrown: this worker no longer owns the run
      this.wireCancels.delete(runId);
      this.deps.store.releaseLease(runId, holder);
    }
  }

  private async executeOwned(runId: string, holder: string, runIn: ResearchRun, opts?: { stopAfter?: RunStageName }): Promise<ResearchRun> {
    const lease = holder;
    let run = runIn;
    const wasCompleted = runIn.status === 'completed';
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
      // Fresh iteration epoch: human-injected feedback earns a new bounded round
      // budget (the cap bounds AUTONOMOUS rounds per injection, not per run lifetime).
      this.deps.store.setMeta(iterationRoundKey(runId), '1');
    }

    // §5.2 evidence-debt reopen: a COMPLETED run whose corpus grew afterwards
    // (counter-search / seeded docs) has unprocessed evidence — resume reopens
    // verify_sources + build_evidence (+ export: the stale report/bundle must be
    // regenerated with the new evidence, mirroring the feedback reopen) so the
    // new sources are verified and their claims extracted. Both stages are
    // naturally idempotent (they only process unverified / not-yet-claimed
    // documents), so existing work is never redone and hypotheses are NOT
    // auto-invalidated (their evidence-binding surfaces can link the new claims;
    // causal revision stays a human/feedback act).
    if (wasCompleted) {
      const unverified = this.deps.store
        .listObjects('source_document', runId)
        .some((d) => d.verification === undefined);
      if (unverified) {
        run = await this.transition(runId, (r) => {
          for (const stage of ['verify_sources', 'build_evidence', 'export'] as RunStageName[]) {
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
        this.deps.store.appendEvent(runId, { type: 'run_resumed', status: 'running', detail: { reopened: 'evidence_debt' } });
      }
    }

    // Real-content remediation reopen (2026-08-29): a COMPLETED run whose LATEST
    // bundle still PROJECTS offline-template hypotheses ("Offline hypothesis N"
    // riding the scientific layer) reopens export only — the filtered re-render
    // mints a clean bundle while every legacy object stays in the audit store
    // and the old bundle stays hash-stable for provenance. Same predicate as the
    // export stage's applicable() (single owner: export.ts).
    if (wasCompleted && run.status === 'completed') {
      const latest = this.deps.store.listObjects('bundle', runId).at(-1);
      if (latest !== undefined && (await latestBundleTemplateTainted(this.deps.artifacts, latest))) {
        run = await this.transition(runId, (r) => {
          const rec = r.stages.find((x) => x.stage === 'export');
          if (rec && (rec.state === 'done' || rec.state === 'skipped')) {
            rec.state = 'pending';
            delete rec.endedAt;
            delete rec.error;
          }
          r.status = 'running';
          return r;
        }, lease);
        this.deps.store.appendEvent(runId, { type: 'run_resumed', status: 'running', detail: { reopened: 'template_content_remediation' } });
      }
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
    // Real-content refusals (red-team P1-1): a stage skipped with the
    // TEMPLATE_REFUSAL_REASON marker promised "restore a live model route and
    // resume" — reopen marker skips exactly like budget pauses so the promise
    // is true. Under a still-offline route the stages re-refuse (cheap,
    // deterministic, zero network); under a restored live route the work mints.
    const templateRefused = run.stages.filter((s) => s.state === 'skipped' && (s.error ?? '').startsWith(TEMPLATE_REFUSAL_REASON));
    if (templateRefused.length > 0) {
      run = await this.transition(runId, (r) => {
        for (const s of templateRefused) {
          const rec = r.stages.find((x) => x.stage === s.stage);
          if (rec !== undefined) {
            rec.state = 'pending';
            delete rec.endedAt;
            delete rec.error;
          }
        }
        return r;
      }, lease);
      this.deps.store.appendEvent(runId, { type: 'note', detail: { reason: 'template_refusal_reopened', stages: templateRefused.map((s) => s.stage) } });
    }
    let budgetWarned = budget.nearLimit();

    // Parking-intent lifecycle: a full (non-stopAfter) execution takes ownership of
    // the run — any stale 'parking:*' tag (crash guard left behind by a crashed
    // scope-proposal/stop-after worker) must be cleared HERE, even when the run is
    // already 'running' (a crashed draft resumes from that status); otherwise a
    // later crash of THIS execution would freeze the run (watchdog exempt forever).
    // NOT cleared under opts.stopAfter — the limited execution keeps the tag as its
    // own crash guard; the park transition clears it on success.
    if (!opts?.stopAfter && run.tags.some((t) => t.startsWith('parking:'))) {
      run = await this.transition(runId, (r) => {
        r.tags = r.tags.filter((t) => !t.startsWith('parking:'));
        return r;
      }, lease);
      this.deps.store.appendEvent(runId, { type: 'note', detail: { reason: 'parking_intent_cleared' } });
    }

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

    // Workflow-as-data (ADR D4): the stage walk is driven by the persisted plan
    // (defaultWorkflow ≡ STAGE_ORDER order and deps), so plan revisions and
    // kernel-authored plans compose without touching the durable stage machine.
    // Equivalence with the previous index-cursor loop: the full suite plus the
    // omega-baseline-w0 pin comparison are the parity harness.
    const plan = this.deps.store.listObjects('workflow_plan', runId).at(-1)
      ?? this.adoptDefaultPlan(runId);
    let activePlan = plan;
    const stopAfterIdx = opts?.stopAfter === undefined
      ? undefined
      : plan.steps.findIndex((s) => s.target === opts.stopAfter);
    const noHandler = new Set<string>();
    // Agent-step terminal set (this execution): an agent step has no stage record;
    // its outcome lives in agent_session/agent_report objects + these events.
    // ΩF-005: completion ALSO persists to store meta — executeOwned re-entries
    // (iteration reopen, resume) must not re-run an already-completed agent step
    // (stage steps get this for free from their persisted stage records).
    const doneAgentSteps = new Set<string>();
    const agentStepDone = (stepId: string): boolean =>
      doneAgentSteps.has(stepId) || this.deps.store.getMeta(`wfp:agent-done:${runId}:${stepId}`) === '1';
    const markAgentStepDone = (stepId: string): void => {
      doneAgentSteps.add(stepId);
      this.deps.store.setMeta(`wfp:agent-done:${runId}:${stepId}`, '1');
    };
    const kernelPlane = this.deps.kernelPlane?.({ run, budget, recordReceipt: this.receiptSink(run, lease) });
    for (;;) {
      const step = nextWorkflowStep(activePlan, (s) => {
        if (s.kind === 'agent') return agentStepDone(s.id) ? 'terminal' : 'pending';
        const rec = this.stageRecord(run, s.target);
        return rec !== undefined && (rec.state === 'done' || rec.state === 'skipped') ? 'terminal' : 'pending';
      }, noHandler);
      if (step === undefined) break;
      // stop-after parks BEFORE the named stage runs — plan-position comparison keeps
      // the original "break at stopAfter even when its record is already done" semantics.
      if (stopAfterIdx !== undefined && activePlan.steps.indexOf(step) >= stopAfterIdx) break;

      if (step.kind === 'agent') {
        if (!budget.hasRemaining()) {
          this.deps.store.appendEvent(runId, {
            type: 'note',
            detail: { reason: 'agent_step_skipped', capability: step.target, stepId: step.id, cause: BUDGET_EXHAUSTED_REASON, spent: budget.spent, cap: budget.cap },
          });
          markAgentStepDone(step.id); // terminal for this pass; a resume with a raised budget re-plans it
          continue;
        }
        if (kernelPlane === undefined) {
          noHandler.add(step.target);
          this.deps.store.appendEvent(runId, {
            type: 'note',
            detail: { reason: 'agent_step_unavailable', capability: step.target, stepId: step.id, cause: 'kernel capability plane not wired in this build' },
          });
          continue;
        }
        // attemptCap is ENFORCED for agent steps via a persisted counter (plan semantics:
        // a bounded capability budget, immune to in-memory Set resets across re-entries).
        const attemptKey = `wfp:agent-attempts:${runId}:${step.id}`;
        const attempts = Number(this.deps.store.getMeta(attemptKey) ?? '0');
        if (attempts >= step.attemptCap) {
          markAgentStepDone(step.id);
          this.deps.store.appendEvent(runId, {
            type: 'note',
            detail: { reason: 'agent_step_skipped', capability: step.target, stepId: step.id, cause: `attempt_cap (${attempts}/${step.attemptCap})` },
          });
          continue;
        }
        this.deps.store.setMeta(attemptKey, String(attempts + 1));
        const wireCancel = this.wireCancels.get(runId);
        this.deps.store.appendEvent(runId, { type: 'note', detail: { reason: 'agent_step_started', capability: step.target, stepId: step.id } });
        try {
          const res = await kernelPlane.runCapability(step.target, ...(wireCancel !== undefined ? [{ signal: wireCancel.signal }] : []));
          markAgentStepDone(step.id);
          this.deps.store.appendEvent(runId, {
            type: 'note',
            detail: {
              reason: 'agent_step_done', capability: step.target, stepId: step.id,
              ok: res.ok, status: res.status, turns: res.turns,
              ...(res.reportId !== null ? { reportId: res.reportId } : {}),
              ...(res.materialized !== undefined ? { materialized: res.materialized } : {}),
              ...(res.error !== undefined ? { error: res.error } : {}),
            },
          });
          if (res.status === 'aborted') {
            const msg = `agent step ${step.id} (${step.target}) aborted`;
            run = await this.transition(runId, (r) => {
              r.status = 'cancelled' satisfies RunStatus;
              r.lastError = msg;
              r.cancelRequested = false;
              return r;
            }, lease);
            this.deps.store.appendEvent(runId, { type: 'run_cancelled', stage: step.target, status: run.status, detail: { error: msg } });
            return run;
          }
        } catch (e) {
          markAgentStepDone(step.id);
          this.deps.store.appendEvent(runId, {
            type: 'note',
            detail: { reason: 'agent_step_failed', capability: step.target, stepId: step.id, error: e instanceof Error ? e.message : String(e) },
          });
        }
        continue;
      }
      const stage = step.target;
      const rec = this.stageRecord(run, stage);

      // Budget boundary: once the cap is spent, remaining model/retrieval stages are
      // skipped with the marker reason (resume with a raised cap reopens them). export
      // is never budget-gated — the honest partial bundle must still be produced.
      if (stage !== 'export' && !budget.hasRemaining()) {
        run = await this.transition(runId, (r) => {
          this.setStage(r, stage, { state: 'skipped', endedAt: new Date().toISOString(), error: `${BUDGET_EXHAUSTED_REASON}: spent ${budget.spent} of cap ${budget.cap}` });
          return r;
        }, lease);
        this.deps.store.appendEvent(runId, { type: 'stage_skipped', stage, detail: { reason: BUDGET_EXHAUSTED_REASON, spent: budget.spent, cap: budget.cap } });
        continue;
      }

      const handler = this.deps.stages.get(stage);
      if (!handler) { noHandler.add(stage); continue; } // not implemented in this build — stays pending and visible

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

      const ctx = this.makeContext(run, lease, budget, kernelPlane);
      try {
        const applicability = await handler.applicable(ctx);
        // applicable=false must never be silent: the object form carries the
        // stage's branch-local reason; the bare boolean form still names its
        // cause class so the skipped record is always self-explaining.
        const skipReason = typeof applicability === 'object'
          ? applicability.reason
          : 'not applicable (stage predicate returned false)';
        if (applicability === true) {
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
                // The re-marked pending stages are picked up by nextWorkflowStage in
                // plan order (generate_hypotheses first) — the plan-order equivalent
                // of the old cursor back-jump.
                continue;
              }
              if (signalQg.weak && (round >= MAX_QUALITY_ROUNDS || !budget.hasRemaining())) {
                this.deps.store.appendEvent(runId, {
                  type: 'note', stage: 'rank',
                  detail: { reason: 'quality_gate_weak_proceeding', round, budgetRemaining: budget.hasRemaining(), metrics: signalQg.metrics, reasons: signalQg.reasons },
                });
              }
              // Ω ADR D4 kernel planner v1 (deterministic): a contested-mechanism
              // problem earns an adversarial counter-evidence debate step once the
              // ranked set is final (the QG regeneration loop above `continue`s
              // early, so this only runs on the settling pass).
              const revisedPlan = kernelPlanRevisionFor(this.deps.store, runId, activePlan);
              if (revisedPlan !== null) {
                this.deps.store.putObject('workflow_plan', revisedPlan);
                this.deps.store.appendEvent(runId, {
                  type: 'note', stage: 'rank',
                  detail: { reason: 'workflow_plan_revised', by: 'kernel-planner-v1', origin: revisedPlan.origin, version: revisedPlan.version, inserted: 'counter-evidence-debate' },
                });
                activePlan = revisedPlan;
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
            this.setStage(r, stage, { state: 'skipped', endedAt: new Date().toISOString(), error: skipReason });
            return r;
          }, lease);
          this.deps.store.appendEvent(runId, { type: 'stage_skipped', stage, detail: { reason: skipReason } });
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
    }

    // stopAfter exit: park the run BEFORE the lease releases (execute()'s finally).
    // Returning with status='running' + no lease opened an adoption window: the
    // watchdog (30s tick) or a process restart adopts lease-less 'running' runs and
    // would continue the full pipeline behind the user's back — exactly what the
    // scope-proposal draft flow must never allow. 'paused' is the only safe resting
    // state for a deliberately stopped run (covers CLI --stop-after too). The park
    // also clears any 'parking:*' intent tag (see scopeProposal/CLI) so a crashed
    // worker's draft stops being watchdog-exempt once it is properly parked.
    if (opts?.stopAfter && run.status === 'running') {
      run = await this.transition(runId, (r) => {
        r.status = 'paused' satisfies RunStatus;
        if (r.tags.some((t) => t.startsWith('parking:'))) {
          r.tags = r.tags.filter((t) => !t.startsWith('parking:'));
        }
        return r;
      }, lease);
      this.deps.store.appendEvent(runId, {
        type: 'note', status: 'paused',
        detail: { reason: 'stop_after_parked', after: opts.stopAfter },
      });
      return run;
    }

    // ---- research iteration rounds (src/app/iteration.ts): a FULLY completed pass
    // with actionable falsification-loop legs left reopens them as the next bounded
    // round instead of parking the run as completed. Deterministic decision, full audit.
    const passUnfinished = run.stages.filter((s) => s.state === 'pending' || s.state === 'running');
    const passFailed = run.stages.some((s) => s.state === 'failed');
    if (passUnfinished.length === 0 && !passFailed) {
      // ---- supervisor observation (AVO fusion G2): read-only trajectory analysis at
      // every pass boundary. Signals are PERSISTED for audit + UX; acting on them stays
      // with the orchestrator/iteration controller and the human. One note per boundary.
      const supervision = analyzeTrajectory({ store: this.deps.store, runId });
      this.deps.store.appendEvent(runId, {
        type: 'note',
        detail: {
          reason: 'supervisor_observation',
          signals: supervision.signals.map((s) => ({
            kind: s.kind, severity: s.severity, evidence: s.evidence, action: s.recommendation.action,
          })),
        },
      });
      const round = Number(this.deps.store.getMeta(iterationRoundKey(runId)) ?? '1') || 1;
      const it = evaluateIteration({ store: this.deps.store, runId, round, budget });
      const lastIt = this.deps.store.listObjects('iteration', runId).at(-1);
      // Idempotent no-op resume: same round + same material fingerprint decided already.
      const decidedAlready = lastIt !== undefined && lastIt.round === round && lastIt.snapshot.fingerprint === it.record.snapshot.fingerprint;
      if (!decidedAlready) {
        this.deps.store.putObject('iteration', it.record);
        this.deps.store.appendEvent(runId, {
          type: 'note',
          detail: {
            reason: 'iteration_decided', decision: it.decision, round,
            ...(it.decision === 'continue'
              ? { trigger: it.record.continueTrigger, reopenStages: it.reopenStages, rationale: it.record.rationale }
              : { stopReason: it.record.stopReason, rationale: it.record.rationale, unblockHints: it.record.unblockHints }),
          },
        });
      }
      if (it.decision === 'continue') {
        this.deps.store.setMeta(iterationRoundKey(runId), String(round + 1));
        this.deps.store.setMeta(iterationFingerprintKey(runId), it.record.snapshot.fingerprint);
        run = await this.transition(runId, (r) => {
          for (const s of it.reopenStages) {
            const rec2 = r.stages.find((x) => x.stage === s);
            if (rec2 !== undefined) {
              // startedAt + attempt survive (provenance facts); the next start increments.
              rec2.state = 'pending';
              delete rec2.endedAt;
              delete rec2.error;
              delete rec2.subtasks;
            }
          }
          return r;
        }, lease);
        this.deps.store.appendEvent(runId, {
          type: 'note',
          detail: { reason: 'iteration_round_started', round: round + 1, reopenStages: it.reopenStages, trigger: it.record.continueTrigger },
        });
        // Bounded recursion (depth ≤ MAX_ITERATION_ROUNDS): the next round runs through
        // the SAME owned stage machine — leases, checkpoints and budget governance unchanged.
        return this.executeOwned(runId, holder, run, opts);
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

      // RU-1 memory consolidation: terminal runs project their durable facts into
      // cross-run memory (deterministic, idempotent, zero LLM). Fail-visible but
      // non-fatal — a memory hiccup must never invalidate a completed run.
      try {
        const consolidated = consolidateRun(this.deps.store, runId);
        this.deps.store.appendEvent(runId, {
          type: 'note',
          detail: { kind: 'memory_consolidated', itemsWritten: consolidated.itemsWritten, skipped: consolidated.skipped },
        });
      } catch (e) {
        this.deps.store.appendEvent(runId, {
          type: 'note',
          detail: { kind: 'memory_consolidation_failed', error: e instanceof Error ? e.message : String(e) },
        });
      }

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

  cancel(runId: string, via: string = 'persisted-request'): boolean {
    // Wire-level: kill the in-flight provider call of an executing run (this
    // process) within ms — the persisted flag below still carries cross-process
    // cancels to the next stage/subtask boundary.
    this.wireCancels.get(runId)?.abort();
    // Atomic flag write (W8 audit P2-4): never a whole-doc read-modify-write that could
    // race the owning executor's stage transitions.
    const ok = this.deps.store.requestCancel(runId);
    if (!ok) return false;
    // Single event source: entry points pass their own `via` (http/cli) instead of
    // appending a second run_cancelled on top of this one.
    this.deps.store.appendEvent(runId, { type: 'run_cancelled', detail: { via } });
    return ok;
  }

  /**
   * Product Spine action dispatch (2026-08-28): researcher-directed stage reopen.
   * Generalizes the three internal reopen helpers (feedback / evidence-debt /
   * budget-skip) into ONE audited primitive the /runs/:id/actions endpoint maps
   * NextResearchActions onto. Lease-held and evented like every transition;
   * `attempt` counts are NEVER reset (provenance facts); status -> 'running' so
   * a subsequent execute() walks the reopened stages. The caller owns launching
   * execution (single execution per run stays an API-layer invariant).
   */
  async reopenStages(runId: string, stages: readonly RunStageName[], reason: string): Promise<ResearchRun> {
    const run = this.deps.store.getRun(runId);
    if (!run) throw new Error(`run not found: ${runId}`);
    if (run.status === 'running') {
      throw new Error(`run ${runId} is already running — reopen is for settled runs`);
    }
    const holder = leaseHolderId();
    const leaseUntil = new Date(Date.now() + LEASE_TTL_MS).toISOString();
    if (!this.deps.store.acquireLease(runId, holder, leaseUntil)) {
      throw new RunLeaseHeldError(runId, this.deps.store.getRunLease(runId)?.holder ?? 'unknown');
    }
    try {
      const next = await this.transition(runId, (r) => {
        for (const stage of stages) {
          const rec = r.stages.find((x) => x.stage === stage);
          if (rec && (rec.state === 'done' || rec.state === 'skipped' || rec.state === 'failed')) {
            rec.state = 'pending';
            delete rec.endedAt;
            delete rec.error;
          }
        }
        r.status = 'running';
        return r;
      }, holder);
      this.deps.store.appendEvent(runId, {
        type: 'run_resumed', status: 'running',
        detail: { reopened: 'action_dispatch', reason, stages: [...stages] },
      });
      return next;
    } finally {
      this.deps.store.releaseLease(runId, holder);
    }
  }
}
