import { z } from 'zod';
import { EvidenceRelation, FeedbackSignal, HypothesisCandidate, Revision, VersionDiff } from '../domain/index.js';
import { newId } from '../domain/ids.js';
import { hasExplicitQuantity } from '../domain/claim.js';
import { relationStrength } from '../domain/evidence-strength.js';
import type { App } from '../app/composition.js';

/**
 * B5 hypothesis lifecycle operations (R3): promote / reject / fork / connect,
 * driven by the researcher from the workbench. Grounding rules (mirrors
 * actions.ts):
 *  - Objects are stored globally by id — every load is ownership-guarded: the
 *    hypothesis (and, for connect, the claim) MUST belong to the addressed run.
 *    Cross-run mutation is a truthfulness violation, not a 500.
 *  - Every real mutation appends an audit event ('note' with a stable reason);
 *    idempotent no-ops mutate nothing and event nothing.
 *  - connect persists a first-class EvidenceRelation with '[human] ' provenance
 *    so human links enter the ACH analysis on par with pipeline/AI relations;
 *    strength derives deterministically from the linked claim's measured
 *    properties (SCIENCE lane 2026-08-24) — never a fabricated grade.
 *
 * BP-2 researcher sovereignty: `edit` performs a direct content correction
 * (statement / mechanism / predictions) INTO the causal revision chain — a
 * FeedbackSignal (human_expert) triggers a Revision whose operation records
 * before/after, the predecessor is archived as a content-addressed artifact,
 * the hypothesis version increments, and a monotonic staleness uncertainty
 * discloses that the falsification spec and evidence links predate the edit.
 * Near-miss corrections no longer require a full AI feedback round-trip.
 */

export type HypothesisOpErrorCode = 'not_found' | 'target_not_found' | 'validation';

export class HypothesisOpError extends Error {
  constructor(readonly status: number, readonly code: HypothesisOpErrorCode, message: string) {
    super(message);
  }
}

const badRequest = (message: string): HypothesisOpError =>
  new HypothesisOpError(400, 'validation', message);

const targetNotFound = (message: string): HypothesisOpError =>
  new HypothesisOpError(404, 'target_not_found', message);

/** Status/fork bodies accept only an optional free-text note (nothing required). */
const StatusOpBody = z.object({ note: z.string().max(2_000).optional() });

export const ConnectClaimBody = z.object({
  claimId: z.string().min(1),
  direction: z.enum(['supports', 'counters']),
  note: z.string().max(2_000).optional(),
});
export type ConnectClaimInput = z.infer<typeof ConnectClaimBody>;

const issueText = (issues: z.ZodIssue[]): string =>
  issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');

/** Run-existence + run-ownership guard (same semantics as runResearchAction). */
const mustGetHypothesis = (app: App, runId: string, hypId: string): HypothesisCandidate => {
  if (app.store.getRun(runId) === null) {
    throw new HypothesisOpError(404, 'not_found', `run ${runId} not found`);
  }
  const hyp = app.store.getObject('hypothesis', hypId);
  if (hyp === null || hyp.runId !== runId) {
    throw targetNotFound(`hypothesis ${hypId} not found in run ${runId}`);
  }
  return hyp;
};

// ---- promote / reject ----

export interface HypothesisStatusResult {
  hypothesisId: string;
  status: 'active' | 'promoted' | 'rejected';
}

function setHypothesisStatus(
  app: App,
  runId: string,
  hypId: string,
  target: 'promoted' | 'rejected',
  rawBody: unknown,
): HypothesisStatusResult {
  const parsed = StatusOpBody.safeParse(rawBody ?? {});
  if (!parsed.success) throw badRequest(`invalid ${target} request: ${issueText(parsed.error.issues)}`);
  const hyp = mustGetHypothesis(app, runId, hypId);
  const from = hyp.status; // schema .default guarantees presence on read
  if (from === target) {
    // Idempotent: nothing changes, so nothing is persisted or evented — an
    // event would claim a transition that did not happen.
    return { hypothesisId: hyp.id, status: from };
  }
  app.store.putObject('hypothesis', HypothesisCandidate.parse({ ...hyp, status: target }));
  app.store.appendEvent(runId, {
    type: 'note',
    detail: { reason: 'hypothesis_status_changed', hypothesisId: hyp.id, from, to: target, actor: 'human' },
  });
  return { hypothesisId: hyp.id, status: target };
}

export const promoteHypothesis = (app: App, runId: string, hypId: string, rawBody?: unknown): HypothesisStatusResult =>
  setHypothesisStatus(app, runId, hypId, 'promoted', rawBody);

export const rejectHypothesis = (app: App, runId: string, hypId: string, rawBody?: unknown): HypothesisStatusResult =>
  setHypothesisStatus(app, runId, hypId, 'rejected', rawBody);

// ---- fork ----

export interface HypothesisForkResult {
  hypothesisId: string;
  forkedFrom: string;
}

export function forkHypothesis(app: App, runId: string, hypId: string, rawBody?: unknown): HypothesisForkResult {
  const parsed = StatusOpBody.safeParse(rawBody ?? {});
  if (!parsed.success) throw badRequest(`invalid fork request: ${issueText(parsed.error.issues)}`);
  const hyp = mustGetHypothesis(app, runId, hypId);
  const forkId = newId('hyp');
  const fork = HypothesisCandidate.parse({
    ...hyp,
    id: forkId,
    version: 0, // fresh causal-revision lineage
    status: 'active', // the fork starts its own triage life
    // Fresh cluster key: the fork must compete in ranking on its own merits,
    // never ride the original's paraphrase-cluster seat.
    clusterKey: `${hyp.clusterKey ?? hyp.id}:fork:${forkId}`,
    distinctnessRationale:
      hyp.distinctnessRationale !== undefined && hyp.distinctnessRationale.trim().length > 0
        ? `${hyp.distinctnessRationale} (forked_from:${hyp.id})`
        : `forked_from:${hyp.id}`,
    createdAt: new Date().toISOString(),
  });
  app.store.putObject('hypothesis', fork);
  app.store.appendEvent(runId, {
    type: 'note',
    detail: { reason: 'hypothesis_forked', from: hyp.id, to: fork.id, actor: 'human' },
  });
  return { hypothesisId: fork.id, forkedFrom: hyp.id };
}

// ---- edit (BP-2: direct researcher correction into the causal revision chain) ----

export const EditHypothesisBody = z.object({
  statement: z.string().min(20).max(4_000).optional(),
  mechanism: z.string().min(20).max(8_000).optional(),
  predictions: z.array(z.string().min(5).max(2_000)).min(1).max(10).optional(),
  /** Why the correction is needed — becomes the feedback content (the causal trigger). */
  note: z.string().min(3).max(2_000),
});
export type EditHypothesisInput = z.infer<typeof EditHypothesisBody>;

export interface HypothesisEditResult {
  hypothesisId: string;
  version: number;
  revisionId: string;
  feedbackId: string;
  predecessorArtifactRef: string;
  changedFields: string[];
}

export async function editHypothesis(app: App, runId: string, hypId: string, rawBody: unknown): Promise<HypothesisEditResult> {
  const parsed = EditHypothesisBody.safeParse(rawBody);
  if (!parsed.success) throw badRequest(`invalid edit request: ${issueText(parsed.error.issues)}`);
  const { statement, mechanism, predictions, note } = parsed.data;
  const changedFields = Object.entries({ statement, mechanism, predictions })
    .filter(([, v]) => v !== undefined)
    .map(([k]) => k);
  if (changedFields.length === 0) {
    throw badRequest('edit requires at least one of statement / mechanism / predictions');
  }
  const hyp = mustGetHypothesis(app, runId, hypId);

  // (1) archive the predecessor exactly as the revise stage does: content-addressed,
  //     immutable, restorable — the version chain never loses a prior state.
  const predecessorArtifact = await app.artifacts.put(JSON.stringify(hyp, null, 2));
  const now = new Date().toISOString();

  // (2) the causal trigger: a human_expert feedback signal (so the edit enters the
  //     SAME feedback -> revision chain the Revisions tab renders for AI revisions).
  const feedback = FeedbackSignal.parse({
    id: newId('fbk'),
    runId,
    source: 'human_expert',
    content: note,
    target: { kind: 'hypothesis', id: hyp.id },
    provenance: 'workbench direct edit (BP-2)',
    receivedAt: now,
  });
  app.store.putObject('feedback', feedback);

  // (3) version bump + monotonic staleness disclosure: the falsification spec and
  //     evidence links were derived from the OLD statement — the uncertainty list
  //     grows (constitution s7: uncertainties are only ever added, never erased).
  const staleness = `statement/mechanism manually edited by researcher at ${now}; falsification spec, scorecard and evidence links predate this edit`;
  const updated = HypothesisCandidate.parse({
    ...hyp,
    version: hyp.version + 1,
    ...(statement !== undefined ? { statement } : {}),
    ...(mechanism !== undefined ? { mechanism } : {}),
    ...(predictions !== undefined ? { predictions } : {}),
    uncertainties: [...hyp.uncertainties, staleness],
  });
  app.store.putObject('hypothesis', updated);

  // (4) the causal record: Revision (operation with before/after) + VersionDiff.
  const fieldBeforeAfter = (field: 'statement' | 'mechanism'): { before: string; after: string } | undefined =>
    field === 'statement' && statement !== undefined ? { before: hyp.statement, after: statement }
      : field === 'mechanism' && mechanism !== undefined ? { before: hyp.mechanism, after: mechanism }
        : undefined;
  const revision = Revision.parse({
    id: newId('rev'),
    runId,
    triggerFeedbackId: feedback.id,
    causalReason: `researcher direct edit: ${note}`,
    operations: changedFields.map((field) => {
      const ba = field === 'predictions'
        ? { before: JSON.stringify(hyp.predictions), after: JSON.stringify(predictions) }
        : fieldBeforeAfter(field as 'statement' | 'mechanism') ?? { before: '', after: '' };
      return {
        objectType: 'hypothesis' as const,
        objectId: hyp.id,
        operation: 'modify' as const,
        before: ba.before,
        after: ba.after,
        reason: note,
      };
    }),
    fromVersionLabel: `v${hyp.version}`,
    toVersionLabel: `v${hyp.version + 1}`,
    qualityDelta: {
      status: 'inconclusive' as const, // human edits are corrections, not measured improvements
      claim: 'direct researcher correction; no quality change is asserted',
      evidenceRefs: [predecessorArtifact.ref],
    },
    createdAt: now,
  });
  app.store.putObject('revision', revision);
  app.store.putObject('version_diff', VersionDiff.parse({
    revisionId: revision.id,
    runId,
    entries: [{
      objectType: 'hypothesis',
      objectId: hyp.id,
      summary: `human edit (${changedFields.join(', ')}) v${hyp.version} -> v${hyp.version + 1}`,
      changedFields,
    }],
    semanticSummary: `researcher corrected ${changedFields.join(', ')}: ${note}`,
    remainingUncertainties: [staleness],
  }));

  // (5) provenance receipt + audit event (same surfaces the AI revision path uses).
  app.store.appendEvent(runId, {
    type: 'revision_created',
    detail: { reason: 'hypothesis_edited_human', hypothesisId: hyp.id, revisionId: revision.id, feedbackId: feedback.id, changedFields, actor: 'human' },
  });

  return {
    hypothesisId: updated.id,
    version: updated.version,
    revisionId: revision.id,
    feedbackId: feedback.id,
    predecessorArtifactRef: predecessorArtifact.ref,
    changedFields,
  };
}

// ---- connect (link a run claim as supporting/counter evidence) ----

export interface ConnectClaimResult {
  hypothesisId: string;
  claimId: string;
  direction: 'supports' | 'counters';
}

export function connectClaim(app: App, runId: string, hypId: string, rawBody: unknown): ConnectClaimResult {
  const parsed = ConnectClaimBody.safeParse(rawBody);
  if (!parsed.success) throw badRequest(`invalid connect request: ${issueText(parsed.error.issues)}`);
  const { claimId, direction, note } = parsed.data;
  const hyp = mustGetHypothesis(app, runId, hypId);
  const claim = app.store.getObject('claim', claimId);
  // Ownership guard: a claim from ANOTHER run must not support this run's
  // hypothesis — the ACH analysis only reasons over this run's evidence base.
  if (claim === null || claim.runId !== runId) {
    throw targetNotFound(`claim ${claimId} not found in run ${runId}`);
  }
  const linked = direction === 'supports' ? hyp.supportingClaimIds : hyp.counterClaimIds;
  if (linked.includes(claimId)) {
    // Idempotent: the link exists — no duplicate relation, no duplicate event.
    return { hypothesisId: hyp.id, claimId, direction };
  }
  app.store.putObject('hypothesis', HypothesisCandidate.parse({
    ...hyp,
    supportingClaimIds: direction === 'supports' ? [...hyp.supportingClaimIds, claimId] : hyp.supportingClaimIds,
    counterClaimIds: direction === 'counters' ? [...hyp.counterClaimIds, claimId] : hyp.counterClaimIds,
  }));
  // The human source enters the ACH evidence analysis as a first-class relation:
  // '[human] ' marks provenance; strength is the SAME deterministic mapping from
  // the linked claim's measured properties every pipeline write point uses —
  // never a fabricated grade, never a permanent zero either.
  const strength = relationStrength({
    gradeCertainty: claim.gradeCertainty,
    bindingVerified: claim.bindingStatus === 'verified',
    quantitative: hasExplicitQuantity(claim.text),
  });
  app.store.putObject('evidence_relation', EvidenceRelation.parse({
    id: newId('ev'),
    runId,
    relation: direction === 'supports' ? 'supports' : 'contradicts',
    claimId,
    targetHypothesisId: hyp.id,
    rationale: `[human] ${note ?? 'manually linked by the researcher in the workbench'}`,
    strength: strength.strength,
    uncertainties: [strength.derivation],
    createdAt: new Date().toISOString(),
  }));
  app.store.appendEvent(runId, {
    type: 'note',
    detail: { reason: 'claim_linked_human', hypothesisId: hyp.id, claimId, direction, actor: 'human' },
  });
  return { hypothesisId: hyp.id, claimId, direction };
}
