import { z } from 'zod';
import {
  FeedbackSignal,
  ProtocolExecution,
  ProtocolSpec,
  buildCollectionForm,
  newId,
  protocolOutcomeFeedback,
  protocolStepStates,
  applyProtocolRecord,
  type ProtocolRecord,
} from '../domain/index.js';
import type { App } from '../app/composition.js';

/**
 * Protocol HTTP-surface operations (convergence 2026-08-29) — the researcher's
 * plane for paradigm-honest execution: read the frozen protocol + collection
 * form + ledger, and record HUMAN-ATTESTED events (step starts/completions,
 * measurements, deviations, approvals, aborts). Every transition is validated
 * by the deterministic domain state machine; nothing here can advance, invent
 * or complete execution on the software's own authority.
 *
 * Outcome bridge: when the ledger reaches `completed` (or the researcher
 * explicitly publishes a partial outcome), the physical world's evidence
 * enters the SAME causal loop every other executed result uses — a
 * FeedbackSignal with source 'experiment', minted exactly once (provenance
 * key `protocol-execution:<ledger id>`), consumed by feedback -> revise.
 */

export type ProtocolOpErrorCode = 'not_found' | 'target_not_found' | 'validation' | 'state_conflict';

export class ProtocolOpError extends Error {
  constructor(readonly status: number, readonly code: ProtocolOpErrorCode, message: string) {
    super(message);
  }
}

const badRequest = (message: string): ProtocolOpError => new ProtocolOpError(400, 'validation', message);

export interface ProtocolStateView {
  protocol: ProtocolSpec;
  execution: ProtocolExecution | null;
  stepStates: Record<string, 'pending' | 'in_progress' | 'done'>;
  collectionForm: ReturnType<typeof buildCollectionForm>;
  outcomeFeedbackPublished: boolean;
}

/** Read-side projection: latest registered protocol + its ledger + derived views. */
export const getProtocolState = (app: App, runId: string): ProtocolStateView => {
  if (app.store.getRun(runId) === null) throw new ProtocolOpError(404, 'not_found', `run ${runId} not found`);
  const protocol = app.store.listObjects('protocol', runId).at(-1) ?? null;
  if (protocol === null) {
    throw new ProtocolOpError(404, 'target_not_found', `no protocol registered in run ${runId} — the execute stage drafts one when the plan's real-world legs cannot run computationally`);
  }
  const execution = app.store.listObjects('protocol_execution', runId).find((e) => e.protocolId === protocol.id) ?? null;
  const outcomeFeedbackPublished = execution !== null
    && app.store.listObjects('feedback', runId).some((f) => f.provenance === `protocol-execution:${execution.id}`);
  return {
    protocol,
    execution,
    stepStates: execution === null ? {} : protocolStepStates(protocol, execution),
    collectionForm: buildCollectionForm(protocol.variables),
    outcomeFeedbackPublished,
  };
};

export const RecordProtocolEventBody = z.object({
  /** ISO timestamp; defaults to server now (the researcher's clock is authoritative). */
  at: z.string().datetime().optional(),
  actor: z.string().min(2).max(120),
  kind: z.enum([
    'approval', 'step_started', 'step_completed', 'measurement', 'deviation', 'block', 'unblock', 'abort',
  ]),
  stepId: z.string().optional(),
  note: z.string().max(2000).optional(),
  measurement: z.object({
    variableName: z.string().min(1).max(120),
    unitIndex: z.number().int().nonnegative().optional(),
    timepoint: z.string().max(120).optional(),
    value: z.union([z.number(), z.string().min(1).max(2000)]),
  }).optional(),
  deviation: z.object({
    what: z.string().min(3).max(1000),
    why: z.string().min(3).max(1000),
    consequence: z.string().min(3).max(1000),
  }).optional(),
  approval: z.object({
    approvalBody: z.string().min(1).max(200),
    approvalId: z.string().min(1).max(200),
    approvedBy: z.string().min(1).max(120),
  }).optional(),
  /** Publish a partial outcome as feedback NOW (completion auto-publishes anyway). */
  publishOutcome: z.boolean().optional(),
});
export type RecordProtocolEventInput = z.infer<typeof RecordProtocolEventBody>;

export interface RecordProtocolEventResult {
  protocolId: string;
  executionId: string;
  status: ProtocolExecution['status'];
  stepStates: Record<string, 'pending' | 'in_progress' | 'done'>;
  outcomeFeedbackPublished: boolean;
}

const feedbackProvenanceOf = (executionId: string): string => `protocol-execution:${executionId}`;

/**
 * Apply ONE human-attested record. Fail-closed state machine (domain owns the
 * verdicts); the outcome bridge mints the experiment FeedbackSignal exactly once.
 */
export const recordProtocolEvent = (
  app: App,
  runId: string,
  rawBody: unknown,
): RecordProtocolEventResult => {
  if (app.store.getRun(runId) === null) throw new ProtocolOpError(404, 'not_found', `run ${runId} not found`);
  const parsed = RecordProtocolEventBody.safeParse(rawBody);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw badRequest(`invalid protocol record: ${issues}`);
  }
  const body = parsed.data;
  const protocol = app.store.listObjects('protocol', runId).at(-1) ?? null;
  if (protocol === null) {
    throw new ProtocolOpError(404, 'target_not_found', `no protocol registered in run ${runId}`);
  }
  const execution = app.store.listObjects('protocol_execution', runId).find((e) => e.protocolId === protocol.id) ?? null;
  if (execution === null) {
    throw new ProtocolOpError(404, 'target_not_found', `protocol ${protocol.id} has no execution ledger`);
  }

  const record: ProtocolRecord = {
    at: body.at ?? new Date().toISOString(),
    actor: body.actor,
    kind: body.kind,
    ...(body.stepId !== undefined ? { stepId: body.stepId } : {}),
    ...(body.note !== undefined ? { note: body.note } : {}),
    ...(body.measurement !== undefined ? { measurement: body.measurement } : {}),
    ...(body.deviation !== undefined ? { deviation: body.deviation } : {}),
    ...(body.approval !== undefined ? { approval: body.approval } : {}),
  };
  const outcome = applyProtocolRecord(protocol, execution, record);
  if (!outcome.ok) {
    throw new ProtocolOpError(409, 'state_conflict', outcome.error);
  }
  const updated = outcome.execution;
  app.store.putObject('protocol_execution', updated);
  app.store.appendEvent(runId, {
    type: 'note',
    detail: {
      reason: 'protocol_record',
      protocolId: protocol.id,
      executionId: updated.id,
      kind: record.kind,
      ...(record.stepId !== undefined ? { stepId: record.stepId } : {}),
      actor: record.actor,
      status: updated.status,
    },
  });

  const alreadyPublished = app.store
    .listObjects('feedback', runId)
    .some((f) => f.provenance === feedbackProvenanceOf(updated.id));
  const shouldPublish = (updated.status === 'completed' || body.publishOutcome === true) && !alreadyPublished;
  if (shouldPublish) {
    const fb = protocolOutcomeFeedback(protocol, updated);
    const signal = FeedbackSignal.parse({
      ...fb,
      id: newId('fbk'),
      receivedAt: new Date().toISOString(),
    });
    app.store.putObject('feedback', signal);
    app.store.appendEvent(runId, {
      type: 'feedback_received',
      detail: {
        reason: 'protocol_outcome_published',
        protocolId: protocol.id,
        executionId: updated.id,
        feedbackId: signal.id,
        status: updated.status,
      },
    });
  }
  return {
    protocolId: protocol.id,
    executionId: updated.id,
    status: updated.status,
    stepStates: protocolStepStates(protocol, updated),
    outcomeFeedbackPublished: shouldPublish || alreadyPublished,
  };
};
