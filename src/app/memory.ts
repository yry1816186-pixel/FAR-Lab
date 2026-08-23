import { createHash } from 'node:crypto';
import type { Store } from '../persistence/store.js';
import { MemoryItemSchema, deriveTrustClass, type MemoryItem } from '../domain/memory.js';
import type { ExperimentRun } from '../domain/index.js';

/**
 * Deterministic memory consolidation (RU-1, TencentDB cursor-consolidation +
 * AutoSci terminal-artifact lineage): when a run reaches a terminal state, its
 * durable scientific facts are projected into cross-run memory items.
 *
 * Hard rules:
 * - ZERO LLM anywhere in consolidation (determinism-first; an LLM may later
 *   DRAFT richer summaries, but acceptance stays behind the deterministic gates).
 * - Deterministic item ids (sha256 of run+entity) make consolidation idempotent
 *   — re-running on the same terminal run replaces, never duplicates.
 * - Failed experiments REQUIRE a failureReason (the AutoSci governance gate).
 */

const memIdFor = (namespace: string, key: string): string =>
  `mem_${createHash('sha256').update(`${namespace}:${key}`).digest('hex').slice(0, 24)}`;

export interface ConsolidationResult {
  runId: string;
  itemsWritten: number;
  skipped: string[];
}

export const consolidateRun = (store: Store, runId: string, now = new Date().toISOString()): ConsolidationResult => {
  const run = store.getRun(runId);
  if (run === null) throw new Error(`consolidateRun: no such run ${runId}`);
  const skipped: string[] = [];
  const items: MemoryItem[] = [];

  // ---- episodic: the run itself as a research episode ----
  const question = store.getObject('question', run.questionId);
  const hypotheses = store.listObjects('hypothesis', runId);
  const feedbacks = store.listObjects('feedback', runId);
  items.push(MemoryItemSchema.parse({
    id: memIdFor('run', runId),
    kind: 'episodic',
    entityType: 'run',
    title: (question?.text ?? runId).slice(0, 200),
    body: JSON.stringify({
      runId, status: run.status, questionId: run.questionId,
      hypothesisCount: hypotheses.length, feedbackCount: feedbacks.length,
      completedAt: now,
    }),
    status: 'active',
    trustClass: 'own_unverified', // deterministic projection of run state; no per-item receipt
    taint: 'trusted',
    provenance: { runId },
    createdAt: now, lastAccessedAt: now, accessCount: 0,
  }));

  // ---- experiment_outcome: every terminal experiment becomes reusable knowledge ----
  const experiments = store.listObjects('experiment_run', runId) as unknown as ExperimentRun[];
  for (const exp of experiments) {
    if (exp.status === 'queued' || exp.status === 'running') {
      skipped.push(`${exp.id}: non-terminal (${exp.status})`);
      continue;
    }
    const outcome =
      exp.status === 'completed' ? 'succeeded' as const
      : (exp.status === 'failed' || exp.status === 'canceled') ? 'failed' as const
      : 'inconclusive' as const;
    const failureReason =
      outcome === 'failed'
        ? (exp.error ?? `experiment ${exp.status} (no error detail recorded)`).slice(0, 500)
        : undefined;
    const verdicts = exp.statReportIds
      .map((sid) => store.getObject('stat_report', sid))
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .map((s) => ({ metric: s.metricKey, estimate: s.pointEstimate, ci: s.ci }));
    items.push(MemoryItemSchema.parse({
      id: memIdFor('experiment', exp.id),
      kind: 'experiment_outcome',
      entityType: 'experiment',
      // question context rides the title so question-keyword retrieval reaches
      // experiment outcomes (the body is ids/hashes alone — not searchable prose)
      title: `experiment ${exp.status} for: ${(question?.text ?? runId).slice(0, 120)}`,
      body: JSON.stringify({
        experimentRunId: exp.id, specId: exp.specId, specHash: exp.specHash,
        status: exp.status, executor: exp.executor,
        resultCount: exp.resultIds.length, statReports: verdicts,
      }),
      status: 'active',
      outcome,
      ...(failureReason !== undefined ? { failureReason } : {}),
      trustClass: 'own_unverified', // run-bound facts; per-call receipts are not itemized here
      taint: 'trusted',
      provenance: { runId },
      createdAt: exp.endedAt ?? now, lastAccessedAt: now, accessCount: 0,
    }));
  }

  // ---- semantic: durable literature findings (claims participating in relations) ----
  items.push(...semanticFindingsForRun(store, runId, now));

  for (const item of items) store.putMemory(item);
  return { runId, itemsWritten: items.length, skipped };
};

/** Cap: at most this many semantic findings per run (memory-flood guard). */
export const SEMANTIC_FINDINGS_PER_RUN = 20;

/**
 * RU-1 semantic writer: verified claims that PARTICIPATE in evidence relations
 * (the durable literature findings of this run) become semantic memory items.
 * Deterministic derivation, zero LLM: trust = external_literature with the
 * source's resolvable identifier as sourceRef (the putMemory gate REQUIRES it);
 * claims without a resolvable DOI/URL are fenced to external_untrusted honestly
 * rather than fabricated as literature. Bounded per run.
 */
export const semanticFindingsForRun = (
  store: Store,
  runId: string,
  now = new Date().toISOString(),
): MemoryItem[] => {
  const relations = store.listObjects('evidence_relation', runId) as unknown as Array<{ claimId?: string; sourceDocumentId?: string; relation: string }>;
  const claimsById = new Map(
    (store.listObjects('claim', runId) as unknown as Array<{ id: string; text: string; locators: Array<{ sourceDocumentId: string }> }>)
      .map((c) => [c.id, c]),
  );
  const docsById = new Map(
    (store.listObjects('source_document', runId) as unknown as Array<{ id: string; identifiers: Array<{ kind: string; value: string }> }>)
      .map((d) => [d.id, d]),
  );
  const findings = new Map<string, { claim: { id: string; text: string; locators: Array<{ sourceDocumentId: string }> }; relations: string[] }>();
  for (const rel of relations) {
    const claim = rel.claimId !== undefined ? claimsById.get(rel.claimId) : undefined;
    if (claim === undefined) continue;
    const entry = findings.get(claim.id) ?? { claim, relations: [] };
    entry.relations.push(rel.relation);
    findings.set(claim.id, entry);
  }
  const out: MemoryItem[] = [];
  for (const { claim, relations: rels } of findings.values()) {
    if (out.length >= SEMANTIC_FINDINGS_PER_RUN) break;
    const docId = claim.locators[0]?.sourceDocumentId;
    const doc = docId !== undefined ? docsById.get(docId) : undefined;
    const doi = doc?.identifiers.find((i) => i.kind === 'doi')?.value;
    const url = doc?.identifiers.find((i) => i.kind === 'url')?.value;
    const sourceRef = doi !== undefined ? `doi:${doi}` : url;
    out.push(MemoryItemSchema.parse({
      id: memIdFor('claim', claim.id),
      kind: 'semantic',
      entityType: 'finding',
      title: claim.text.slice(0, 200),
      body: JSON.stringify({ claimId: claim.id, relations: rels, sourceDocumentId: docId ?? null }),
      status: 'active',
      trustClass: deriveTrustClass('derived_untrusted', { runId, ...(sourceRef !== undefined ? { sourceRef } : {}) }),
      taint: 'derived_untrusted',
      provenance: {
        runId,
        ...(sourceRef !== undefined ? { sourceRef } : {}),
      },
      createdAt: now, lastAccessedAt: now, accessCount: 0,
    }));
  }
  return out;
};

/**
 * RU-1 profile writer: researcher preferences derived deterministically from a
 * conversation's proposal resolutions — per action kind, the LATEST resolution
 * decides the disposition (approved/rejected), and remembered grants surface as
 * auto-trust. Same-id latest-wins (one preference object per kind, idempotent),
 * consistent with deterministic consolidation ids.
 */
export const consolidateConversationProfile = (
  store: Store,
  conversation: { id: string; autoApprove: readonly string[]; messages: readonly { proposals?: Array<{ kind: string; status: string; resolvedAt?: string }> }[] },
  now = new Date().toISOString(),
): { itemsWritten: number } => {
  const latest = new Map<string, { disposition: 'approved' | 'rejected'; resolvedAt: string }>();
  for (const m of conversation.messages) {
    for (const p of m.proposals ?? []) {
      if (p.status !== 'executed' && p.status !== 'rejected') continue;
      const at = p.resolvedAt ?? '';
      const prev = latest.get(p.kind);
      if (prev === undefined || at >= prev.resolvedAt) {
        latest.set(p.kind, { disposition: p.status === 'executed' ? 'approved' : 'rejected', resolvedAt: at });
      }
    }
  }
  const remembered = new Set(conversation.autoApprove);
  for (const [kind, state] of latest) {
    store.putMemory(MemoryItemSchema.parse({
      id: memIdFor('profile', `${conversation.id}:${kind}`),
      kind: 'profile',
      entityType: 'preference',
      title: `researcher preference: ${kind} → ${state.disposition}${remembered.has(kind) ? ' (auto-trusted in this conversation)' : ''}`,
      body: JSON.stringify({ conversationId: conversation.id, kind, disposition: state.disposition, rememberedGrant: remembered.has(kind), resolvedAt: state.resolvedAt }),
      status: 'active',
      trustClass: 'own_unverified', // deterministic projection of conversation state; no per-item receipt
      taint: 'trusted',
      provenance: {},
      createdAt: now, lastAccessedAt: now, accessCount: 0,
    }));
  }
  return { itemsWritten: latest.size };
};

/**
 * Memory consumer #1 (RU-1 MIGRATE CALLERS): negative conditioning for hypothesis
 * generation. Deterministic retrieval of past OWN outcomes relevant to the
 * question — failed experiments must not be re-proposed blind. Trust-filtered to
 * own_* classes (external literature already conditions via claims); bounded;
 * labels travel with every item (RU-3: memory is data, never instructions).
 */
export const memoryNegativeConditioning = (
  store: Store,
  questionText: string,
  limit = 5,
): Array<{ id: string; kind: string; title: string; body: string; trustClass: string }> => {
  const words = questionText
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 4)
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);
  if (words.length === 0) return [];
  // keyword OR semantics — a phrase match would demand adjacent ordered terms,
  // which question-derived keywords never satisfy against stored titles/bodies.
  const hits = store.searchMemory({
    query: words.join(' '),
    mode: 'or',
    kinds: ['experiment_outcome', 'episodic'],
    trustClasses: ['own_verified', 'own_unverified'],
    limit,
  });
  return hits.map((h) => ({ id: h.id, kind: h.kind, title: h.title, body: h.body, trustClass: h.trustClass }));
};
