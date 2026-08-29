import { z } from 'zod';
import { HypothesisId, PlanId, ProtocolExecutionId, ProtocolId, RunId, TaskId, newId } from './ids.js';
import type { ResearchPlan } from './plan.js';
import type { FeedbackSignal } from './feedback.js';

/**
 * Research protocol layer — paradigm-honest execution for work the software
 * cannot run itself (convergence goal 2026-08-29).
 *
 * Wet-lab, field, human-subjects, engineering, archive and theoretical legs of
 * a research plan were previously represented only by an honest execute-stage
 * SKIP ("tabular: …; literature-pool: …"). This module turns that dead end
 * into the artifact a researcher can actually work from:
 *
 *  - ProtocolSpec: the PREREGISTERED operationalization (materials, instruments,
 *    sampling with a code-committed allocation sequence, step schedule with
 *    human-confirmation requirements, measurement variables with declarative
 *    QC, ethics gates, stop conditions), frozen against the plan hash.
 *  - ProtocolExecution: the append-only ledger of what really happened. Every
 *    state change originates from a HUMAN-recorded event; the software never
 *    advances, completes or fabricates execution.
 *
 * Truth rules (workspace constitution §2/§7):
 *  - the MODEL may propose inside a closed declarative space; deterministic
 *    code owns ids, seeds, allocation sequences, form derivation and every
 *    validation verdict;
 *  - physical work is PENDING HUMAN ACTION — execution status never claims
 *    machine execution;
 *  - recorded measurements are data with QC verdicts, never hypothesis
 *    verdicts (StatReport semantics stay with the experiment subsystem);
 *  - protocol outcomes re-enter the causal loop as FeedbackSignals
 *    (source 'experiment'); Revision stays the only causal mutation path.
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * Execution modality — NOT a discipline taxonomy. It selects what the protocol
 * must make explicit (consent for human_subjects, hazards for bench,
 * calibration for engineering) so different research paradigms walk different
 * paths over one shared object model instead of being forced into the
 * computational template.
 */
export const ResearchParadigm = z.enum([
  'bench',          // wet lab / materials / chemistry bench work
  'field',          // field observation, deployment, ecology, site work
  'human_subjects', // surveys, interviews, clinical, psychological studies
  'engineering',    // physical test rigs, prototypes, hardware characterization
  'theory',         // derivations, proofs, formal analyses executed by humans/CAS
  'archive',        // records, registries, specimens outside machine reach
  'mixed',
]);
export type ResearchParadigm = z.infer<typeof ResearchParadigm>;

export const ProtocolMaterialSpec = z.object({
  name: z.string().min(1).max(120),
  /** Free-form quantity with unit ("5 mg", "1 L", "12 coverslips"). */
  quantity: z.string().min(1).max(80),
  /** Grade/purity/catalog reference when it matters for reproducibility. */
  specification: z.string().max(300).optional(),
  hazardClass: z.enum(['none', 'irritant', 'toxic', 'flammable', 'biological', 'unknown']).default('unknown'),
});
export type ProtocolMaterialSpec = z.infer<typeof ProtocolMaterialSpec>;

export const ProtocolInstrumentSpec = z.object({
  name: z.string().min(1).max(120),
  purpose: z.string().min(1).max(300),
  /** Calibration/verification requirement stated BEFORE execution starts. */
  calibrationRequirement: z.string().max(300).optional(),
  /** Preset settings/parameters committed at registration. */
  settings: z.string().max(300).optional(),
});
export type ProtocolInstrumentSpec = z.infer<typeof ProtocolInstrumentSpec>;

/** How a completed step is attested — a human-confirmation node, never a claim. */
export const ProtocolConfirmationKind = z.enum([
  'human_signed', 'instrument_record', 'photo', 'witness', 'none',
]);
export type ProtocolConfirmationKind = z.infer<typeof ProtocolConfirmationKind>;

export const ProtocolStep = z.object({
  /** Deterministic code id (ps1, ps2, …) — never model-minted. */
  id: z.string().regex(/^ps[0-9]+$/, 'must be ps<digits>'),
  /** The plan step this operationalizes (existence-checked against the plan). */
  planStepId: TaskId,
  title: z.string().min(3).max(160),
  /** Imperative action text: what is physically done, concretely enough to follow. */
  action: z.string().min(10).max(2000),
  actor: z.enum(['researcher', 'technician', 'instrument', 'external_service', 'participant']).default('researcher'),
  materials: z.array(z.string().min(1).max(120)).max(24).default([]),
  instruments: z.array(z.string().min(1).max(120)).max(16).default([]),
  duration: z.object({
    value: z.number().positive().max(100000),
    unit: z.enum(['minutes', 'hours', 'days', 'weeks']),
  }),
  /** Environmental/operational conditions that must hold (temp, light, sterility…). */
  conditions: z.string().max(300).default(''),
  /** Measurement variable names this step is expected to produce. */
  producesMeasurements: z.array(z.string().min(1).max(120)).max(24).default([]),
  safetyNote: z.string().max(500).optional(),
  confirmation: ProtocolConfirmationKind.default('human_signed'),
  dependsOn: z.array(z.string().regex(/^ps[0-9]+$/, 'must be ps<digits>')).default([]),
});
export type ProtocolStep = z.infer<typeof ProtocolStep>;

export const ProtocolMeasurementVariable = z.object({
  name: z.string().min(1).max(120),
  role: z.enum(['independent', 'dependent', 'control', 'covariate', 'context']),
  /** How it is measured (instrument + procedure reference). */
  method: z.string().min(3).max(500),
  unit: z.string().max(60).optional(),
  valueType: z.enum(['numeric', 'categorical', 'ordinal', 'text', 'date', 'image', 'other']),
  /** When it is captured ("baseline", "after 200 cycles", "at each visit"). */
  timepoints: z.array(z.string().min(1).max(120)).min(1).max(12),
  qcRule: z.lazy((): z.ZodType<ProtocolQcRule> => ProtocolQcRule).optional(),
});
export type ProtocolMeasurementVariable = z.infer<typeof ProtocolMeasurementVariable>;

/** Declarative QC checked by deterministic code at record time. */
export const ProtocolQcRule = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('range'), min: z.number().optional(), max: z.number().optional() }),
  z.object({ kind: z.literal('required') }),
  z.object({ kind: z.literal('enum'), allowed: z.array(z.string().min(1)).min(1).max(32) }),
]).superRefine((rule, ctx) => {
  if (rule.kind === 'range' && rule.min === undefined && rule.max === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'range rule needs min or max' });
  }
});
export type ProtocolQcRule = z.infer<typeof ProtocolQcRule>;

export const ProtocolArm = z.object({
  label: z.string().min(1).max(80),
  description: z.string().min(1).max(300),
  isControl: z.boolean().default(false),
});
export type ProtocolArm = z.infer<typeof ProtocolArm>;

export const ProtocolAllocationAssignment = z.object({
  unitIndex: z.number().int().nonnegative(),
  arm: z.string().min(1).max(80),
});
export type ProtocolAllocationAssignment = z.infer<typeof ProtocolAllocationAssignment>;

/**
 * Allocation v1 is deliberately restricted to schemes deterministic code can
 * honestly commit: complete randomization (even split, shuffled) and blocked
 * randomization (block size = arm count, every block contains every arm once).
 * Matched/cluster designs need pairing structure this schema cannot express
 * yet — declaring them would promise a sequence the code cannot generate.
 */
export const ProtocolAllocation = z.discriminatedUnion('scheme', [
  z.object({ scheme: z.literal('none'), rationale: z.string().min(3).max(300) }),
  z.object({
    scheme: z.literal('complete_randomization'),
    seed: z.number().int().nonnegative(),
    sequence: z.array(ProtocolAllocationAssignment).min(1),
  }),
  z.object({
    scheme: z.literal('blocked'),
    blockVariable: z.string().min(1).max(120),
    seed: z.number().int().nonnegative(),
    sequence: z.array(ProtocolAllocationAssignment).min(1),
  }),
]);
export type ProtocolAllocation = z.infer<typeof ProtocolAllocation>;

export const ProtocolSamplingPlan = z.object({
  unitLabel: z.string().min(1).max(80),
  plannedN: z.number().int().min(1).max(1_000_000),
  minN: z.number().int().min(1).max(1_000_000).optional(),
  eligibilityIncludes: z.array(z.string().min(1).max(300)).default([]),
  eligibilityExcludes: z.array(z.string().min(1).max(300)).default([]),
  blinding: z.enum(['open', 'single', 'double']).default('open'),
  biologicalReplicates: z.number().int().min(1).max(1000).optional(),
  technicalReplicates: z.number().int().min(1).max(1000).optional(),
});
export type ProtocolSamplingPlan = z.infer<typeof ProtocolSamplingPlan>;

export const ProtocolEthics = z.object({
  requiresApproval: z.boolean(),
  approvalBody: z.string().min(1).max(200).optional(),
  consentRequired: z.boolean(),
  riskLevel: z.enum(['minimal', 'more_than_minimal', 'unknown']).default('unknown'),
  notes: z.array(z.string().min(1).max(500)).default([]),
});
export type ProtocolEthics = z.infer<typeof ProtocolEthics>;

export const ProtocolStopCondition = z.object({
  kind: z.enum(['safety', 'futility', 'resource', 'scientific', 'completion']),
  detail: z.string().min(3).max(500),
});
export type ProtocolStopCondition = z.infer<typeof ProtocolStopCondition>;

// ---------------------------------------------------------------------------
// ProtocolSpec — the frozen preregistration
// ---------------------------------------------------------------------------

export const ProtocolSpec = z.object({
  id: ProtocolId,
  runId: RunId,
  planId: PlanId,
  /** Hash of the plan this protocol operationalizes — re-freeze detection. */
  planHash: z.string().length(64),
  hypothesisIds: z.array(HypothesisId).min(1),
  title: z.string().min(3).max(200),
  objective: z.string().min(10).max(2000),
  paradigm: ResearchParadigm,
  /** Where the work physically happens (bench, site, clinic, desk). */
  setting: z.string().min(3).max(300),
  arms: z.array(ProtocolArm).min(1).max(6),
  materials: z.array(ProtocolMaterialSpec).max(48).default([]),
  instruments: z.array(ProtocolInstrumentSpec).max(16).default([]),
  sampling: ProtocolSamplingPlan,
  allocation: ProtocolAllocation,
  steps: z.array(ProtocolStep).min(1).max(32),
  variables: z.array(ProtocolMeasurementVariable).min(1).max(32),
  ethics: ProtocolEthics,
  stopConditions: z.array(ProtocolStopCondition).min(1).max(8),
  /** Disclosed deterministic adjustments made to the model draft (never silent). */
  draftNotes: z.array(z.string().min(1).max(500)).default([]),
  status: z.enum(['draft', 'registered']).default('draft'),
  createdAt: z.string().datetime(),
  frozenAt: z.string().datetime().optional(),
})
  .superRefine((p, ctx) => {
    const issue = (message: string): void => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    const armLabels = new Set(p.arms.map((a) => a.label));
    if (armLabels.size !== p.arms.length) issue('arm labels must be unique');
    const varNames = new Set(p.variables.map((v) => v.name));
    if (varNames.size !== p.variables.length) issue('measurement variable names must be unique');
    const materialNames = new Set(p.materials.map((m) => m.name));
    const instrumentNames = new Set(p.instruments.map((i) => i.name));
    const stepIds = new Set(p.steps.map((s) => s.id));
    if (stepIds.size !== p.steps.length) issue('step ids must be unique');
    for (const s of p.steps) {
      for (const dep of s.dependsOn) {
        if (dep === s.id) issue(`step ${s.id} depends on itself`);
        else if (!stepIds.has(dep)) issue(`step ${s.id} dependsOn unknown step ${dep}`);
      }
      for (const m of s.materials) if (!materialNames.has(m)) issue(`step ${s.id} references undeclared material '${m}'`);
      for (const i of s.instruments) if (!instrumentNames.has(i)) issue(`step ${s.id} references undeclared instrument '${i}'`);
      for (const v of s.producesMeasurements) if (!varNames.has(v)) issue(`step ${s.id} produces unknown measurement '${v}'`);
    }
    // cycle check (deterministic DFS, campaign.ts pattern)
    const state = new Map<string, number>();
    const visit = (id: string): boolean => {
      const s = state.get(id);
      if (s === 2) return true;
      if (s === 1) return false;
      state.set(id, 1);
      const step = p.steps.find((x) => x.id === id);
      if (step === undefined) return false;
      for (const d of step.dependsOn) if (!visit(d)) return false;
      state.set(id, 2);
      return true;
    };
    for (const s of p.steps) {
      if (!visit(s.id)) {
        issue(`step dependencies must be acyclic (cycle through ${s.id})`);
        break;
      }
    }
    // allocation consistency: randomized schemes need >=2 arms, a full-plannedN
    // sequence, and assignments only to declared arms.
    if (p.allocation.scheme !== 'none') {
      if (p.arms.length < 2) issue('randomized allocation requires at least 2 arms');
      if (p.allocation.sequence.length !== p.sampling.plannedN) {
        issue(`allocation sequence length (${p.allocation.sequence.length}) must equal plannedN (${p.sampling.plannedN})`);
      }
      const seen = new Set<number>();
      for (const a of p.allocation.sequence) {
        if (!armLabels.has(a.arm)) issue(`allocation assigns unknown arm '${a.arm}'`);
        if (seen.has(a.unitIndex)) issue(`unit ${a.unitIndex} allocated twice`);
        seen.add(a.unitIndex);
      }
    }
    // ethics honesty: human-subjects work must declare consent; an approval
    // requirement must name the body the researcher answers to.
    if (p.paradigm === 'human_subjects' && !p.ethics.consentRequired) {
      issue('human_subjects protocols must declare consentRequired=true');
    }
    if (p.ethics.requiresApproval && p.ethics.approvalBody === undefined) {
      issue('requiresApproval=true must name the approval body');
    }
  });
export type ProtocolSpec = z.infer<typeof ProtocolSpec>;

// ---------------------------------------------------------------------------
// ProtocolExecution — the append-only human-attested ledger
// ---------------------------------------------------------------------------

export const ProtocolStatus = z.enum([
  'awaiting_approval', // ethics gate open — no execution records accepted
  'awaiting_human',    // registered, no work recorded yet
  'in_progress',
  'paused',
  'completed',
  'aborted',
]);
export type ProtocolStatus = z.infer<typeof ProtocolStatus>;

export const ProtocolMeasurementEntry = z.object({
  variableName: z.string().min(1).max(120),
  unitIndex: z.number().int().nonnegative().optional(),
  timepoint: z.string().max(120).optional(),
  value: z.union([z.number(), z.string().min(1).max(2000)]),
  qcPassed: z.boolean(),
  qcDetail: z.string().max(300).optional(),
  at: z.string().datetime(),
  stepId: z.string().optional(),
});
export type ProtocolMeasurementEntry = z.infer<typeof ProtocolMeasurementEntry>;

export const ProtocolApprovalEntry = z.object({
  approvalBody: z.string().min(1).max(200),
  approvalId: z.string().min(1).max(200),
  approvedBy: z.string().min(1).max(120),
  at: z.string().datetime(),
});
export type ProtocolApprovalEntry = z.infer<typeof ProtocolApprovalEntry>;

export const ProtocolDeviationEntry = z.object({
  id: z.string().min(3).max(40),
  at: z.string().datetime(),
  stepId: z.string().optional(),
  what: z.string().min(3).max(1000),
  why: z.string().min(3).max(1000),
  consequence: z.string().min(3).max(1000),
});
export type ProtocolDeviationEntry = z.infer<typeof ProtocolDeviationEntry>;

export const ProtocolRecordKind = z.enum([
  'approval', 'step_started', 'step_completed', 'measurement', 'deviation', 'block', 'unblock', 'abort',
]);
export type ProtocolRecordKind = z.infer<typeof ProtocolRecordKind>;

export const ProtocolRecord = z.object({
  at: z.string().datetime(),
  stepId: z.string().optional(),
  /** Who attests the record — always a named human/operator or instrument label. */
  actor: z.string().min(1).max(120),
  kind: ProtocolRecordKind,
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
  note: z.string().max(2000).optional(),
})
  .superRefine((r, ctx) => {
    const issue = (message: string): void => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if (r.kind === 'measurement' && r.measurement === undefined) issue('measurement record requires measurement payload');
    if (r.kind !== 'measurement' && r.measurement !== undefined) issue('measurement payload only valid on measurement records');
    if (r.kind === 'deviation' && r.deviation === undefined) issue('deviation record requires deviation payload');
    if (r.kind !== 'deviation' && r.deviation !== undefined) issue('deviation payload only valid on deviation records');
    if (r.kind === 'approval' && r.approval === undefined) issue('approval record requires approval payload');
    if (r.kind !== 'approval' && r.approval !== undefined) issue('approval payload only valid on approval records');
    if ((r.kind === 'step_started' || r.kind === 'step_completed') && r.stepId === undefined) issue(`${r.kind} requires stepId`);
  });
export type ProtocolRecord = z.infer<typeof ProtocolRecord>;

export const ProtocolExecution = z.object({
  id: ProtocolExecutionId,
  protocolId: ProtocolId,
  runId: RunId,
  status: ProtocolStatus,
  startedAt: z.string().datetime().optional(),
  endedAt: z.string().datetime().optional(),
  records: z.array(ProtocolRecord).default([]),
  measurements: z.array(ProtocolMeasurementEntry).default([]),
  approvals: z.array(ProtocolApprovalEntry).default([]),
  deviations: z.array(ProtocolDeviationEntry).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ProtocolExecution = z.infer<typeof ProtocolExecution>;

// ---------------------------------------------------------------------------
// Deterministic helpers (zero LLM)
// ---------------------------------------------------------------------------

/** Deterministic PRNG (mulberry32) — the only randomness source in the layer. */
const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Fisher–Yates shuffle over 0..n-1 driven by the seeded PRNG. */
const shuffledIndices = (n: number, rng: () => number): number[] => {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = idx[i]!;
    idx[i] = idx[j]!;
    idx[j] = tmp;
  }
  return idx;
};

/** Seed derived from the frozen plan hash — same plan, same sequence, forever. */
export const seedFromPlanHash = (planHash: string): number => Number.parseInt(planHash.slice(0, 8), 16) >>> 0;

export interface AllocationAssignment {
  unitIndex: number;
  arm: string;
}

/**
 * Commit the randomization sequence: complete_randomization assigns an even
 * split in shuffled order; blocked shuffles within blocks of arm-count size so
 * every block contains every arm exactly once (season/site drift resistance).
 * Deterministic in (plannedN, arms, seed) — regenerated, never re-randomized.
 */
export const generateAllocationSequence = (
  plannedN: number,
  armLabels: readonly string[],
  seed: number,
  scheme: 'complete_randomization' | 'blocked',
): AllocationAssignment[] => {
  if (armLabels.length < 2) throw new Error('randomized allocation requires >= 2 arms');
  if (plannedN < armLabels.length) throw new Error('plannedN must cover at least one full block');
  const rng = mulberry32(seed);
  const assignments: AllocationAssignment[] = [];
  if (scheme === 'complete_randomization') {
    const order = shuffledIndices(plannedN, rng);
    // even split: arm i receives units whose shuffled rank mod armCount === i
    for (let rank = 0; rank < order.length; rank += 1) {
      assignments.push({ unitIndex: order[rank]!, arm: armLabels[rank % armLabels.length]! });
    }
    return assignments;
  }
  const blockSize = armLabels.length;
  const fullBlocks = Math.floor(plannedN / blockSize);
  const remainder = plannedN - fullBlocks * blockSize;
  let unit = 0;
  for (let b = 0; b < fullBlocks; b += 1) {
    const order = shuffledIndices(blockSize, rng);
    for (let rank = 0; rank < blockSize; rank += 1) {
      assignments.push({ unitIndex: unit, arm: armLabels[order[rank]!]! });
      unit += 1;
    }
  }
  if (remainder > 0) {
    // final partial block: shuffle the full arm set and take the remainder —
    // balance degrades honestly rather than by a biased fixed prefix.
    const order = shuffledIndices(blockSize, rng);
    for (let rank = 0; rank < remainder; rank += 1) {
      assignments.push({ unitIndex: unit, arm: armLabels[order[rank]!]! });
      unit += 1;
    }
  }
  return assignments;
};

// ---------------------------------------------------------------------------
// Collection form derivation (deterministic projection of the variables)
// ---------------------------------------------------------------------------

export interface CollectionFormField {
  variableName: string;
  role: ProtocolMeasurementVariable['role'];
  valueType: ProtocolMeasurementVariable['valueType'];
  unit: string | undefined;
  timepoints: string[];
  qcSummary: string;
}

export interface CollectionForm {
  fields: CollectionFormField[];
}

const qcSummaryOf = (rule: ProtocolQcRule | undefined): string => {
  if (rule === undefined) return 'none declared';
  if (rule.kind === 'required') return 'required (non-empty)';
  if (rule.kind === 'enum') return `one of: ${rule.allowed.join(' | ')}`;
  const lo = rule.min !== undefined ? String(rule.min) : '-inf';
  const hi = rule.max !== undefined ? String(rule.max) : '+inf';
  return `range [${lo}, ${hi}]`;
};

/** The data-collection form a researcher fills in the field/lab — derived, never drafted. */
export const buildCollectionForm = (variables: readonly ProtocolMeasurementVariable[]): CollectionForm => ({
  fields: variables.map((v) => ({
    variableName: v.name,
    role: v.role,
    valueType: v.valueType,
    unit: v.unit,
    timepoints: [...v.timepoints],
    qcSummary: qcSummaryOf(v.qcRule),
  })),
});

// ---------------------------------------------------------------------------
// Execution state machine (deterministic, human-attested transitions only)
// ---------------------------------------------------------------------------

export type ProtocolStepState = 'pending' | 'in_progress' | 'done';

/** Step states derived from the ledger — the projection, never stored separately. */
export const protocolStepStates = (
  protocol: ProtocolSpec,
  execution: ProtocolExecution,
): Record<string, ProtocolStepState> => {
  const states: Record<string, ProtocolStepState> = {};
  for (const s of protocol.steps) states[s.id] = 'pending';
  for (const r of execution.records) {
    if (r.kind === 'step_started' && r.stepId !== undefined && states[r.stepId] === 'pending') states[r.stepId] = 'in_progress';
    if (r.kind === 'step_completed' && r.stepId !== undefined && states[r.stepId] === 'in_progress') states[r.stepId] = 'done';
  }
  return states;
};

const valueMatchesType = (
  valueType: ProtocolMeasurementVariable['valueType'],
  value: number | string,
): boolean => {
  switch (valueType) {
    case 'numeric':
      return typeof value === 'number' && Number.isFinite(value);
    case 'date':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value);
    default:
      return typeof value === 'string' && value.length > 0;
  }
};

/**
 * Declarative QC verdict: a failing value is RECORDED with its verdict — QC
 * flags data quality; it never silently drops the researcher's observation.
 */
const checkMeasurementQc = (
  variable: ProtocolMeasurementVariable,
  value: number | string,
): { passed: boolean; detail?: string } => {
  const rule = variable.qcRule;
  if (rule === undefined) return { passed: true };
  if (rule.kind === 'required') {
    const empty = typeof value === 'string' ? value.trim().length === 0 : Number.isNaN(value);
    return empty ? { passed: false, detail: 'required value is empty' } : { passed: true };
  }
  if (rule.kind === 'enum') {
    const passed = typeof value === 'string' && rule.allowed.includes(value);
    return { passed, detail: passed ? undefined : 'value not in allowed set' };
  }
  if (typeof value !== 'number') {
    return { passed: false, detail: 'range rule requires a numeric value' };
  }
  const tooLow = rule.min !== undefined && value < rule.min;
  const tooHigh = rule.max !== undefined && value > rule.max;
  if (!tooLow && !tooHigh) return { passed: true };
  return { passed: false, detail: `outside declared range [${rule.min ?? '-inf'}, ${rule.max ?? '+inf'}]` };
};

export const initialExecutionStatus = (protocol: ProtocolSpec): ProtocolStatus =>
  protocol.ethics.requiresApproval ? 'awaiting_approval' : 'awaiting_human';

export const newProtocolExecution = (protocol: ProtocolSpec, id: string, at: string): ProtocolExecution =>
  ProtocolExecution.parse({
    id,
    protocolId: protocol.id,
    runId: protocol.runId,
    status: initialExecutionStatus(protocol),
    records: [],
    measurements: [],
    approvals: [],
    deviations: [],
    createdAt: at,
    updatedAt: at,
  });

export type ProtocolRecordOutcome =
  | { ok: true; execution: ProtocolExecution }
  | { ok: false; error: string };

const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['completed', 'aborted']);

/**
 * Apply one human-attested record to the ledger. Deterministic validation:
 * ethics gate (fail-closed), dependency order, per-state transitions, value
 * typing and QC. Returns a NEW execution object (immutable append) or an error
 * — never a silent mutation, never an invented transition.
 */
export const applyProtocolRecord = (
  protocol: ProtocolSpec,
  execution: ProtocolExecution,
  record: ProtocolRecord,
): ProtocolRecordOutcome => {
  if (TERMINAL_STATUSES.has(execution.status)) {
    return { ok: false, error: `protocol execution is terminal (${execution.status}) — no further records accepted` };
  }
  const parsed = ProtocolRecord.safeParse(record);
  if (!parsed.success) {
    return { ok: false, error: `invalid record: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).slice(0, 3).join('; ')}` };
  }
  const r = parsed.data;
  const ethicsOpen = protocol.ethics.requiresApproval && execution.approvals.length === 0;
  if (ethicsOpen && r.kind !== 'approval' && r.kind !== 'abort' && r.kind !== 'deviation') {
    return { ok: false, error: 'ethics approval pending — execution records are blocked (fail-closed); record the approval first' };
  }
  const states = protocolStepStates(protocol, execution);
  const next: ProtocolExecution = { ...execution, records: [...execution.records, r], updatedAt: r.at };
  switch (r.kind) {
    case 'approval': {
      if (r.approval === undefined) return { ok: false, error: 'approval payload missing' };
      if (!protocol.ethics.requiresApproval) {
        return { ok: false, error: 'protocol does not declare a required approval — nothing to approve' };
      }
      next.approvals = [...execution.approvals, { ...r.approval, at: r.at }];
      if (execution.status === 'awaiting_approval') next.status = 'awaiting_human';
      break;
    }
    case 'step_started': {
      const step = protocol.steps.find((s) => s.id === r.stepId);
      if (step === undefined) return { ok: false, error: `unknown step '${r.stepId ?? ''}'` };
      if (states[step.id] !== 'pending') return { ok: false, error: `step ${step.id} is ${states[step.id]} — cannot start again` };
      for (const dep of step.dependsOn) {
        if (states[dep] !== 'done') return { ok: false, error: `step ${step.id} depends on ${dep} (${states[dep]}) — dependency order enforced` };
      }
      if (next.startedAt === undefined) next.startedAt = r.at;
      next.status = 'in_progress';
      break;
    }
    case 'step_completed': {
      const step = protocol.steps.find((s) => s.id === r.stepId);
      if (step === undefined) return { ok: false, error: `unknown step '${r.stepId ?? ''}'` };
      if (states[step.id] !== 'in_progress') return { ok: false, error: `step ${step.id} is ${states[step.id]} — completion requires an open start` };
      const after: Record<string, ProtocolStepState> = { ...states, [step.id]: 'done' };
      if (protocol.steps.every((s) => after[s.id] === 'done')) {
        next.status = 'completed';
        next.endedAt = r.at;
      }
      break;
    }
    case 'measurement': {
      if (r.measurement === undefined) return { ok: false, error: 'measurement payload missing' };
      const m = r.measurement;
      const variable = protocol.variables.find((v) => v.name === m.variableName);
      if (variable === undefined) return { ok: false, error: `unknown measurement variable '${m.variableName}'` };
      if (!valueMatchesType(variable.valueType, m.value)) {
        return { ok: false, error: `value for '${m.variableName}' does not match declared type ${variable.valueType}` };
      }
      const qc = checkMeasurementQc(variable, m.value);
      next.measurements = [...execution.measurements, {
        variableName: m.variableName,
        ...(m.unitIndex !== undefined ? { unitIndex: m.unitIndex } : {}),
        ...(m.timepoint !== undefined ? { timepoint: m.timepoint } : {}),
        value: m.value,
        qcPassed: qc.passed,
        ...(qc.detail !== undefined ? { qcDetail: qc.detail } : {}),
        at: r.at,
        ...(r.stepId !== undefined ? { stepId: r.stepId } : {}),
      }];
      if (execution.status === 'awaiting_human') next.status = 'in_progress';
      break;
    }
    case 'deviation': {
      if (r.deviation === undefined) return { ok: false, error: 'deviation payload missing' };
      next.deviations = [...execution.deviations, {
        id: newId('pdd'),
        at: r.at,
        ...(r.stepId !== undefined ? { stepId: r.stepId } : {}),
        what: r.deviation.what,
        why: r.deviation.why,
        consequence: r.deviation.consequence,
      }];
      break;
    }
    case 'block': {
      next.status = 'paused';
      break;
    }
    case 'unblock': {
      next.status = execution.startedAt !== undefined ? 'in_progress' : 'awaiting_human';
      break;
    }
    case 'abort': {
      next.status = 'aborted';
      next.endedAt = r.at;
      break;
    }
  }
  return { ok: true, execution: ProtocolExecution.parse(next) };
};

// ---------------------------------------------------------------------------
// Plan cross-validation (deterministic)
// ---------------------------------------------------------------------------

export interface ProtocolPlanValidation {
  passed: boolean;
  errors: string[];
  advisories: string[];
}

/**
 * Cross-object validation the schema cannot express: the protocol must bind
 * THIS plan's steps and hypotheses; coverage gaps (plan variables with no
 * measurement variable, plan controls with no visible control arm) are
 * ADVISORIES — surfaced, never silently dropped, never hard failures.
 */
export const validateProtocolAgainstPlan = (protocol: ProtocolSpec, plan: ResearchPlan): ProtocolPlanValidation => {
  const errors: string[] = [];
  const advisories: string[] = [];
  if (protocol.planId !== plan.id) {
    errors.push(`protocol binds plan ${protocol.planId}, validation ran against ${plan.id}`);
  }
  const planHypIds = new Set(plan.hypothesisIds);
  for (const h of protocol.hypothesisIds) {
    if (!planHypIds.has(h)) errors.push(`hypothesis ${h} not part of the plan`);
  }
  const planStepIds = new Set(plan.steps.map((s) => s.id));
  for (const s of protocol.steps) {
    if (!planStepIds.has(s.planStepId)) errors.push(`step ${s.id} references unknown plan step ${s.planStepId}`);
  }
  const varNames = new Set(protocol.variables.map((v) => v.name));
  for (const pv of plan.variables) {
    if (!varNames.has(pv)) advisories.push(`plan variable '${pv}' has no matching protocol measurement variable`);
  }
  const lower = (s: string): string => s.toLowerCase();
  const controlArms = protocol.arms.filter((a) => a.isControl);
  for (const c of plan.controls) {
    const represented = controlArms.some(
      (a) => lower(a.label).includes(lower(c).slice(0, 12)) || lower(c).includes(lower(a.label).slice(0, 12)),
    );
    if (!represented) {
      advisories.push(`plan control '${c}' not visibly represented among control arms (${controlArms.map((a) => a.label).join(', ') || 'none'})`);
    }
  }
  return { passed: errors.length === 0, errors, advisories };
};

// ---------------------------------------------------------------------------
// Feedback bridge — protocol outcomes re-enter the causal loop
// ---------------------------------------------------------------------------

/**
 * Project the ledger into a FeedbackSignal body (source 'experiment'): the
 * physical world's evidence enters the SAME feedback -> revise chain every
 * other executed result uses. The caller mints id/receivedAt.
 */
export const protocolOutcomeFeedback = (
  protocol: ProtocolSpec,
  execution: ProtocolExecution,
): Omit<FeedbackSignal, 'id' | 'receivedAt'> => {
  const states = protocolStepStates(protocol, execution);
  const done = Object.values(states).filter((s) => s === 'done').length;
  const qcFailures = execution.measurements.filter((m) => !m.qcPassed).length;
  const content =
    `Protocol ${protocol.id} (${protocol.paradigm}, ${protocol.title}) execution ledger: ` +
    `${done}/${protocol.steps.length} steps completed, ${execution.measurements.length} measurement(s) recorded ` +
    `(${qcFailures} failed QC), ${execution.deviations.length} deviation(s), status ${execution.status}.`;
  return {
    runId: protocol.runId,
    source: 'experiment',
    content,
    structured: {
      protocolId: protocol.id,
      executionId: execution.id,
      status: execution.status,
      stepsDone: done,
      stepsTotal: protocol.steps.length,
      measurements: execution.measurements.length,
      qcFailures,
      deviations: execution.deviations.length,
    },
    target: { kind: 'protocol', id: protocol.id },
    provenance: `protocol-execution:${execution.id}`,
  };
};
