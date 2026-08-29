import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProtocolSpec, newProtocolExecution, newId, type ProtocolExecution } from '../src/domain/index.js';
import { protocolCommand, type ProtocolCommandOptions } from '../src/cli/protocol.js';

/**
 * `far protocol show|record` in-process contract (slice 3): the CLI module rides
 * the SAME protocol-ops engine as the web band and the HTTP routes. Seeding
 * mirrors tests/protocol-api.test.ts (HTTP run creation + direct store puts) so
 * no store API is guessed; the commands under test open their own app on the
 * seeded data dir, exactly as main.ts would invoke them.
 */

const AT = '2026-08-29T09:30:00.000Z';

const seedProtocol = (runId: string): { spec: ProtocolSpec; execution: ProtocolExecution } => {
  const spec = ProtocolSpec.parse({
    id: newId('prt'),
    runId,
    planId: newId('pln'),
    planHash: 'b'.repeat(64),
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
        id: 'ps1', planStepId: newId('task'), title: 'prepare coupons',
        action: 'weigh, label and mount the four coupons before bath exposure',
        actor: 'researcher', materials: [], instruments: [],
        duration: { value: 30, unit: 'minutes' }, conditions: 'gloves, fume hood',
        producesMeasurements: [], confirmation: 'human_signed', dependsOn: [],
      },
      {
        id: 'ps2', planStepId: newId('task'), title: 'record yield',
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

interface Seeded {
  dir: string;
  runId: string;
  spec: ProtocolSpec;
}

const seed = async (): Promise<Seeded> => {
  const { createApiServer } = await import('../src/server/api.js');
  const { createApp } = await import('../src/app/composition.js');
  const { createTestStubProvider } = await import('../src/providers/test-stub.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-prot-cli-'));
  const app = await createApp({ dataDir: dir, providerOverride: createTestStubProvider([]) });
  const api = createApiServer(app, { port: 0, staticRoot: path.join(dir, 'no-dist') });
  const port = await api.start();
  try {
    const create = await fetch(`http://127.0.0.1:${port}/api/v1/runs`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'etch rate by bath temperature?' }),
    });
    const runId = ((await create.json()) as { runId: string }).runId;
    const { spec, execution } = seedProtocol(runId);
    app.store.putObject('protocol', spec);
    app.store.putObject('protocol_execution', execution);
    return { dir, runId, spec };
  } finally {
    await api.stop();
    app.close();
  }
};

const opts = (dir: string, positional: string | undefined, flags: Record<string, string | boolean> = {}): ProtocolCommandOptions => ({
  dataDir: dir,
  positional,
  flag: (name) => flags[name] === true,
  arg: (name) => (typeof flags[name] === 'string' ? flags[name] : undefined),
});

describe('far protocol show', () => {
  it('renders the frozen protocol + ledger truthfully (text and json)', async () => {
    const s = await seed();
    const text = await protocolCommand('show', opts(s.dir, s.runId));
    expect(text.code).toBe(0);
    expect(text.text).toBeDefined();
    const plain = text.text ?? '';
    expect(plain).toContain(s.spec.id);
    expect(plain).toContain('bench');
    expect(plain).toContain('awaiting_human');
    expect(plain).toContain('ps1');
    expect(plain).toContain('pending');
    expect(plain).toContain('not published');
    const json = await protocolCommand('show', opts(s.dir, s.runId, { '--json': true }));
    expect(json.code).toBe(0);
    const body = json.json as { runId: string; protocol: { id: string }; execution: { status: string } | null };
    expect(body.runId).toBe(s.runId);
    expect(body.protocol.id).toBe(s.spec.id);
    expect(body.execution?.status).toBe('awaiting_human');
  });

  it('fails honestly: unknown run, run without a protocol, malformed run id', async () => {
    const s = await seed();
    const ghost = await protocolCommand('show', opts(s.dir, `run_${'0'.repeat(26)}`));
    expect(ghost.code).toBe(1);
    expect(ghost.text).toContain('not found');
    const bad = await protocolCommand('show', opts(s.dir, 'not-a-run-id'));
    expect(bad.code).toBe(2);
  });
});

describe('far protocol record', () => {
  it('enforces usage (missing --actor / unknown --kind / missing per-kind flags)', async () => {
    const s = await seed();
    const noActor = await protocolCommand('record', opts(s.dir, s.runId, { '--kind': 'step_started', '--step': 'ps1' }));
    expect(noActor.code).toBe(2);
    expect(noActor.text).toContain('--actor');
    const badKind = await protocolCommand('record', opts(s.dir, s.runId, { '--kind': 'teleport', '--actor': 'Dr. Chen' }));
    expect(badKind.code).toBe(2);
    expect(badKind.text).toContain('--kind');
    const noStep = await protocolCommand('record', opts(s.dir, s.runId, { '--kind': 'step_started', '--actor': 'Dr. Chen' }));
    expect(noStep.code).toBe(2);
    expect(noStep.text).toContain('--step');
  });

  it('dependency order is refused with the machine reason; happy path advances the ledger', async () => {
    const s = await seed();
    const early = await protocolCommand('record', opts(s.dir, s.runId, { '--kind': 'step_started', '--step': 'ps2', '--actor': 'Dr. Chen' }));
    expect(early.code).toBe(1);
    expect(early.text).toContain('depends on ps1');

    const start = await protocolCommand('record', opts(s.dir, s.runId, { '--kind': 'step_started', '--step': 'ps1', '--actor': 'Dr. Chen' }));
    expect(start.code).toBe(0);
    expect(start.text).toContain('in_progress');

    const done = await protocolCommand('record', opts(s.dir, s.runId, { '--kind': 'step_completed', '--step': 'ps1', '--actor': 'Dr. Chen' }));
    expect(done.code).toBe(0);

    // QC-failing measurement stays recorded with its verdict — visible in show
    const measure = await protocolCommand('record', opts(s.dir, s.runId, {
      '--kind': 'measurement', '--variable': 'yield_pct', '--value': '150', '--timepoint': 'final', '--actor': 'Dr. Chen',
    }));
    expect(measure.code).toBe(0);
    const json = measure.json as { measurement?: unknown; status: string };
    expect(json.status).toBeDefined();
    const view = await protocolCommand('show', opts(s.dir, s.runId, { '--json': true }));
    const body = view.json as { execution: { measurements: Array<{ value: number; qcPassed: boolean }> } | null };
    const m = body.execution?.measurements[0];
    expect(m?.value).toBe(150);
    expect(m?.qcPassed).toBe(false);
  });
});
