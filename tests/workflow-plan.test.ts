import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { STAGE_ORDER, type RunStageName } from '../src/domain/run.js';
import { WorkflowPlanSchema, defaultWorkflow, nextWorkflowStage, type WorkflowPlan } from '../src/domain/workflow-plan.js';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';

const rec = (state: string) => ({ state });

describe('defaultWorkflow (plan-order ≡ STAGE_ORDER)', () => {
  it('targets exactly STAGE_ORDER in order', () => {
    const plan = defaultWorkflow('run_x');
    expect(plan.steps.map((s) => s.target)).toEqual([...STAGE_ORDER]);
    expect(plan.origin).toBe('default');
    expect(plan.version).toBe(1);
  });

  it('linear deps chain: each step depends on the previous one only', () => {
    const plan = defaultWorkflow('run_x');
    expect(plan.steps[0]!.after).toEqual([]);
    for (let i = 1; i < plan.steps.length; i += 1) {
      expect(plan.steps[i]!.after).toEqual([plan.steps[i - 1]!.id]);
    }
  });

  it('round-trips the store schema (fail-closed read)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-wfp-'));
    try {
      const db = openDb(path.join(dir, 'far.db'));
      const store = new Store(db);
      const plan = defaultWorkflow('run_roundtrip');
      store.putObject('workflow_plan', plan);
      const back = store.listObjects('workflow_plan', 'run_roundtrip');
      expect(back).toHaveLength(1);
      expect(WorkflowPlanSchema.parse(back[0])).toEqual(plan);
      db.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('nextWorkflowStage (cursor equivalence)', () => {
  const plan: WorkflowPlan = defaultWorkflow('run_y');
  const statesOf = (states: Partial<Record<RunStageName, string>>) =>
    (t: RunStageName) => (states[t] === undefined ? undefined : rec(states[t]!));

  it('returns the first stage without a done/skipped record (missing record = pending)', () => {
    expect(nextWorkflowStage(plan, statesOf({}), new Set())).toBe('scope');
    expect(nextWorkflowStage(plan, statesOf({ scope: 'done' }), new Set())).toBe('retrieve');
    expect(nextWorkflowStage(plan, statesOf({ scope: 'skipped', retrieve: 'done' }), new Set())).toBe('verify_sources');
  });

  it('resumes from a failed stage (retry on resume, like the array loop)', () => {
    const states = statesOf({ scope: 'done', retrieve: 'done', verify_sources: 'failed' });
    expect(nextWorkflowStage(plan, states, new Set())).toBe('verify_sources');
  });

  it('quality-gate back-jump: re-marked pending stages are picked in plan order', () => {
    const states = statesOf({
      scope: 'done', retrieve: 'done', verify_sources: 'done', build_evidence: 'done',
      generate_hypotheses: 'pending', critique_falsify: 'pending', rank: 'pending',
    });
    expect(nextWorkflowStage(plan, states, new Set())).toBe('generate_hypotheses');
  });

  it('returns undefined when every step is terminal', () => {
    const all = Object.fromEntries(STAGE_ORDER.map((s) => [s, 'done'])) as Partial<Record<RunStageName, string>>;
    expect(nextWorkflowStage(plan, statesOf(all), new Set())).toBeUndefined();
  });

  it('skips handler-missing targets for the rest of the pass (cursor += 1 equivalent)', () => {
    expect(nextWorkflowStage(plan, statesOf({}), new Set(['scope']))).toBe('retrieve');
  });

  it('honors after-deps: a step is not runnable while its dependency is pending, regardless of listing order', () => {
    const custom = WorkflowPlanSchema.parse({
      ...defaultWorkflow('run_z'),
      steps: [
        { id: 'b', kind: 'stage', target: 'build_evidence', after: ['a'], completion: { kind: 'stage_terminal' }, attemptCap: 3 },
        { id: 'a', kind: 'stage', target: 'retrieve', after: [], completion: { kind: 'stage_terminal' }, attemptCap: 3 },
      ],
    });
    // b is listed FIRST but its dep (retrieve) is pending: the dep runs first.
    expect(nextWorkflowStage(custom, statesOf({}), new Set())).toBe('retrieve');
    // dep terminal (done) -> b becomes runnable
    expect(nextWorkflowStage(custom, statesOf({ retrieve: 'done' }), new Set())).toBe('build_evidence');
    // a FAILED dep does not mark the dep satisfied; the failed stage itself is re-picked
    // first (resume retries it), so downstream order is preserved through the failure path.
    expect(nextWorkflowStage(custom, statesOf({ retrieve: 'failed' }), new Set())).toBe('retrieve');
  });
});
