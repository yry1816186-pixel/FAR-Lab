import { createApp } from '../app/composition.js';
import { getProtocolState, recordProtocolEvent, ProtocolOpError } from '../server/protocol-ops.js';
import { ink, marker } from './term.js';

/**
 * `far protocol …` — the paradigm-honest execution ledger as a CLI surface
 * (slice 3). Same engine as the web band and the HTTP routes (protocol-ops
 * against the in-process app); this layer only parses input and renders
 * truthful state. The CLI never advances, invents or completes execution on
 * its own authority — every record is human-attested and the --actor name is
 * archived with the record.
 *
 * Commands:
 *   far protocol show   <runId> [--json]
 *   far protocol record <runId> --kind <k> --actor <name> [kind flags] [--json]
 * kinds: approval | step_started | step_completed | measurement | deviation |
 *        block | unblock | abort
 * kind flags:
 *   approval         --body --approval-id --approved-by
 *   step_*           --step <psId>
 *   measurement      --variable <name> --value <v> [--unit-index N] [--timepoint <t>]
 *   deviation        --what --why --consequence
 *   block/unblock/abort  optional --note
 * universal: --actor (required), --note (optional), --at <ISO>, --publish-outcome
 */

export interface ProtocolCommandOptions {
  dataDir: string | undefined;
  positional: string | undefined;
  flag: (name: string) => boolean;
  arg: (name: string) => string | undefined;
}

export interface ProtocolCommandResult {
  code: number;
  text?: string;
  json?: unknown;
}

const RUN_ID_RE = /^run_[0-9a-z]{20,32}$/;
const KINDS = ['approval', 'step_started', 'step_completed', 'measurement', 'deviation', 'block', 'unblock', 'abort'] as const;
type ProtocolRecordKind = (typeof KINDS)[number];

const isKind = (v: string): v is ProtocolRecordKind => (KINDS as readonly string[]).includes(v);

class UsageError extends Error {}

const USAGE = 'usage: far protocol show <runId> [--json] | far protocol record <runId> --kind <approval|step_started|step_completed|measurement|deviation|block|unblock|abort> --actor <name> [--step <psId>] [--variable <name> --value <v> --unit-index N --timepoint <t>] [--body --approval-id --approved-by] [--what --why --consequence] [--note <text>] [--at <ISO>] [--publish-outcome] [--json]';

const opFailure = (e: ProtocolOpError): ProtocolCommandResult => ({
  code: 1,
  text: `protocol error (HTTP ${e.status} ${e.code}): ${e.message}`,
});

const show = async (o: ProtocolCommandOptions, runId: string): Promise<ProtocolCommandResult> => {
  const app = await createApp({ dataDir: o.dataDir });
  try {
    const attempted = (() => {
      try {
        return { ok: true as const, view: getProtocolState(app, runId) };
      } catch (e) {
        return { ok: false as const, err: e };
      }
    })();
    if (!attempted.ok) {
      if (attempted.err instanceof ProtocolOpError) return opFailure(attempted.err);
      throw attempted.err;
    }
    const view = attempted.view;
    const p = view.protocol;
    const ex = view.execution;
    const status = ex?.status ?? 'registered (no ledger yet)';
    const stepLines = p.steps.map((s) => {
      const st = view.stepStates[s.id] ?? 'pending';
      const deps = s.dependsOn.length > 0 ? s.dependsOn.join(',') : '—';
      return `  [${st.padEnd(11)}] ${s.id}  ${s.title} ${ink.muted(`(${s.confirmation}; deps ${deps})`)}`;
    });
    const measurements = ex?.measurements ?? [];
    const qcFail = measurements.filter((m) => !m.qcPassed).length;
    const lines = [
      `${marker()} ${ink.bold(`protocol ${p.id}`)} — ${p.title}`,
      `  paradigm ${p.paradigm} · plan frozen ${p.planHash.slice(0, 12)}… · status ${status}`,
      `  objective: ${p.objective}`,
      `  ethics: ${p.ethics.requiresApproval ? 'approval required' : 'not required'}`,
      ...stepLines,
      `  measurements: ${measurements.length} recorded${qcFail > 0 ? `, ${ink.err(`${qcFail} QC-failed`)}` : ''}`,
      `  outcome feedback: ${view.outcomeFeedbackPublished ? ink.ok('published') : 'not published'}`,
    ];
    if (status === 'awaiting_approval') {
      lines.push(`  ${ink.warn('ethics gate closed')} — record the approval to unlock:`);
      lines.push(`    far protocol record ${runId} --kind approval --actor <name> --body <body> --approval-id <id> --approved-by <who>`);
    }
    if (o.flag('--json')) {
      return { code: 0, json: { runId, ...view } };
    }
    return { code: 0, text: lines.join('\n') };
  } finally {
    app.close();
  }
};

const record = async (o: ProtocolCommandOptions, runId: string, kind: ProtocolRecordKind): Promise<ProtocolCommandResult> => {
  const actor = o.arg('--actor');
  if (actor === undefined || actor.trim().length < 2) {
    throw new UsageError('--actor <name> is required (archived with every record)');
  }
  const req = (name: string): string => {
    const v = o.arg(name);
    if (v === undefined || v.length === 0) throw new UsageError(`${kind} requires ${name}\n${USAGE}`);
    return v;
  };
  const body: Record<string, unknown> = { actor: actor.trim(), kind };
  const at = o.arg('--at');
  if (at !== undefined) body.at = at;
  const note = o.arg('--note');
  if (note !== undefined) body.note = note;
  switch (kind) {
    case 'approval':
      body.approval = { approvalBody: req('--body'), approvalId: req('--approval-id'), approvedBy: req('--approved-by') };
      break;
    case 'step_started':
    case 'step_completed':
      body.stepId = req('--step');
      break;
    case 'measurement': {
      const variableName = req('--variable');
      const rawValue = req('--value');
      const num = Number(rawValue);
      const value: number | string = rawValue.trim() !== '' && Number.isFinite(num) ? num : rawValue;
      const measurement: Record<string, unknown> = { variableName, value };
      const unitIndex = o.arg('--unit-index');
      if (unitIndex !== undefined) {
        const n = Number(unitIndex);
        if (!Number.isInteger(n) || n < 0) throw new UsageError('--unit-index must be a non-negative integer');
        measurement.unitIndex = n;
      }
      const timepoint = o.arg('--timepoint');
      if (timepoint !== undefined) measurement.timepoint = timepoint;
      body.measurement = measurement;
      break;
    }
    case 'deviation':
      body.deviation = { what: req('--what'), why: req('--why'), consequence: req('--consequence') };
      break;
    default:
      break; // block / unblock / abort carry an optional --note only
  }
  if (o.flag('--publish-outcome')) body.publishOutcome = true;
  const app = await createApp({ dataDir: o.dataDir });
  try {
    const attempted = (() => {
      try {
        return { ok: true as const, result: recordProtocolEvent(app, runId, body) };
      } catch (e) {
        return { ok: false as const, err: e };
      }
    })();
    if (!attempted.ok) {
      if (attempted.err instanceof ProtocolOpError) return opFailure(attempted.err);
      throw attempted.err;
    }
    const r = attempted.result;
    const stepSuffix = typeof body.stepId === 'string' ? ` (${body.stepId})` : '';
    return {
      code: 0,
      json: { runId, ...r },
      text: `${marker()} recorded ${kind}${stepSuffix} by ${actor.trim()} — ledger ${r.executionId} now ${r.status}` +
        `${r.outcomeFeedbackPublished ? ink.ok(' · outcome published as experiment feedback') : ''}`,
    };
  } finally {
    app.close();
  }
};

export async function protocolCommand(sub: string | undefined, o: ProtocolCommandOptions): Promise<ProtocolCommandResult> {
  try {
    if (sub === 'show') {
      const runId = o.positional;
      if (runId === undefined || !RUN_ID_RE.test(runId)) {
        return { code: 2, text: `far protocol show requires a run id (run_<26-char id>)\n${USAGE}` };
      }
      return await show(o, runId);
    }
    if (sub === 'record') {
      const runId = o.positional;
      if (runId === undefined || !RUN_ID_RE.test(runId)) {
        return { code: 2, text: `far protocol record requires a run id (run_<26-char id>)\n${USAGE}` };
      }
      const kind = o.arg('--kind');
      if (kind === undefined || !isKind(kind)) {
        return { code: 2, text: `far protocol record requires --kind <${KINDS.join('|')}>\n${USAGE}` };
      }
      return await record(o, runId, kind);
    }
    return { code: 2, text: USAGE };
  } catch (e) {
    if (e instanceof UsageError) return { code: 2, text: e.message };
    throw e;
  }
}
