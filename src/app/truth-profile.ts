import type { Store } from '../persistence/store.js';
import type { ProvenanceReceipt } from '../domain/index.js';

/**
 * Execution-truth profile (goal §5.5): ONE deterministic, zero-LLM projection of
 * what a run's receipts actually prove about HOW it was executed. Receipts stay
 * the single authority (this module never persists anything); every surface that
 * needs the truth boundary (API /runs/:id/truth, CLI, export disclosure, verify)
 * consumes this projection instead of re-deriving it.
 *
 * Classification is driven ONLY by external-world evidence receipts
 * (model_call + source_retrieval). Local receipts (export rendering, tool execs)
 * prove real local execution but nothing about external truth, so they never
 * upgrade the class — they are disclosed in the counts.
 *
 * Rules (ordered, first match wins):
 *   empty            no external-evidence receipts at all (run not started, or
 *                    local-only receipts such as an export re-render)
 *   mixed            live and test model calls coexist, OR live model calls ran
 *                    over replayed retrieval (a live brain over recorded worlds)
 *   synthetic        test model calls only (deterministic stub plane)
 *   live             a live model call or a live retrieval touched the external world
 *   recorded_replay  no external contact this run: retrieval served exclusively
 *                    from recorded state (replay mode, or cache hit/stale only)
 *
 * Cache disclosure is orthogonal and always carried in the counts: 'hit'/'stale'
 * are read-through servings of previously live-fetched data; only 'replay' means
 * the live source was deliberately never callable.
 */

export const RunTruthClass = ['live', 'mixed', 'recorded_replay', 'synthetic', 'empty'] as const;
export type RunTruthClass = (typeof RunTruthClass)[number];

export interface RunTruthProfile {
  runId: string;
  klass: RunTruthClass;
  modelCalls: { live: number; test: number };
  retrieval: { live: number; hit: number; stale: number; replay: number };
  toolExecs: number;
  totalReceipts: number;
}

const countModel = (receipts: readonly ProvenanceReceipt[]): { live: number; test: number } => {
  let live = 0;
  let test = 0;
  for (const r of receipts) {
    if (r.kind !== 'model_call' || r.modelCall === undefined) continue;
    if (r.executionMode === 'live') live += 1;
    else test += 1;
  }
  return { live, test };
};

const countRetrieval = (receipts: readonly ProvenanceReceipt[]): { live: number; hit: number; stale: number; replay: number } => {
  const out = { live: 0, hit: 0, stale: 0, replay: 0 };
  for (const r of receipts) {
    if (r.kind !== 'source_retrieval' || r.sourceRetrieval === undefined) continue;
    const cache = r.sourceRetrieval.cache;
    if (cache === 'hit') out.hit += 1;
    else if (cache === 'stale') out.stale += 1;
    else if (cache === 'replay') out.replay += 1;
    else out.live += 1;
  }
  return out;
};

export const classifyTruth = (modelCalls: { live: number; test: number }, retrieval: { live: number; hit: number; stale: number; replay: number }): RunTruthClass => {
  const evidence = modelCalls.live + modelCalls.test + retrieval.live + retrieval.hit + retrieval.stale + retrieval.replay;
  if (evidence === 0) return 'empty';
  if (modelCalls.test > 0 && modelCalls.live > 0) return 'mixed';
  if (modelCalls.test > 0) return 'synthetic';
  if (modelCalls.live > 0 && retrieval.replay > 0) return 'mixed';
  if (modelCalls.live > 0 || retrieval.live > 0) return 'live';
  return 'recorded_replay';
};

export const truthProfileFromReceipts = (runId: string, receipts: readonly ProvenanceReceipt[]): RunTruthProfile => {
  const modelCalls = countModel(receipts);
  const retrieval = countRetrieval(receipts);
  return {
    runId,
    klass: classifyTruth(modelCalls, retrieval),
    modelCalls,
    retrieval,
    toolExecs: receipts.filter((r) => r.kind === 'tool_exec').length,
    totalReceipts: receipts.length,
  };
};

export const runTruthProfile = (store: Store, runId: string): RunTruthProfile =>
  truthProfileFromReceipts(runId, store.listObjects('receipt', runId) as ProvenanceReceipt[]);

/** Human-facing one-liner (zh, matching the report's bilingual convention). */
export const truthDisclosureLine = (p: RunTruthProfile): string =>
  `执行真实性：${p.klass} —— live 模型调用 ${p.modelCalls.live} 次、确定性测试调用 ${p.modelCalls.test} 次、live 检索 ${p.retrieval.live} 次、缓存命中 ${p.retrieval.hit} 次、过期缓存 ${p.retrieval.stale} 次、记录重放 ${p.retrieval.replay} 次（共 ${p.totalReceipts} 条回执）`;
