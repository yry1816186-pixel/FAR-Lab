/**
 * dataset_source.ts — 前端 datasetSource 枚举(IC-11 · ADR-015)。
 * 与后端 src/schema/dataset_source.ts 对齐(前端只呈现不推断)。
 */
export const DATASET_SOURCES = ['online', 'cached_fixture', 'replay', 'fixture'] as const;
export type DatasetSourceKind = (typeof DATASET_SOURCES)[number];

export function isDatasetSource(value: unknown): value is DatasetSourceKind {
  return typeof value === 'string' && (DATASET_SOURCES as readonly string[]).includes(value);
}

/** 视觉语义映射(低饱和、暖色、可区分;unknown 不猜测,显式标注)。 */
export const DATASET_SOURCE_META: Readonly<
  Record<DatasetSourceKind, { label: string; tone: 'live' | 'cached' | 'replay' | 'fixture'; hint: string }>
> = {
  online: { label: 'Live', tone: 'live', hint: 'real-time online data source' },
  cached_fixture: { label: 'Cached reference', tone: 'cached', hint: 'degraded: cached reference fallback (baseline_exempt)' },
  replay: { label: 'Replay', tone: 'replay', hint: 'offline replay of recorded reference data — NOT live inference' },
  fixture: { label: 'Reference data', tone: 'fixture', hint: 'synthetic reference data — for regression only' },
};
