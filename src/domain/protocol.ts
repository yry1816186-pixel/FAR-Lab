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
 * must make explicit (randomization/blinding for human_subjects, hazards for
 * bench, calibration for engineering) so different research paradigms walk
 * different paths over one shared object model.
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

export const MeasurementRole = z.enum(['independent', 'dependent', 'control', 'covariate', 'context']);
export type MeasurementRole = z.infer<typeof MeasurementRole>;

export const MeasurementValueType = z.enum(['numeric', 'categorical', 'ordinal', 'text', 'date', 'image', 'other']);
export type MeasurementValueType = z.infer<typeof MeasurementValueType>;

/** Declarative QC checked by deterministic code at record time. */
export const ProtocolQcRule = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('range'), min: z.number().optional(), max: z.number().optional() }),
    .refine((r) => r.min !== undefined || r.max !== undefined, { message: 'range rule needs min or max' }),
  z.object({ kind: z.literal('required') }),
  z.object({ kind: z.literal('enum'), allowed: z.array(z.string().min(1)).min(1).max(32) }),
]);
export type ProtocolQcRule = z.infer<typeof ProtocolQcRule>;

export const ProtocolMeasurementVariable = z.object({
  name: z.string().min(1).max(120),
  role: MeasurementRole,
  /** How it is measured (instrument + procedure reference). */
  method: z.string().min(3).max(500),
  unit: z.string().max(60).optional(),
  valueType: MeasurementValueType,
  /** When it is captured ("baseline", "after 200 cycles", "at each visit"). */
  timepoints: z.array(z.string().min(1).max(120)).min(1).max(12),
  qcRule: ProtocolQcRule.optional(),
});
export type ProtocolMeasurementVariable = z.infer<typeof ProtocolMeasurementVariable>;

export const ProtocolArm = z.object({
  label: z.string().min(1).max(80),
  description: z.string().min(1).max(300),
  isControl: z.boolean().default(false),
});
export type ProtocolArm = z.infer<typeof ProtocolArm>;

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
    sequence: z.array(z.object({ unitIndex: z.number().int().nonnegative(), arm: z.string().min(1).max(80) })).min(1),
  }),
  z.object({
    scheme: z.literal('blocked'),
    blockVariable: z.string().min(1).max(120),
    seed: z.number().int().nonnegative(),
    sequence: z.array(z.object({ unitIndex: z.number().int().nonnegative(), arm: z.string().min(1).max(80) })).min(1),
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
    for (const s of p.steps) if (!visit(s.id)) { issue(`step dependencies must be acyclic (cycle through ${s.id})`); break; }
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
  deviation: z.object({ what: z.string().min(3).max(1000), why: z.string().min(3).max(1000), consequence: z.string().min(3).max(1000) }).optional(),
  approval: ProtocolApprovalEntry.omit({ at: true }).optional(),
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

export interface AllocationAssignment { unitIndex: number; arm: string }

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
      assignments.push({ unitIndex: unit++, arm: armLabels[order[rank]!]! });
    }
  }
  if (remainder > 0) {
    // final partial block: shuffle the full arm set and take the remainder —
    // balance degrades honestly rather than by a biased fixed prefix.
    const order = shuffledIndices(blockSize, rng);
    for (let rank = 0; rank < remainder; rank += 1) {
      assignments.push({ unitIndex: unit++, arm: armLabels[order[rank]!]! });
    }
  }
  return assignments;
};

// ---------------------------------------------------------------------------
// Collection form derivation (deterministic projection of the variables)
// ---------------------------------------------------------------------------

export interface CollectionFormField {
  variableName: string;
  role: MeasurementRole extends z.ZodType<infer R> ? never : string;
}
