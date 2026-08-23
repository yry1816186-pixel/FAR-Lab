import { z } from 'zod';
import { newId } from './ids.js';

/**
 * Research Memory (RU-1, AVO G7) — the cross-run memory substrate's ONE domain
 * vocabulary. Design rulings (research/tech-intel/RU1-MEMORY.md, adjudicated):
 * - far.db is the single authoritative store (dedicated governed tables); no
 *   second memory DB, no competing authority.
 * - Schema governance over free-form RAG (AutoSci SciMem adaptation): typed
 *   entities, lifecycle transitions, negative results cannot be archived
 *   without a recorded failure reason.
 * - Poisoning co-design (RU-3): trust_class is DERIVED from content taint +
 *   provenance resolvability — never asserted freely by callers.
 *
 * T2 unification: ContentTaint below is the single owner of the content-taint
 * vocabulary for the whole product (claims, events, memory). Hard invariant:
 * derived_untrusted content must never enter permission decisions, approval
 * justifications, verdicts, or unlabelled exports.
 */

export const ContentTaint = z.enum(['trusted', 'untrusted_literal', 'derived_untrusted']);
export type ContentTaint = z.infer<typeof ContentTaint>;

export const MemoryTrustClass = z.enum([
  'own_verified',      // our experiment/verdict output, receipt-resolvable
  'own_unverified',    // our pipeline output without a resolvable receipt
  'external_literature', // extracted from retrieved literature (data, never instructions)
  'external_untrusted',  // MCP/web/tool output of unknown provenance
]);
export type MemoryTrustClass = z.infer<typeof MemoryTrustClass>;

/**
 * Deterministic trust derivation (the cross-RU ruling, executable):
 * taint says where content came from; provenance resolvability upgrades or
 * fences it. External content NEVER becomes own_* — retrieval presents labels.
 */
export const deriveTrustClass = (taint: ContentTaint, provenance: { runId?: string; receiptId?: string; sourceRef?: string }): MemoryTrustClass => {
  if (taint === 'untrusted_literal' || taint === 'derived_untrusted') {
    return provenance.sourceRef !== undefined ? 'external_literature' : 'external_untrusted';
  }
  // trusted content: our own pipeline output — verified only with resolvable provenance
  if (provenance.runId !== undefined && provenance.receiptId !== undefined) return 'own_verified';
  return 'own_unverified';
};

export const MemoryKind = z.enum(['episodic', 'semantic', 'experiment_outcome', 'profile']);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemoryStatus = z.enum(['active', 'superseded', 'archived']);
export type MemoryStatus = z.infer<typeof MemoryStatus>;

export const MemoryOutcome = z.enum(['succeeded', 'failed', 'inconclusive']);
export type MemoryOutcome = z.infer<typeof MemoryOutcome>;

/** Allowed lifecycle transitions (AutoSci-style governance; supersede is append-only). */
export const MEMORY_LIFECYCLE: Readonly<Record<MemoryStatus, readonly MemoryStatus[]>> = {
  active: ['superseded', 'archived'],
  superseded: ['archived'],
  archived: [],
};

const MemoryId = z.string().regex(/^mem_[a-z0-9]+$/, 'must be mem_<random>');

export const MemoryItemSchema = z.object({
  id: MemoryId,
  kind: MemoryKind,
  /** Typed entity this item records (hypothesis|experiment|finding|failure|preference|...). */
  entityType: z.string().min(2).max(48),
  title: z.string().min(3).max(200),
  body: z.string().min(1),
  status: MemoryStatus,
  /** Required when an experiment_outcome records a failure — negative results stay explainable. */
  outcome: MemoryOutcome.optional(),
  failureReason: z.string().min(3).optional(),
  trustClass: MemoryTrustClass,
  taint: ContentTaint,
  provenance: z.object({
    runId: z.string().optional(),
    receiptId: z.string().optional(),
    sourceRef: z.string().optional(), // DOI/URL for external_literature
  }),
  createdAt: z.string().datetime(),
  lastAccessedAt: z.string().datetime(),
  accessCount: z.number().int().nonnegative().default(0),
  /** Append-only supersession: the item this one replaces (never a delete). */
  supersedesId: MemoryId.optional(),
}).refine(
  (m) => m.kind !== 'experiment_outcome' || m.outcome === undefined || m.outcome !== 'failed' || (m.failureReason !== undefined && m.failureReason.length >= 3),
  { message: 'a failed experiment_outcome requires a failureReason (negative results stay explainable)' },
).refine(
  (m) => m.trustClass !== 'external_literature' || m.provenance.sourceRef !== undefined,
  { message: 'external_literature requires a sourceRef (DOI/URL)' },
);
export type MemoryItem = z.infer<typeof MemoryItemSchema>;

export const newMemoryId = (): string => newId('mem');

/**
 * Deterministic activation ranking (ACT-R base-level activation lineage):
 * recent, often-accessed items rank higher; decays with half-life ~14 days.
 * Pure function of persisted timestamps/counts — no LLM anywhere.
 */
export const memoryActivation = (m: Pick<MemoryItem, 'accessCount' | 'lastAccessedAt'>, nowMs: number): number => {
  const ageDays = Math.max(0, (nowMs - Date.parse(m.lastAccessedAt)) / 86_400_000);
  return Math.log1p(m.accessCount) / Math.pow(1 + ageDays / 14, 0.5);
};
