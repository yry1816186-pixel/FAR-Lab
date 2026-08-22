import { z } from 'zod';
import { newId } from '../domain/ids.js';
import { ProvenanceReceipt } from '../domain/provenance.js';
import { strictSchemaOrUndefined } from '../providers/http.js';
import type { App } from '../app/composition.js';
import type { StructuredCallResult } from '../shared/ports.js';

/**
 * B4 object-level AI research actions (thinking-collision surface): one click
 * from any hypothesis/claim/plan asks the model an adversarial question
 * (challenge / weakest assumption / falsification probe / counter-evidence /
 * ask / what next). Grounding rules:
 *  - The model sees ONLY facts from this run's store (target object + claims
 *    with their verbatim quotes). No world knowledge is asserted as fact.
 *  - The response must cite claims by id; ids that do not exist in the run
 *    are dropped and REPORTED, never silently kept.
 *  - Every call is receipted + evented exactly like a pipeline model call —
 *    an API-triggered analysis leaves the same provenance trail.
 *  - The analysis is MODEL OUTPUT, labeled as such in the response; it never
 *    mutates domain objects. Promoting a point into the causal revision chain
 *    is a separate, deliberate human act (feedback POST).
 * v1 scope: counter_evidence works over the run's OWN evidence base and
 * names retrieval gaps; live external retrieval stays with the pipeline
 * (B6/B9 own the retrieve router reuse).
 */

export const ResearchActionName = z.enum([
  'challenge', 'weakest_assumption', 'falsify_probe', 'counter_evidence', 'ask', 'what_next',
]);
export type ResearchActionName = z.infer<typeof ResearchActionName>;

export class ActionError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

export const ActionRequest = z.object({
  action: ResearchActionName,
  targetType: z.enum(['hypothesis', 'claim', 'plan']),
  targetId: z.string().min(1),
  /** Free-text researcher question; required for `ask`, ignored otherwise. */
  question: z.string().max(2_000).optional(),
});

const ActionAnalysis = z.object({
  headline: z.string().min(1),
  points: z.array(z.object({
    kind: z.enum(['argument', 'evidence_link', 'caveat', 'gap']),
    text: z.string().min(1),
    claimId: z.string().optional(),
  })).min(1).max(12),
  uncertainties: z.array(z.string()).max(8).default([]),
  nextStep: z.string().optional(),
});

export interface ActionResponse {
  action: ResearchActionName;
  targetType: 'hypothesis' | 'claim' | 'plan';
  targetId: string;
  model: { provider: string; modelId: string; latencyMs: number };
  analysis: z.infer<typeof ActionAnalysis>;
  /** Cited ids that do not exist in this run — dropped, disclosed, never kept. */
  droppedRefs: string[];
  groundingClaims: number;
  note: string;
}

const ACTION_PROMPTS: Record<ResearchActionName, string> = {
  challenge: 'CHALLENGE this target like a rigorous peer reviewer at a top journal: attack its weakest inferential links, question the sufficiency of the cited evidence for the claim actually made, and name alternative explanations the evidence cannot exclude.',
  weakest_assumption: 'Identify the WEAKEST ASSUMPTION this target depends on. Rank the listed assumptions (or implicit ones you can derive from the statement) by fragility, explain concretely what breaks if the weakest one fails, and which existing evidence bears on it.',
  falsify_probe: 'Propose how to FALSIFY this target: the single most decisive observable, the measurement, and a DECIDABLE rule that separates support from refutation. If a falsification spec already exists, stress-test it instead of repeating it.',
  counter_evidence: 'Search the provided claim base for COUNTER-EVIDENCE against this target: claims whose findings conflict, weaken, bound, or fail-to-replicate it. Link them by id with the exact tension. Then name the most important MISSING counter-evidence search (a gap the current corpus cannot answer).',
  ask: 'Answer the researcher question strictly from the provided evidence and target facts. If the evidence base cannot answer it, say so plainly — never fill gaps with outside knowledge.',
  what_next: 'Given this target and the evidence base, what single next step most advances the research? Prefer steps the existing claims make decidable; name the data or experiment needed and what result would change the target standing.',
};

export async function runResearchAction(app: App, runId: string, rawBody: unknown): Promise<ActionResponse> {
  const parsedReq = ActionRequest.safeParse(rawBody);
  if (!parsedReq.success) {
    throw new ActionError(400, 'invalid_action_request', `invalid action request: ${parsedReq.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; ')}`);
  }
  const req = parsedReq.data;
  if (req.action === 'ask' && (req.question === undefined || req.question.trim().length === 0)) {
    throw new ActionError(400, 'question_required', "action 'ask' requires a non-empty question");
  }
  const run = app.store.getRun(runId);
  if (run === null) throw new ActionError(404, 'not_found', `run ${runId} not found`);

  // ---- assemble grounded context from the store ----
  const question = app.store.getObject('question', run.questionId);
  const claims = app.store.listObjects('claim', runId);
  const claimById = new Map(claims.map((c) => [c.id, c] as const));

  let targetPayload: Record<string, unknown>;
  let evidenceClaims: { id: string; text: string; quote: string; gradeCertainty?: string }[];
  if (req.targetType === 'hypothesis') {
    const hyp = app.store.getObject('hypothesis', req.targetId);
    if (hyp === null) throw new ActionError(404, 'target_not_found', `hypothesis ${req.targetId} not found in run`);
    const relevant = new Set([...hyp.supportingClaimIds, ...hyp.counterClaimIds]);
    evidenceClaims = claims
      .filter((c) => relevant.has(c.id))
      .slice(0, 24)
      .map((c) => ({ id: c.id, text: c.text, quote: c.locators[0]?.quote ?? '', ...(c.gradeCertainty !== undefined ? { gradeCertainty: c.gradeCertainty } : {}) }));
    targetPayload = {
      statement: hyp.statement,
      mechanism: hyp.mechanism,
      assumptions: hyp.assumptions.map((a) => a.statement),
      predictions: hyp.predictions,
      supportingClaimIds: hyp.supportingClaimIds,
      counterClaimIds: hyp.counterClaimIds,
      falsification: hyp.falsification !== undefined
        ? { observable: hyp.falsification.observable, method: hyp.falsification.method, decisionRule: hyp.falsification.decisionRule }
        : undefined,
    };
  } else if (req.targetType === 'claim') {
    const claim = claimById.get(req.targetId);
    if (claim === undefined) throw new ActionError(404, 'target_not_found', `claim ${req.targetId} not found in run`);
    const srcTitle = claim.locators[0] !== undefined
      ? app.store.getObject('source_document', claim.locators[0].sourceDocumentId)?.title
      : undefined;
    evidenceClaims = claims
      .filter((c) => c.id !== claim.id)
      .slice(0, 24)
      .map((c) => ({ id: c.id, text: c.text, quote: c.locators[0]?.quote ?? '', ...(c.gradeCertainty !== undefined ? { gradeCertainty: c.gradeCertainty } : {}) }));
    targetPayload = {
      text: claim.text,
      sourceTitle: srcTitle,
      quote: claim.locators[0]?.quote,
      bindingStatus: claim.bindingStatus,
      uncertainties: claim.uncertainties,
    };
  } else {
    const plan = app.store.getObject('plan', req.targetId);
    if (plan === null) throw new ActionError(404, 'target_not_found', `plan ${req.targetId} not found in run`);
    evidenceClaims = claims
      .slice(0, 24)
      .map((c) => ({ id: c.id, text: c.text, quote: c.locators[0]?.quote ?? '', ...(c.gradeCertainty !== undefined ? { gradeCertainty: c.gradeCertainty } : {}) }));
    targetPayload = {
      objective: plan.objective,
      boundHypothesisIds: plan.hypothesisIds,
      decisionRules: {
        success: plan.decisionRules.successCriterion,
        weakening: plan.decisionRules.weakeningCriterion,
        falsification: plan.decisionRules.falsificationCriterion,
        stop: plan.decisionRules.stopCriterion,
      },
      metrics: plan.metrics,
    };
  }

  const systemPrompt =
    'You are an adversarial scientific reviewer embedded in a research workbench. You reason ONLY over the ' +
    'provided evidence claims (with their verbatim source quotes) and target facts; outside knowledge may ' +
    'color reasoning but must NEVER be asserted as fact — mark such points as caveats. Cite claims by their ' +
    'exact id in points of kind "evidence_link". Task: ' + ACTION_PROMPTS[req.action];

  const res: StructuredCallResult<z.infer<typeof ActionAnalysis>> = await app.provider.structuredCall(
    {
      task: `research-action:${req.action}`,
      systemPrompt,
      userPayload: {
        outputContract: '{headline: string, points: [{kind: one of "argument"|"evidence_link"|"caveat"|"gap", text: string, claimId?: string}], uncertainties: string[], nextStep?: string}',
        input: {
          action: req.action,
          researcherQuestion: req.action === 'ask' ? req.question : undefined,
          researchQuestion: question?.text,
          target: { type: req.targetType, ...targetPayload },
          evidenceClaims,
        },
      },
      outputKind: 'json',
      temperature: 0.2,
      maxTokens: 4096,
      jsonSchema: strictSchemaOrUndefined(ActionAnalysis),
      purpose: `research-action:${req.action}`,
    },
    (raw) => {
      const p = ActionAnalysis.safeParse(raw);
      return p.success ? p.data : new Error(`action analysis schema failed: ${p.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).slice(0, 4).join('; ')}`);
    },
  );

  // Provenance parity with pipeline calls: receipt + event, same shapes.
  const at = new Date().toISOString();
  const receipt = ProvenanceReceipt.parse({
    id: newId('rcp'), runId,
    kind: 'model_call',
    executionMode: res.receipt.executionMode,
    at,
    redactionNote: 'raw prompts/responses not retained; hashes only',
    modelCall: {
      provider: res.receipt.provider,
      modelId: res.receipt.modelId,
      modelVersion: res.receipt.modelVersion,
      usage: res.receipt.usage,
      latencyMs: res.receipt.latencyMs,
      requestHash: res.receipt.requestHash,
      outputHash: res.receipt.outputHash,
      finishReason: res.receipt.finishReason,
    },
  });
  app.store.putObject('receipt', receipt);
  app.store.appendEvent(runId, {
    type: 'receipt_recorded',
    // modelCall is always present on this receipt (constructed two lines up with kind 'model_call');
    // optional chaining only satisfies the schema-level optionality, wire shape unchanged.
    detail: { kind: receipt.kind, id: receipt.id, provider: receipt.modelCall?.provider, modelId: receipt.modelCall?.modelId, latencyMs: receipt.modelCall?.latencyMs },
    receiptId: receipt.id,
  });
  app.store.appendEvent(runId, {
    type: 'note',
    detail: { reason: 'research_action', action: req.action, targetType: req.targetType, targetId: req.targetId },
  });

  if (!res.ok || res.data === undefined) {
    const err = res.error ?? { kind: 'provider_error', message: 'unknown provider failure' };
    throw new ActionError(502, 'action_model_failed', `model call failed (${err.kind}): ${err.message}`);
  }

  // Ref honesty: non-existent cited ids are dropped and disclosed.
  const droppedRefs: string[] = [];
  const analysis = {
    ...res.data,
    points: res.data.points.flatMap((p) => {
      if (p.claimId !== undefined && !claimById.has(p.claimId)) {
        droppedRefs.push(p.claimId);
        return p.kind === 'evidence_link' ? [] : [{ ...p, claimId: undefined }];
      }
      return [p];
    }),
  };

  return {
    action: req.action,
    targetType: req.targetType,
    targetId: req.targetId,
    model: { provider: res.receipt.provider, modelId: res.receipt.modelId, latencyMs: res.receipt.latencyMs },
    analysis,
    droppedRefs,
    groundingClaims: evidenceClaims.length,
    note: 'AI 分析基于本 run 库内证据生成（模型输出，非事实断言）；证据引用已校验存在性。转为反馈可进入因果修订链。',
  };
}
