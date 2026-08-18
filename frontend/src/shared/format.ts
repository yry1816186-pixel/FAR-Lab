/** Locale-aware formatting helpers (dates, counts, rates). No library. */

/** ISO timestamp → locale date-time string; invalid input passes through verbatim. */
export function formatDateTime(iso: string | null | undefined, locale: string): string {
  if (iso === null || iso === undefined || iso.length === 0) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

/** Ratio → percent string with one decimal; null renders as an honest dash. */
export function formatRate(value: number | null): string {
  if (value === null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

/** Metric value cell: numbers keep precision, null is an honest dash. */
export function formatMetric(value: number | boolean | null): string {
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return Number.isInteger(value) ? String(value) : value.toPrecision(4);
}
