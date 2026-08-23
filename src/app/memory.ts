import { createHash } from 'node:crypto';
import type { Store } from '../persistence/store.js';
import { MemoryItemSchema, type MemoryItem } from '../domain/memory.js';
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
      title: `experiment ${exp.status}: spec ${exp.specId} (executor ${exp.executor})`,
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

  for (const item of items) store.putMemory(item);
  return { runId, itemsWritten: items.length, skipped };
};
