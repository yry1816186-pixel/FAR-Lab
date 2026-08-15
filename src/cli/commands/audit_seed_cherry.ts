// src/cli/commands/audit_seed_cherry.ts
// `far audit-seed-cherry` —— FUSION-OS-1 detector-validation showcase：把一个 cherry-pick fixture 经真实
// anti-theater → verdict 路径回放（detect_seed_cherry 真实集合差集 fire → kernel ANTI_THEATER_FAIL）。
//
// 诚实框架（非 production verdict-path wiring）：cherry-pick 是 fixture 模块常量（declared 5 / reported 3·
// 类比 GV-14 测试 fixture），非真实 submission 的 run registry。故本命令是 detector 验证展示，不是把
// anti-theater 接进处理真实声明的 verdict 路径——后者需 P1-6（真实实验 run registry）。Status RED。
// Authority: FUSION-OS-1。

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { PACKAGE_ROOT } from '../paths.ts';
import { findPythonCommand, probeNumpy, buildPythonPath } from '../python_env.ts';
import {
  buildSeedCherryAdversarialChain,
  SEED_CHERRY_DECLARED_SEEDS,
  SEED_CHERRY_REPORTED_SEEDS,
} from '../../science_harness/seed_cherry_pipeline.ts';

const DEFAULT_FIXTURE = join(PACKAGE_ROOT, 'tests', 'fixtures', 'science_harness', 'tic_sample.cache');

/** Input parameters for operations involving audit seed cherry options. */
export interface AuditSeedCherryOptions {
  readonly lightcurvePath?: string;
  readonly pythonCmd?: string;
  readonly json?: boolean;
}

/** Interface defining audit seed cherry dump. */
export interface AuditSeedCherryDump {
  readonly status: 'DETECTED' | 'MISSED';
  readonly claimId: string;
  readonly claim: string;
  readonly declaredSeeds: readonly number[];
  readonly reportedSeeds: readonly number[];
  readonly hiddenSeeds: readonly number[];
  readonly blsPeriod: number;
  readonly blsDepth: number;
  readonly blsDepthSNR: number;
  readonly antiTheaterHasFail: boolean;
  readonly machineVerdict: string;
  readonly decisiveRuleId: string;
  readonly sealedConclusion: string;
}

// collect 不做 env 发现（caller 负责）；仅跑真实链 + 构 dump，供 CLI 包装与物证测试共享。
/**
 * collect audit seed cherry.
 */
export async function collectAuditSeedCherry(options: {
  readonly lightcurvePath: string;
  readonly pythonCmd: string;
}): Promise<AuditSeedCherryDump> {
  const previous = process.env.PYTHONPATH;
  process.env.PYTHONPATH = buildPythonPath(previous);
  const work = mkdtempSync(resolve(tmpdir(), 'far-audit-cherry-'));
  const db = new Database(':memory:');
  try {
    const chain = await buildSeedCherryAdversarialChain(db, {
      lightcurvePath: options.lightcurvePath,
      workingDir: work,
      pythonCmd: options.pythonCmd,
    });
    const hidden = SEED_CHERRY_DECLARED_SEEDS.filter((s) => !SEED_CHERRY_REPORTED_SEEDS.includes(s));
    const detected =
      chain.antiTheaterReport.hasFail && chain.kernelOutput.decisiveRuleId === 'ANTI_THEATER_FAIL';
    return {
      status: detected ? 'DETECTED' : 'MISSED',
      claimId: chain.claimId,
      claim: chain.claimText,
      declaredSeeds: SEED_CHERRY_DECLARED_SEEDS,
      reportedSeeds: SEED_CHERRY_REPORTED_SEEDS,
      hiddenSeeds: hidden,
      blsPeriod: chain.statistics.bls.period,
      blsDepth: chain.statistics.bls.depth,
      blsDepthSNR: chain.statistics.bls.depthSNR,
      antiTheaterHasFail: chain.antiTheaterReport.hasFail,
      machineVerdict: chain.machineVerdict,
      decisiveRuleId: chain.kernelOutput.decisiveRuleId,
      sealedConclusion: chain.sealedConclusion,
    };
  } finally {
    db.close();
    if (previous === undefined) {
      delete process.env.PYTHONPATH;
    } else {
      process.env.PYTHONPATH = previous;
    }
    rmSync(work, { recursive: true, force: true });
  }
}

/**
 * run audit seed cherry.
 */
export async function runAuditSeedCherry(options: AuditSeedCherryOptions = {}): Promise<number> {
  const lightcurvePath = options.lightcurvePath ?? DEFAULT_FIXTURE;
  const pythonCommand = options.pythonCmd ?? findPythonCommand();
  if (pythonCommand === null) {
    process.stderr.write('far audit-seed-cherry: python3/python not found on PATH (BLS needs python+numpy)\n');
    return 1;
  }
  if (!probeNumpy(pythonCommand)) {
    process.stderr.write(`far audit-seed-cherry: numpy import failed for ${pythonCommand} (BLS needs numpy)\n`);
    return 1;
  }
  if (!existsSync(lightcurvePath)) {
    process.stderr.write(`far audit-seed-cherry: lightcurve fixture missing: ${lightcurvePath}\n`);
    return 1;
  }

  const dump = await collectAuditSeedCherry({ lightcurvePath, pythonCmd: pythonCommand });
  if (options.json === true) {
    process.stdout.write(`${JSON.stringify(dump, null, 2)}\n`);
  } else {
    process.stdout.write(renderAuditText(dump));
  }
  // exit 0 = 审计跑通且正确检出 cherry-pick（攻击被阻断）。MISSED = 已知对抗 fixture 上 detector 未 fire = 回归。
  return dump.status === 'DETECTED' ? 0 : 7;
}

function renderAuditText(dump: AuditSeedCherryDump): string {
  return `far audit-seed-cherry: cherry-pick audit — ${dump.status}
  claim           : ${dump.claimId} — ${dump.claim}
  fixture cherry  : declared seeds ${JSON.stringify(dump.declaredSeeds)} / reported ${JSON.stringify(dump.reportedSeeds)} (hides ${JSON.stringify(dump.hiddenSeeds)})
  real BLS        : period=${dump.blsPeriod.toFixed(4)}d depth=${dump.blsDepth.toFixed(5)} depthSNR=${dump.blsDepthSNR.toFixed(2)}
  anti-theater    : hasFail=${dump.antiTheaterHasFail} (detect_seed_cherry HIDDEN_FAILED_RUN on the declared-reported diff)
  machine verdict : ${dump.machineVerdict}
  decisive rule   : ${dump.decisiveRuleId}
  sealed          : ${dump.sealedConclusion}
  honest status   : RED — fixture replay (hardcoded cherry-pick constants); detect_seed_cherry fires on
                    constants, NOT on a real submission's run registry. Production wiring needs a real run registry.
`;
}
