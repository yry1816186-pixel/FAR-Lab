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
 * 历史溯源：FINAL_PACKAGE/12_EXECUTABLE_SCIENCE_HARNESS.md §2.2（已归档·备份 FAR-Lab_Backups/）·运行时 SSOT 以本文件源码实测为准。
 * 零容忍合规：无 any / @ts-ignore / 空 catch / 双重断言。
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type {
  DatasetRef,
  DatasetResolution,
  DatasetResolutionStatus,
} from './types.ts';
import { buildVenvPythonEnv } from './sandbox_runner.ts';

const DATASET_FETCH_PY = fileURLToPath(
  new URL('../../repro/science_harness/dataset_fetch.py', import.meta.url),
);

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

// ---------------------------------------------------------------------------
// V2 在线数据集获取（P1-6 · 真 spawn dataset_fetch.py）
// ---------------------------------------------------------------------------

export interface OnlineFetchParams {
  readonly resolver: 'lightkurve' | 'astroquery.mast';
  /** 目标 host（TS 侧白名单权威门——非白名单不 spawn）。 */
  readonly host: string;
  readonly version: string;
  readonly ticId?: string;
  readonly sector?: number;
  readonly timeoutMs?: number;
  readonly pythonCmd?: string;
}

export interface OnlineFetchResult {
  readonly ref: DatasetRef;
  readonly hostWhitelisted: boolean;
}

interface DatasetFetchResponse {
  readonly ok: boolean;
  readonly resolver?: string;
  readonly host?: string;
  readonly version?: string;
  readonly contentHash?: string;
  readonly retrievedAt?: string;
  readonly ticId?: string;
  readonly sector?: number;
  readonly error?: string;
}

/**
 * 真 spawn dataset_fetch.py 在线获取数据集（lightkurve / astroquery.mast）。
 *
 * 返回 onlineAttempt 形态喂给 resolveDataset；任一失败（非白名单 host / 缺 lightkurve /
 * 网络不可达 / MAST 限流 / JSON 解析失败）→ null，resolveDataset 据此落 cached_fixture。
 *
 * 诚实边界（CLAUDE.md §3）：缺 lightkurve 或网络不可达是**环境问题**，不当代码 bug——
 * 调用方应据返回 null 走 cached_fixture 降级路径（02 F1 never-fabricate）。
 */
export async function fetchOnlineDataset(params: OnlineFetchParams): Promise<OnlineFetchResult | null> {
  const hostWhitelisted = (DATASET_HOST_WHITELIST as readonly string[]).includes(params.host);
  if (!hostWhitelisted) {
    // SR-5 fail-closed：非白名单 host 不 spawn（权威门，节省进程 + 防绕过）。
    return null;
  }

  const pythonCmd = params.pythonCmd ?? (process.platform === 'win32' ? 'python' : 'python3');
  const timeoutMs = params.timeoutMs ?? 30_000;
  const cfg = {
    resolver: params.resolver,
    host: params.host,
    version: params.version,
    ticId: params.ticId ?? '',
    sector: params.sector ?? null,
    timeoutMs,
  };

  return new Promise<OnlineFetchResult | null>((promiseResolve) => {
    const child = spawn(pythonCmd, [DATASET_FETCH_PY], {
      env: buildVenvPythonEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });

    const stdoutChunks: Buffer[] = [];
    // stderr 须 drain（否则子进程警告填满 OS pipe buffer ~64KB 后 write 阻塞 → spawn 挂起至 timeout）。
    // astropy/lightkurve 发大量 warning；捕获同时供失败诊断（02 F1 never-fabricate：fetch 失败有 stderr 可查，非静默 null）。
    const stderrChunks: Buffer[] = [];
    let settled = false;
    const finish = (r: OnlineFetchResult | null): void => {
      if (settled) return;
      settled = true;
      promiseResolve(r);
    };

    child.stdout.on('data', (c: Buffer) => stdoutChunks.push(c));
    child.stderr.on('data', (c: Buffer) => stderrChunks.push(c));
    child.on('error', () => finish(null));
    child.on('close', () => {
      const text = Buffer.concat(stdoutChunks).toString('utf8').trim();
      let parsed: DatasetFetchResponse;
      try {
        parsed = JSON.parse(text) as DatasetFetchResponse;
      } catch {
        if (stderrChunks.length > 0) {
          console.warn(`fetchOnlineDataset: dataset_fetch.py stderr (parse fail): ${Buffer.concat(stderrChunks).toString('utf8').slice(0, 500)}`);
        }
        finish(null);
        return;
      }
      if (!parsed.ok || typeof parsed.contentHash !== 'string' || typeof parsed.retrievedAt !== 'string') {
        if (stderrChunks.length > 0) {
          console.warn(`fetchOnlineDataset: dataset_fetch.py stderr (ok=false): ${Buffer.concat(stderrChunks).toString('utf8').slice(0, 500)}`);
        }
        finish(null);
        return;
      }
      // exactOptionalPropertyTypes：ticId/sector 缺省时不提供 key（条件展开，非 undefined 赋值）。
      const ref: DatasetRef = {
        resolver: params.resolver,
        version: typeof parsed.version === 'string' ? parsed.version : params.version,
        retrievedAt: parsed.retrievedAt,
        contentHash: parsed.contentHash,
        ...(typeof parsed.ticId === 'string' && parsed.ticId.length > 0 ? { ticId: parsed.ticId } : {}),
        ...(typeof parsed.sector === 'number' ? { sector: parsed.sector } : {}),
      };
      finish({ hostWhitelisted: true, ref });
    });

    child.stdin.write(JSON.stringify(cfg));
    child.stdin.end();
  });
}
