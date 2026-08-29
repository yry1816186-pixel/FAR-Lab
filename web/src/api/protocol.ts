/**
 * Protocol-plane web client (web slice 2, 2026-08-29).
 *
 * Types mirror the server contract exactly — src/server/protocol-ops.ts
 * projecting src/domain/protocol.ts. The view is read-only except for
 * POST /records: every mutation is a HUMAN-ATTESTED event validated by the
 * deterministic domain state machine (ethics gate fail-closed, dependency
 * order, value typing, QC). Nothing here can advance or invent execution.
 */
import { api } from './client';

export type ResearchParadigm =
  'bench' | 'field' | 'human_subjects' | 'engineering' | 'theory' | 'archive' | 'mixed';
export type ProtocolConfirmationKind = 'human_signed' | 'instrument_record' | 'photo' | 'witness' | 'none';
export type ProtocolVariableRole = 'independent' | 'dependent' | 'control' | 'covariate' | 'context';
export type ProtocolValueType = 'numeric' | 'categorical' | 'ordinal' | 'text' | 'date' | 'image' | 'other';
export type ProtocolStatus =
  'awaiting_approval' | 'awaiting_human' | 'in_progress' | 'paused' | 'completed' | 'aborted';
export type ProtocolStepState = 'pending' | 'in_progress' | 'done';
export type ProtocolRecordKind =
  'approval' | 'step_started' | 'step_completed' | 'measurement' | 'deviation' | 'block' | 'unblock' | 'abort';

export interface ProtocolArmView {
  label: string;
  description: string;
  isControl: boolean;
}

export interface ProtocolStepView {
  id: string;
  planStepId: string;
  title: string;
  action: string;
  actor: 'researcher' | 'technician' | 'instrument' | 'external_service' | 'participant';
  materials: string[];
  instruments: string[];
  duration: { value: number; unit: 'minutes' | 'hours' | 'days' | 'weeks' };
  conditions: string;
  producesMeasurements: string[];
  safetyNote?: string;
  confirmation: ProtocolConfirmationKind;
  dependsOn: string[];
}

export interface ProtocolVariableView {
  name: string;
  role: ProtocolVariableRole;
  method: string;
  unit?: string;
  valueType: ProtocolValueType;
  timepoints: string[];
}

export interface ProtocolSpecView {
  id: string;
  runId: string;
  planId: string;
  planHash: string;
  hypothesisIds: string[];
  title: string;
  objective: string;
  paradigm: ResearchParadigm;
  setting: string;
  arms: ProtocolArmView[];
  sampling: {
    unitLabel: string;
    plannedN: number;
    minN?: number;
    blinding: 'open' | 'single' | 'double';
  };
  allocation:
    | { scheme: 'none'; rationale: string }
    | { scheme: 'complete_randomization' | 'blocked'; seed: number; sequence: Array<{ unitIndex: number; arm: string }> };
  steps: ProtocolStepView[];
  variables: ProtocolVariableView[];
  ethics: {
    requiresApproval: boolean;
    approvalBody?: string;
    consentRequired: boolean;
  };
  draftNotes: string[];
  frozenAt?: string;
}

export interface ProtocolMeasurementEntryView {
  variableName: string;
  timepoint?: string;
  value: number | string;
  qcPassed: boolean;
  qcDetail?: string;
  at: string;
  stepId?: string;
}

export interface ProtocolExecutionView {
  id: string;
  protocolId: string;
  status: ProtocolStatus;
  startedAt?: string;
  endedAt?: string;
  measurements: ProtocolMeasurementEntryView[];
  approvals: Array<{ approvalBody: string; approvalId: string; approvedBy: string; at: string }>;
  deviations: Array<{ id: string; at: string; stepId?: string; what: string; why: string; consequence: string }>;
}

export interface CollectionFormFieldView {
  variableName: string;
  role: ProtocolVariableRole;
  valueType: ProtocolValueType;
  unit?: string;
  timepoints: string[];
  qcSummary: string;
}

export interface ProtocolStateView {
  protocol: ProtocolSpecView;
  execution: ProtocolExecutionView | null;
  stepStates: Record<string, ProtocolStepState>;
  collectionForm: { fields: CollectionFormFieldView[] };
  outcomeFeedbackPublished: boolean;
}

export interface RecordProtocolEventInput {
  at?: string;
  actor: string;
  kind: ProtocolRecordKind;
  stepId?: string;
  note?: string;
  measurement?: { variableName: string; unitIndex?: number; timepoint?: string; value: number | string };
  deviation?: { what: string; why: string; consequence: string };
  approval?: { approvalBody: string; approvalId: string; approvedBy: string };
  publishOutcome?: boolean;
}

export interface RecordProtocolEventResult {
  protocolId: string;
  executionId: string;
  status: ProtocolStatus;
  stepStates: Record<string, ProtocolStepState>;
  outcomeFeedbackPublished: boolean;
}

/** Server contract: GET /api/v1/runs/:id/protocol returns protocol-ops' ProtocolStateView (404 when none registered). */
export const getProtocolState = (runId: string, signal?: AbortSignal): Promise<ProtocolStateView> =>
  api.getJson(`/api/v1/runs/${runId}/protocol`, signal) as Promise<ProtocolStateView>;

/** Server contract: POST /api/v1/runs/:id/protocol/records returns RecordProtocolEventResult (409 on state conflicts). */
export const recordProtocolEvent = (
  runId: string,
  body: RecordProtocolEventInput,
  signal?: AbortSignal,
): Promise<RecordProtocolEventResult> =>
  api.post(`/api/v1/runs/${runId}/protocol/records`, body, signal) as Promise<RecordProtocolEventResult>;

/**
 * Form-input coercion: the collection form yields raw strings; the domain's
 * value-type check demands a real number for numeric variables — coerce here
 * so the researcher gets an immediate local verdict instead of a 409
 * round-trip after typing.
 */
export type CoercedMeasurement =
  | { ok: true; value: number | string }
  | { ok: false; error: 'empty' | 'not_numeric' };

export const coerceMeasurementInput = (valueType: ProtocolValueType, raw: string): CoercedMeasurement => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, error: 'empty' };
  if (valueType === 'numeric') {
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return { ok: false, error: 'not_numeric' };
    return { ok: true, value: n };
  }
  return { ok: true, value: trimmed };
};
