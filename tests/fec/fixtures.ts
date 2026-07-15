/**
 * FEC V2 测试 fixture 工厂（共享于 compiler.test.ts / fec_mandatory_gate.test.ts / fec_contracts_v2_db.test.ts）。
 *
 * makeValidFec 返回合法 FecContractV2（通过 compileFec 全部 HARD_FAIL 检查）；
 * 各测试通过 Partial<FecContractV2> override 触发特定 reasonCode。
 */

import type {
  FecContractV2,
  MetricSpec,
  ScopeSpec,
  StatisticalPlan,
} from '../../src/fec/fec_contract.ts';

export function baseScope(): ScopeSpec {
  return {
    population: 'galaxies with redshift z<0.5',
    timeWindow: '2018-01-01..2020-12-31',
    domainConstraint: 'optical photometry',
  };
}

export function baseMetric(): MetricSpec {
  return {
    metricKey: 'rmse',
    description: 'root mean squared error',
    unit: 'unitless',
    computationRef: 'metrics/rmse.py',
    isDeterministic: false,
  };
}

export function baseStatPlan(): StatisticalPlan {
  return {
    primaryMetric: 'rmse',
    nullHypothesis: 'RMSE >= 0.5',
    alternativeHypothesis: 'RMSE < 0.5',
    alpha: 0.05,
    effectDirection: 'less',
    confidenceIntervalMethod: 'bootstrap-1000',
    multipleTestingCorrection: 'none',
    missingDataPolicy: 'listwise-deletion',
    outlierPolicy: 'none',
    stoppingRule: 'fixed-n',
  };
}

export function makeValidFec(overrides: Partial<FecContractV2> = {}): FecContractV2 {
  return {
    fecId: 'FEC-TEST-0001',
    contractVersion: 'FEC/2.0',
    claimId: 'CLAIM-0001',
    measurableImplication: 'Model M achieves RMSE <= 0.5 on dataset D',
    scope: baseScope(),
    requiredEvidence: [
      {
        evidenceId: 'EV-1',
        kind: 'measurement',
        critical: true,
        description: 'RMSE on hold-out D',
        verificationCheckId: 'CHECK-rmse',
      },
    ],
    datasetRequirements: [
      {
        name: 'D',
        contentHashAlgorithm: 'sha256',
        allowSynthetic: false,
        schemaFingerprintRequired: true,
      },
    ],
    workflowRequirements: [
      {
        name: 'train-eval',
        engine: 'script',
        requireContainerDigest: true,
        requireCommandHash: true,
        expectedNetworkPolicy: 'off',
        requireFixedSeed: true,
      },
    ],
    metric: baseMetric(),
    threshold: {
      value: 0.5,
      unit: 'unitless',
      thresholdSemantics: 'lt',
      preregistered: true,
    },
    direction: 'less',
    statisticalPlan: baseStatPlan(),
    seedPolicy: {
      fixed: true,
      seedValue: 42,
      allowCherryPick: false,
    },
    deviationPolicy: {
      criticalCategories: ['alpha_change'],
      nonCriticalHandling: 'tolerate',
      requireExplicitLog: true,
    },
    freeze: {
      fecHash: '0'.repeat(64),
      actor: { actorKind: 'deterministic_freezer', actorId: 'freezer-01' },
      timestamp: '2020-01-01T00:00:00Z',
      environmentPolicy: 'locked-digest',
      deviationPolicyHash: '1'.repeat(64),
      frozenBy: 'deterministic_freezer',
    },
    integrityFlags: [],
    ...overrides,
  };
}
