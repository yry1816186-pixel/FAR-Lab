import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProtocolSpec, newProtocolExecution, newId } from '../src/domain/index.js';

/**
 * Protocol-plane HTTP surface contract (web slice 2): the routes the StudyMap
 * band rides — GET /runs/:id/protocol and POST /runs/:id/protocol/records —
 * against a REAL server on an ephemeral port. Closes the gap registered in
 * PR #132 ("HTTP 级 e2e 随 web 切片补"): slice-1 verified the ops logic and
 * the route glue only via typecheck.
 */

const AT = '2026-08-29T07:30:00.000Z';

const seedProtocol = (runId: string): { protocolId: string; executionId: string } => {
  // Minimal-but-valid preregistration: bench paradigm, no approval gate,
  // two ordered steps, one range-QC'd numeric variable.
  const spec = ProtocolSpec.parse({
    id: newId('prt'),
    runId,
    planId: newId('pln'),
    planHash: 'a'.repeat(64),
    hypothesisIds: [newId('hyp')],
    title: 'etch-rate pilot',
    objective: 'measure etch rate under two bath temperatures with gravimetric yield',
    paradigm: 'bench',
    setting: 'materials bench, room 3',
    arms: [
      { label: 'cold', description: 'bath at 25C', isControl: true },
      { label: 'warm', description: 'bath at 45C', isControl: false },
    ],
    materials: [],
    instruments: [],
    sampling: { unitLabel: 'coupon', plannedN: 4, eligibilityIncludes: [], eligibilityExcludes: [], blinding: 'open' },
    allocation: { scheme: 'none', rationale: 'observational pilot, no randomization' },
    steps: [
      {
        id: 'ps1', planStepId: newId('tsk'), title: 'prepare coupons',
        action: 'weigh, label and mount the four coupons before bath exposure',
        actor: 'researcher', materials: [], instruments: [],
        duration: { value: 30, unit: 'minutes' }, conditions: 'gloves, fume hood',
        producesMeasurements: [], confirmation: 'human_signed', dependsOn: [],
      },
      {
        id: 'ps2', planStepId: newId('tsk'), title: 'record yield',
        action: 'after exposure, dry and re-weigh each coupon, enter yield percent',
        actor: 'researcher', materials: [], instruments: [],
        duration: { value: 15, unit: 'minutes' }, conditions: '',
        producesMeasurements: ['yield_pct'], confirmation: 'human_signed', dependsOn: ['ps1'],
      },
    ],
    variables: [
      {
        name: 'yield_pct', role: 'dependent', method: 'gravimetric before/after',
        unit: '%', valueType: 'numeric', timepoints: ['final'],
        qcRule: { kind: 'range', min: 0, max: 100 },
      },
    ],
    ethics: { requiresApproval: false, consentRequired: false, riskLevel: 'minimal', notes: [] },
    stopConditions: [{ kind: 'safety', detail: 'stop on skin contact or spill' }],
    draftNotes: [], status: 'registered', createdAt: AT, frozenAt: AT,
  });
  const execution = newProtocolExecution(spec, newId('pex'), AT);
  return { spec, execution };
};

describe('protocol HTTP surface (real server)', () => {
  it('GET /runs/:id/protocol — 200 projection, 404 unknown run, 404 run without a protocol', async () => {
    const { createApiServer } = await import('../src/server/api.js');
    const { createApp } = await import('../src/app/composition.js');
    const { createTestStubProvider } = await import('../src/providers/test-stub.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-prot-api-'));
    const app = await createApp({ dataDir: dir, providerOverride: createTestStubProvider([]) });
    const api = createApiServer(app, { port: 0, staticRoot: path.join(dir, 'no-dist') });
    const port = await api.start();
    const base = `http://127.0.0.1:${port}`;
    try {
      const create = await fetch(`${base}/api/v1/runs`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'etch rate by bath temperature?' }),
      });
      const runId = ((await create.json()) as { runId: string }).runId;

      const ghost = await fetch(`${base}/api/v1/runs/${'run_'.padEnd(30, '0')}/protocol`);
      expect(ghost.status).toBe(404);

      const none = await fetch(`${base}/api/v1/runs/${runId}/protocol`);
      expect(none.status).toBe(404);

      const { spec, execution } = seedProtocol(runId);
      app.store.putObject('protocol', spec);
      app.store.putObject('protocol_execution', execution);

      const ok = await fetch(`${base}/api/v1/runs/${runId}/protocol`);
      expect(ok.status).toBe(200);
      const body = (await ok.json()) as {
        protocol: { id: string; paradigm: string };
        execution: { id: string; status: string };
        stepStates: Record<string, string>;
        collectionForm: { fields: Array<{ variableName: string; qcSummary: string }> };
        outcomeFeedbackPublished: boolean;
      };
      expect(body.protocol.id).toBe(spec.id);
      expect(body.protocol.paradigm).toBe('bench');
      expect(body.execution?.status).toBe('awaiting_human');
      expect(body.stepStates.ps1).toBe('pending');
      expect(body.collectionForm.fields[0]?.variableName).toBe('yield_pct');
      expect(body.collectionForm.fields[0]?.qcSummary).toContain('range');
      expect(body.outcomeFeedbackPublished).toBe(false);
    } finally {
      await api.stop();
      app.close();
    }
  });

  it('POST /runs/:id/protocol/records — dependency order 409, QC-failing values stay recorded, 400 on invalid body', async () => {
    const { createApiServer } = await import('../src/server/api.js');
    const { createApp } = await import('../src/app/composition.js');
    const { createTestStubProvider } = await import('../src/providers/test-stub.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-prot-api2-'));
    const app = await createApp({ dataDir: dir, providerOverride: createTestStubProvider([]) });
    const api = createApiServer(app, { port: 0, staticRoot: path.join(dir, 'no-dist') });
    const port = await api.start();
    const base = `http://127.0.0.1:${port}`;
    try {
      const create = await fetch(`${base}/api/v1/runs`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'etch rate replication?' }),
      });
      const runId = ((await create.json()) as { runId: string }).runId;
      const { spec, execution } = seedProtocol(runId);
      app.store.putObject('protocol', spec);
      app.store.putObject('protocol_execution', execution);

      const post = (body: unknown): Promise<Response> =>
        fetch(`${base}/api/v1/runs/${runId}/protocol/records`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });

      // dependency order: ps2 cannot start while ps1 is pending — 409 with the machine's reason
      const early = await post({ actor: 'Dr. Chen', kind: 'step_started', stepId: 'ps2' });
      expect(early.status).toBe(409);
      const earlyBody = (await early.json()) as { error: { code: string; message: string } };
      expect(earlyBody.error.code).toBe('validation');
      expect(earlyBody.error.message).toContain('depends on ps1');

      // invalid body: actor missing → 400
      const invalid = await post({ kind: 'step_started', stepId: 'ps1' });
      expect(invalid.status).toBe(400);

      // happy path: start ps1 → complete ps1 → QC-FAILING measurement stays recorded with its verdict
      const start = await post({ actor: 'Dr. Chen', kind: 'step_started', stepId: 'ps1' });
      expect(start.status).toBe(200);
      const startBody = (await start.json()) as { stepStates: Record<string, string>; status: string };
      expect(startBody.stepStates.ps1).toBe('in_progress');
      expect(startBody.status).toBe('in_progress');

      const done = await post({ actor: 'Dr. Chen', kind: 'step_completed', stepId: 'ps1' });
      expect(done.status).toBe(200);

      const measure = await post({
        actor: 'Dr. Chen', kind: 'measurement',
        measurement: { variableName: 'yield_pct', timepoint: 'final', value: 150 },
      });
      expect(measure.status).toBe(200);

      const view = await fetch(`${base}/api/v1/runs/${runId}/protocol`);
      const viewBody = (await view.json()) as {
        execution: { measurements: Array<{ value: number; qcPassed: boolean; qcDetail?: string }> };
      };
      const m = viewBody.execution?.measurements[0];
      expect(m?.value).toBe(150);
      expect(m?.qcPassed).toBe(false);
      expect(m?.qcDetail).toContain('range');
    } finally {
      await api.stop();
      app.close();
    }
  });
});
