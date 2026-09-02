import { createHash } from 'node:crypto';
import type { SplitSpec, SplitOutcome } from '../domain/experiment.js';
import type { DatasetRecordId } from '../domain/ids.js';

/**
 * Deterministic splitting (E2). Platform-stable: pure uint32 arithmetic (Math.imul/
 * >>> are well-defined), no float accumulation across platforms. The same
 * (dataset content, split spec) always yields the same partition — the split IS data,
 * reproducible without storing row assignments (they are stored anyway for audit).
 */

/** splitmix-style finalizer over (seed, index) — deterministic 32-bit hash to [0,1). */
const unit = (seed: number, i: number): number => {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (i + 0x85ebca6b), 0xc2b2ae35) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 0x1_0000_0000;
};

/** FNV-1a 32-bit over a string — for group-column bucketing. */
const fnv1a = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
};

export const splitSpecHash = (canonical: {
  datasetContentRef: string;
  targetColumn: string;
  split: SplitSpec;
  groupColumn?: string;
}): string => createHash('sha256').update(JSON.stringify(canonical)).digest('hex');

/**
 * Apply a SplitSpec to parsed rows. Allocation: within each stratum (target class when
 * stratified, everything when random), indices are ordered by the deterministic unit
 * draw and allocated to train/val/test by ratio — exact counts, stable across runs.
 * A groupColumn forces all rows of a group into one partition (bucket by group hash);
 * it overrides stratification when both are set.
 *
 * FA-DAT-01: the allocation core below consumes ONLY per-row column VALUES, never
 * full rows — applySplit (materialized rows) and applySplitColumns (streamed column
 * arrays) share it, so the streaming path cannot drift from the audited behavior.
 */
export const applySplit = (
  header: string[],
  rows: string[][],
  opts: {
    datasetRecordId: DatasetRecordId;
    datasetContentRef: string;
    targetColumn: string;
    split: SplitSpec;
    groupColumn?: string;
  },
): SplitOutcome => {
  // Column indices are computed OUTSIDE the map callbacks: property narrowing on
  // opts.groupColumn would not survive into the closures.
  const targetIdx = header.indexOf(opts.targetColumn);
  const groupIdx = opts.groupColumn !== undefined ? header.indexOf(opts.groupColumn) : -1;
  return applySplitColumns(header, rows.length, {
    targetValues: rows.map((r) => String(r[targetIdx] ?? '')),
    groupValues: groupIdx >= 0 ? rows.map((r) => String(r[groupIdx] ?? '')) : null,
  }, opts);
};

/** Column view for streaming splits: index-aligned values of the split-relevant columns. */
export interface SplitColumnValues {
  targetValues: string[];
  /** Non-null iff the spec declares a group column. */
  groupValues: string[] | null;
}

export const applySplitColumns = (
  header: string[],
  n: number,
  cols: SplitColumnValues,
  opts: {
    datasetRecordId: DatasetRecordId;
    datasetContentRef: string;
    targetColumn: string;
    split: SplitSpec;
    groupColumn?: string;
  },
): SplitOutcome => {
  const targetIdx = header.indexOf(opts.targetColumn);
  if (targetIdx < 0) throw new Error(`target column '${opts.targetColumn}' not in dataset header`);
  const groupIdx = opts.groupColumn !== undefined ? header.indexOf(opts.groupColumn) : -1;
  if (opts.groupColumn !== undefined && groupIdx < 0) {
    throw new Error(`group column '${opts.groupColumn}' not in dataset header`);
  }
  if (cols.targetValues.length !== n) {
    throw new Error(`split column view inconsistent: ${cols.targetValues.length} target values for ${n} rows`);
  }
  if (cols.groupValues !== null && cols.groupValues.length !== n) {
    throw new Error(`split column view inconsistent: ${cols.groupValues.length} group values for ${n} rows`);
  }
  const targetAt = (i: number): string => String(cols.targetValues[i] ?? '');
  const groupAt = (i: number): string => (cols.groupValues !== null ? String(cols.groupValues[i] ?? '') : '');

  const trainIdx: number[] = [];
  const valIdx: number[] = [];
  const testIdx: number[] = [];

  if (groupIdx >= 0) {
    // Group bucketing: one unit draw per GROUP (not per row) — same partition for the whole group.
    const groups = new Map<string, number[]>();
    for (let i = 0; i < n; i += 1) {
      const key = groupAt(i);
      const list = groups.get(key);
      if (list === undefined) groups.set(key, [i]);
      else list.push(i);
    }
    const ordered = [...groups.values()].sort((a, b) => unit(opts.split.seed, fnv1a(String(a[0]))) - unit(opts.split.seed, fnv1a(String(b[0]))));
    const nTrain = Math.max(1, Math.round(opts.split.ratios.train * n));
    const nVal = Math.round(opts.split.ratios.val * n);
    let assigned = 0;
    for (const members of ordered) {
      const target = assigned < nTrain ? trainIdx : assigned < nTrain + nVal ? valIdx : testIdx;
      target.push(...members);
      assigned += members.length;
    }
  } else {
    const strata: Map<string, number[]> = opts.split.method === 'random_stratified' ? new Map() : new Map([['__all__', Array.from({ length: n }, (_, i) => i)]]);
    if (opts.split.method === 'random_stratified') {
      for (let i = 0; i < n; i += 1) {
        const key = targetAt(i);
        const list = strata.get(key);
        if (list === undefined) strata.set(key, [i]);
        else list.push(i);
      }
    }
    for (const members of strata.values()) {
      const ordered = [...members].sort((a, b) => unit(opts.split.seed, a) - unit(opts.split.seed, b));
      const nStrat = ordered.length;
      const nTrain = Math.max(1, Math.round(opts.split.ratios.train * nStrat));
      const nVal = Math.round(opts.split.ratios.val * nStrat);
      for (let k = 0; k < nStrat; k += 1) {
        const idx = ordered[k];
        if (idx === undefined) continue;
        if (k < nTrain) trainIdx.push(idx);
        else if (k < nTrain + nVal) valIdx.push(idx);
        else testIdx.push(idx);
      }
    }
  }

  const asc = (a: number, b: number): number => a - b;
  trainIdx.sort(asc);
  valIdx.sort(asc);
  testIdx.sort(asc);
  const classBalance: Record<string, number> = {};
  for (const i of testIdx) {
    const cls = targetAt(i);
    classBalance[cls] = (classBalance[cls] ?? 0) + 1;
  }

  return {
    datasetRecordId: opts.datasetRecordId,
    specHash: splitSpecHash({
      datasetContentRef: opts.datasetContentRef,
      targetColumn: opts.targetColumn,
      split: opts.split,
      groupColumn: opts.groupColumn,
    }),
    trainIdx, valIdx, testIdx, classBalance,
  };
};
