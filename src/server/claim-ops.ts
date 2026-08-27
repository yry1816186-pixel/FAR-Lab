import { z } from 'zod';
import { ScientificClaim } from '../domain/index.js';
import type { App } from '../app/composition.js';

/**
 * HX §15 evidence annotation/classification operations — the researcher
 * judgement layer over claims (annotate / pin / exclude / reinstate /
 * reclassify), driven from the workbench. Grounding rules (mirrors
 * hypothesis-ops.ts):
 *  - Objects are stored globally by id — every load is ownership-guarded: the
 *    claim MUST belong to the addressed run. Cross-run mutation is a
 *    truthfulness violation, not a 500.
 *  - Every real mutation appends an audit event ('note' with a stable reason,
 *    actor 'human'); idempotent no-ops mutate nothing and event nothing.
 *  - The researcher layer is strictly additive: pipeline provenance fields
 *    (locators / bindingStatus / gradeCertainty / taint) are never touched.
 *    Exclusion changes analysis INPUTS (researcher-adjusted ACH projection),
 *    never the historical record — the claim stays queryable and exportable
 *    with its exclusion disclosed.
 *  - exclude/reclassify REQUIRE a reason: these change how evidence enters
 *    analysis, so the decision must be reviewable (G3 researcher control).
 */

export type ClaimOpErrorCode = 'not_found' | 'target_not_found' | 'validation';

export class ClaimOpError extends Error {
  constructor(readonly status: number, readonly code: ClaimOpErrorCode, message: string) {
    super(message);
  }
}

const badRequest = (message: string): ClaimOpError =>
  new ClaimOpError(400, 'validation', message);

const targetNotFound = (message: string): ClaimOpError =>
  new ClaimOpError(404, 'target_not_found', message);

export const AnnotateClaimBody = z.object({ text: z.string().min(1).max(2_000) });
export type AnnotateClaimInput = z.infer<typeof AnnotateClaimBody>;

export const ExcludeClaimBody = z.object({ reason: z.string().min(1).max(2_000) });
export type ExcludeClaimInput = z.infer<typeof ExcludeClaimBody>;

export const ReclassifyClaimBody = z.object({
  classification: z.enum(['core-evidence', 'counter-evidence', 'background', 'methodological-concern']),
  note: z.string().max(2_000).optional(),
});
export type ReclassifyClaimInput = z.infer<typeof ReclassifyClaimBody>;

/** Status-style bodies (pin/unpin/reinstate) accept only an optional free-text note. */
const NoteOnlyBody = z.object({ note: z.string().max(2_000).optional() });

const issueText = (issues: z.ZodIssue[]): string =>
  issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');

/** Run-existence + run-ownership guard (same semantics as hypothesis-ops). */
const mustGetClaim = (app: App, runId: string, claimId: string): ScientificClaim => {
  if (app.store.getRun(runId) === null) {
    throw new ClaimOpError(404, 'not_found', `run ${runId} not found`);
  }
  const claim = app.store.getObject('claim', claimId);
  if (claim === null || claim.runId !== runId) {
    throw targetNotFound(`claim ${claimId} not found in run ${runId}`);
  }
  return claim;
};

export interface ClaimMutationResult {
  claimId: string;
  researcher: ScientificClaim['researcher'];
  /** Present only when this call performed a real mutation (null on idempotent no-op). */
  eventId: number | null;
}

// ---- annotate ----

export function annotateClaim(app: App, runId: string, claimId: string, rawBody: unknown): ClaimMutationResult {
  const parsed = AnnotateClaimBody.safeParse(rawBody);
  if (!parsed.success) throw badRequest(`invalid annotate request: ${issueText(parsed.error.issues)}`);
  const { text } = parsed.data;
  const claim = mustGetClaim(app, runId, claimId);
  const now = new Date().toISOString();
  const updated = ScientificClaim.parse({
    ...claim,
    researcher: {
      ...claim.researcher,
      annotations: [...claim.researcher.annotations, { text, at: now }],
    },
  });
  app.store.putObject('claim', updated);
  const event = app.store.appendEvent(runId, {
    type: 'note',
    detail: { reason: 'claim_annotated_human', claimId, actor: 'human' },
  });
  return { claimId: updated.id, researcher: updated.researcher, eventId: event.seq };
}

// ---- pin / unpin ----

export function pinClaim(app: App, runId: string, claimId: string, pin: boolean, rawBody: unknown): ClaimMutationResult {
  const parsed = NoteOnlyBody.safeParse(rawBody);
  if (!parsed.success) throw badRequest(`invalid ${pin ? 'pin' : 'unpin'} request: ${issueText(parsed.error.issues)}`);
  const claim = mustGetClaim(app, runId, claimId);
  if (claim.researcher.pinned === pin) {
    // Idempotent: the pin state already matches — nothing to mutate or audit.
    return { claimId: claim.id, researcher: claim.researcher, eventId: null };
  }
  const now = new Date().toISOString();
  const updated = ScientificClaim.parse({
    ...claim,
    researcher: {
      ...claim.researcher,
      pinned: pin,
      pinnedAt: pin ? now : undefined,
    },
  });
  app.store.putObject('claim', updated);
  const event = app.store.appendEvent(runId, {
    type: 'note',
    detail: { reason: pin ? 'claim_pinned_human' : 'claim_unpinned_human', claimId, actor: 'human' },
  });
  return { claimId: updated.id, researcher: updated.researcher, eventId: event.seq };
}

// ---- exclude / reinstate ----

export function excludeClaim(app: App, runId: string, claimId: string, rawBody: unknown): ClaimMutationResult {
  const parsed = ExcludeClaimBody.safeParse(rawBody);
  if (!parsed.success) throw badRequest(`invalid exclude request (reason is required): ${issueText(parsed.error.issues)}`);
  const { reason } = parsed.data;
  const claim = mustGetClaim(app, runId, claimId);
  if (claim.researcher.excluded) {
    // Idempotent: already excluded — the original reason stays authoritative.
    return { claimId: claim.id, researcher: claim.researcher, eventId: null };
  }
  const now = new Date().toISOString();
  const updated = ScientificClaim.parse({
    ...claim,
    researcher: {
      ...claim.researcher,
      excluded: true,
      excludedAt: now,
      excludedReason: reason,
    },
  });
  app.store.putObject('claim', updated);
  const event = app.store.appendEvent(runId, {
    type: 'note',
    detail: { reason: 'claim_excluded_human', claimId, excludedReason: reason, actor: 'human' },
  });
  return { claimId: updated.id, researcher: updated.researcher, eventId: event.seq };
}

export function reinstateClaim(app: App, runId: string, claimId: string, rawBody: unknown): ClaimMutationResult {
  const parsed = NoteOnlyBody.safeParse(rawBody);
  if (!parsed.success) throw badRequest(`invalid reinstate request: ${issueText(parsed.error.issues)}`);
  const { note } = parsed.data;
  const claim = mustGetClaim(app, runId, claimId);
  if (!claim.researcher.excluded) {
    // Idempotent: not excluded — nothing to mutate or audit.
    return { claimId: claim.id, researcher: claim.researcher, eventId: null };
  }
  const updated = ScientificClaim.parse({
    ...claim,
    researcher: {
      ...claim.researcher,
      excluded: false,
      // The exclusion history stays reviewable via the audit event trail;
      // the ACTIVE state no longer carries stale exclusion fields.
      excludedAt: undefined,
      excludedReason: undefined,
    },
  });
  app.store.putObject('claim', updated);
  const event = app.store.appendEvent(runId, {
    type: 'note',
    detail: { reason: 'claim_reinstated_human', claimId, note, actor: 'human' },
  });
  return { claimId: updated.id, researcher: updated.researcher, eventId: event.seq };
}

// ---- reclassify ----

export function reclassifyClaim(app: App, runId: string, claimId: string, rawBody: unknown): ClaimMutationResult {
  const parsed = ReclassifyClaimBody.safeParse(rawBody);
  if (!parsed.success) throw badRequest(`invalid reclassify request: ${issueText(parsed.error.issues)}`);
  const { classification, note } = parsed.data;
  const claim = mustGetClaim(app, runId, claimId);
  if (claim.researcher.classification === classification) {
    // Idempotent: same classification already active.
    return { claimId: claim.id, researcher: claim.researcher, eventId: null };
  }
  const now = new Date().toISOString();
  const updated = ScientificClaim.parse({
    ...claim,
    researcher: {
      ...claim.researcher,
      classification,
      classifiedAt: now,
    },
  });
  app.store.putObject('claim', updated);
  const event = app.store.appendEvent(runId, {
    type: 'note',
    detail: {
      reason: 'claim_reclassified_human',
      claimId,
      from: claim.researcher.classification ?? null,
      to: classification,
      note,
      actor: 'human',
    },
  });
  return { claimId: updated.id, researcher: updated.researcher, eventId: event.seq };
}

/**
 * Researcher-adjusted ACH projection (read-time, deterministic): excludes the
 * excluded claims' relations and recomputes diagnosticity + ordering
 * sensitivity with the SAME pure functions the pipeline used. This is a
 * PROJECTION, not a new source of truth — the stored AchAnalysis stays
 * untouched and both views are disclosed. Null when no exclusion exists
 * (the common case adds no payload noise).
 */
export const excludedClaimIdsOf = (claims: readonly ScientificClaim[]): string[] =>
  claims.filter((c) => c.researcher.excluded).map((c) => c.id);
