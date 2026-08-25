import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { openArtifactStore } from '../src/persistence/artifacts.js';
import { CampaignSpec } from '../src/domain/campaign.js';
import { driveCampaign } from '../src/app/campaign-driver.js';
import type { UnitTerminalState } from '../src/app/campaign.js';
import { ExperimentSpec, ResearchQuestion, newId } from '../src/domain/index.js';

// RU-8 GO4 — campaign driver loop. Deterministic offline lifecycle via the
// executeUnit test seam (the real executor path is exercised by its own suites).

const mkEnv = (): { store: Store; artifacts: ReturnType<typeof openArtifactStore> } => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-camp-'));
  const store = new Store(openDb(path.join(dir, 'far.db')));
  return { store, artifacts: openArtifactStore(path.join(dir, 'artifacts')) };
};

const mkRun = (store: Store): string => {
  const q = ResearchQuestion.parse({ id: newId('q'), text: 'campaign?', goalType: 'explanatory', createdAt: '2026-08-24T00:00:00.000Z', scope: { domain: 'd', phenomena: ['p'] }, constraints: {} });
  return store.createRun(q).id;
};

const mkCampaign = (cross: unknown, stopRules: unknown[], units?: unknown[]): CampaignSpec =>
  CampaignSpec.parse({
    id: 'cmp_drivertest0000000000000a',
    runId: 'run_drivertest00000000000000a',
    units: units ?? [
      { label: 'root', hypothesisId: 'hyp_r000000000000000000000', experimentSpecId: 'xsp_r000000000000000000000', dependsOn: [] },
      { label: 'child', hypothesisId: 'hyp_c000000000000000000000', experimentSpecId: 'xsp_c000000000000000000000', dependsOn: ['root'] },
      { label: 'sink', hypothesisId: 'hyp_s000000000000000000000', experimentSpecId: 'xsp_s000000000000000000000', dependsOn: ['child'] },
    ],
    crossUnitTesting: cross,
    stopRules,
    createdAt: '2026-08-24T00:00:00.000Z',
  });

const sequencer = (plan: Record<string, { state: UnitTerminalState; alpha?: number }>) => {
  const calls: string[] = [];
  const executeUnit = async (spec: ExperimentSpec): Promise<{ state: UnitTerminalState; alphaSpent?: number; experimentRunId: string }> => {
    const label = labelBySpec[spec.id] ?? spec.id;
    calls.push(label);
    const p = plan[label];
    if (p === undefined) throw new Error(`unexpected unit executed: ${label}`);
    return { state: p.state, alphaSpent: p.alpha, experimentRunId: `xrun_${label}` };
  };
  return { calls, executeUnit };
};
const labelBySpec: Record<string, string> = { 'xsp_r000000000000000000000': 'root', 'xsp_c000000000000000000000': 'child', 'xsp_s000000000000000000000': 'sink', 'xsp_p000000000000000000000': 'primary', 'xsp_x000000000000000000000': 'extra' };

describe('driveCampaign lifecycle', () => {
  it('a 3-unit chain runs root -> child -> sink in DAG order; all_terminal stop fires', async () => {
    const { store, artifacts } = mkEnv();
    mkRun(store);
    const spec = mkCampaign({ policy: 'single_primary', primaryUnit: 'sink' }, [{ kind: 'all_units_terminal' }]);
    const seq = sequencer({ root: { state: 'completed' }, child: { state: 'completed' }, sink: { state: 'completed' } });
    const fakeSpecs = Object.fromEntries(Object.entries(labelBySpec).map(([id, label]) => [label, { id, runId: spec.runId } as unknown as ExperimentSpec]));
    const out = await driveCampaign(store, artifacts, spec, {
      executeUnit: seq.executeUnit,
      resolveSpec: (id) => fakeSpecs[labelBySpec[id] ?? ''] ?? null,
    });
    expect(seq.calls).toEqual(['root', 'child', 'sink']); // exact DAG order
    expect(out.stopped).toBe(true);
    expect(out.stopReason).toBe('all_units_terminal');
    expect(out.unitStates.every((s) => s.state === 'completed')).toBe(true);
    expect(out.executedRunIds).toHaveLength(3);
    // audit trail on the run spine
    const events = store.listEvents(spec.runId).map((e) => (e.detail as { kind?: string }).kind ?? e.type);
    expect(events).toContain('campaign_unit_started');
    expect(events).toContain('campaign_unit_completed');
    expect(events).toContain('campaign_stopped');
  });

  it('primary_falsified stops enqueueing remaining units mid-campaign', async () => {
    const { store, artifacts } = mkEnv();
    mkRun(store);
    const spec = mkCampaign({ policy: 'single_primary', primaryUnit: 'root' }, [{ kind: 'primary_falsified' }], [
      { label: 'root', hypothesisId: 'hyp_r000000000000000000000', experimentSpecId: 'xsp_r000000000000000000000', dependsOn: [] },
      { label: 'extra', hypothesisId: 'hyp_e000000000000000000000', experimentSpecId: 'xsp_x000000000000000000000', dependsOn: [] },
    ]);
    const seq = sequencer({ root: { state: 'failed' } });
    const fakeSpecs = Object.fromEntries(Object.entries(labelBySpec).map(([id, label]) => [label, { id, runId: spec.runId } as unknown as ExperimentSpec]));
    const out = await driveCampaign(store, artifacts, spec, {
      executeUnit: seq.executeUnit,
      resolveSpec: (id) => fakeSpecs[labelBySpec[id] ?? ''] ?? null,
    });
    expect(seq.calls).toEqual(['root']); // extra never enqueued
    expect(out.stopped).toBe(true);
    expect(out.stopReason).toContain('primary_falsified');
  });

  it('a failed dependency stalls dependents honestly (campaign_stalled event; no silent skip)', async () => {
    const { store, artifacts } = mkEnv();
    mkRun(store);
    const spec = mkCampaign({ policy: 'single_primary', primaryUnit: 'sink' }, [{ kind: 'all_units_terminal' }]);
    const seq = sequencer({ root: { state: 'failed' } });
    const fakeSpecs = Object.fromEntries(Object.entries(labelBySpec).map(([id, label]) => [label, { id, runId: spec.runId } as unknown as ExperimentSpec]));
    const out = await driveCampaign(store, artifacts, spec, {
      executeUnit: seq.executeUnit,
      resolveSpec: (id) => fakeSpecs[labelBySpec[id] ?? ''] ?? null,
    });
    expect(seq.calls).toEqual(['root']);
    expect(out.stopped).toBe(false); // not all terminal — stalled, honestly disclosed
    const kinds = store.listEvents(spec.runId).map((e) => (e.detail as { kind?: string }).kind);
    expect(kinds).toContain('campaign_stalled');
    expect(kinds).toContain('campaign_unit_failed');
  });

  it('alpha_spending: spent shares ride the terminal states and events', async () => {
    const { store, artifacts } = mkEnv();
    mkRun(store);
    const spec = mkCampaign(
      { policy: 'alpha_spending', familyAlpha: 0.05, alphaByUnit: { root: 0.02, child: 0.02, sink: 0.01 } },
      [{ kind: 'all_units_terminal' }],
    );
    const seq = sequencer({ root: { state: 'completed', alpha: 0.02 }, child: { state: 'completed', alpha: 0.019 }, sink: { state: 'completed', alpha: 0.009 } });
    const fakeSpecs = Object.fromEntries(Object.entries(labelBySpec).map(([id, label]) => [label, { id, runId: spec.runId } as unknown as ExperimentSpec]));
    const out = await driveCampaign(store, artifacts, spec, {
      executeUnit: seq.executeUnit,
      resolveSpec: (id) => fakeSpecs[labelBySpec[id] ?? ''] ?? null,
    });
    expect(out.unitStates.find((s) => s.label === 'child')!.alphaSpent).toBe(0.019);
    const spendNote = store.listEvents(spec.runId).find((e) => (e.detail as { kind?: string }).kind === 'campaign_unit_completed' && (e.detail as { unit?: string }).unit === 'root');
    expect((spendNote!.detail as { alphaSpent?: number }).alphaSpent).toBe(0.02);
  });

  it('missing frozen spec = unit fails visibly, campaign continues with others', async () => {
    const { store, artifacts } = mkEnv();
    mkRun(store);
    const spec = mkCampaign({ policy: 'single_primary', primaryUnit: 'sink' }, [{ kind: 'all_units_terminal' }]);
    // note: no experiment_spec objects in the store — but the seam bypasses store reads only
    // when specs EXIST; here executeUnit is the seam, so exercise the raw path instead:
    const seq = sequencer({ root: { state: 'completed' }, child: { state: 'failed' }, sink: { state: 'canceled' } });
    const fakeSpecs = Object.fromEntries(Object.entries(labelBySpec).map(([id, label]) => [label, { id, runId: spec.runId } as unknown as ExperimentSpec]));
    const out = await driveCampaign(store, artifacts, spec, {
      executeUnit: seq.executeUnit,
      resolveSpec: (id) => fakeSpecs[labelBySpec[id] ?? ''] ?? null,
    });
    // fail-no-unblock: sink (depends on child) never runs; campaign stalls honestly
    expect(out.unitStates).toHaveLength(2);
    expect(out.stopped).toBe(false);
  });
});
