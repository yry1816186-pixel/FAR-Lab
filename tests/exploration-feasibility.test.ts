import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { openArtifactStore } from '../src/persistence/artifacts.js';
import { ResearchQuestion, newId } from '../src/domain/index.js';
import type { ArtifactStore } from '../src/shared/ports.js';

/**
 * S10a offline capability probe: does the exploratory CodeAct plane actually
 * run end-to-end in THIS environment? Spawns the REAL sidecar (uv family env)
 * through runExploration — the same path an agent tool would take. This is the
 * environment-feasibility check for directive §10's "real workload" bar on the
 * deterministic parts (LLM-dependent comparisons stay blocked and documented).
 *
 * Skipped honestly when `uv` is unavailable (CI without the Python family):
 * skip reason states exactly what could not be verified.
 */

const uvAvailable = async (): Promise<boolean> => {
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    await promisify(execFile)('uv', ['--version'], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
};

describe('exploratory CodeAct environment feasibility (real sidecar)', () => {
  it('runs gated analysis code through the real sidecar and lands full audit chain', async () => {
    if (!(await uvAvailable())) {
      console.warn('SKIP-EVIDENCE: uv not available in this environment — live sidecar feasibility unverified');
      return;
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-cap-'));
    const db = openDb(path.join(dir, 'far.db'));
    const store = new Store(db);
    const artifacts: ArtifactStore = openArtifactStore(path.join(dir, 'artifacts'));
    try {
      const q = ResearchQuestion.parse({
        id: newId('q'), text: 'feasibility probe', background: '', goalType: 'explanatory',
        scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
      });
      const run = store.createRun(q);

      // Lazy import keeps module-load time off the non-uv path.
      const { runExploration } = await import('../src/agent/exploration-runner.js');
      const { createSidecar } = await import('../src/experiment/python.js');

      const result = await runExploration({
        store,
        runId: run.id,
        artifacts,
        purpose: 'environment feasibility probe: compute a descriptive statistic',
        code: [
          'import statistics',
          'xs = [2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0]',
          'print("n", len(xs))',
          'print("mean", round(statistics.mean(xs), 3))',
          'print("stdev", round(statistics.stdev(xs), 3))',
        ].join('\n'),
        maxRuntimeMs: 120_000,
        sidecarFactory: () => createSidecar(),
      });

      expect(result.gate.allowed).toBe(true);
      expect(result.execution.ok).toBe(true);
      expect(result.execution.stdout).toContain('mean 5');
      expect(result.artifactRef).toBeTruthy();

      // Full audit chain landed: receipt + note event.
      const receipts = store.listObjects('receipt', run.id);
      expect(receipts.some((r) => r.toolExec?.tool === 'run_exploration')).toBe(true);
      const notes = store.listEvents(run.id).filter(
        (e) => e.type === 'note' && (e.detail as Record<string, unknown>).reason === 'exploration_completed',
      );
      expect(notes).toHaveLength(1);
    } finally {
      try { db.close(); } catch { /* temp cleanup */ }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 180_000);
});
