import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { ResearchQuestion, newId } from '../src/domain/index.js';
import type { ArtifactStore } from '../src/shared/ports.js';
import { wireResearchTools } from '../src/agent/capabilities/research-tools.js';

/**
 * Wiring tests for the research-tools capability: the AVO-fusion planes
 * (G4 exploration execution, G5 pass-by-reference, G6 event queries) exposed
 * as REAL AgentTool instances with the same shape the refine agent loop
 * consumes (inputSchema zod + execute + riskClass), so any kernel session —
 * refine now, conversation/autonomous loops next — can adopt them by
 * registration instead of growing a disconnected proof-of-concept.
 */

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'far-rtools-'));

const fixture = () => {
  const db = openDb(path.join(tmp(), 'far.db'));
  const store = new Store(db);
  const q = ResearchQuestion.parse({
    id: newId('q'), text: 'wiring test', background: '', goalType: 'explanatory',
    scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
  });
  const run = store.createRun(q);
  const runId = run.id;
  const artifacts: ArtifactStore = {
    put: async (p) => ({ ref: `sha256:${'b'.repeat(56)}`, hash: 'h', size: String(p).length }),
    get: async () => null,
    path: () => '/unused',
  };
  const tools = Object.fromEntries(
    wireResearchTools({ store, runId, artifacts }).map((t) => [t.name, t]),
  );
  return { store, runId, artifacts, tools: tools as Record<string, (typeof tools)[string]> };
};

describe('query_run_events tool', () => {
  it('returns bounded events through the tool surface', async () => {
    const { store, runId, tools } = fixture();
    for (let i = 0; i < 3; i++) store.appendEvent(runId, { type: 'note', detail: { text: `n${i}` } });
    const out = await tools.query_run_events!.execute({ kinds: ['note'], limit: 2 });
    expect(out.ok).toBe(true);
    const data = out.data as { events: unknown[]; truncated: boolean };
    expect(data.events).toHaveLength(2);
    expect(data.truncated).toBe(true);
  });

  it('surfaces query errors as ok=false results, not throws', async () => {
    const { tools } = fixture();
    const out = await tools.query_run_events!.execute({ kinds: [] });
    expect(out.ok).toBe(false);
  });
});

describe('preview_ref tool', () => {
  it('returns bounded preview without inlining full payloads', async () => {
    const { tools } = fixture();
    const out = await tools.preview_ref!.execute({
      ref: 'sha256:abc', kind: 'artifact',
      payload: 'y'.repeat(5000),
      maxChars: 200,
    });
    expect(out.ok).toBe(true);
    const data = out.data as { truncated: boolean; chars: number; payload?: unknown };
    expect(data.truncated).toBe(true);
    expect(data.chars).toBe(5000);
    expect(data.payload).toBeUndefined(); // full body never inlined
  });
});

describe('explore_code tool (real sidecar)', () => {
  it('runs gated analysis end-to-end and returns candidate findings with audit chain', async () => {
    const uvAvailable = await new Promise<boolean>((res) => {
      import('node:child_process').then(({ execFile }) =>
        execFile('uv', ['--version'], { timeout: 10_000 }, (e) => res(e === null)),
      );
    });
    if (!uvAvailable) {
      console.warn('SKIP-EVIDENCE: uv unavailable');
      return;
    }
    const { createSidecar } = await import('../src/experiment/python.js');
    const { store, runId } = fixture();
    // rewire with the REAL sidecar factory
    const realTools = Object.fromEntries(
      wireResearchTools({
        store, runId,
        artifacts: { put: async (p) => ({ ref: `sha256:${'c'.repeat(56)}`, hash: 'h', size: String(p).length }), get: async () => null, path: () => '' },
        sidecarFactory: () => createSidecar(),
      }).map((t) => [t.name, t]),
    ) as Record<string, (typeof realTools extends infer T ? T : never)[string]>;

    const out = await (realTools.explore_code as { execute: (a: unknown) => Promise<{ ok: boolean; data?: unknown }> }).execute({
      purpose: 'wiring test: descriptive statistic',
      code: 'import statistics\nprint("mean", statistics.mean([1, 2, 3]))',
    });
    expect(out.ok).toBe(true);
    const data = out.data as { ok: boolean; stdout: string; artifactRef: string };
    expect(data.ok).toBe(true);
    expect(data.stdout).toContain('mean 2');
    expect(data.artifactRef).toBeTruthy();

    // audit chain landed on the run
    const receipts = store.listObjects('receipt', runId);
    expect(receipts.some((r) => r.toolExec?.tool === 'run_exploration')).toBe(true);

    // gate rejection path surfaces violation codes to the model
    const rejected = await (realTools.explore_code as { execute: (a: unknown) => Promise<{ ok: boolean; error?: string }> }).execute({
      purpose: 'wiring test: gate rejection surface',
      code: 'import socket',
    });
    expect(rejected.ok).toBe(false);
    expect(rejected.error).toMatch(/E-NETWORK/);
  }, 180_000);
});
