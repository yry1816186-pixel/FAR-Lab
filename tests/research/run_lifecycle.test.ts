/**
 * tests/research/run_lifecycle.test.ts — persistent run lifecycle contracts.
 *
 * Pins (directives §14/§16): checkpoint persistence per stage, resume that
 * skips completed stages (no repeated model calls for done work), cancellation
 * → CANCELLED, gate refusal → FAILED(gate_refused), store atomicity, and the
 * event sequence. All on the offline replay path (fast, deterministic); the
 * LIVE path uses the same driver (verified separately by the live evidence
 * runs recorded in PROGRESS).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLlmGateway, type LlmGateway } from '../../src/llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';
import type { LlmRequest, LlmResponse, ProviderAdapter, ProviderProfile } from '../../src/llm_gateway/types.ts';
import { createReplayAdapter } from '../../src/retrieval/index.ts';
import {
  assertValidResearchRunId,
  renameWithRetry,
  executeResearchRun,
  RunStore,
  parseCheckpoint,
  cancelRun,
  addRunEventListener,
  type RunCheckpoint,
  type ResearchRunEvent,
} from '../../src/research/run_lifecycle.ts';
import { RESEARCH_DEMO_DOCS, RESEARCH_DEMO_FIXTURES } from '../../src/research/research_fixtures.ts';
import { verifyResearchRunDeterministic } from '../../src/research/verification.ts';

/** Gateway wrapper that counts model calls (resume must not repeat done work). */
class CountingGateway implements LlmGateway {
  private readonly inner: LlmGateway;
  calls = 0;

  constructor(inner: LlmGateway) {
    this.inner = inner;
  }

  register(adapter: ProviderAdapter): void {
    this.inner.register(adapter);
  }

  registeredProfiles(): readonly ProviderProfile[] {
    return this.inner.registeredProfiles();
  }

  async callLlm(profile: ProviderProfile, request: LlmRequest): Promise<LlmResponse> {
    this.calls += 1;
    return this.inner.callLlm(profile, request);
  }
}

/** Gateway wrapper that throws on the Nth call (simulated mid-run crash). */
class FailOnNthGateway implements LlmGateway {
  private readonly inner: LlmGateway;
  private readonly failAt: number;
  calls = 0;

  constructor(inner: LlmGateway, failAt: number) {
    this.inner = inner;
    this.failAt = failAt;
  }

  register(adapter: ProviderAdapter): void {
    this.inner.register(adapter);
  }

  registeredProfiles(): readonly ProviderProfile[] {
    return this.inner.registeredProfiles();
  }

  async callLlm(profile: ProviderProfile, request: LlmRequest): Promise<LlmResponse> {
    this.calls += 1;
    if (this.calls === this.failAt) {
      throw new Error(`simulated crash on model call #${this.failAt}`);
    }
    return this.inner.callLlm(profile, request);
  }
}

/**
 * Gateway wrapper that delays each call: cancellation lands at the NEXT stage
 * boundary (an in-flight provider call is not itself abortable in this
 * codebase — the honest documented semantics).
 */
class DelayedGateway implements LlmGateway {
  private readonly inner: LlmGateway;
  private readonly delayMs: number;
  calls = 0;

  constructor(inner: LlmGateway, delayMs: number) {
    this.inner = inner;
    this.delayMs = delayMs;
  }

  register(adapter: ProviderAdapter): void {
    this.inner.register(adapter);
  }

  registeredProfiles(): readonly ProviderProfile[] {
    return this.inner.registeredProfiles();
  }

  async callLlm(profile: ProviderProfile, request: LlmRequest): Promise<LlmResponse> {
    this.calls += 1;
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    return this.inner.callLlm(profile, request);
  }
}

/** A real pipeline failure racing an abort must not be relabelled CANCELLED. */
class AbortThenFailGateway implements LlmGateway {
  private readonly inner: LlmGateway;
  private readonly controller: AbortController;

  constructor(inner: LlmGateway, controller: AbortController) {
    this.inner = inner;
    this.controller = controller;
  }

  register(adapter: ProviderAdapter): void {
    this.inner.register(adapter);
  }

  registeredProfiles(): readonly ProviderProfile[] {
    return this.inner.registeredProfiles();
  }

  async callLlm(_profile: ProviderProfile, _request: LlmRequest): Promise<LlmResponse> {
    this.controller.abort();
    throw new Error('provider failed while cancellation raced');
  }
}

describe('run lifecycle (offline replay)', () => {
  let storeRoot: string;
  let store: RunStore;
  let baseGateway: LlmGateway;

  beforeEach(() => {
    storeRoot = mkdtempSync(join(tmpdir(), 'far-research-lifecycle-'));
    store = new RunStore(storeRoot);
    baseGateway = createLlmGateway([createOfflineReplayAdapter({ fixtures: RESEARCH_DEMO_FIXTURES })]);
  });

  afterEach(() => {
    rmSync(storeRoot, { recursive: true, force: true });
  });

  const offlineArgs = (gateway: LlmGateway, question: string) => ({
    question,
    gateway,
    profile: 'offline_replay' as const,
    grounding: { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) },
    targetHypothesisCount: 3,
    // These tests exercise lifecycle mechanics (call counts, resume, events);
    // the single-shot path keeps their 6/4-call contracts stable. The
    // multi-strategy default has its own coverage (orchestrator + CLI tests).
    hypothesisGenerationStrategy: 'legacy' as const,
    store,
  });

  it('completes: checkpoint + frozen run persisted, verify PASS', async () => {
    const run = await executeResearchRun({
      ...offlineArgs(baseGateway, 'Does stellar activity inflate hot Jupiter radii?'),
    });
    const cp = store.loadCheckpoint(run.runId);
    assert.ok(cp !== null, 'checkpoint persisted');
    assert.equal(cp.state, 'COMPLETED');
    assert.equal(cp.completedStages.length, 8, 'all stages completed');
    assert.ok(existsSync(store.runPath(run.runId)), 'frozen run persisted');
    assert.equal(verifyResearchRunDeterministic(run).status, 'PASS');
  });

  it('emits run_started → stage events → run_completed with monotonic seq', async () => {
    const collected: ResearchRunEvent[] = [];
    let preparedRunId: string | undefined;
    let preparedState: string | undefined;
    const subscription: { unsubscribe: (() => void) | null } = { unsubscribe: null };
    const run = await executeResearchRun({
      ...offlineArgs(baseGateway, 'Does stellar activity inflate hot Jupiter radii?'),
      onRunPrepared: (runId) => {
        preparedRunId = runId;
        preparedState = store.loadCheckpoint(runId)?.state;
        subscription.unsubscribe = addRunEventListener(runId, (event) => collected.push(event));
      },
    });
    subscription.unsubscribe?.();

    const types = collected.map((e) => e.type);
    assert.equal(preparedRunId, run.runId, 'prepared callback exposes the executor-owned id');
    assert.equal(preparedState, 'CREATED', 'initial checkpoint is durable before the callback');
    assert.equal(types[0], 'run_started', 'subscription is installed before the first event');
    assert.ok(types.includes('stage_completed'), 'stage events observed');
    assert.equal(types[types.length - 1], 'run_completed');
    const seqs = collected.map((e) => e.seq);
    for (let i = 1; i < seqs.length; i += 1) {
      assert.ok(seqs[i]! > seqs[i - 1]!, 'seq strictly increasing');
    }
  });

  it('resume skips completed stages (no repeated model calls, same result)', async () => {
    // Full reference run: decompose + hypotheses + 3 critiques + plan = 6 calls.
    const refGateway = new CountingGateway(baseGateway);
    const ref = await executeResearchRun({
      ...offlineArgs(refGateway, 'Does stellar activity inflate hot Jupiter radii?'),
    });
    assert.equal(refGateway.calls, 6, 'full run = 6 model calls');

    // Simulated crash on call #4 (critique #2): stages through falsifiability
    // gate are complete; critique is not.
    const failGateway = new FailOnNthGateway(baseGateway, 4);
    await assert.rejects(
      executeResearchRun({
        ...offlineArgs(failGateway, 'Does stellar activity inflate hot Jupiter radii?'),
      }),
      /simulated crash on model call #4/,
    );
    const failedId = store.listRunIds().find((id) => id !== ref.runId)!;
    const failedCp = store.loadCheckpoint(failedId)!;
    assert.equal(failedCp.state, 'FAILED');
    assert.equal(failedCp.errorKind, 'pipeline');
    assert.deepEqual([...failedCp.completedStages], [
      'researchability_gate',
      'grounding',
      'hypothesis_generation',
      'citation_binding',
      'falsifiability_gate',
    ], 'crash mid-critique: earlier stages checkpointed');

    // Resume with a healthy gateway: only critique(3) + plan(1) = 4 more calls.
    const resumeGateway = new CountingGateway(baseGateway);
    const resumed = await executeResearchRun({
      gateway: resumeGateway,
      profile: 'offline_replay',
      grounding: { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) },
      runId: failedId,
      store,
    });
    assert.equal(resumeGateway.calls, 4, 'resume does not repeat completed model stages');
    assert.equal(resumed.runId, failedId, 'same run id across resume');
    assert.equal(resumed.hypotheses.length, 3);
    assert.equal(verifyResearchRunDeterministic(resumed).status, 'PASS');
    // Deterministic replay → identical hypotheses to the reference run.
    assert.deepEqual(
      resumed.hypotheses.map((h) => h.id).sort(),
      ref.hypotheses.map((h) => h.id).sort(),
    );
    // Receipts continuity: sequence numbers strictly increase, no duplicates.
    const seqs = resumed.stageReceipts.map((r) => r.sequence);
    assert.equal(new Set(seqs).size, seqs.length, 'receipt sequences unique after resume');
  });

  it('pre-aborted signal → CANCELLED, no stages executed', async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      executeResearchRun({
        ...offlineArgs(baseGateway, 'Does stellar activity inflate hot Jupiter radii?'),
        signal: controller.signal,
      }),
      /aborted/i,
    );
    const runId = store.listRunIds()[0]!;
    const cp = store.loadCheckpoint(runId)!;
    assert.equal(cp.state, 'CANCELLED');
    assert.equal(cp.completedStages.length, 0);
  });

  it('gate-refused question → FAILED(gate_refused), no model call, nothing fabricated', async () => {
    const gateway = new CountingGateway(baseGateway);
    await assert.rejects(
      executeResearchRun({
        ...offlineArgs(gateway, 'write a poem about stars'),
      }),
      /UNSUPPORTED|refused/i,
    );
    const runId = store.listRunIds()[0]!;
    const cp = store.loadCheckpoint(runId)!;
    assert.equal(cp.state, 'FAILED');
    assert.equal(cp.errorKind, 'gate_refused');
    assert.equal(gateway.calls, 0, 'deterministic refusal happens before any model call');
    assert.ok(!existsSync(store.runPath(runId)), 'no frozen run written for a refused question');
  });

  it('resume of a COMPLETED run is rejected (idempotency guard)', async () => {
    const run = await executeResearchRun({
      ...offlineArgs(baseGateway, 'Does stellar activity inflate hot Jupiter radii?'),
    });
    await assert.rejects(
      executeResearchRun({
        gateway: baseGateway,
        profile: 'offline_replay',
        runId: run.runId,
        store,
      }),
      /already COMPLETED/,
    );
  });

  it('parseCheckpoint rejects structural corruption (fail loud)', () => {
    assert.throws(() => parseCheckpoint('{"nope": 1}'), /structurally invalid/);
    assert.throws(() => parseCheckpoint('null'), /not an object/);
  });

  it('RunStore rejects traversal-shaped ids and cross-bound storage records', () => {
    for (const invalid of [
      '',
      '.',
      '..',
      '../outside',
      '..\\outside',
      '/absolute',
      'nested/run',
      'encoded%2Fslash',
      `x${'a'.repeat(128)}`,
    ]) {
      assert.throws(
        () => store.runDir(invalid),
        /research run id must be 1\.\.128 ASCII/,
        invalid,
      );
      assert.throws(() => store.loadCheckpoint(invalid), /research run id must/);
    }

    assert.doesNotThrow(() => assertValidResearchRunId('01M0459R7V71SZTRKMFPEPDYWQ'));
    assert.doesNotThrow(() => assertValidResearchRunId('rediscovery-cosmology-1994-r0'));

    const checkpoint = {
      runId: 'bound-a',
      question: 'Does the storage binding hold?',
      profile: 'offline_replay',
      sources: ['openalex'],
      maxPerQuery: 5,
      target: 3,
      state: 'CREATED',
      completedStages: [],
      ctx: {},
      startedAt: '2026-08-17T00:00:00.000Z',
      updatedAt: '2026-08-17T00:00:00.000Z',
      error: null,
      errorKind: null,
      completedAt: null,
    } satisfies RunCheckpoint;
    store.saveCheckpoint(checkpoint);
    const mismatchedPath = store.checkpointPath('bound-b');
    store.saveCheckpoint({ ...checkpoint, runId: 'bound-b' });
    writeFileSync(mismatchedPath, `${JSON.stringify(checkpoint)}\n`, 'utf8');
    assert.throws(
      () => store.loadCheckpoint('bound-b'),
      /runId does not match its storage directory/,
    );
  });

  it('RunStore rejects linked run directories and linked storage files', {
    skip: process.platform === 'win32' ? 'symlink creation needs elevated privileges on Windows' : undefined,
  }, () => {
    const outside = mkdtempSync(join(tmpdir(), 'far-research-outside-'));
    const at = '2026-08-17T00:00:00.000Z';
    const checkpoint = {
      runId: 'alias',
      question: 'OUTSIDE_SENTINEL',
      profile: 'offline_replay',
      sources: ['openalex'],
      maxPerQuery: 5,
      target: 3,
      state: 'CREATED',
      completedStages: [],
      ctx: {},
      startedAt: at,
      updatedAt: at,
      error: null,
      errorKind: null,
      completedAt: null,
    } satisfies RunCheckpoint;
    try {
      writeFileSync(join(outside, 'checkpoint.json'), JSON.stringify(checkpoint), 'utf8');
      mkdirSync(storeRoot, { recursive: true });
      symlinkSync(outside, join(storeRoot, 'alias'), 'dir');
      assert.throws(() => store.loadCheckpoint('alias'), /real directory, not a link/);
      assert.throws(() => store.runDir('alias'), /real directory, not a link/);

      const fileCheckpoint = { ...checkpoint, runId: 'linked-file' };
      store.saveCheckpoint(fileCheckpoint);
      const checkpointPath = store.checkpointPath('linked-file');
      rmSync(checkpointPath);
      symlinkSync(join(outside, 'checkpoint.json'), checkpointPath, 'file');
      assert.throws(() => store.loadCheckpoint('linked-file'), /regular file, not a link/);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('RunStore rejects portable case-fold aliases and leaves no fixed tmp file', () => {
    const at = '2026-08-17T00:00:00.000Z';
    const checkpoint = {
      runId: 'CaseRun',
      question: 'portable identity',
      profile: 'offline_replay',
      sources: ['openalex'],
      maxPerQuery: 5,
      target: 3,
      state: 'CREATED',
      completedStages: [],
      ctx: {},
      startedAt: at,
      updatedAt: at,
      error: null,
      errorKind: null,
      completedAt: null,
    } satisfies RunCheckpoint;
    store.saveCheckpoint(checkpoint);
    assert.throws(
      () => store.saveCheckpoint({ ...checkpoint, runId: 'caserun' }),
      /case-fold collision/,
    );
    assert.ok(store.listRunIds().includes('CaseRun'));
    assert.equal(readdirSync(store.runDir('CaseRun')).some((name) => name.endsWith('.tmp')), false);
  });

  it('cancelRun aborts an active run at the next stage boundary', async () => {
    const slowGateway = new DelayedGateway(baseGateway, 40);
    const execution = executeResearchRun({
      ...offlineArgs(slowGateway, 'Does stellar activity inflate hot Jupiter radii?'),
    });
    const runId = await new Promise<string>((resolve) => {
      const timer = setInterval(() => {
        const ids = store.listRunIds();
        if (ids.length > 0) {
          clearInterval(timer);
          resolve(ids[0]!);
        }
      }, 5);
    });
    // Cancel while call #1 (decompose) is still in flight; the stage completes,
    // then the next stage boundary observes the abort → CANCELLED checkpoint.
    const cancelTimer = setTimeout(() => cancelRun(runId), 10);
    await assert.rejects(execution, /aborted/i);
    clearTimeout(cancelTimer);
    const cp = store.loadCheckpoint(runId)!;
    assert.equal(cp.state, 'CANCELLED');
    assert.ok(cp.completedStages.length >= 1, 'finished stage checkpointed before cancel');
  });

  it('a real provider failure racing an abort remains FAILED with its root cause', async () => {
    const controller = new AbortController();
    let preparedRunId: string | undefined;
    await assert.rejects(
      executeResearchRun({
        ...offlineArgs(
          new AbortThenFailGateway(baseGateway, controller),
          'Does stellar activity inflate hot Jupiter radii?',
        ),
        signal: controller.signal,
        onRunPrepared: (runId) => {
          preparedRunId = runId;
        },
      }),
      /provider failed while cancellation raced/,
    );
    assert.ok(preparedRunId !== undefined);
    const checkpoint = store.loadCheckpoint(preparedRunId);
    assert.ok(checkpoint !== null);
    assert.equal(checkpoint.state, 'FAILED');
    assert.equal(checkpoint.errorKind, 'pipeline');
    assert.equal(checkpoint.error, 'provider failed while cancellation raced');
  });

  it('cancellation accepted at the final durable boundary stays CANCELLED and resumes without repeated stages', async () => {
    let preparedRunId: string | undefined;
    let cancelAccepted = false;
    const subscription: { unsubscribe: (() => void) | null } = { unsubscribe: null };

    const execution = executeResearchRun({
      ...offlineArgs(baseGateway, 'Does stellar activity inflate hot Jupiter radii?'),
      onRunPrepared: (runId) => {
        preparedRunId = runId;
        subscription.unsubscribe = addRunEventListener(runId, (event) => {
          if (event.type === 'stage_completed' && event.stageId === 'plan') {
            cancelAccepted = cancelRun(runId);
          }
        });
      },
    });

    try {
      await assert.rejects(execution, /aborted/i);
    } finally {
      subscription.unsubscribe?.();
    }
    assert.ok(preparedRunId !== undefined, 'executor must expose its authoritative run id');
    assert.equal(cancelAccepted, true, 'final-boundary cancellation reached the active controller');

    const cancelled = store.loadCheckpoint(preparedRunId);
    assert.ok(cancelled !== null);
    assert.equal(cancelled.state, 'CANCELLED');
    assert.equal(cancelled.errorKind, 'aborted');
    assert.equal(cancelled.completedStages.length, 8, 'final stage is durable before cancellation');
    assert.equal(cancelled.completedStages.at(-1), 'plan');
    assert.ok(!existsSync(store.runPath(preparedRunId)), 'cancelled execution must not publish a completed run');

    const resumeGateway = new CountingGateway(baseGateway);
    const resumed = await executeResearchRun({
      gateway: resumeGateway,
      profile: 'offline_replay',
      grounding: { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) },
      runId: preparedRunId,
      store,
    });
    assert.equal(resumeGateway.calls, 0, 'resume reuses all eight durable stages');
    assert.equal(verifyResearchRunDeterministic(resumed).status, 'PASS');
    assert.equal(store.loadCheckpoint(preparedRunId)?.state, 'COMPLETED');
  });
});

describe('renameWithRetry (Windows EPERM resilience — 2026-08-14 UX finding)', () => {
  const failingRename = (failTimes: number, code: string) => {
    let calls = 0;
    return (_from: string, _to: string): void => {
      calls += 1;
      if (calls <= failTimes) {
        const err = new Error(`synthetic ${code}`) as NodeJS.ErrnoException;
        err.code = code;
        throw err;
      }
      calls = -100; // succeed only once
    };
  };

  it('retries transient EPERM and succeeds once the lock clears', () => {
    const rename = failingRename(3, 'EPERM');
    const sleeps: number[] = [];
    renameWithRetry('a.tmp', 'a.json', rename, (ms) => sleeps.push(ms));
    assert.deepEqual(sleeps, [20, 40, 80], 'exponential backoff between attempts');
  });

  it('falls back to an in-place write when the lock never clears', () => {
    const rename = failingRename(99, 'EPERM');
    // The fallback path reads `from` and writes `to` — use real temp files.
    const dir = mkdtempSync(join(tmpdir(), 'far-rename-retry-'));
    const from = join(dir, 'from.json');
    const to = join(dir, 'to.json');
    writeFileSync(from, '{"ok":true}', 'utf8');
    try {
      renameWithRetry(from, to, rename, () => {});
      assert.equal(readFileSync(to, 'utf8'), '{"ok":true}');
      assert.ok(!existsSync(from), 'tmp cleaned up after fallback');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws immediately on non-transient errors (ENOENT)', () => {
    const rename = ((): void => {
      const err = new Error('no such file') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    });
    assert.throws(() => renameWithRetry('a', 'b', rename, () => {}), /no such file/);
  });
});
