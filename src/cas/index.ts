/**
 * cas/ barrel —— 内容寻址 blob CAS（FUSION-OS-9）。
 *
 * Authority: PROJECT_PLAN/FUSION_OPEN_SCIENCE_DESIGN.md §4 FUSION-OS-9。
 */

export type { FarBlobRow } from './blob_store.ts';
export { storeBlob, getBlob, blobExists } from './blob_store.ts';
