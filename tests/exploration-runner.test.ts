import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { ResearchQuestion, newId } from '../src/domain/index.js';
import { analyzeExplorationCode } from '../src/agent/exploratory-codeact.js';
import { createSidecar, type SidecarFactory } from '../src/experiment/python.js';
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

const realFactory: SidecarFactory = () => createSidecar();

describe('runExploration (real sidecar)', () => {
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
      sidecarFactory: realFactory,
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
    const countingFactory: SidecarFactory = () => {
      spawned = true;
      return createSidecar();
    };
    await expect(runExploration({
      store, runId,
      artifacts: { put: async () => ({ ref: 'r', hash: 'h', size: 0 }), get: async () => null, path: () => '' },
      purpose: '',
      code: 'import socket',
      maxRuntimeMs: 1000,
      sidecarFactory: countingFactory,
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
      sidecarFactory: realFactory,
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
    const countingFactory: SidecarFactory = () => {
      spawned = true;
      return createSidecar();
    };
    await expect(runExploration({
      store, runId,
      artifacts: { put: async () => ({ ref: 'r', hash: 'h', size: 0 }), get: async () => null, path: () => '' },
      purpose: 'recover builtins',
      code: escapeCode,
      maxRuntimeMs: 1000,
      sidecarFactory: countingFactory,
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
});
