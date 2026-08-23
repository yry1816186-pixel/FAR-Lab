import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { ResearchQuestion, newId } from '../src/domain/index.js';
import {
  EVALUATOR_IDS,
  runEvaluators,
  type EvaluatorContext,
  type EvaluatorOutput,
} from '../src/app/evaluators.js';

/**
 * Evaluator family (AVO fusion G8): AVO's single score f becomes a FAMILY of
 * scientific evaluators (directive §3). Hard scientific constraints stay
 * deterministic gates; multi-dimensional judgment stays legible and auditable.
 * Every evaluator is pure over persisted state — no LLM produces a verdict.
 */

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'far-eval-'));

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

const ctxOf = (store: Store, runId: string): EvaluatorContext => ({
  store,
  runId,
  now: new Date().toISOString(),
});

describe('evaluator family', () => {
  it('covers the named directive dimensions with a closed id set', () => {
    expect([...EVALUATOR_IDS].sort()).toEqual([
      'evidence_balance', 'falsifiability', 'hypothesis_diversity',
      'provenance_completeness', 'uncertainty_transparency',
    ].sort());
  });

  it('runs every evaluator and returns well-formed outputs', () => {
    const { store, runId } = openStore();
    const outs = runEvaluators(ctxOf(store, runId));
    expect(outs.map((o) => o.id).sort()).toEqual([...EVALUATOR_IDS].sort());
    for (const o of outs as EvaluatorOutput[]) {
      expect(['pass', 'warn', 'fail']).toContain(o.status);
      expect(o.detail.length).toBeGreaterThan(0);
    }
  });

  it('falsifiability fails honestly when hypotheses carry no falsification spec', () => {
    const { store, runId } = openStore();
    store.putObject('hypothesis', {
      id: newId('hyp'), runId, version: 0, status: 'active',
      statement: 'x causes y', mechanism: '',
      derivation: { strategy: 'evidence_conditioned', rationale: 'r', inputClaimIds: [] },
      assumptions: [], predictions: [], supportingClaimIds: [], counterClaimIds: [],
      uncertainties: [], createdAt: new Date().toISOString(),
    });
    const outs = runEvaluators(ctxOf(store, runId));
    const f = outs.find((o) => o.id === 'falsifiability')!;
    expect(f.status).toBe('fail');
    expect(f.detail).toMatch(/falsification/i);
  });

  it('evidence_balance warns when counter-evidence is absent (confirmation-bias guard)', () => {
    const { store, runId } = openStore();
    // all-supporting relation set -> warn: nothing contradicts
    store.putObject('evidence_relation', {
      id: newId('ev'), runId, relation: 'supports', rationale: 'r1',
      strength: 'weak', uncertainties: [], createdAt: new Date().toISOString(),
    });
    const outs = runEvaluators(ctxOf(store, runId));
    const eb = outs.find((o) => o.id === 'evidence_balance')!;
    expect(eb.status).toBe('warn');
    expect(eb.detail.toLowerCase()).toContain('counter');
  });

  it('is read-only over the store', () => {
    const { store, runId } = openStore();
    const before = store.listEvents(runId).length;
    runEvaluators(ctxOf(store, runId));
    expect(store.listEvents(runId).length).toBe(before);
  });
});
