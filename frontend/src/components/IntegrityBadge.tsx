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
  live: 'border-success/40 bg-success/10 text-success',
  cached: 'border-warning/40 bg-warning/10 text-warning',
  replay: 'border-border bg-muted text-muted-foreground',
  fixture: 'border-stone-400/50 bg-stone-100 text-stone-700',
  unknown: 'border-destructive/50 bg-destructive/5 text-destructive',
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
