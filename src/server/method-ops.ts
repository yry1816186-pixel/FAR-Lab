import { z } from 'zod';
import { FeedbackSignal, MethodSelection, Revision, VersionDiff } from '../domain/index.js';
import { MethodFamily } from '../domain/problem-model.js';
import { newId } from '../domain/ids.js';
import type { App } from '../app/composition.js';

/**
 * FA-HCI-02: researcher method-family override INTO the causal revision chain.
 * PRODUCT.md promises "correct the system's scientific decisions" — the
 * ProblemModelBand was read-only, so an override required rerunning scope.
 * Mirrors hypothesis-ops (BP-2) discipline:
 *  - the researcher may only select families the system ASSESSED for that
 *    objective (no silent injection of unassessed families);
 *  - a selected family must carry a validation plan (the real check that
 *    verifies results) — inherited from the assessment or supplied now;
 *  - the change is causal, never a silent re-render: FeedbackSignal
 *    (human_expert) -> Revision (scope modify, before/after) -> VersionDiff,
 *    the predecessor archived as a content-addressed artifact, an audit note
 *    lands in the run's event chain, and the MethodSelection is replaced
 *    in place (same id) with decidedBy='researcher_override' so every reader
 *    (science bundle, StudyMap band, revise stage) sees the corrected decision.
 */

export type MethodOpErrorCode = 'not_found' | 'target_not_found' | 'validation';

export class MethodOpError extends Error {
  constructor(readonly status: number, readonly code: MethodOpErrorCode, message: string) {
    super(message);
  }
}

const badRequest = (message: string): MethodOpError => new MethodOpError(400, 'validation', message);

export const MethodOverrideBody = z.object({
  selectedFamilies: z.array(MethodFamily).min(1).max(2),
  reason: z.string().min(10).max(2000),
  /** validation plan text per family, required when the stored assessment never recorded one */
  validationPlans: z.record(z.string(), z.string().min(10).max(600)).optional(),
});
export type MethodOverrideBody = z.infer<typeof MethodOverrideBody>;

export const overrideMethodSelection = async (
  app: App,
  runId: string,
  selectionId: string,
  rawBody: unknown,
): Promise<{ selection: MethodSelection; feedbackId: string; revisionId: string }> => {
  const body = MethodOverrideBody.parse(rawBody ?? {});
  const run = app.store.getRun(runId);
  if (run === null) throw new MethodOpError(404, 'not_found', `run not found: ${runId}`);

  const selection = app.store.listObjects('method_selection', runId).find((s) => s.id === selectionId)
    ?? app.store.listObjects('method_selection', '__none__').find((s) => s.id === selectionId && s.runId === runId);
  if (selection === undefined) throw new MethodOpError(404, 'target_not_found', `method selection not found in run ${runId}: ${selectionId}`);
  if (selection.runId !== runId) throw new MethodOpError(404, 'target_not_found', `selection ${selectionId} belongs to run ${selection.runId}, not ${runId}`);

  const byFamily = new Map(selection.candidates.map((c) => [c.family, c]));
  for (const family of body.selectedFamilies) {
    if (!byFamily.has(family)) {
      throw badRequest(`family ${family} was never assessed for objective ${selection.forObjectiveId} — the override may only choose among assessed families: ${[...byFamily.keys()].join(', ')}`);
    }
  }
  const chosen = new Set(body.selectedFamilies);

  // Remap assessments: chosen -> selected (validation plan inherited or supplied);
  // a previously-selected family the researcher dropped -> viable_alternative.
  const candidates = selection.candidates.map((c) => {
    if (chosen.has(c.family)) {
      const plan = c.validationPlan ?? body.validationPlans?.[c.family];
      if (plan === undefined) {
        throw badRequest(`family ${c.family} has no recorded validation plan — supply validationPlans.${c.family} (the real check that verifies results)`);
      }
      return { ...c, assessment: 'selected' as const, ...(plan !== c.validationPlan ? { validationPlan: plan } : {}) };
    }
    return c.assessment === 'selected' ? { ...c, assessment: 'viable_alternative' as const } : c;
  });

  const now = new Date().toISOString();
  const before = selection.candidates.filter((c) => c.assessment === 'selected').map((c) => c.family);
  const predecessor = await app.artifacts.put(JSON.stringify(selection));

  const feedback = FeedbackSignal.parse({
    id: newId('fbk'),
    runId,
    source: 'human_expert',
    content: `方法族覆盖：objective ${selection.forObjectiveId} 从 [${before.join(' / ') || 'undecided'}] 改为 [${body.selectedFamilies.join(' / ')}] — ${body.reason}`,
    structured: { kind: 'method_family_override', selectionId, before, after: body.selectedFamilies },
    target: { kind: 'method_selection', id: selectionId },
    provenance: 'workbench method-family override (FA-HCI-02)',
    receivedAt: now,
  });
  app.store.putObject('feedback', feedback);

  // A selection now carries >=1 selected family, so any inherited undecidedReason is dropped.
  const { undecidedReason: _dropped, ...rest } = selection;
  const updated = MethodSelection.parse({
    ...rest,
    candidates,
    decidedBy: 'researcher_override',
  });
  app.store.putObject('method_selection', updated);

  const revision = Revision.parse({
    id: newId('rev'),
    runId,
    triggerFeedbackId: feedback.id,
    causalReason: `researcher method-family override: ${body.reason}`,
    operations: [{
      objectType: 'scope',
      objectId: selectionId,
      operation: 'modify',
      before: before.join(' / ') || 'undecided',
      after: body.selectedFamilies.join(' / '),
      reason: body.reason,
    }],
    fromVersionLabel: `families=${before.join('+') || 'undecided'}`,
    toVersionLabel: `families=${body.selectedFamilies.join('+')}`,
    qualityDelta: {
      status: 'inconclusive', // a human correction, not a measured improvement
      claim: 'researcher method-family override; no quality change is asserted',
      evidenceRefs: [predecessor.ref],
    },
    createdAt: now,
  });
  app.store.putObject('revision', revision);
  app.store.putObject('version_diff', VersionDiff.parse({
    revisionId: revision.id,
    runId,
    entries: [{
      objectType: 'scope',
      objectId: selectionId,
      summary: `human method-family override (${before.join('/') || 'undecided'} -> ${body.selectedFamilies.join('/')})`,
      changedFields: ['decidedBy', 'candidates'],
      patchOps: [{ op: 'replace', path: '/decidedBy', value: 'researcher_override' }],
      semanticFlags: ['method_family_override'],
    }],
    semanticSummary: 'method-family decision moved from model-proposed to researcher-override; downstream plan/protocol derivations predate this change',
    remainingUncertainties: [],
  }));
  app.store.appendEvent(runId, { type: 'note', detail: { reason: `[human] method-family override on ${selectionId}: ${before.join('/') || 'undecided'} -> ${body.selectedFamilies.join('/')}` } }, now);

  return { selection: updated, feedbackId: feedback.id, revisionId: revision.id };
};
