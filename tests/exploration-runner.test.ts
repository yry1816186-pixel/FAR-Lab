import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { ResearchQuestion, newId } from '../src/domain/index.js';
import { analyzeExplorationCode } from '../src/agent/exploratory-codeact.js';
import { createSidecar, type SandboxAttestation, type Sidecar, type SidecarCallResult } from '../src/experiment/python.js';

// Keep deterministic runner doubles inside this test worker. The production
// runner has no caller-supplied factory; its sandbox module is the only seam
// replaced here, and real OCI tests remain in their dedicated suite.
const sandboxHarness = vi.hoisted(() => ({
  factory: (() => { throw new Error('sandbox test harness was not configured'); }) as () => import('../src/experiment/python.js').Sidecar,
}));
vi.mock('../src/experiment/exploration-sandbox.js', () => ({
  createExplorationSandbox: () => sandboxHarness.factory(),
}));
import { runExploration } from '../src/agent/exploration-runner.js';

/**
 * Exploratory CodeAct execution wiring (AVO fusion G4, execution half):
 * static gate -> sidecar sandbox -> artifact + tool_exec receipt.
 * Uses the REAL sidecar (uv family env) — the capability is claimed live, not mocked.
 */

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'far-explore-'));

const openStore = (): { store: Store; runId: string } => {
  const db = openDb(path.join(tmp(), 'far.db'));
  const store = new Store(db);
  const q = ResearchQuestion.parse({
    id: newId('q'), text: 'question', background: '', goalType: 'explanatory',
    scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
  });
  const run = store.createRun(q);
  return { store, runId: run.id };
};

const TEST_ATTESTATION: SandboxAttestation = {
  backend: 'docker-linux',
  imageRef: 'test-only-attested-double',
  imageId: `sha256:${'a'.repeat(64)}`,
  policyHash: 'b'.repeat(64),
  policyVersion: 1,
  uid: 65532,
  gid: 65532,
  noNewPrivs: true,
  seccompEnabled: true,
  seccompMode: 2,
  capEff: '0000000000000000',
  rootfsReadOnly: true,
  tmpWritable: true,
  networkDisabled: true,
  interfaces: ['lo'],
  cgroup: { memoryMaxBytes: 512 * 1024 * 1024, pidsMax: 64, cpuMax: '50000 100000' },
};

// TEST ONLY: the Python process is real, but the attestation is synthetic.
// This exercises the runner's persistence/cancellation seam and is never
// production isolation evidence; the production wiring uses Docker directly.
const attestedHostDouble = (): Sidecar => {
  const sidecar = createSidecar();
  return { ...sidecar, sandboxAttestation: () => TEST_ATTESTATION };
};

const realFactory = attestedHostDouble;

const pendingSidecar = (phase: 'warmup' | 'call'): { sidecar: Sidecar; started: Promise<void>; close: ReturnType<typeof vi.fn> } => {
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  let rejectPending!: (error: Error) => void;
  const pending = new Promise<SidecarCallResult<unknown>>((_resolve, reject) => { rejectPending = reject; });
  const close = vi.fn(() => rejectPending(new Error('sidecar closed')));
  const sidecar: Sidecar = {
    warmup: async () => {
      if (phase === 'warmup') {
        markStarted();
        await new Promise<never>((_resolve, reject) => { rejectPending = reject; });
      }
      return { pythonVersion: 'test', versions: {} };
    },
    call: async <T>() => {
      markStarted();
      return await pending as SidecarCallResult<T>;
    },
    logs: () => [],
    envInfo: () => null,
    lockfileHash: () => null,
    sandboxAttestation: () => TEST_ATTESTATION,
    close,
  };
  return { sidecar, started, close };
};

describe('runExploration (test seam + real execution sidecar)', () => {
  beforeEach(() => {
    sandboxHarness.factory = realFactory;
  });
  afterEach(() => {
    sandboxHarness.factory = () => { throw new Error('sandbox test harness was not configured'); };
  });

  it('aborts during sandbox warmup and closes the sidecar promptly', async () => {
    const { store, runId } = openStore();
    const signal = { aborted: false };
    const fixture = pendingSidecar('warmup');
    sandboxHarness.factory = () => fixture.sidecar;
    const running = runExploration({
      store,
      runId,
      artifacts: { put: async () => ({ ref: 'r', hash: 'h', size: 0 }), get: async () => null, path: () => '' },
      purpose: 'cancel during sandbox warmup',
      code: 'print(1)',
      maxRuntimeMs: 60_000,
      signal,
    });
    await fixture.started;
    signal.aborted = true;
    await expect(running).rejects.toMatchObject({ name: 'AbortError' });
    expect(fixture.close).toHaveBeenCalledOnce();
  });

  it('aborts an in-flight exploration and closes the sidecar before returning', async () => {
    const { store, runId } = openStore();
    const signal = { aborted: false };
    const fixture = pendingSidecar('call');
    sandboxHarness.factory = () => fixture.sidecar;
    const running = runExploration({
      store,
      runId,
      artifacts: { put: async () => ({ ref: 'r', hash: 'h', size: 0 }), get: async () => null, path: () => '' },
      purpose: 'cancel an in-flight sandbox exploration',
      code: 'print(1)',
      maxRuntimeMs: 60_000,
      signal,
    });
    await fixture.started;
    signal.aborted = true;
    await expect(running).rejects.toMatchObject({ name: 'AbortError' });
    expect(fixture.close).toHaveBeenCalledOnce();
  });

  it('fails closed when a sidecar does not provide an OS attestation', async () => {
    const { store, runId } = openStore();
    const close = vi.fn();
    let executionCalls = 0;
    const unverified: Sidecar = {
      warmup: async () => ({ pythonVersion: 'host', versions: {} }),
      call: async () => {
        executionCalls += 1;
        return { ok: true, result: { exploration: { ok: true, stdout: 'unexpected' } } };
      },
      logs: () => [],
      envInfo: () => null,
      lockfileHash: () => null,
      sandboxAttestation: () => null,
      close,
    };
    sandboxHarness.factory = () => unverified;

    await expect(runExploration({
      store,
      runId,
      artifacts: { put: async () => ({ ref: 'r', hash: 'h', size: 0 }), get: async () => null, path: () => '' },
      purpose: 'refuse an unverified host execution sidecar',
      code: 'print(1)',
      maxRuntimeMs: 1_000,
    })).rejects.toThrow('verified OS sandbox');
    expect(executionCalls).toBe(0);
    expect(close).toHaveBeenCalledOnce();
  });

  it('executes gated analysis code and persists artifact + receipt + event', async () => {
    const { store, runId } = openStore();
    const result = await runExploration({
      store,
      runId,
      artifacts: {
        put: async (p) => ({ ref: `sha256:${'a'.repeat(56)}${String(p.length).padStart(6, '0')}`, hash: 'h', size: 0 }),
        get: async () => null,
        path: () => '/unused',
      },
      purpose: 'summarize central tendency of a retrieved numeric column',
      code: [
        'import statistics',
        'xs = [1.0, 2.0, 3.0, 4.0]',
        'print("mean", statistics.mean(xs))',
      ].join('\n'),
      maxRuntimeMs: 60_000,
    });

    expect(result.gate.allowed).toBe(true);
    expect(result.execution.ok).toBe(true);
    expect(result.execution.stdout).toContain('mean');

    // provenance: receipt with tool_exec facts
    const receipts = store.listObjects('receipt', runId);
    const rec = receipts.find((r) => r.toolExec?.tool === 'run_exploration');
    expect(rec).toBeDefined();
    expect(rec!.toolExec!.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rec!.toolExec!.outputHash).toMatch(/^[0-9a-f]{64}$/);

    // audit spine: one note carrying the artifact ref
    const notes = store.listEvents(runId).filter((e) => e.type === 'note' && (e.detail as Record<string, unknown>).reason === 'exploration_completed');
    expect(notes).toHaveLength(1);
    expect((notes[0]!.detail as Record<string, unknown>).artifactRef).toBeTruthy();
  });

  it('refuses to spawn the sidecar when the static gate fails (fail-closed)', async () => {
    const { store, runId } = openStore();
    let spawned = false;
    const countingFactory = () => {
      spawned = true;
      return createSidecar();
    };
    sandboxHarness.factory = countingFactory;
    await expect(runExploration({
      store, runId,
      artifacts: { put: async () => ({ ref: 'r', hash: 'h', size: 0 }), get: async () => null, path: () => '' },
      purpose: '',
      code: 'import socket',
      maxRuntimeMs: 1000,
    })).rejects.toThrow(/E-NETWORK|E-PURPOSE|gate/);
    expect(spawned).toBe(false); // gate failure never reaches the sandbox layer
  });

  it('records runtime failures inside the sandbox as visible candidate findings', async () => {
    const { store, runId } = openStore();
    const result = await runExploration({
      store, runId,
      artifacts: { put: async () => ({ ref: 'r', hash: 'h', size: 0 }), get: async () => null, path: () => '' },
      purpose: 'probe division by zero behavior of the dataset pipeline',
      code: 'x = 1 / 0',
      maxRuntimeMs: 60_000,
    });
    expect(result.execution.ok).toBe(false);
    expect(result.execution.errorKind).toBe('ZeroDivisionError');
    // the failed analysis is still audited as an exploration event
    const notes = store.listEvents(runId).filter((e) => e.type === 'note' && (e.detail as Record<string, unknown>).reason === 'exploration_failed');
    expect(notes).toHaveLength(1);
  });

  it('keeps the TS gate verdict in the result for agent-readable feedback', async () => {
    const v = analyzeExplorationCode({ code: 'import os\nos.system("x")', purpose: 'p', maxRuntimeMs: 1000 });
    expect(v.allowed).toBe(false);
    expect(v.violations.some((x) => x.code === 'E-SUBPROCESS')).toBe(true);
  });

  it('dunder-traversal escape is refused before spawn AND mirrored at the Python AST layer', async () => {
    const escapeCode = [
      'objs = ().__class__.__bases__[0].__subclasses__()',
      'for o in objs:',
      '    try:',
      '        g = o.__init__.__globals__',
      "        bi = g['__builtins__']",
      '        print("ESCAPED", hasattr(bi, "open"))',
      '        break',
      '    except Exception:',
      '        pass',
    ].join('\n');
    // Layer 1: the TS gate refuses before any process spawn (fail-closed).
    const { store, runId } = openStore();
    let spawned = false;
    const countingFactory = () => {
      spawned = true;
      return createSidecar();
    };
    sandboxHarness.factory = countingFactory;
    await expect(runExploration({
      store, runId,
      artifacts: { put: async () => ({ ref: 'r', hash: 'h', size: 0 }), get: async () => null, path: () => '' },
      purpose: 'recover builtins',
      code: escapeCode,
      maxRuntimeMs: 1000,
    })).rejects.toThrow(/E-ESCAPE/);
    expect(spawned).toBe(false);

    // Layer 2: even with the TS gate bypassed, the sidecar op itself rejects
    // the traversal at AST level (defense in depth — real sidecar, direct op call).
    const sidecar = realFactory();
    try {
      const r = await sidecar.call<{ exploration?: { ok: boolean; stdout?: string } }>(
        'run_exploration', { code: escapeCode, purpose: 'recover builtins', maxRuntimeMs: 1000 }, 30_000,
      );
      expect(r.ok).toBe(false); // op raise surfaces as a protocol error, never as executed output
      const stdout = JSON.stringify(r);
      expect(stdout).not.toContain('ESCAPED');
    } finally {
      sidecar.close();
    }
  });

  it('numpy-lazy-submodule payloads execute (14-F2 regression: np ops that lazily import internals)', async () => {
    const { store, runId } = openStore();
    const result = await runExploration({
      store,
      runId,
      artifacts: {
        put: async (p) => ({ ref: `sha256:${'b'.repeat(56)}${String(p.length).padStart(6, '0')}`, hash: 'h', size: 0 }),
        get: async () => null,
        path: () => '/unused',
      },
      purpose: 'numpy surface regression (lazy submodule imports)',
      code: [
        "print(int(np.arange(4).sum()))",          // arange dispatches through numpy._core._methods
        "print(round(float(np.linalg.det(np.eye(3))), 1))",  // nested lazy submodule (linalg)
        "print(float(np.percentile([1, 2, 3, 4], 50)))",      // percentile (function-base lazy path)
      ].join('\n'),
      maxRuntimeMs: 60_000,
    });

    expect(result.gate.allowed).toBe(true);
    expect(result.execution.ok).toBe(true);
    expect(result.execution.stdout).toContain('6');
    expect(result.execution.stdout).toContain('1.0');
    expect(result.execution.stdout).toContain('2.5');
  });
});
