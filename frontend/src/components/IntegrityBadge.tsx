/**
 * IntegrityBadge.tsx — 数据来源诚实边界徽标(IC-11 · ADR-015)。
 *
 * 规则:
 *   - 每个 datasetSource 状态有可见区分(色块+标签+title 提示);
 *   - 后端未标注/非法值 → 显式 unknown 态(不猜测、不静默);
 *   - 标识与后端事实一致(前端只呈现不推断)。
 */
import { DATASET_SOURCE_META, isDatasetSource, type DatasetSourceKind } from '../lib/dataset_source.ts';

const TONE_CLASSES: Readonly<Record<'live' | 'cached' | 'replay' | 'fixture' | 'unknown', string>> = {
  live: 'border-emerald-700/40 bg-emerald-50 text-emerald-900',
  cached: 'border-amber-700/40 bg-amber-50 text-amber-900',
  replay: 'border-slate-500/40 bg-slate-100 text-slate-800',
  fixture: 'border-stone-400/50 bg-stone-100 text-stone-700',
  unknown: 'border-red-700/50 bg-red-50 text-red-900',
};

export interface IntegrityBadgeProps {
  readonly source: DatasetSourceKind | string | null | undefined;
  readonly note?: string | undefined;
  readonly className?: string | undefined;
}

export function IntegrityBadge({ source, note, className }: IntegrityBadgeProps) {
  const known = isDatasetSource(source);
  const meta = known ? DATASET_SOURCE_META[source as DatasetSourceKind] : null;
  const label = meta?.label ?? 'Unknown source';
  const hint = meta?.hint ?? 'backend did not declare a data source (treat as unverified)';
  const tone = meta?.tone ?? 'unknown';
  return (
    <span
      data-testid={`integrity-badge-${known ? (source as string) : 'unknown'}`}
      data-source={known ? (source as string) : 'unknown'}
      title={hint}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]} ${className ?? ''}`}
    >
      <span aria-hidden="true">●</span>
      <span>{label}</span>
      {note !== undefined && note.length > 0 ? <span className="opacity-70">· {note}</span> : null}
    </span>
  );
}
