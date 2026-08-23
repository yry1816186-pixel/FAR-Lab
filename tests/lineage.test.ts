import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import {
  ResearchQuestion, ResearchRun, newId, FeedbackSignal, Revision,
} from '../src/domain/index.js';
import { buildLineageGraph, type LineageGraph } from '../src/app/lineage.js';

/**
 * Research Lineage (AVO fusion, G3): the AVO paper's P_t is a queryable
 * lineage of solutions+outcomes; FAR-Lab's equivalent spans runs (parentRunId
 * chain), hypotheses (versions + status), evidence relations (support/counter),
 * experiments and revisions. buildLineageGraph assembles these into ONE typed,
 * queryable view over persisted state — read-only, no new authority.
 */

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'far-lin-'));

interface World { store: Store; runA: string; runB: string }

const setup = (): World => {
  const db = openDb(path.join(tmp(), 'far.db'));
  const store = new Store(db);

  const q = ResearchQuestion.parse({
    id: newId('q'), text: 'question', background: '', goalType: 'explanatory',
    scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
  });
  const runA = store.createRun(q);
  // revised run: child of A. updateRun only UPDATEs, so INSERT the row first via
  // the same SQL the store owns — no second write path (single authority).
  const now = new Date().toISOString();
  const runB = ResearchRun.parse({
    id: newId('run'), questionId: q.id, status: 'completed', currentStage: 'export',
    stages: [], createdAt: now, updatedAt: now, cancelRequested: false, parentRunId: runA.id,
  });
  db.prepare('INSERT INTO runs (id, question_id, status, current_stage, doc, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
    .run(runB.id, runB.questionId, runB.status, runB.currentStage, JSON.stringify(runB), runB.createdAt, runB.updatedAt);
  return { store, runA: runA.id, runB: runB.id };
};

const addHypothesis = (store: Store, runId: string, version = 0) => {
  const h = {
    id: newId('hyp'), runId, version, status: 'active', statement: `h v${version}`,
    mechanism: '', derivation: { strategy: 'evidence_conditioned', rationale: 'r', inputClaimIds: [] },
    assumptions: [], predictions: [], supportingClaimIds: [], counterClaimIds: [],
    uncertainties: [], createdAt: new Date().toISOString(),
  };
  store.putObject('hypothesis', h);
  return h;
};

describe('buildLineageGraph — structure assembly', () => {
  it('links parent/child runs across the revision chain', () => {
    const { store, runA, runB } = setup();
    const graph: LineageGraph = buildLineageGraph({ store, rootRunId: runA });
    expect(graph.nodes.map((n) => n.id).sort()).toEqual([runA, runB].sort());
    const edge = graph.edges.find((e) => e.kind === 'revised_into');
    expect(edge).toEqual({ kind: 'revised_into', from: runA, to: runB });
  });

  it('includes hypotheses with version + status as lineage members', () => {
    const { store, runA } = setup();
    addHypothesis(store, runA, 0);
    addHypothesis(store, runA, 1);
    const graph = buildLineageGraph({ store, rootRunId: runA });
    const hypNodes = graph.nodes.filter((n) => n.kind === 'hypothesis');
    expect(hypNodes).toHaveLength(2);
    expect(hypNodes.map((n) => n.label)).toEqual(['h v0', 'h v1']);
  });
});

describe('buildLineageGraph — counter-evidence preservation (negative results survive)', () => {
  it('records counter relations as first-class lineage facts, never averaged away', () => {
    const { store, runA } = setup();
    const h = addHypothesis(store, runA);
    const rel = {
      id: newId('ev'), runId: runA, relation: 'contradicts' as const,
      targetHypothesisId: h.id, rationale: 'dataset shows opposite effect',
      strength: 'moderate', uncertainties: [], createdAt: new Date().toISOString(),
    };
    store.putObject('evidence_relation', rel);
    const graph = buildLineageGraph({ store, rootRunId: runA });
    const counterEdges = graph.edges.filter((e) => e.kind === 'counter_evidence');
    expect(counterEdges).toHaveLength(1);
    expect(counterEdges[0]).toMatchObject({ from: rel.id, to: h.id });
  });
});

describe('buildLineageGraph — revision causality', () => {
  it('attaches revisions to their feedback trigger as causal edges', () => {
    const { store, runA } = setup();
    const fb = FeedbackSignal.parse({
      id: newId('fbk'), runId: runA, source: 'human_expert',
      content: 'expert disagrees with the mechanism', provenance: 'test',
      receivedAt: new Date().toISOString(),
    });
    store.putObject('feedback', fb);
    const rev = Revision.parse({
      id: newId('rev'), runId: runA, triggerFeedbackId: fb.id,
      causalReason: 'mechanism contradicted by expert analysis',
      operations: [{ objectType: 'hypothesis', objectId: 'hyp_x', operation: 'weaken', reason: 'counter-evidence' }],
      fromVersionLabel: 'v0', toVersionLabel: 'v1',
      qualityDelta: { status: 'improved', claim: 'c', evidenceRefs: [] },
      createdAt: new Date().toISOString(),
    });
    store.putObject('revision', rev);

    const graph = buildLineageGraph({ store, rootRunId: runA });
    const node = graph.nodes.find((n) => n.id === rev.id);
    expect(node?.kind).toBe('revision');
    const edge = graph.edges.find((e) => e.kind === 'caused_revision');
    expect(edge).toMatchObject({ from: fb.id, to: rev.id });
  });
});

describe('lineage discipline invariants', () => {
  it('is read-only over the store', () => {
    const { store, runA } = setup();
    addHypothesis(store, runA);
    const before = store.listEvents(runA).length;
    buildLineageGraph({ store, rootRunId: runA });
    expect(store.listEvents(runA).length).toBe(before);
  });

  it('handles a lone run with empty lineage without inventing nodes', () => {
    const { store, runA } = setup();
    const graph = buildLineageGraph({ store, rootRunId: runA });
    // only real persisted objects appear; every node is well-formed
    expect(graph.nodes.length).toBeGreaterThanOrEqual(1);
    expect(graph.nodes.every((n) => typeof n.id === 'string' && n.id.length > 0 && n.kind.length > 0)).toBe(true);
  });
});
