/**
 * dataset_source.ts — datasetSource 枚举 SSOT(IC-11 · ADR-015)。
 *
 * 前后端对齐:online(实时在线数据)| cached_fixture(降级缓存夹具)| replay(离线回放)| fixture(合成夹具)。
 * 后端科学管线(c_astro_pipeline)用其子集 online/cached_fixture;
 * arena/court offline_replay 标 replay;前端 IntegrityBadge 消费同一枚举(前端只呈现不推断)。
 */
export const DATASET_SOURCES = ['online', 'cached_fixture', 'replay', 'fixture'] as const;
export type DatasetSourceKind = (typeof DATASET_SOURCES)[number];

export function isDatasetSource(value: unknown): value is DatasetSourceKind {
  return typeof value === 'string' && (DATASET_SOURCES as readonly string[]).includes(value);
}
