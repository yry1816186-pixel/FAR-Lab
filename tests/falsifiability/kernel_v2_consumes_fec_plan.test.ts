import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { compileFec } from '../../src/fec/compiler.ts';
import type { FecContractV2 } from '../../src/fec/fec_contract.ts';
import {
  decideFiveValueVerdict,
  type VerdictKernelInput,
} from '../../src/falsifiability/verdict_kernel_v2.ts';
import { baseScope, baseStatPlan, makeValidFec } from '../fec/fixtures.ts';

test('kernel R1 fires on the same HARD_FAIL condition as compileFec', () => {
  const fec = makeValidFec({
    scope: { ...baseScope(), timeWindow: '' },
  });
  const compileResult = compileFec({ fec });
  assert.equal(compileResult.ok, false);
  assert.ok(
    compileResult.errors.some((error) => error.code === 'SCOPE_UNBOUNDED'),
    'fixture must fail compiler scope check',
  );

  const out = decideFiveValueVerdict(makeSupportInput(fec));
  assert.equal(out.verdict, 'UNTESTED');
  assert.equal(out.decisiveRuleId, 'R1_FEC_NOT_COMPILABLE');
  assert.equal(out.untestedReason, 'FEC_NOT_READY');
});

test('kernel consumes compileFec integrityFlags before allowing R7 confirmation', () => {
  const fec = makeValidFec({
    statisticalPlan: {
      ...baseStatPlan(),
      multipleTestingCorrection: 'none',
    },
    multipleTestingPlan: {
      correction: 'bonferroni',
      familySize: 2,
      adjustedAlpha: 0.025,
      preregistered: true,
    },
  });
  const compileResult = compileFec({ fec });
  assert.equal(compileResult.ok, true);
  assert.ok(compileResult.plan.integrityFlags.includes('p_hacking_risk'));

  const out = decideFiveValueVerdict(makeSupportInput(fec));
  assert.equal(out.verdict, 'INCONCLUSIVE');
  assert.equal(out.decisiveRuleId, 'R8_INSUFFICIENT_POWER_OR_NULL');
  assert.ok(out.integrityFlags.includes('p_hacking_risk'));
});

function makeSupportInput(fec: FecContractV2): VerdictKernelInput {
  return {
    fec,
    datasetBindings: [
      {
        datasetId: 'D1',
        contentHash: 'a'.repeat(64),
        sourceAnchor: { resolved: true },
        scopeCoverage: { dimension: 'population', value: 'galaxies with redshift z<0.5', relation: 'within' },
      },
    ],
    statistics: [
      {
        testId: fec.metric.metricKey,
        status: 'ran',
        effectDirection: 'supports',
        pValue: 0.01,
        adjustedPValue: 0.01,
        effectSizeObserved: 0.8,
        confidenceInterval: [0.3, 1.1],
        assumptionDiagnostics: [],
      },
    ],
    protocolDeviations: [],
    antiTheaterFindings: [],
    evidenceSufficiency: { status: 'sufficient', powerStatus: 'adequate' },
    contradictionSet: [],
    integrityFlags: [],
  };
}
