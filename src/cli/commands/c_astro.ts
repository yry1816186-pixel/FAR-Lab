// src/cli/commands/c_astro.ts
// `far c-astro` —— C-ASTRO-0001 在线 TESS dataset_resolver 生产接线（P1-6 · BUILD T7）。
//
// 接线：fetchOnlineDataset（真 spawn dataset_fetch.py · lightkurve/MAST · host 白名单门）→ resolveDataset
// （online→cached_fixture 决策树）→ buildCAstroChain（datasetSource 由 resolution 派生）。
// 在线取数成功 + lightcurvePath → datasetSource='online'（真实 TESS · scope 不缩窄 · 真实 R7）；
// 任一失败/不可达 → fail-safe 落 cached_fixture（baseline_exempt · DEGRADED_SCOPE · 02 F1 never-fabricate）。
//
// 这是 fetchOnlineDataset / resolveDataset / buildCAstroChain 三组件的首个生产编排调用方
// （先前三组件均仅由测试驱动·BUILD T7 闭合「组件存在但生产未编排」gap，类比 DIGEST G1）。
//
// 诚实边界：在线取数需 lightkurve + MAST 可达（环境门）。缺之 = 环境问题（非代码 bug）→ 诚实降级 cached_fixture。
// Authority: CLAUDE.md §4 P1-6 + spec 12 §2.1-§2.2 + dataset_resolver.ts。

import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { PACKAGE_ROOT } from '../paths.ts';
import { findPythonCommand, probeNumpy, buildPythonPath } from '../python_env.ts';
import {
  fetchOnlineDataset,
  resolveDataset,
} from '../../science_harness/dataset_resolver.ts';
import {
  buildCAstroChain,
  C_ASTRO_TIC_ID,
  C_ASTRO_SECTOR,
  C_ASTRO_FROZEN_AT,
  type DatasetSource,
  type CAstroPipelineResult,
} from '../../science_harness/c_astro_pipeline.ts';
import type { DatasetRef, DatasetResolution, DatasetResolutionStatus } from '../../science_harness/types.ts';

const DEFAULT_FIXTURE = join(PACKAGE_ROOT, 'tests', 'fixtures', 'science_harness', 'tic_sample.cache');

/** Input parameters for operations involving c astro online options. */
export interface CAstroOnlineOptions {
  readonly ticId?: string;
  readonly sector?: number;
  readonly lightcurvePath?: string;
  readonly pythonCmd?: string;
  readonly json?: boolean;
}

/** Interface defining c astro online dump. */
export interface CAstroOnlineDump {
  readonly status: 'resolved_online' | 'degraded_cached' | 'untested';
  readonly claimId: string;
  readonly claim: string;
  readonly datasetSource: DatasetSource;
  readonly resolutionStatus: DatasetResolutionStatus;
  readonly resolutionReason: string;
  readonly onlineContentHash: string | null;
  readonly cachedFixtureHash: string;
  readonly machineVerdict: string;
  readonly decisiveRuleId: string;
  readonly sealedConclusion: string;
  readonly blsPeriod: number;
  readonly blsDepth: number;
  readonly blsDepthSNR: number;
}

function hashFixture(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * 生产编排：fetchOnlineDataset → resolveDataset → buildCAstroChain。
 *
 * fail-safe：在线 LC 测量异常（桥/格式/数据）→ 回退 cached_fixture（never-fabricate·不抛）。
 * 在线取数不可达（无 lightkurve/MAST）→ resolveDataset 直接 degraded cached_fixture。
 */
export async function collectCAstroOnline(options: {
  readonly lightcurveFixture: string;
  readonly pythonCmd: string;
  readonly ticId?: string;
  readonly sector?: number;
}): Promise<CAstroOnlineDump> {
  const previous = process.env.PYTHONPATH;
  process.env.PYTHONPATH = buildPythonPath(previous);
  const work = mkdtempSync(join(tmpdir(), 'far-castro-online-'));
  const db = new Database(':memory:');
  try {
    const bareTic = (options.ticId ?? C_ASTRO_TIC_ID).replace(/^TIC\s+/, '');
    const sector = options.sector ?? C_ASTRO_SECTOR;
    const cachedFixtureHash = hashFixture(options.lightcurveFixture);

    // cached_fixture ref（真实文件 sha256·非字面量；resolveDataset 据此落 degraded）。
    const cachedFixtureRef: DatasetRef = {
      resolver: 'cached_fixture',
      version: 'preregistered-synthetic',
      retrievedAt: C_ASTRO_FROZEN_AT,
      contentHash: cachedFixtureHash,
      ...(bareTic.length > 0 ? { ticId: bareTic } : {}),
      sector,
    };

    // 1. 在线取数（host 白名单门 + 真 spawn dataset_fetch.py + outDir 桥落 2-col CSV）。
    const online = await fetchOnlineDataset({
      resolver: 'lightkurve',
      host: 'mast.stsci.edu',
      version: '1.0',
      ticId: bareTic,
      sector,
      outDir: work,
      pythonCmd: options.pythonCmd,
    });

    // 2. 决策树（expectedContentHash=null：全新在线取数，无预登记 hash 比对）。
    const resolution: DatasetResolution = resolveDataset({
      onlineAttempt:
        online === null ? null : { ref: online.ref, hostWhitelisted: online.hostWhitelisted },
      expectedContentHash: null,
      cachedFixture: { ref: cachedFixtureRef },
    });

    // 3. datasetSource 派生：resolved + lightcurvePath → 真实 R7；否则 cached_fixture。
    const onlineResolved =
      resolution.status === 'resolved' && online !== null && online.lightcurvePath !== undefined;

    // 4. buildCAstroChain（fail-safe：在线测量异常 → 回退 cached_fixture）。
    let chain: CAstroPipelineResult;
    let effectiveSource: DatasetSource;
    let effectiveReason = resolution.reason;
    // onlineResolved 定义含 online !== null && lightcurvePath !== undefined——if 条件显式重述
    // 让 TS 完成类型窄化（零断言·零非空断言）。
    if (onlineResolved && online !== null && online.lightcurvePath !== undefined) {
      try {
        chain = await buildCAstroChain(db, {
          lightcurvePath: online.lightcurvePath,
          datasetSource: 'online',
          workingDir: work,
          pythonCmd: options.pythonCmd,
        });
        effectiveSource = 'online';
      } catch {
        // 在线 LC 桥测量异常（格式/数据/blocked）→ fail-safe 回退 cached_fixture（never-fabricate）。
        chain = await buildCAstroChain(db, {
          lightcurvePath: options.lightcurveFixture,
          datasetSource: 'cached_fixture',
          workingDir: work,
          pythonCmd: options.pythonCmd,
        });
        effectiveSource = 'cached_fixture';
        effectiveReason = `online LC measurement failed (bridge/format); fell back to cached_fixture (never-fabricate). prior online resolution: ${resolution.reason}`;
      }
    } else {
      chain = await buildCAstroChain(db, {
        lightcurvePath: options.lightcurveFixture,
        datasetSource: 'cached_fixture',
        workingDir: work,
        pythonCmd: options.pythonCmd,
      });
      effectiveSource = 'cached_fixture';
    }

    const status: CAstroOnlineDump['status'] =
      effectiveSource === 'online'
        ? 'resolved_online'
        : resolution.status === 'untested'
          ? 'untested'
          : 'degraded_cached';

    return {
      status,
      claimId: chain.claimId,
      claim: chain.claimText,
      datasetSource: effectiveSource,
      resolutionStatus: resolution.status,
      resolutionReason: effectiveReason,
      onlineContentHash: online !== null ? online.ref.contentHash : null,
      cachedFixtureHash,
      machineVerdict: chain.machineVerdict,
      decisiveRuleId: chain.kernelOutput.decisiveRuleId,
      sealedConclusion: chain.sealedConclusion,
      blsPeriod: chain.sandbox.metrics.period,
      blsDepth: chain.sandbox.metrics.depth,
      blsDepthSNR: chain.sandbox.metrics.depthSNR,
    };
  } finally {
    db.close();
    rmSync(work, { recursive: true, force: true });
    if (previous === undefined) {
      delete process.env.PYTHONPATH;
    } else {
      process.env.PYTHONPATH = previous;
    }
  }
}

/**
 * run c astro.
 */
export async function runCAstro(options: CAstroOnlineOptions = {}): Promise<number> {
  const lightcurveFixture = options.lightcurvePath ?? DEFAULT_FIXTURE;
  const pythonCommand = options.pythonCmd ?? findPythonCommand();
  if (pythonCommand === null) {
    process.stderr.write('far c-astro: python3/python not found on PATH (BLS needs python+numpy)\n');
    return 1;
  }
  if (!probeNumpy(pythonCommand)) {
    process.stderr.write(`far c-astro: numpy import failed for ${pythonCommand} (BLS needs numpy)\n`);
    return 1;
  }
  if (!existsSync(lightcurveFixture)) {
    process.stderr.write(`far c-astro: lightcurve fixture missing: ${lightcurveFixture}\n`);
    return 1;
  }

  const dump = await collectCAstroOnline({
    lightcurveFixture,
    pythonCmd: pythonCommand,
    ...(options.ticId !== undefined ? { ticId: options.ticId } : {}),
    ...(options.sector !== undefined ? { sector: options.sector } : {}),
  });
  if (options.json === true) {
    process.stdout.write(`${JSON.stringify(dump, null, 2)}\n`);
  } else {
    process.stdout.write(renderCAstroText(dump));
  }
  return 0;
}

function renderCAstroText(dump: CAstroOnlineDump): string {
  const sourceLine =
    dump.datasetSource === 'online'
      ? 'REAL online TESS LC measured (lightkurve+MAST · scope not narrowed · real R7 path)'
      : 'cached_fixture fallback (baseline_exempt · DEGRADED_SCOPE); online TESS needs lightkurve+MAST reachable';
  return `far c-astro: C-ASTRO-0001 online TESS dataset_resolver wiring — ${dump.status}
  claim           : ${dump.claimId} — ${dump.claim}
  dataset source  : ${dump.datasetSource} (resolution: ${dump.resolutionStatus})
  resolution      : ${dump.resolutionReason}
  online hash     : ${dump.onlineContentHash ?? '<unavailable — fell back to cached_fixture>'}
  cached hash     : ${dump.cachedFixtureHash.slice(0, 16)}…
  BLS             : period=${dump.blsPeriod.toFixed(4)}d depth=${dump.blsDepth.toFixed(5)} depthSNR=${dump.blsDepthSNR.toFixed(2)}
  machine verdict : ${dump.machineVerdict}
  decisive rule   : ${dump.decisiveRuleId}
  sealed          : ${dump.sealedConclusion}
  honest status   : ${sourceLine}.
                    RED: single-seed demo, not a real exoplanet confirmation; doer=grader.
`;
}
