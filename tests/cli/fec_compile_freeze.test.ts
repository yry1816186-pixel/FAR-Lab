// tests/cli/fec_compile_freeze.test.ts
// 端到端测试：`far fec compile` + `far fec freeze`。
// 真实依赖：compileFec + computeFecHash（非 mock / 非 stub），由 src/fec/compiler.ts 直接驱动。

import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { computeFecHash } from '../../src/fec/compiler.ts';
import { runFecCompile, runFecFreeze } from '../../src/cli/commands/fec.ts';
import type { FecCompileOutput, FecCompileSuccessOutput } from '../../src/cli/commands/fec.ts';
import type { FecContractV2 } from '../../src/fec/fec_contract.ts';

interface TamperedFecFile {
  readonly ok: boolean;
  readonly plan?: unknown;
  readonly fecHash: string;
  readonly fec: FecContractV2;
  readonly errors?: readonly string[];
}

function buildValidFec(): FecContractV2 {
  return {
    fecId: 'FEC-TEST-0001',
    contractVersion: 'FEC/2.0',
    claimId: 'C-TEST-0001',
    measurableImplication: 'macro_f1 score on benchmark B held-out split >= 0.80',
    scope: {
      population: 'held-out test split (n=512)',
      timeWindow: '2026-07-01 to 2026-07-31',
      domainConstraint: 'benchmark B v1.2',
    },
    requiredEvidence: [
      {
        evidenceId: 'EV-1',
        kind: 'measurement',
        critical: true,
        description: 'measured macro_f1 score on held-out split',
        verificationCheckId: 'check-threshold',
      },
    ],
    datasetRequirements: [
      {
        name: 'held-out-test-split',
        contentHashAlgorithm: 'sha256',
        allowSynthetic: false,
        schemaFingerprintRequired: false,
      },
    ],
    workflowRequirements: [
      {
        name: 'eval-workflow',
        engine: 'script',
        requireContainerDigest: false,
        requireCommandHash: false,
        expectedNetworkPolicy: 'off',
        requireFixedSeed: false,
      },
    ],
    metric: {
      metricKey: 'macro_f1',
      description: 'macro-F1 score',
      unit: 'score',
      computationRef: 'sklearn.metrics.f1_score',
      isDeterministic: true,
    },
    threshold: {
      value: 0.8,
      unit: 'score',
      thresholdSemantics: 'gt',
      preregistered: true,
    },
    direction: 'greater',
    statisticalPlan: {
      primaryMetric: 'macro_f1',
      nullHypothesis: 'macro_f1 <= 0.80',
      alternativeHypothesis: 'macro_f1 > 0.80',
      alpha: 0.05,
      effectDirection: 'greater',
      confidenceIntervalMethod: 'bootstrap',
      multipleTestingCorrection: 'none',
      missingDataPolicy: 'exclude',
      outlierPolicy: 'retain',
      stoppingRule: 'fixed_n',
    },
    seedPolicy: {
      fixed: false,
      allowCherryPick: false,
      justification: 'deterministic metric; no stochastic seed required',
    },
    deviationPolicy: {
      criticalCategories: ['metric_swap', 'alpha_rewrite'],
      nonCriticalHandling: 'degrade',
      requireExplicitLog: true,
    },
    freeze: {
      fecHash: '0'.repeat(64),
      actor: { actorKind: 'deterministic_freezer', actorId: 'ci-freezer' },
      timestamp: '2026-07-01T00:00:00.000Z',
      environmentPolicy: 'ci_offline',
      deviationPolicyHash: '0'.repeat(64),
      frozenBy: 'deterministic_freezer',
    },
    integrityFlags: [],
  };
}

test('runFecCompile drives real compileFec + computeFecHash; runFecFreeze verifies and detects tampering', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-fec-compile-freeze-'));
  try {
    const claimPath = join(tmp, 'claim.json');
    const outPath = join(tmp, 'out', 'fec.json');
    writeFileSync(claimPath, `${JSON.stringify(buildValidFec(), null, 2)}\n`, 'utf8');

    // 1. compile：真实调 compileFec + computeFecHash（非 mock）。
    const compileExit = runFecCompile({ claimPath, outPath });
    assert.equal(compileExit, 0, `runFecCompile should exit 0 (got ${compileExit})`);

    const parsed = JSON.parse(readFileSync(outPath, 'utf8')) as FecCompileOutput;
    assert.equal(parsed.ok, true);
    const success = parsed as FecCompileSuccessOutput;
    assert.equal(success.fecHash.length, 64, 'fecHash 须为 sha256 hex（64 字符）');
    assert.ok(success.plan.statLock.hash.length > 0, 'plan.statLock.hash 须由 compileFec 产出');
    assert.ok(success.plan.proofChecks.length === 4, 'proofChecks 须含 4 项模板（compiler.ts buildFalsificationPlan）');

    // 2. fecHash === computeFecHash(fec) 直接断言（真实重算，非 stored 比较）。
    const recomputed = computeFecHash(success.fec);
    assert.equal(
      success.fecHash,
      recomputed,
      `stored fecHash (${success.fecHash.slice(0, 12)}…) must === computeFecHash(fec) (${recomputed.slice(0, 12)}…)`,
    );

    // 3. freeze：stored === computed → exit 0。
    const freezeExitOk = runFecFreeze({ fecPath: outPath });
    assert.equal(freezeExitOk, 0, `runFecFreeze should exit 0 on match (got ${freezeExitOk})`);

    // 4. 篡改 fec.json 中的 fecHash → exit 7（篡改检出）。
    const tampered: TamperedFecFile = {
      ...success,
      fecHash: 'f'.repeat(64),
    };
    writeFileSync(outPath, `${JSON.stringify(tampered, null, 2)}\n`, 'utf8');
    const freezeExitMismatch = runFecFreeze({ fecPath: outPath });
    assert.equal(
      freezeExitMismatch,
      7,
      `runFecFreeze should exit 7 on hash mismatch / tampering (got ${freezeExitMismatch})`,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
