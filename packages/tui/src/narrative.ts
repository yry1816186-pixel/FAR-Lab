import type { RunEvent } from './api.ts';
import { relTimeLabel, STAGE_LABELS, type Lang } from './i18n.ts';

/**
 * Stage narrative derivation — the SAME L1 semantics as the web timeline
 * (ActivityFeed): latest transition per stage wins; the researcher reads
 * stages with a plain-language line, raw telemetry stays out of the story.
 */
export interface StageRow {
  stage: string;
  status: 'done' | 'failed' | 'skipped' | 'started';
  at: string;
  summary?: string;
}

const TRANSITIONS = new Set(['stage_started', 'stage_done', 'stage_failed', 'stage_skipped']);

export function deriveStages(events: RunEvent[]): StageRow[] {
  const byStage = new Map<string, StageRow>();
  for (const e of events) {
    if (!TRANSITIONS.has(e.type) || e.stage === undefined) continue;
    const status = e.type === 'stage_done' ? 'done'
      : e.type === 'stage_failed' ? 'failed'
      : e.type === 'stage_skipped' ? 'skipped' : 'started';
    const summary = typeof e.detail?.summary === 'string' ? e.detail.summary : undefined;
    byStage.set(e.stage, { stage: e.stage, status, at: e.at, summary: summary ?? byStage.get(e.stage)?.summary });
  }
  return [...byStage.values()].reverse(); // newest first, like the web feed
}

/** Historical zh-only stage table, kept for existing importers; new code prefers stageLabel(). */
export const STAGE_ZH: Record<string, string> = STAGE_LABELS.zh;

export const stageLabel = (stage: string, lang: Lang = 'zh'): string => STAGE_LABELS[lang][stage] ?? stage;

export const STAGE_ICON: Record<StageRow['status'], string> = {
  done: '✓', failed: '✗', skipped: '–', started: '●',
};

export const relTime = (iso: string, lang: Lang = 'zh'): string => relTimeLabel(iso, lang);
