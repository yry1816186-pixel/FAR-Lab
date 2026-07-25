/**
 * ProofEnvelope V2 测试 fixture 工厂（共享于 proof_hash_v2 / validator / diff / cross_lang 测试）。
 *
 * makeValidEnvelopeV2Core 返回合法 SealProofEnvelopeV2Input（通过 validator 10 rules 全 PASS +
 * computeProofHashV2 不抛 fecHash 断言）。各测试通过 Partial override 触发特定场景。
 */

import { computeFecHash } from '../../../src/fec/compiler.ts';
import { makeValidFec } from '../../fec/fixtures.ts';
import type { SealProofEnvelopeV2Input } from '../../../src/proof_envelope/v2/types.ts';

/**
 * 构造合法 SealProofEnvelopeV2Input（GV-01 complete support 风格）。
 * fecSnapshot.freeze.fecHash 预填 = computeFecHash(fec)，使 computeProofHashV2 第 2 步 fecHash 互验通过。
 */
export function makeValidEnvelopeV2Core(
  overrides: Partial<SealProofEnvelopeV2Input> = {},
): SealProofEnvelopeV2Input {
  const baseFec = makeValidFec({
    fecId: 'FEC-GV-01',
    claimId: 'CLAIM-GV-01',
    measurableImplication: 'Model M achieves RMSE <= 0.5 on dataset D',
    metric: { metricKey: 'rmse', description: 'root mean squared error', unit: 'unitless', computationRef: 'metrics/rmse.py', isDeterministic: false },
    statisticalPlan: {
      primaryMetric: 'rmse',
      nullHypothesis: 'RMSE >= 0.5',
      alternativeHypothesis: 'RMSE < 0.5',
      alpha: 0.0125,
      effectDirection: 'less',
      confidenceIntervalMethod: 'bootstrap-1000',
      multipleTestingCorrection: 'bonferroni',
      missingDataPolicy: 'listwise-deletion',
      outlierPolicy: 'none',
      stoppingRule: 'fixed-n',
    },
    powerPlan: { targetPower: 0.8, minimumDetectableEffect: 0.2, sampleSize: 120, powerMethod: 'ttest', alphaAssumed: 0.0125 },
  });
  const fecHash = computeFecHash(baseFec);
  const fecSnapshot = { ...baseFec, freeze: { ...baseFec.freeze, fecHash } };

  return {
    schemaVersion: 'far.proof_envelope.v2',
    envelopeId: 'ENVELOPE-GV-01',
    createdAt: '2026-07-01T00:00:00Z',
    claim: {
      id: 'CLAIM-GV-01',
      naturalLanguage: 'Model M achieves RMSE <= 0.5 on dataset D',
      domain: 'astronomy',
      scope: 'galaxies with redshift z<0.5',
      claimType: 'quantitative',
    },
    fecHash,
    fecSnapshot,
    protocolFreeze: fecSnapshot.freeze,
    datasetBindings: [
      {
        datasetId: 'D1',
        contentHash: 'b'.repeat(64),
        schemaHash: 'c'.repeat(64),
        statsFingerprint: 'd'.repeat(64),
        scopeCoverage: [{ dimension: 'population', value: 'galaxies z<0.5', relation: 'within' }],
        sourceAnchor: { resolved: true, resolverRef: 'zenodo-0001' },
      },
    ],
    workflowBindings: [
      {
        workflowId: 'W1',
        workflowHash: 'e'.repeat(64),
        containerDigest: 'sha256:' + 'f'.repeat(64),
        environmentHash: '1'.repeat(64),
        commandHash: '2'.repeat(64),
        seedPolicy: { seed: 42, locked: true },
        networkPolicy: 'off',
      },
    ],
    experimentRuns: [
      {
        runId: 'R1',
        startedAt: '2026-06-01T00:00:00Z',
        endedAt: '2026-06-02T00:00:00Z',
        actor: 'ci_runner',
        inputHashes: ['3'.repeat(64)],
        outputHashes: ['4'.repeat(64)],
        logHashes: ['5'.repeat(64)],
        exitCode: 0,
        deviations: [],
      },
    ],
    measurementResults: [
      {
        metricKey: 'rmse',
        metricValue: 0.42,
        rawArtifactHashes: ['6'.repeat(64)],
        runId: 'R1',
        runEnvironment: 'locked-digest',
        stdoutHash: '7'.repeat(64),
        stderrHash: '8'.repeat(64),
      },
    ],
    statisticalResults: [
      {
        testId: 'rmse',
        effectSizeObserved: 0.3,
        pValue: 0.003,
        adjustedPValue: 0.003,
        confidenceInterval: [0.2, 0.4],
        power: 0.85,
        multipleTestingCorrection: 'bonferroni',
        assumptions: [],
      },
    ],
    verdictTrace: {
      verdict: 'CONFIRMED',
      reasonCodes: ['R7_PRIMARY_TEST_CONFIRMS'],
      ruleTrace: [{ ruleId: 'R7_PRIMARY_TEST_CONFIRMS', triggered: true }],
      decisiveRuleId: 'R7_PRIMARY_TEST_CONFIRMS',
      scopeReport: {
        isDegraded: false,
        coverage: 'full',
        impactedScopeEdges: [],
        scopeSlipText: null,
        hasSameScopeRefutation: false,
      },
      statisticalReport: {
        refutes: false,
        supports: true,
        conflicting: false,
        underpowered: false,
        effectiveDirection: 'supports',
        primaryAdjustedPValue: 0.003,
        primaryEffectSize: 0.3,
        primaryConfidenceInterval: [0.2, 0.4],
        hasWarnAssumption: false,
        formMismatch: false,
      },
      evidenceSufficiency: { status: 'sufficient', powerStatus: 'adequate' },
      untestedReason: null,
      integrityFlags: [],
      boundedSupport: true,
      kernelVersion: 'far.verdict_kernel.v2.r0-r9',
      rulePriorityTableHash: 'a'.repeat(64),
      proofHashInputs: ['claim.id', 'fecHash', 'statisticalResults'],
    },
    antiTheaterReport: { findings: [], hasFail: false, failCount: 0, warnCount: 0, llmOverrideRejected: true },
    ledgerRoot: '9'.repeat(64),
    ...overrides,
  };
}
