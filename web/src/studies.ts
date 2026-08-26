/**
 * Study identity model (M2 workspace model, extracted as the single owner):
 * runs that asked the same question are one study — the researcher's mental
 * object, not a status bucket. Normalized question text is the key (id
 * fallback keeps unlabelled runs singletons). Shared by the lab home index,
 * the study map switcher, and legacy workbench surfaces during migration.
 */
import type { RunSummary } from './api/types';

export function runLabel(run: RunSummary): string {
  const text = run.questionText?.trim();
  return text !== undefined && text.length > 0 ? text : run.id;
}

export function studyKey(run: RunSummary): string {
  const q = run.questionText?.trim().toLowerCase().replace(/\s+/g, ' ');
  return q !== undefined && q.length > 0 ? q : run.id;
}

export interface StudyGroup {
  key: string;
  question: string;
  runs: RunSummary[]; // newest first
  latest: RunSummary;
  activeCount: number;
  failedCount: number;
}

export function groupStudies(filtered: RunSummary[]): StudyGroup[] {
  const byStudy = new Map<string, StudyGroup>();
  for (const run of filtered) {
    const key = studyKey(run);
    const group = byStudy.get(key);
    if (group === undefined) {
      byStudy.set(key, {
        key,
        question: runLabel(run),
        runs: [run],
        latest: run,
        activeCount: run.status === 'running' || run.status === 'queued' ? 1 : 0,
        failedCount: run.status === 'partial' || run.status === 'failed' || run.status === 'cancelled' ? 1 : 0,
      });
    } else {
      group.runs.push(run);
      if (run.status === 'running' || run.status === 'queued') group.activeCount += 1;
      if (run.status === 'partial' || run.status === 'failed' || run.status === 'cancelled') group.failedCount += 1;
      if (Date.parse(run.createdAt) > Date.parse(group.latest.createdAt)) group.latest = run;
    }
  }
  const groups = [...byStudy.values()];
  for (const g of groups) g.runs.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  groups.sort((a, b) => {
    // Live studies float to the top regardless of recency — the researcher's
    // running work outranks everything else in the library.
    if (a.activeCount !== b.activeCount) return b.activeCount - a.activeCount;
    return Date.parse(b.latest.createdAt) - Date.parse(a.latest.createdAt);
  });
  return groups;
}
