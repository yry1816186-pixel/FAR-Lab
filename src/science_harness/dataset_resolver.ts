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
import { join } from 'node:path';
import { PACKAGE_ROOT } from '../paths.ts';
import type {
  DatasetRef,
  DatasetResolution,
  DatasetResolutionStatus,
} from './types.ts';
import { buildVenvPythonEnv, resolveVenvPython } from './sandbox_runner.ts';

const DATASET_FETCH_PY = join(PACKAGE_ROOT, 'repro', 'science_harness', 'dataset_fetch.py');

/** 在线数据集白名单 host（SR-5 · spec 12 §2.2）。 */
export const DATASET_HOST_WHITELIST = [
  'mast.stsci.edu',
  'heasarc.gsfc.nasa.gov',
  // F-5-06-003: 发榜方 NADC 镜像（代码层声明支持对接；resolver 当前仅 MAST 通路，NADC 专属 VO 数据 API 对接待 T-024·BLOCKED_EXTERNAL）
  'nadc.china-vo.org',
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
  /** 瞬时失败（网络/限流/超时）最大重试次数·默认 3。永久失败（python 缺失/lightkurve 未装）不重试。 */
  readonly maxAttempts?: number;
  /** 指数退避基数 ms（backoff = backoffMs * 2^(attempt-1)）·默认 1000。 */
  readonly backoffMs?: number;
  /**
   * 在线→BLS 桥（P1-6）：提供时把 lightkurve LC 落 2-col CSV 到 `${outDir}/online-lightcurve.csv`
   * 供 bls_compute.read_lightcurve 直接测量。仅 lightkurve resolver 生效（astroquery 是 catalog 无 LC）。
   * 调用方据此把 result.lightcurvePath 喂 buildCAstroChain（datasetSource='online'·真实 R7）。
   */
  readonly outDir?: string;
}

export interface OnlineFetchResult {
  readonly ref: DatasetRef;
  readonly hostWhitelisted: boolean;
  /** 在线 LC 落盘路径（仅 params.outDir + lightkurve resolver + 取数成功时存在）。 */
  readonly lightcurvePath?: string;
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
  readonly lightcurvePath?: string;
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
interface OnlineFetchAttempt {
  readonly result: OnlineFetchResult | null;
  readonly permanent: boolean;
}

// 单次在线 fetch（真 spawn dataset_fetch.py）。permanent=true 表示不可重试的永久失败
//（python 无法启动 / lightkurve 未安装）；permanent=false 表示可重试的瞬时失败（网络/限流/超时）。
async function attemptOnlineFetch(
  pythonCmd: string,
  cfg: { resolver: 'lightkurve' | 'astroquery.mast'; host: string; version: string; ticId: string; sector: number | null; timeoutMs: number; outPath: string | null },
): Promise<OnlineFetchAttempt> {
  return new Promise<OnlineFetchAttempt>((promiseResolve) => {
    const child = spawn(pythonCmd, [DATASET_FETCH_PY], {
      env: buildVenvPythonEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: cfg.timeoutMs,
    });

    const stdoutChunks: Buffer[] = [];
    // stderr 须 drain（否则子进程警告填满 OS pipe buffer ~64KB 后 write 阻塞 → spawn 挂起至 timeout）。
    // astropy/lightkurve 发大量 warning；捕获同时供失败诊断（02 F1 never-fabricate：fetch 失败有 stderr 可查，非静默 null）。
    const stderrChunks: Buffer[] = [];
    let settled = false;
    const finish = (result: OnlineFetchResult | null, permanent: boolean): void => {
      if (settled) return;
      settled = true;
      promiseResolve({ result, permanent });
    };

    child.stdout.on('data', (c: Buffer) => stdoutChunks.push(c));
    child.stderr.on('data', (c: Buffer) => stderrChunks.push(c));
    // spawn 本身失败（python 无法启动）→ 永久失败，不重试。
    child.on('error', () => finish(null, true));
    child.on('close', () => {
      const stderrText = Buffer.concat(stderrChunks).toString('utf8');
      // lightkurve 未安装（ModuleNotFoundError）→ 永久失败，重试无益（venv 装包须离线进行）。
      const permanent = /No module named/i.test(stderrText);

      const text = Buffer.concat(stdoutChunks).toString('utf8').trim();
      let parsed: DatasetFetchResponse;
      try {
        parsed = JSON.parse(text) as DatasetFetchResponse;
      } catch {
        if (stderrText.length > 0) {
          console.warn(`fetchOnlineDataset: dataset_fetch.py stderr (parse fail): ${stderrText.slice(0, 500)}`);
        }
        finish(null, permanent);
        return;
      }
      if (!parsed.ok || typeof parsed.contentHash !== 'string' || typeof parsed.retrievedAt !== 'string') {
        if (stderrText.length > 0) {
          console.warn(`fetchOnlineDataset: dataset_fetch.py stderr (ok=false): ${stderrText.slice(0, 500)}`);
        }
        finish(null, permanent);
        return;
      }
      // exactOptionalPropertyTypes：ticId/sector 缺省时不提供 key（条件展开，非 undefined 赋值）。
      const ref: DatasetRef = {
        resolver: cfg.resolver,
        version: typeof parsed.version === 'string' ? parsed.version : cfg.version,
        retrievedAt: parsed.retrievedAt,
        contentHash: parsed.contentHash,
        ...(typeof parsed.ticId === 'string' && parsed.ticId.length > 0 ? { ticId: parsed.ticId } : {}),
        ...(typeof parsed.sector === 'number' ? { sector: parsed.sector } : {}),
      };
      finish(
        {
          hostWhitelisted: true,
          ref,
          ...(typeof parsed.lightcurvePath === 'string' && parsed.lightcurvePath.length > 0
            ? { lightcurvePath: parsed.lightcurvePath }
            : {}),
        },
        false,
      );
    });

    child.stdin.write(JSON.stringify(cfg));
    child.stdin.end();
  });
}

export async function fetchOnlineDataset(params: OnlineFetchParams): Promise<OnlineFetchResult | null> {
  const hostWhitelisted = (DATASET_HOST_WHITELIST as readonly string[]).includes(params.host);
  if (!hostWhitelisted) {
    // SR-5 fail-closed：非白名单 host 不 spawn（权威门，节省进程 + 防绕过）。
    return null;
  }

  // P1-6:优先用 .venv312（Python 3.12·lightkurve 兼容）；系统 python 3.14 无稳定 lightkurve wheel。
  // venv 缺/坏 → resolveVenvPython 返回 null → 落系统 python（lightkurve import 失败 → fetch 返回 ok:false → cached_fixture 降级）。
  const pythonCmd = params.pythonCmd ?? resolveVenvPython() ?? (process.platform === 'win32' ? 'python' : 'python3');
  const timeoutMs = params.timeoutMs ?? 30_000;
  const outPath = params.outDir !== undefined ? join(params.outDir, 'online-lightcurve.csv') : null;
  const cfg = {
    resolver: params.resolver,
    host: params.host,
    version: params.version,
    ticId: params.ticId ?? '',
    sector: params.sector ?? null,
    timeoutMs,
    outPath,
  };

  // retry/backoff（MAST 限流 / 网络抖动 / 超时为瞬时失败 → 重试；python 缺失 / lightkurve 未装为永久 → 不重试）。
  // 任一失败最终落 cached_fixture（02 F1 never-fabricate·调用方据 null 降级）。
  const maxAttempts = params.maxAttempts ?? 3;
  const backoffMs = params.backoffMs ?? 1000;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const r = await attemptOnlineFetch(pythonCmd, cfg);
    if (r.result !== null) return r.result;
    if (r.permanent || attempt === maxAttempts) return null;
    await new Promise<void>((resolveSleep) => setTimeout(resolveSleep, backoffMs * 2 ** (attempt - 1)));
  }
  return null;
}
