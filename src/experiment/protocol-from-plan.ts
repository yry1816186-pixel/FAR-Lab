import { z } from 'zod';
import {
  ProtocolSpec,
  generateAllocationSequence,
  newId,
  seedFromPlanHash,
  validateProtocolAgainstPlan,
} from '../domain/index.js';
import type { ProtocolSpec as ProtocolSpecType } from '../domain/protocol.js';
import type { ResearchPlan } from '../domain/plan.js';
import { invokeStructured, type ModelPlaneDeps } from '../pipeline/llm.js';
import { RunBudgetExhaustedError } from '../app/run-budget.js';
import { canonicalJson, canonicalSha256 } from '../shared/crypto.js';
import type { Store } from '../persistence/store.js';

/**
 * Convergence 2026-08-29 — research-plan -> ProtocolSpec drafting.
 *
 * Division of truth (constitution §7): the MODEL proposes inside a CLOSED
 * declarative space (paradigm, arms, materials, instruments, sampling,
 * steps/variables with declarative QC, ethics, stop conditions); DETERMINISTIC
 * code owns everything with authority: ids, the plan-hash freeze binding, the
 * randomization seed and sequence, step numbering/dependency remapping, the
 * consent floor for human-subjects work, allocation downgrades, and every
 * cross-object validation verdict. Adjustments the code makes to the draft are
 * disclosed in draftNotes — never silent.
 *
 * This drafter only answers the legs the computational executors cannot
 * (wet-lab, field, human subjects, engineering, archive, theory); a plan that
 * is purely tabular-ML or literature-pool is declared infeasible here with a
 * skipReason naming why.
 */

export type ProtocolDraftOutcome =
  | { kind: 'protocol'; spec: ProtocolSpecType; executionMode: 'live' | 'test' }
  | { kind: 'skip'; reason: string };

/** The freeze binding: the plan hash this protocol operationalizes. */
export const planHashOf = (plan: ResearchPlan): string =>
  plan.planHash ?? canonicalSha256(canonicalJson(plan));

/** The protocol registered for the plan's CURRENT hash (null = stale or absent). */
export const protocolForPlan = (store: Store, runId: string, plan: ResearchPlan): ProtocolSpecType | null => {
  const hash = planHashOf(plan);
  return store.listObjects('protocol', runId).find((p) => p.planId === plan.id && p.planHash === hash) ?? null;
};

const DraftOut = z.object({
  /** false = the plan has no operationalizable real-world execution legs. */
  feasible: z.boolean(),
  skipReason: z.string().min(10).optional(),
  paradigm: z.enum(['bench', 'field', 'human_subjects', 'engineering', 'theory', 'archive', 'mixed']).optional(),
  title: z.string().min(3).max(200).optional(),
  objective: z.string().min(10).max(2000).optional(),
  setting: z.string().min(3).max(300).optional(),
  arms: z.array(z.object({
    label: z.string().min(1).max(80),
    description: z.string().min(1).max(300),
    isControl: z.boolean().default(false),
  })).min(1).max(6).optional(),
  materials: z.array(z.object({
    name: z.string().min(1).max(120),
    quantity: z.string().min(1).max(80),
    specification: z.string().max(300).optional(),
    hazardClass: z.enum(['none', 'irritant', 'toxic', 'flammable', 'biological', 'unknown']).default('unknown'),
  })).max(48).default([]),
  instruments: z.array(z.object({
    name: z.string().min(1).max(120),
    purpose: z.string().min(1).max(300),
    calibrationRequirement: z.string().max(300).optional(),
    settings: z.string().max(300).optional(),
  })).max(16).default([]),
  sampling: z.object({
    unitLabel: z.string().min(1).max(80),
    plannedN: z.number().int().min(1).max(1_000_000),
    minN: z.number().int().min(1).max(1_000_000).optional(),
    eligibilityIncludes: z.array(z.string().min(1).max(300)).default([]),
    eligibilityExcludes: z.array(z.string().min(1).max(300)).default([]),
    blinding: z.enum(['open', 'single', 'double']).default('open'),
  }).optional(),
  allocation: z.object({
    scheme: z.enum(['none', 'complete_randomization', 'blocked']),
    blockVariable: z.string().min(1).max(120).optional(),
    rationale: z.string().min(3).max(300).optional(),
  }).optional(),
  steps: z.array(z.object({
    planStepId: z.string().min(1),
    title: z.string().min(3).max(160),
    action: z.string().min(10).max(2000),
    actor: z.enum(['researcher', 'technician', 'instrument', 'external_service', 'participant']).default('researcher'),
    materials: z.array(z.string().min(1).max(120)).max(24).default([]),
    instruments: z.array(z.string().min(1).max(120)).max(16).default([]),
    durationValue: z.number().positive().max(100000),
    durationUnit: z.enum(['minutes', 'hours', 'days', 'weeks']),
    conditions: z.string().max(300).default(''),
    producesMeasurements: z.array(z.string().min(1).max(120)).max(24).default([]),
    safetyNote: z.string().max(500).optional(),
    confirmation: z.enum(['human_signed', 'instrument_record', 'photo', 'witness', 'none']).default('human_signed'),
    dependsOnStepNumbers: z.array(z.number().int().positive()).max(8).default([]),
  })).min(1).max(32).optional(),
  variables: z.array(z.object({
    name: z.string().min(1).max(120),
    role: z.enum(['independent', 'dependent', 'control', 'covariate', 'context']),
    method: z.string().min(3).max(500),
    unit: z.string().max(60).optional(),
    valueType: z.enum(['numeric', 'categorical', 'ordinal', 'text', 'date', 'image', 'other']),
    timepoints: z.array(z.string().min(1).max(120)).min(1).max(12),
    qcRule: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('range'), min: z.number().optional(), max: z.number().optional() }),
      z.object({ kind: z.literal('required') }),
      z.object({ kind: z.literal('enum'), allowed: z.array(z.string().min(1)).min(1).max(32) }),
    ]).optional(),
  })).min(1).max(32).optional(),
  ethics: z.object({
    requiresApproval: z.boolean(),
    approvalBody: z.string().min(1).max(200).optional(),
    consentRequired: z.boolean(),
    riskLevel: z.enum(['minimal', 'more_than_minimal', 'unknown']).default('unknown'),
    notes: z.array(z.string().min(1).max(500)).default([]),
  }).optional(),
  stopConditions: z.array(z.object({
    kind: z.enum(['safety', 'futility', 'resource', 'scientific', 'completion']),
    detail: z.string().min(3).max(500),
  })).min(1).max(8).optional(),
}).superRefine((d, ctx) => {
  if (!d.feasible) return;
  const missing: string[] = [];
  if (d.paradigm === undefined) missing.push('paradigm');
  if (d.title === undefined) missing.push('title');
  if (d.objective === undefined) missing.push('objective');
  if (d.setting === undefined) missing.push('setting');
  if (d.arms === undefined) missing.push('arms');
  if (d.sampling === undefined) missing.push('sampling');
  if (d.steps === undefined) missing.push('steps');
  if (d.variables === undefined) missing.push('variables');
  if (d.ethics === undefined) missing.push('ethics');
  if (d.stopConditions === undefined) missing.push('stopConditions');
  if (missing.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `feasible=true requires ${missing.join(', ')}` });
  }
});

const SYSTEM_PROMPT =
  'You convert a research plan into ONE executable research-protocol draft for the real-world work the software cannot run itself, or declare it infeasible. ' +
  'Feasible ONLY when the plan contains steps that require physical, human, field, engineering, archive or theoretical execution (wet-lab procedures, field observation, human participants, physical tests, formal derivations, records/specimen retrieval). ' +
  'If every step is pure tabular ML on public datasets or pooling published effect estimates, set feasible=false with a skipReason naming that. ' +
  'Choose the paradigm that matches HOW the work is executed (bench, field, human_subjects, engineering, theory, archive, mixed). ' +
  'Steps MUST reference EXISTING planStepId values from the plan, listed exactly. dependsOnStepNumbers are 1-based positions within your steps array. ' +
  'Materials and instruments referenced by a step must be declared in the same draft, with honest quantities and calibration requirements. ' +
  'Variables must cover what the decision rules need observed, with concrete measurement methods, units, timepoints, and justifiable QC rules. ' +
  'ethics: human_subjects REQUIRES consentRequired=true; name the approval body when approval is required. ' +
  'allocation scheme none unless the design truly randomizes; a randomized scheme needs >= 2 arms. ' +
  'The deterministic layer owns ids, seeds, the committed randomization sequence and every validation verdict — do not invent them. Output JSON only.';

export const draftProtocolFromPlan = async (
  plan: ResearchPlan,
  questionText: string,
  plane: ModelPlaneDeps,
): Promise<ProtocolDraftOutcome> => {
  let draft: z.infer<typeof DraftOut>;
  let executionMode: 'live' | 'test';
  try {
    const res = await invokeStructured<z.infer<typeof DraftOut>>(plane, {
      stage: 'execute',
      purpose: 'protocol-draft',
      systemPrompt: SYSTEM_PROMPT,
      payload: {
        researchQuestion: questionText,
        objective: plan.objective,
        planSteps: plan.steps.map((s) => ({ id: s.id, title: s.title, kind: s.kind, method: s.method })),
        variables: plan.variables,
        controls: plan.controls,
        inclusionCriteria: plan.inclusionCriteria,
        exclusionCriteria: plan.exclusionCriteria,
        dataRequirements: plan.dataRequirements.map((d) => ({ name: d.name, availability: d.availability, variables: d.variables })),
        decisionRules: {
          success: plan.decisionRules.successCriterion,
          falsification: plan.decisionRules.falsificationCriterion,
          stop: plan.decisionRules.stopCriterion,
        },
        hypothesisIds: plan.hypothesisIds,
        ethicsConstraintsFromQuestion: [],
      },
      schema: DraftOut,
      temperature: 0.1,
      maxTokens: 4096,
    });
    draft = res.data;
    executionMode = res.executionMode;
  } catch (e) {
    // Budget exhaustion is operational (the orchestrator owns the pause) — never a domain skip.
    if (e instanceof RunBudgetExhaustedError) throw e;
    return { kind: 'skip', reason: `protocol drafting failed: ${(e instanceof Error ? e.message : String(e)).slice(0, 180)}` };
  }
  if (
    !draft.feasible || draft.paradigm === undefined || draft.title === undefined || draft.objective === undefined ||
    draft.setting === undefined || draft.arms === undefined || draft.sampling === undefined || draft.steps === undefined ||
    draft.variables === undefined || draft.ethics === undefined || draft.stopConditions === undefined
  ) {
    return { kind: 'skip', reason: draft.skipReason ?? 'plan has no operationalizable real-world execution legs' };
  }

  // ---- deterministic assembly (every adjustment disclosed in draftNotes) ----
  const notes: string[] = [];
  const planStepIds = new Set(plan.steps.map((s) => s.id));
  const kept = draft.steps.filter((s) => planStepIds.has(s.planStepId));
  if (kept.length < draft.steps.length) {
    notes.push(`dropped ${draft.steps.length - kept.length} draft step(s) referencing unknown plan steps`);
  }
  if (kept.length === 0) {
    return { kind: 'skip', reason: 'no draft step references an existing plan step' };
  }

  const idOfIndex = (i: number): string => `ps${i + 1}`;
  let droppedDeps = 0;
  const steps = kept.map((s, i) => {
    const validDeps = s.dependsOnStepNumbers.filter((n) => n >= 1 && n <= kept.length && n !== i + 1);
    droppedDeps += s.dependsOnStepNumbers.length - validDeps.length;
    return {
      id: idOfIndex(i),
      planStepId: s.planStepId,
      title: s.title,
      action: s.action,
      actor: s.actor,
      materials: s.materials,
      instruments: s.instruments,
      duration: { value: s.durationValue, unit: s.durationUnit },
      conditions: s.conditions,
      producesMeasurements: s.producesMeasurements,
      ...(s.safetyNote !== undefined ? { safetyNote: s.safetyNote } : {}),
      confirmation: s.confirmation,
      dependsOn: validDeps.map((n) => idOfIndex(n - 1)),
    };
  });
  if (droppedDeps > 0) notes.push(`dropped ${droppedDeps} out-of-range dependency reference(s)`);

  // Ethical floor: consent is never negotiable for human-subjects work.
  const ethics = { ...draft.ethics };
  if (draft.paradigm === 'human_subjects' && !ethics.consentRequired) {
    ethics.consentRequired = true;
    notes.push('consentRequired forced true for human_subjects paradigm (ethical floor)');
  }

  const armLabels = draft.arms.map((a) => a.label);
  const scheme = draft.allocation?.scheme ?? 'none';
  const planHash = planHashOf(plan);
  const seed = seedFromPlanHash(planHash);
  let allocation: ProtocolSpecType['allocation'];
  if ((scheme === 'complete_randomization' || scheme === 'blocked') && armLabels.length >= 2 && draft.sampling.plannedN >= armLabels.length) {
    allocation = scheme === 'blocked'
      ? {
          scheme: 'blocked',
          blockVariable: draft.allocation?.blockVariable ?? 'batch',
          seed,
          sequence: generateAllocationSequence(draft.sampling.plannedN, armLabels, seed, 'blocked'),
        }
      : {
          scheme: 'complete_randomization',
          seed,
          sequence: generateAllocationSequence(draft.sampling.plannedN, armLabels, seed, 'complete_randomization'),
        };
  } else {
    if (scheme !== 'none') {
      notes.push(`requested allocation '${scheme}' downgraded to none (${armLabels.length < 2 ? 'fewer than 2 arms' : 'plannedN below one full block'})`);
    }
    allocation = { scheme: 'none', rationale: draft.allocation?.rationale ?? 'design does not randomize allocation' };
  }

  const candidate = {
    id: newId('prt'),
    runId: plan.runId,
    planId: plan.id,
    planHash,
    hypothesisIds: [...plan.hypothesisIds],
    title: draft.title,
    objective: draft.objective,
    paradigm: draft.paradigm,
    setting: draft.setting,
    arms: draft.arms,
    materials: draft.materials,
    instruments: draft.instruments,
    sampling: draft.sampling,
    allocation,
    steps,
    variables: draft.variables,
    ethics,
    stopConditions: draft.stopConditions,
    draftNotes: notes,
    status: 'draft',
    createdAt: new Date().toISOString(),
  };
  const parsed = ProtocolSpec.safeParse(candidate);
  if (!parsed.success) {
    return {
      kind: 'skip',
      reason: `protocol draft failed schema validation: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).slice(0, 4).join('; ')}`,
    };
  }
  const cross = validateProtocolAgainstPlan(parsed.data, plan);
  if (!cross.passed) {
    return { kind: 'skip', reason: `protocol draft does not bind the plan: ${cross.errors.slice(0, 3).join('; ')}` };
  }
  const spec = ProtocolSpec.parse({ ...parsed.data, draftNotes: [...notes, ...cross.advisories].slice(0, 24) });
  return { kind: 'protocol', spec, executionMode };
};
