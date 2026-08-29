import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createApp } from '../src/app/composition.js';
import { getProtocolState, recordProtocolEvent, ProtocolOpError } from '../src/server/protocol-ops.js';
import { ResearchQuestion, newId } from '../src/domain/index.js';
import type { App } from '../src/app/composition.js';

/**
 * Protocol ops (convergence 2026-08-29): read-side projection + the
 * human-attested record path over a REAL app/store. Truth gates: the ledger
 * advances only through the domain state machine (rejections THROW, nothing
 * persists); the outcome bridge mints the experiment FeedbackSignal exactly
 * once; a terminal ledger stays closed even against explicit re-publish.
 */

const tmp = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'far-protops-'));

const setup = async (): Promise<{ app: App; runId: string }> => {
  const app = await createApp({ dataDir: tmp() });
  const q = ResearchQuestion.parse({
    id: newId('q'),
    text: 'What drives interface impedance growth in polymer electrolyte cells?',
    background: '',
    goalType: 'explanatory',
    scope: { domain: 'electrochemistry', phenomena: ['interface degradation'] },
    constraints: {},
    createdAt: new Date().toISOString(),
  });
  const run = app.store.createRun(q);
  const protocol = {
    id: newId('prt'),
    runId: run.id,
    planId: newId('pln'),
    planHash: 'a'.repeat(64),
    hypothesisIds: [newId('hyp')],
    title: 'Paired-cell cycling protocol',
    objective: 'Operationalize the plan into bench-executable steps with human confirmations',
    paradigm: 'bench',
    setting: 'electrochemistry bench, glovebox',
    arms: [
      { label: 'blocked-additive', description: 'cells with anion-blocking additive', isControl: false },
      { label: 'inert-additive control', description: 'cells with inert additive', isControl: true },
    ],
    materials: [],
    instruments: [],
    sampling: { unitLabel: 'cell', plannedN: 4, eligibilityIncludes: [], eligibilityExcludes: [], blinding: 'open' },
    allocation: { scheme: 'none', rationale: 'fixture: no randomization' },
    steps: [
      {
        id: 'ps1',
        planStepId: newId('task'),
        title: 'Assemble cells',
        action: 'Assemble four cells applying the committed procedure.',
        actor: 'technician',
        materials: [],
        instruments: [],
        duration: { value: 6, unit: 'hours' },
        conditions: 'glovebox',
        producesMeasurements: [],
        confirmation: 'human_signed',
        dependsOn: [],
      },
    ],
    variables: [
      {
        name: 'interfacial impedance',
        role: 'dependent',
        method: 'operando EIS fit',
        unit: 'ohm',
        valueType: 'numeric',
        timepoints: ['cycle 200'],
        qcRule: { kind: 'range', min: 0, max: 10000 },
      },
    ],
    ethics: { requiresApproval: false, consentRequired: false, riskLevel: 'minimal', notes: [] },
    stopConditions: [{ kind: 'safety', detail: 'stop on cell venting' }],
    status: 'registered',
    createdAt: new Date().toISOString(),
    frozenAt: new Date().toISOString(),
  };
  app.store.putObject('protocol', protocol);
  app.store.putObject('protocol_execution', {
    id: newId('pex'),
    protocolId: protocol.id,
    runId: run.id,
    status: 'awaiting_human',
    records: [],
    measurements: [],
    approvals: [],
    deviations: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return { app, runId: run.id };
};

describe('protocol ops', () => {
  it('getProtocolState projects protocol + ledger + collection form + step states', async () => {
    const { app, runId } = await setup();
    try {
      const state = getProtocolState(app, runId);
      expect(state.protocol.title).toBe('Paired-cell cycling protocol');
      expect(state.execution?.status).toBe('awaiting_human');
      expect(state.stepStates['ps1']).toBe('pending');
      expect(state.collectionForm.fields[0]?.variableName).toBe('interfacial impedance');
      expect(state.collectionForm.fields[0]?.qcSummary).toContain('range');
      expect(state.outcomeFeedbackPublished).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('recordProtocolEvent advances the ledger and audits a note event', async () => {
    const { app, runId } = await setup();
    try {
      const result = recordProtocolEvent(app, runId, { actor: 'R. Yuan', kind: 'step_started', stepId: 'ps1' });
      expect(result.status).toBe('in_progress');
      expect(result.stepStates['ps1']).toBe('in_progress');
      expect(app.store.listObjects('protocol_execution', runId)[0]?.records).toHaveLength(1);
      const events = app.store.listEvents(runId);
      expect(events.some((e) => e.type === 'note' && (e.detail as { reason?: string }).reason === 'protocol_record')).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('invalid transitions throw ProtocolOpError and persist nothing', async () => {
    const { app, runId } = await setup();
    try {
      expect(() => recordProtocolEvent(app, runId, { actor: 'R. Yuan', kind: 'step_completed', stepId: 'ps1' })).toThrow(ProtocolOpError);
      expect(() => recordProtocolEvent(app, runId, { actor: 'R. Yuan', kind: 'measurement', measurement: { variableName: 'interfacial impedance', value: 'high' } })).toThrow(ProtocolOpError);
      expect(() => recordProtocolEvent(app, runId, { actor: 'R. Yuan', kind: 'deviation' })).toThrow(ProtocolOpError);
      expect(app.store.listObjects('protocol_execution', runId)[0]?.records).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('completion publishes the experiment feedback signal exactly once; the terminal ledger stays closed', async () => {
    const { app, runId } = await setup();
    try {
      recordProtocolEvent(app, runId, { actor: 'R. Yuan', kind: 'step_started', stepId: 'ps1' });
      const done = recordProtocolEvent(app, runId, { actor: 'R. Yuan', kind: 'step_completed', stepId: 'ps1' });
      expect(done.status).toBe('completed');
      expect(done.outcomeFeedbackPublished).toBe(true);
      const signals = app.store.listObjects('feedback', runId);
      expect(signals).toHaveLength(1);
      expect(signals[0]?.source).toBe('experiment');
      expect(signals[0]?.target?.kind).toBe('protocol');
      // terminal: further records fail closed, even with an explicit publishOutcome
      expect(() => recordProtocolEvent(app, runId, { actor: 'R. Yuan', kind: 'measurement', measurement: { variableName: 'interfacial impedance', value: 42 } })).toThrow(ProtocolOpError);
      expect(() => recordProtocolEvent(app, runId, { actor: 'R. Yuan', kind: 'abort', note: 'late abort', publishOutcome: true })).toThrow(ProtocolOpError);
      expect(app.store.listObjects('feedback', runId)).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it('run without a protocol 404s honestly', async () => {
    const app = await createApp({ dataDir: tmp() });
    try {
      const q = ResearchQuestion.parse({
        id: newId('q'),
        text: 'q',
        background: '',
        goalType: 'exploratory',
        scope: { domain: 'd', phenomena: ['p'] },
        constraints: {},
        createdAt: new Date().toISOString(),
      });
      const run = app.store.createRun(q);
      expect(() => getProtocolState(app, run.id)).toThrow(ProtocolOpError);
    } finally {
      await app.close();
    }
  });
});
