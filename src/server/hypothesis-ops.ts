import { z } from 'zod';
import { EvidenceRelation, HypothesisCandidate } from '../domain/index.js';
import { newId } from '../domain/ids.js';
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
 *    strength stays 'unrated' until assessed — never a fabricated grade.
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
  // '[human] ' marks provenance, 'unrated' keeps strength honest until assessed.
  app.store.putObject('evidence_relation', EvidenceRelation.parse({
    id: newId('ev'),
    runId,
    relation: direction === 'supports' ? 'supports' : 'contradicts',
    claimId,
    targetHypothesisId: hyp.id,
    rationale: `[human] ${note ?? 'manually linked by the researcher in the workbench'}`,
    strength: 'unrated',
    uncertainties: [],
    createdAt: new Date().toISOString(),
  }));
  app.store.appendEvent(runId, {
    type: 'note',
    detail: { reason: 'claim_linked_human', hypothesisId: hyp.id, claimId, direction, actor: 'human' },
  });
  return { hypothesisId: hyp.id, claimId, direction };
}
