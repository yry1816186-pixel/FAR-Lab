/**
 * TUI i18n mechanism (Wave A).
 *
 * The TUI's strings were born Chinese; this module makes the language a
 * runtime choice without rebuilding: `resolveLang()` honors `FARLANG`
 * (`en`, `en-US`, `zh`, `zh-CN`, ...), defaulting to zh (the historical
 * surface). English wording mirrors web/src/i18n/dict.ts — the TUI must not
 * invent competing translations for the same domain terms.
 *
 * Tables are per-domain Record maps (not flat key strings) because the TUI's
 * surfaces are enumerations (stages, statuses, connection states); a missing
 * key falls back to the raw machine value, which is honest, not blank.
 */

export type Lang = 'zh' | 'en';

export const resolveLang = (env: Record<string, string | undefined> = process.env): Lang => {
  const raw = env['FARLANG'] ?? '';
  if (/^en([-_]|$)/i.test(raw)) return 'en';
  if (/^zh([-_]|$)/i.test(raw)) return 'zh';
  return 'zh';
};

export const pick = <T>(lang: Lang, table: { zh: T; en: T }): T => table[lang];

export const STAGE_LABELS: { zh: Record<string, string>; en: Record<string, string> } = {
  zh: {
    scope: '范围界定', retrieve: '文献检索', verify_sources: '来源核验', build_evidence: '证据构建',
    generate_hypotheses: '假设生成', critique_falsify: '批判与证伪', rank: '排序评分', plan: '研究计划',
    execute: '实验执行', feedback: '反馈', revise: '修订', export: '导出',
  },
  en: {
    scope: 'Scope', retrieve: 'Retrieve', verify_sources: 'Verify sources', build_evidence: 'Build evidence',
    generate_hypotheses: 'Generate hypotheses', critique_falsify: 'Critique & falsify', rank: 'Rank', plan: 'Plan',
    execute: 'Experiment', feedback: 'Feedback', revise: 'Revise', export: 'Export',
  },
};

export const stageLabel = (stage: string, lang: Lang = 'zh'): string => STAGE_LABELS[lang][stage] ?? stage;

export const STATUS_LABELS: { zh: Record<string, string>; en: Record<string, string> } = {
  zh: {
    completed: '已完成', running: '运行中', queued: '排队中', failed: '失败',
    partial: '部分完成', paused: '已暂停', cancelled: '已取消', created: '已创建',
  },
  en: {
    completed: 'Completed', running: 'Running', queued: 'Queued', failed: 'Failed',
    partial: 'Partial', paused: 'Paused', cancelled: 'Cancelled', created: 'Created',
  },
};

export const statusLabel = (status: string, lang: Lang = 'zh'): string => STATUS_LABELS[lang][status] ?? status;

export const CONN_LABELS: { zh: Record<'connecting' | 'live' | 'reconnecting', string>; en: Record<'connecting' | 'live' | 'reconnecting', string> } = {
  zh: { connecting: '连接中', live: '实时', reconnecting: '重连中' },
  en: { connecting: 'connecting', live: 'live', reconnecting: 'reconnecting' },
};

export const relTimeLabel = (iso: string, lang: Lang = 'zh', now: () => number = Date.now): string => {
  const ms = now() - Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const min = Math.round(ms / 60000);
  if (min < 1) return lang === 'en' ? 'just now' : '刚刚';
  if (min < 60) return lang === 'en' ? `${min}m ago` : `${min} 分钟前`;
  const h = Math.round(min / 60);
  if (h < 24) return lang === 'en' ? `${h}h ago` : `${h} 小时前`;
  const d = Math.round(h / 24);
  return lang === 'en' ? `${d}d ago` : `${d} 天前`;
};
