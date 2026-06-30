/**
 * Dataset resolver — 数据集解析决策树（spec 12 §2.1-§2.2）。
 *
 * 三值决策：
 *   lightkurve / astroquery.mast（在线查询·白名单 host）：
 *     成功 + contentHash 命中 → resolved
 *     成功 + contentHash 不命中 → DATA_INTEGRITY_FAIL → degraded (DEGRADED_SCOPE)
 *     失败（网络/限流/MAST 维护）→ 落 cached_fixture
 *   cached_fixture（仓库内置 fixture）：
 *     命中 + contentHash 一致 → degraded（标 baseline_exempt · 02 C20）
 *     缺失 → untested（02 F1 · 绝不伪造数据）
 *
 * 诚实铁律（F1/F9）：cached 结果**绝不**升 CONFIRMED；fixture 缺失**绝不**伪造。
 *
 * 权威 SSOT：FINAL_PACKAGE/12_EXECUTABLE_SCIENCE_HARNESS.md §2.2。
 * 零容忍合规：无 any / @ts-ignore / 空 catch / 双重断言。
 */

import type {
  DatasetRef,
  DatasetResolution,
  DatasetResolutionStatus,
} from './types.ts';

/** 在线数据集白名单 host（SR-5 · spec 12 §2.2）。 */
export const DATASET_HOST_WHITELIST = [
  'mast.stsci.edu',
  'heasarc.gsfc.nasa.gov',
] as const;

/**
 * 解析数据集（V1 类型层决策树）。
 *
 * @param onlineAttempt 在线查询结果（null 表示未尝试/不可达）。
 * @param expectedContentHash 预期内容 hash（contentHash 不命中 → 数据完整性失败）。
 * @param cachedFixture 仓库内置 fixture（在线失败时兜底）。
 *
 * V1 诚实边界：本函数不执行真实网络请求（F4·V1 类型层）。
 * 调用方传入 onlineAttempt 的结果形态，本函数按 spec 12 §2.2 决策树映射为三态。
 */
export function resolveDataset(args: {
  readonly onlineAttempt: { readonly ref: DatasetRef; readonly hostWhitelisted: boolean } | null;
  readonly expectedContentHash: string | null;
  readonly cachedFixture: { readonly ref: DatasetRef } | null;
}): DatasetResolution {
  const { onlineAttempt, expectedContentHash, cachedFixture } = args;

  // 1. 在线查询路径（lightkurve / astroquery.mast）。
  if (onlineAttempt !== null) {
    if (!onlineAttempt.hostWhitelisted) {
      // SR-5：非白名单 host → 视为网络被阻，降级 cached_fixture。
      return resolveCachedOrUntested(
        cachedFixture,
        'online host not in whitelist (SR-5 network-restricted); fell back to cached_fixture',
      );
    }
    if (expectedContentHash !== null && onlineAttempt.ref.contentHash !== expectedContentHash) {
      // contentHash 不命中 → DATA_INTEGRITY_FAIL → degraded（DEGRADED_SCOPE · 02 C8）。
      return {
        status: 'degraded',
        ref: onlineAttempt.ref,
        exempt: true,
        reason: `contentHash mismatch (DATA_INTEGRITY_FAIL · 02 C8): expected ${expectedContentHash.slice(0, 16)}… got ${onlineAttempt.ref.contentHash.slice(0, 16)}…`,
      };
    }
    // 成功 + hash 命中 → resolved（非豁免）。
    return {
      status: 'resolved',
      ref: onlineAttempt.ref,
      exempt: false,
      reason: 'online dataset resolved with matching contentHash',
    };
  }

  // 2. 在线不可达/未尝试 → 落 cached_fixture。
  return resolveCachedOrUntested(
    cachedFixture,
    'online resolver unavailable (network/MAST/rate-limit); fell back to cached_fixture',
  );
}

function resolveCachedOrUntested(
  cachedFixture: { readonly ref: DatasetRef } | null,
  reason: string,
): DatasetResolution {
  if (cachedFixture !== null) {
    // fixture 命中 → degraded（标 exempt · 02 C20 · 上游映射 baseline_exempt · 绝不升 CONFIRMED）。
    return {
      status: 'degraded',
      ref: cachedFixture.ref,
      exempt: true,
      reason: `cached_fixture fallback (exempt · 02 C20): ${reason}`,
    };
  }
  // fixture 缺失 → untested（02 F1 · 绝不伪造数据）。
  return {
    status: 'untested',
    ref: null,
    exempt: true,
    reason: `no cached_fixture available (UNTESTED · 02 F1 · never fabricate): ${reason}`,
  };
}

/**
 * 将 DatasetResolutionStatus 映射为 verdict_mapping 的影响因子。
 * resolved → 不触发降级；degraded → scope_narrow（DEGRADED_SCOPE）；untested → data_missing（UNTESTED）。
 */
export function datasetStatusToIntegrityFlag(
  status: DatasetResolutionStatus,
): 'scope_narrow' | 'data_missing' | null {
  switch (status) {
    case 'resolved':
      return null;
    case 'degraded':
      return 'scope_narrow';
    case 'untested':
      return 'data_missing';
  }
}

/** 类型守卫：purpose_tag 字符串是否属于 baseline_exempt 通道（02 C20）。 */
export function isBaselineExempt(purposeTag: string): boolean {
  return purposeTag === 'baseline_exempt';
}
