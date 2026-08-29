import { z } from 'zod';
import { ConstraintSet, ResearchQuestion, ScientificGoalType } from '../../domain/index.js';
import {
  ProblemModelDraft, ProblemModelDraftGuards,
  ScientificProblemModel, MethodSelection, checkMethodSelectionBinding,
} from '../../domain/problem-model.js';
import { newId } from '../../domain/ids.js';
import { callStructured } from '../llm.js';
import type { StageContext, StageHandler, StageOutcome } from '../types.js';
import { throwIfCancelled } from './guard.js';
import { TEMPLATE_REFUSAL_REASON } from './shared.js';

/**
 * Refinement contract — a strict subset of the domain ResearchQuestion fields.
 * Schema shapes are reused from the domain modules (single owner), so the LLM
 * output can only fill fields the canonical question actually has.
 */
const ScopeRefinement = z.object({
  domain: z.string().min(1),
  phenomena: z.array(z.string().min(1)).min(1),
  inScope: z.array(z.string().min(1)).default([]),
  outOfScope: z.array(z.string().min(1)).default([]),
  goalType: ScientificGoalType,
  constraints: ConstraintSet,
});
type ScopeRefinement = z.infer<typeof ScopeRefinement>;

const SYSTEM_PROMPT = `You refine a user's research question into a structured, falsifiable scope.
Return ONE JSON object with exactly these fields:
- "domain": the scientific domain of the question (keep the question's own language),
- "phenomena": one or more concrete phenomena the question asks about,
- "inScope": aspects explicitly inside the scope of the question,
- "outOfScope": aspects explicitly excluded by the question,
- "goalType": exactly one of "explanatory", "predictive", "interventional", "methodological", "exploratory",
- "constraints": an object with arrays "assumptions", "dataConstraints", "resourceConstraints", "ethicalConstraints", "methodologicalConstraints".
Rules:
- Preserve the original meaning of the question. NEVER invent background, prior results, data or citations that are not stated in the question.
- Prefer empty arrays over fabricating entries.
- Keep descriptive fields in the question's own language.`;

const PROBLEM_MODEL_PROMPT = `You formalize a research question into a Scientific Problem Model and select methods, BEFORE any hypothesis is generated.
Return ONE JSON object with exactly these fields:
- "objectives": 1-6 concrete research objectives decomposed from the question (the question's own language)
- "variables": the variables involved: { "name", "role" (independent|dependent|controlled|nuisance|parameter|observable), "unit" (only if the question states or standard usage implies one — never invent), "valueType" (numeric|categorical|ordinal|text|date|image|other), "description" }
- "formalization": { "problemClass" (well_posed_computational|statistical_estimation|causal_identification|design_optimization|phenomenon_explanation|descriptive_mapping|formal_derivation|none_stated), "governingRelations": [{ "kind" (pde|ode|algebraic_identity|statistical_model|causal_dag|objective_function|algorithmic|phenomenological|other), "statement", "assumptions" }], "domainGeometry", "boundaryConditions": [{ "kind" (dirichlet|neumann|robin|mixed|periodic|initial_value|other), "statement" }], "wellPosednessNotes" }
- "dataInventory": [{ "name", "kind" (retrieved_literature|external_dataset|local_data|simulated|physical_measurement|instrument_stream|none_available), "accessState" (available|partial|unavailable|unknown), "notes" }] — NEVER mark data available unless the question or scope says so
- "statisticalPremises": { "assumptions", "causalClaims", "identificationStrategy" } — only premises the question actually presupposes
- "metrics": [{ "name", "definition", "appliesTo" (hypothesis_comparison|model_quality|prediction_accuracy|estimation_precision|process_quality) }] — definitions must be checkable, not vague praise
- "stopConditions": 1-6 concrete conditions that end the study
- "unknowns": [{ "statement", "blocking", "resolutionPath" }] — what is genuinely unknown; an empty list on a frontier question is a defect
- "methodSelections": one entry per objective: { "forObjective" (1-based objective number), "candidates": 2-12 entries { "family", "assessment" (selected|viable_alternative|rejected_inappropriate|insufficient_information), "rationale", "validationPlan" }, "undecidedReason" }
Method families: analytic_symbolic, numerical_simulation, statistical_inference, causal_inference, optimization, machine_learning, retrieval_synthesis, theorem_proving, domain_software, llm_reasoning, physical_experiment, archival_analysis.
Rules:
- Consider AT LEAST TWO families per objective, including ones you reject — say why in the rationale.
- Every candidate with assessment "selected" MUST have a "validationPlan" naming the real check that verifies results (e.g. convergence order against an analytic solution, preregistered statistical test, held-out test set, protocol QC rule, independent replication).
- Candidates you do NOT select must OMIT validationPlan entirely (short placeholders like "n/a" are rejected).
- Match the family to the problem: a well-posed PDE/ODE question selects numerical_simulation with a convergence/discretization-error validation plan; a question about a natural phenomenon with no formal structure selects retrieval_synthesis and/or physical_experiment; a closed-form identity claim selects analytic_symbolic with a grid-check plan.
- Prefer empty arrays over fabricating variables, data, premises or unknowns.
- Preserve the question's own language for descriptive fields.`;
export const scopeStage: StageHandler = {
  stage: 'scope',
  applicable: async () => true,

  async execute(ctx: StageContext): Promise<StageOutcome> {
    throwIfCancelled(ctx);
    const question = ctx.store.getObject('question', ctx.run.questionId);
    if (!question) {
      throw new Error(
        `scope: question ${ctx.run.questionId} not found in store — refusing to refine without the user's question`,
      );
    }

    // Single structured call. A provider failure throws out of callStructured
    // (fail-closed) — this stage never silently proceeds with an empty scope.
    const res = await callStructured<ScopeRefinement>(ctx, {
      stage: 'scope',
      purpose: 'scope-refinement',
      systemPrompt: SYSTEM_PROMPT,
      payload: {
        questionText: question.text,
        currentScope: question.scope,
        currentGoalType: question.goalType,
      },
      schema: ScopeRefinement,
      temperature: 0.2,
    });
    const r = res.data;

    // Real-content discipline (owner directive 2026-08-29): the in-process test
    // double's refinement is filler scaffolding, not analysis of the user's
    // question. Refuse adoption — the user's own scope stands and every surface
    // stays truthful (the proposal panel reports unavailability).
    if (ctx.productRun === true && res.executionMode === 'test') {
      return {
        kind: 'skipped',
        reason:
          `${TEMPLATE_REFUSAL_REASON}: model route is the in-process test double — filler scope output is refused as scientific content; ` +
          'configure a live model route and resume to obtain a real scope refinement',
      };
    }

    // Original text/background/id/createdAt are preserved verbatim; unrefined
    // scope boundary fields (temporal/spatial/population) survive the merge.
    const refined = ResearchQuestion.parse({
      ...question,
      goalType: r.goalType,
      scope: {
        ...question.scope,
        domain: r.domain,
        phenomena: r.phenomena,
        inScope: r.inScope,
        outOfScope: r.outOfScope,
      },
      constraints: { ...question.constraints, ...r.constraints },
    });
    ctx.store.putObject('question', refined);

    // ---- AOSSA: Scientific Problem Model + Method Selection ----
    // Formed HERE, before retrieve/hypotheses: the run gets an explicit problem
    // model (objectives, variables/units, formalization, data inventory,
    // statistical premises, metrics, stop conditions, unknowns) and a method
    // selection per objective BEFORE any hypothesis is generated. The model may
    // only propose inside the draft schema; deterministic code below assigns
    // every id and enforces the cross-object binding.
    const pm = await callStructured<ProblemModelDraft>(ctx, {
      stage: 'scope',
      purpose: 'problem-model-formation',
      systemPrompt: PROBLEM_MODEL_PROMPT,
      payload: {
        questionText: question.text,
        scope: {
          domain: r.domain,
          phenomena: r.phenomena,
          inScope: r.inScope,
          outOfScope: r.outOfScope,
        },
        goalType: r.goalType,
        constraints: r.constraints,
      },
      schema: ProblemModelDraftGuards,
      temperature: 0.2,
    });

    if (ctx.productRun === true && pm.executionMode === 'test') {
      // Audit W4: a MARKER SKIPPED, not done — the orchestrator reopens marker
      // skips on resume, so the promised recovery is real; done would leave the
      // run permanently without a problem model.
      ctx.store.appendEvent(ctx.run.id, {
        type: 'note',
        stage: 'scope',
        detail: {
          subject: 'problem_model_refused',
          reason: `${TEMPLATE_REFUSAL_REASON}: model route is the in-process test double — filler problem-model output is refused as scientific content`,
        },
      });
      return {
        kind: 'skipped',
        reason:
          `${TEMPLATE_REFUSAL_REASON}: refinement was adopted from a live receipt but problem-model formation came back ` +
          'test-stamped (mid-run route flip) - scope re-runs whole on resume with a live route',
      };
    }

    const d = pm.data;
    const now = new Date().toISOString();
    const model = ScientificProblemModel.parse({
      id: newId('pmod'),
      runId: ctx.run.id,
      questionId: question.id,
      objectives: d.objectives.map((o, i) => ({ id: `obj${i + 1}`, statement: o.statement })),
      variables: d.variables,
      formalization: {
        problemClass: d.formalization.problemClass,
        governingRelations: d.formalization.governingRelations.map((g, i) => ({ id: `rel${i + 1}`, ...g })),
        domainGeometry: d.formalization.domainGeometry,
        boundaryConditions: d.formalization.boundaryConditions.map((b, i) => ({ id: `bc${i + 1}`, ...b })),
        wellPosednessNotes: d.formalization.wellPosednessNotes,
      },
      dataInventory: d.dataInventory,
      statisticalPremises: d.statisticalPremises,
      metrics: d.metrics,
      stopConditions: d.stopConditions,
      unknowns: d.unknowns,
      provenance: { formedBy: 'model_proposed' },
      createdAt: now,
      updatedAt: now,
    });
    const selections: MethodSelection[] = d.methodSelections.map((s) => {
      const sel = MethodSelection.parse({
        id: newId('msel'),
        runId: ctx.run.id,
        questionId: question.id,
        forObjectiveId: `obj${s.forObjective}`,
        candidates: s.candidates.map((c) => c.assessment === 'selected' ? c : { ...c, validationPlan: undefined }), // a validationPlan on a rejected/viable candidate is placeholder noise; selected keep theirs (canonical min(10))
        undecidedReason: s.undecidedReason,
        decidedBy: 'model_proposed',
        createdAt: now,
      });
      const binding = checkMethodSelectionBinding(sel, model);
      if (binding.length > 0) {
        throw new Error(`scope: method selection binding failed: ${binding.join('; ')}`);
      }
      return sel;
    });

    ctx.store.putObjectEvented('problem_model', model, {
      type: 'note',
      detail: { stage: 'scope',
        subject: 'problem_model_formed',
        problemModelId: model.id,
        objectives: model.objectives.length,
        variables: model.variables.length,
        problemClass: model.formalization.problemClass,
        methodSelections: selections.length,
      },
    });
    for (const sel of selections) {
      ctx.store.putObjectEvented('method_selection', sel, {
        type: 'note',
        detail: {
          stage: 'scope',
          subject: 'method_selection_formed',
          methodSelectionId: sel.id,
          forObjectiveId: sel.forObjectiveId,
          selected: sel.candidates
            .filter((c) => c.assessment === 'selected')
            .map((c) => c.family),
        },
      });
    }

    const selectedFamilies = selections
      .flatMap((s) => s.candidates.filter((c) => c.assessment === 'selected').map((c) => c.family))
      .join('/');
    return {
      kind: 'done',
      summary:
        `scope refined: domain="${r.domain}"; ${r.phenomena.length} phenomena; ` +
        `in/out scope ${r.inScope.length}/${r.outOfScope.length}; goalType=${r.goalType}; ` +
        `problem model formed (${model.objectives.length} objectives, ` +
        `${model.formalization.problemClass}, ${model.unknowns.length} unknowns, ` +
        `methods: ${selectedFamilies || 'undecided'})`,
    };
  },
};







