// src/cli/commands/audit_multiseed.ts
// `far audit-multiseed` —— FUSION-OS-1 strongest-achievable production audit：真实 seed-dependent
// multi-seed BLS 实验（每 seed 注入噪声 → distinct 测量）+ cherry-pick 审计。cherry-pick 从数据涌现
// （研究者只报告 depthSNR >= 阈值的 seed），detect_seed_cherry 从真实 runRegistry 差集 fire →
// kernel ANTI_THEATER_FAIL。
//
// 与 `far audit-seed-cherry`（fixture 常量 showcase）的区别：本命令的 runRegistry 由真实 BLS 子进程
// 执行产出（5 真起 python spawn·distinct per seed），非硬编码常量。诚实边界：本地噪声注入（真实计算·
// 非在线 TESS）；真 online TESS multi-seed 是 P1-6 V2 路径。
// Authority: CLAUDE.md §4 P-FUSION FUSION-OS-1 + FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md §C。

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { PACKAGE_ROOT } from '../paths.ts';
import { findPythonCommand, probeNumpy, buildPythonPath } from '../python_env.ts';
import {
  runMultiseedBlsExperiment,
  auditMultiseedCherryPick,
  MULTISEED_DECLARED_SEEDS,
} from '../../science_harness/multiseed_audit.ts';

const DEFAULT_FIXTURE = join(PACKAGE_ROOT, 'tests', 'fixtures', 'science_harness', 'tic_sample.cache');

export interface AuditMultiseedOptions {
  readonly lightcurvePath?: string;
  readonly pythonCmd?: string;
  readonly json?: boolean;
}

export interface AuditMultiseedDump {
  readonly status: 'DETECTED' | 'MISSED';
  readonly claimId: string;
  readonly claim: string;
  readonly declaredSeeds: readonly number[];
  readonly detectedSeeds: readonly number[];
  readonly hiddenSeeds: readonly number[];
  readonly detectionThreshold: number;
  readonly perSeedResults: readonly { readonly seed: number; readonly depth: number; readonly depthSNR: number; readonly detected: boolean }[];
  readonly meanReportedDepth: number;
  readonly antiTheaterHasFail: boolean;
  readonly machineVerdict: string;
  readonly decisiveRuleId: string;
  readonly sealedConclusion: string;
}

export async function collectAuditMultiseed(options: {
  readonly lightcurvePath: string;
  readonly pythonCmd: string;
}): Promise<AuditMultiseedDump> {
  const previous = process.env.PYTHONPATH;
  process.env.PYTHONPATH = buildPythonPath(previous);
  const db = new Database(':memory:');
  try {
    const experiment = await runMultiseedBlsExperiment({
      lightcurvePath: options.lightcurvePath,
      pythonCmd: options.pythonCmd,
    });
    const audit = await auditMultiseedCherryPick(db, experiment);
    const hidden = MULTISEED_DECLARED_SEEDS.filter((s) => !experiment.detectedSeeds.includes(s));
    const reportedRuns = experiment.runs.filter((r) => experiment.detectedSeeds.includes(r.seed));
    const meanReportedDepth = reportedRuns.length > 0 ? reportedRuns.reduce((s, r) => s + r.metrics.depth, 0) / reportedRuns.length : 0;
    const detected = audit.antiTheaterReport.hasFail && audit.kernelOutput.decisiveRuleId === 'ANTI_THEATER_FAIL';
    return {
      status: detected ? 'DETECTED' : 'MISSED',
      claimId: 'C-MULTISEED-0001',
      claim: 'multi-seed BLS transit confirmation across pre-registered seeds',
      declaredSeeds: experiment.declaredSeeds,
      detectedSeeds: experiment.detectedSeeds,
      hiddenSeeds: hidden,
      detectionThreshold: experiment.detectionThreshold,
      perSeedResults: experiment.runs.map((r) => ({ seed: r.seed, depth: r.metrics.depth, depthSNR: r.metrics.depthSNR, detected: r.detected })),
      meanReportedDepth,
      antiTheaterHasFail: audit.antiTheaterReport.hasFail,
      machineVerdict: audit.machineVerdict,
      decisiveRuleId: audit.kernelOutput.decisiveRuleId,
      sealedConclusion: audit.sealedConclusion,
    };
  } finally {
    db.close();
    if (previous === undefined) {
      delete process.env.PYTHONPATH;
    } else {
      process.env.PYTHONPATH = previous;
    }
  }
}

export async function runAuditMultiseed(options: AuditMultiseedOptions = {}): Promise<number> {
  const lightcurvePath = options.lightcurvePath ?? DEFAULT_FIXTURE;
  const pythonCommand = options.pythonCmd ?? findPythonCommand();
  if (pythonCommand === null) {
    process.stderr.write('far audit-multiseed: python3/python not found on PATH (BLS needs python+numpy)\n');
    return 1;
  }
  if (!probeNumpy(pythonCommand)) {
    process.stderr.write(`far audit-multiseed: numpy import failed for ${pythonCommand} (BLS needs numpy)\n`);
    return 1;
  }
  if (!existsSync(lightcurvePath)) {
    process.stderr.write(`far audit-multiseed: lightcurve fixture missing: ${lightcurvePath}\n`);
    return 1;
  }

  const dump = await collectAuditMultiseed({ lightcurvePath, pythonCmd: pythonCommand });
  if (options.json === true) {
    process.stdout.write(`${JSON.stringify(dump, null, 2)}\n`);
  } else {
    process.stdout.write(renderAuditText(dump));
  }
  return dump.status === 'DETECTED' ? 0 : 7;
}

function renderAuditText(dump: AuditMultiseedDump): string {
  const perSeed = dump.perSeedResults.map((r) => `    seed ${r.seed}: depth=${r.depth.toFixed(5)} depthSNR=${r.depthSNR.toFixed(2)} ${r.detected ? '[reported]' : '[hidden]'}`).join('\n');
  return `far audit-multiseed: real multi-seed cherry-pick audit — ${dump.status}
  claim           : ${dump.claimId} — ${dump.claim}
  real experiment : ${dump.declaredSeeds.length} seeds × real BLS (noise-injected, distinct per seed)
  detection threshold: depthSNR >= ${dump.detectionThreshold} (researcher reports only detected seeds)
${perSeed}
  cherry-pick     : declared ${JSON.stringify(dump.declaredSeeds)} / reported ${JSON.stringify(dump.detectedSeeds)} (hides ${JSON.stringify(dump.hiddenSeeds)})
  anti-theater    : hasFail=${dump.antiTheaterHasFail} (detect_seed_cherry HIDDEN_FAILED_RUN on the real registry diff)
  machine verdict : ${dump.machineVerdict}
  decisive rule   : ${dump.decisiveRuleId}
  sealed          : ${dump.sealedConclusion}
  honest status   : registry is REAL computed BLS output (per-seed subprocess); cherry-pick data-emergent.
                    RED: local noise-injection on cached_fixture LC, not online TESS; doer=grader.
`;
}
