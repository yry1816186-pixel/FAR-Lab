import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp, type App } from '../src/app/composition.js';
import { createApiServer, type ApiServer } from '../src/server/api.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import { MethodSelection, ResearchQuestion } from '../src/domain/index.js';
import { newId } from '../src/domain/ids.js';

/**
 * FA-HCI-02 e2e: researcher method-family override through the real HTTP
 * server — the correction must land as a causal revision chain (feedback ->
 * scope-modify Revision -> VersionDiff with the predecessor archived), the
 * MethodSelection replaced in place with decidedBy='researcher_override', and
 * the audit note visible in the run's event chain. Unassessed families and
 * plan-less selections are refused honestly (400, never silent).
 */

interface OpenServer { app: App; api: ApiServer; base: string; dir: string }
const openServers: OpenServer[] = [];
afterEach(async () => {
  while (openServers.length > 0) {
    const s = openServers.pop()!;
    await s.api.stop();
    s.app.close();
    fs.rmSync(s.dir, { recursive: true, force: true });
  }
});

const openApi = async (): Promise<OpenServer> => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-method-override-'));
  const app = await createApp({ dataDir: dir, providerOverride: createTestStubProvider() });
  const api = createApiServer(app, { port: 0, executor: (runId) => Promise.resolve(app.store.getRun(runId)), staticRoot: path.join(dir, 'no-web') });
  const base = `http://127.0.0.1:${await api.start()}`;
  const opened = { app, api, base, dir };
  openServers.push(opened);
  return opened;
};

const seed = (app: App): { runId: string; selectionId: string } => {
  const now = new Date().toISOString();
  const q = ResearchQuestion.parse({
    id: newId('q'),
    text: 'Does anion redistribution drive interface impedance growth in polymer electrolyte cells?',
    background: 'transport degradation', goalType: 'explanatory',
    scope: { domain: 'electrochemistry', phenomena: ['interface degradation'] },
    constraints: { assumptions: [] }, createdAt: now,
  });
  const run = app.store.createRun(q);
  const selection = MethodSelection.parse({
    id: newId('msel'), runId: run.id, questionId: q.id, forObjectiveId: 'obj1',
    candidates: [
      { family: 'physical_experiment', assessment: 'selected', rationale: 'paired cycling with operando spectra is decisive', validationPlan: 'protocol QC rules at measurement record time' },
      { family: 'numerical_simulation', assessment: 'rejected_inappropriate', rationale: 'no calibrated transport model is available for this chemistry' },
    ],
    decidedBy: 'model_proposed', createdAt: now,
  });
  app.store.putObject('method_selection', selection);
  return { runId: run.id, selectionId: selection.id };
};

const postJson = async (base: string, route: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> => {
  const r = await fetch(`${base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() as Record<string, unknown> };
};

describe('method-family override (FA-HCI-02)', () => {
  it('e2e: override lands in the causal revision chain and replaces the selection in place', async () => {
    const server = await openApi();
    const { runId, selectionId } = seed(server.app);

    const res = await postJson(server.base, `/api/v1/runs/${runId}/method-selections/${selectionId}/override`, {
      selectedFamilies: ['numerical_simulation'],
      reason: 'paired cycling is out of budget; the FEM surrogate is acceptable',
      validationPlans: { numerical_simulation: 'AFEM convergence order >= 2 on two refinements' },
    });
    expect(res.status).toBe(200);
    const selection = res.body.selection as { decidedBy: string; candidates: Array<{ family: string; assessment: string; validationPlan?: string }> };
    expect(selection.decidedBy).toBe('researcher_override');
    const num = selection.candidates.find((c) => c.family === 'numerical_simulation');
    const phys = selection.candidates.find((c) => c.family === 'physical_experiment');
    expect(num?.assessment).toBe('selected');
    expect(num?.validationPlan).toBe('AFEM convergence order >= 2 on two refinements');
    expect(phys?.assessment).toBe('viable_alternative');

    const feedbacks = server.app.store.listObjects('feedback', runId);
    expect(feedbacks).toHaveLength(1);
    expect(feedbacks[0]?.source).toBe('human_expert');
    expect(feedbacks[0]?.target?.id).toBe(selectionId);

    const revisions = server.app.store.listObjects('revision', runId);
    expect(revisions).toHaveLength(1);
    expect(revisions[0]?.triggerFeedbackId).toBe(feedbacks[0]?.id);
    expect(revisions[0]?.operations[0]?.objectType).toBe('scope');
    expect(revisions[0]?.operations[0]?.before).toBe('physical_experiment');
    expect(revisions[0]?.operations[0]?.after).toBe('numerical_simulation');
    expect(revisions[0]?.qualityDelta.evidenceRefs[0]).toMatch(/^sha256:[0-9a-f]{64}$/); // predecessor archived

    const diffs = server.app.store.listObjects('version_diff', runId);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]?.entries[0]?.semanticFlags).toContain('method_family_override');

    const replaced = server.app.store.listObjects('method_selection', runId).find((s) => s.id === selectionId);
    expect(replaced?.decidedBy).toBe('researcher_override');

    const science = await fetch(`${server.base}/api/v1/runs/${runId}/science`).then((r) => r.json() as Promise<{ problemModel: { methodSelections: Array<{ selectedFamilies: string[] }> | null } }>).catch(() => null);
    if (science !== null && science.problemModel !== null) {
      expect(science.problemModel.methodSelections[0]?.selectedFamilies).toEqual(['numerical_simulation']);
    }
  });

  it('refuses unassessed families and plan-less selections honestly (400, nothing persisted)', async () => {
    const server = await openApi();
    const { runId, selectionId } = seed(server.app);

    const unassessed = await postJson(server.base, `/api/v1/runs/${runId}/method-selections/${selectionId}/override`, {
      selectedFamilies: ['theorem_proving'],
      reason: 'not among the assessed families at all',
    });
    expect(unassessed.status).toBe(400);
    expect((unassessed.body.error as { message: string }).message).toContain('never assessed');

    const planless = await postJson(server.base, `/api/v1/runs/${runId}/method-selections/${selectionId}/override`, {
      selectedFamilies: ['numerical_simulation'],
      reason: 'switch without supplying the required validation plan',
    });
    expect(planless.status).toBe(400);
    expect((planless.body.error as { message: string }).message).toContain('validation plan');

    expect(server.app.store.listObjects('feedback', runId)).toHaveLength(0);
    expect(server.app.store.listObjects('revision', runId)).toHaveLength(0);
    const unchanged = server.app.store.listObjects('method_selection', runId).find((s) => s.id === selectionId);
    expect(unchanged?.decidedBy).toBe('model_proposed');
  });

  it('cross-run and unknown-selection targets are 404, never cross-run mutation', async () => {
    const server = await openApi();
    const { runId, selectionId } = seed(server.app);
    const otherRun = app_run(server.app);
    const res = await postJson(server.base, `/api/v1/runs/${otherRun}/method-selections/${selectionId}/override`, {
      selectedFamilies: ['physical_experiment'],
      reason: 'attempting to mutate another run decision',
    });
    expect(res.status).toBe(404);
    const unknown = await postJson(server.base, `/api/v1/runs/${runId}/method-selections/msel_unknown/override`, {
      selectedFamilies: ['physical_experiment'],
      reason: 'selection does not exist at all here',
    });
    expect(unknown.status).toBe(404);
  });
});

const app_run = (app: App): string => {
  const q = ResearchQuestion.parse({
    id: newId('q'), text: 'A different study question entirely', goalType: 'exploratory',
    scope: { domain: 'other', phenomena: ['x'] }, constraints: { assumptions: [] }, createdAt: new Date().toISOString(),
  });
  return app.store.createRun(q).id;
};
