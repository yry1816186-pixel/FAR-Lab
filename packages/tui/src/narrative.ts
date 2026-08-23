import type { RunEvent } from './api.ts';

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

export const STAGE_ZH: Record<string, string> = {
  scope: '范围界定', retrieve: '文献检索', verify_sources: '来源核验', build_evidence: '证据构建',
  generate_hypotheses: '假设生成', critique_falsify: '批判与证伪', rank: '排序评分', plan: '研究计划',
  execute: '实验执行', feedback: '反馈', revise: '修订', export: '导出',
};

export const STAGE_ICON: Record<StageRow['status'], string> = {
  done: '✓', failed: '✗', skipped: '–', started: '●',
};

export function relTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const min = Math.round(ms / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.round(h / 24)} 天前`;
}
