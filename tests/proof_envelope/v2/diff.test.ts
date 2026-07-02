/**
 * ProofEnvelope V2 Verifier Diff —— compareEnvelopes 13 diff codes 逐条覆盖（04 §3.4 + GV-10）。
 *
 * 每个篡改场景触发对应 DiffReportCode；GV-10 tampered proof → verifier RED + diff report 定位篡改字段。
 *
 * Authority: PROJECT_PLAN/04 §3.4（verdict-critical 字段 diff report）+ APPENDIX_B GV-10。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ProofEnvelopeV2 } from '../../../src/proof_envelope/v2/types.ts';
import { makeValidEnvelopeV2Core } from './fixtures.ts';
import {
  compareEnvelopes,
  hasTamper,
  sealProofEnvelopeV2,
} from '../../../src/proof_envelope/v2/index.ts';

function baseEnvelope(): ProofEnvelopeV2 {
  return sealProofEnvelopeV2(makeValidEnvelopeV2Core()).envelope;
}

function diffCodes(expected: ProofEnvelopeV2, actual: ProofEnvelopeV2): string[] {
  return compareEnvelopes(expected, actual).map((d) => d.code);
}

test('compareEnvelopes: 相同 envelope → 空 diff + hasTamper=false', () => {
  const env = baseEnvelope();
  assert.equal(compareEnvelopes(env, env).length, 0);
  assert.equal(hasTamper(compareEnvelopes(env, env)), false);
});

test('GV-10 tamper detection: attacker 篡改 statisticalResults 后重封 → diff 定位 STATISTICAL_RESULT_MISMATCH + PROOF_HASH_MISMATCH', () => {
  const expected = baseEnvelope();
  // attacker 改 pValue 后重新 seal（proofHash 自洽），但 verifier 比对原始 expected 仍能定位字段级篡改
  const tamperedCore = makeValidEnvelopeV2Core({
    statisticalResults: [{ ...expected.statisticalResults[0]!, pValue: 0.5 }],
  });
  const actual = sealProofEnvelopeV2(tamperedCore).envelope;
  const codes = diffCodes(expected, actual);
  assert.ok(codes.includes('STATISTICAL_RESULT_MISMATCH'), '须报统计结果篡改');
  assert.ok(codes.includes('PROOF_HASH_MISMATCH'), 'attacker 重封后 proofHash 仍与原始不同');
  assert.equal(hasTamper(compareEnvelopes(expected, actual)), true);
});

// 13 diff codes 逐条（参数化表）
const TAMPER_CASES = [
  {
    name: 'schemaVersion',
    code: 'UNSUPPORTED_SCHEMA_VERSION',
    // 单层 as：刻意构造非法 schemaVersion（字面量禁止 v1）触发 mismatch。
    tamper: (e: ProofEnvelopeV2): ProofEnvelopeV2 => ({ ...e, schemaVersion: 'far.proof_envelope.v1' as ProofEnvelopeV2['schemaVersion'] }),
  },
  {
    name: 'claim',
    code: 'CLAIM_HASH_MISMATCH',
    tamper: (e: ProofEnvelopeV2): ProofEnvelopeV2 => ({ ...e, claim: { ...e.claim, id: 'CLAIM-TAMPERED' } }),
  },
  {
    name: 'fecHash',
    code: 'FEC_HASH_MISMATCH',
    tamper: (e: ProofEnvelopeV2): ProofEnvelopeV2 => ({ ...e, fecHash: '0'.repeat(64) }),
  },
  {
    name: 'protocolFreeze',
    code: 'PROTOCOL_FREEZE_MISMATCH',
    tamper: (e: ProofEnvelopeV2): ProofEnvelopeV2 => ({ ...e, protocolFreeze: { ...e.protocolFreeze, timestamp: '2027-01-01T00:00:00Z' } }),
  },
  {
    name: 'datasetBindings',
    code: 'DATASET_HASH_MISMATCH',
    tamper: (e: ProofEnvelopeV2): ProofEnvelopeV2 => ({ ...e, datasetBindings: [{ ...e.datasetBindings[0]!, contentHash: 'a'.repeat(64) }] }),
  },
  {
    name: 'workflowBindings',
    code: 'WORKFLOW_HASH_MISMATCH',
    tamper: (e: ProofEnvelopeV2): ProofEnvelopeV2 => ({ ...e, workflowBindings: [{ ...e.workflowBindings[0]!, workflowHash: 'b'.repeat(64) }] }),
  },
  {
    name: 'experimentRuns',
    code: 'RUN_HASH_MISMATCH',
    tamper: (e: ProofEnvelopeV2): ProofEnvelopeV2 => ({ ...e, experimentRuns: [{ ...e.experimentRuns[0]!, exitCode: 1 }] }),
  },
  {
    name: 'measurementResults',
    code: 'MEASUREMENT_HASH_MISMATCH',
    tamper: (e: ProofEnvelopeV2): ProofEnvelopeV2 => ({ ...e, measurementResults: [{ ...e.measurementResults[0]!, metricValue: 0.99 }] }),
  },
  {
    name: 'statisticalResults',
    code: 'STATISTICAL_RESULT_MISMATCH',
    tamper: (e: ProofEnvelopeV2): ProofEnvelopeV2 => ({ ...e, statisticalResults: [{ ...e.statisticalResults[0]!, pValue: 0.5 }] }),
  },
  {
    name: 'verdictTrace',
    code: 'VERDICT_TRACE_MISMATCH',
    tamper: (e: ProofEnvelopeV2): ProofEnvelopeV2 => ({ ...e, verdictTrace: { ...e.verdictTrace, verdict: 'REFUTED' as const } }),
  },
  {
    name: 'antiTheaterReport',
    code: 'ANTI_THEATER_FAIL',
    tamper: (e: ProofEnvelopeV2): ProofEnvelopeV2 => ({
      ...e,
      antiTheaterReport: { findings: [], hasFail: true, failCount: 1, warnCount: 0, llmOverrideRejected: true },
    }),
  },
  {
    name: 'ledgerRoot',
    code: 'LEDGER_ROOT_MISMATCH',
    tamper: (e: ProofEnvelopeV2): ProofEnvelopeV2 => ({ ...e, ledgerRoot: 'c'.repeat(64) }),
  },
  {
    name: 'proofHash',
    code: 'PROOF_HASH_MISMATCH',
    tamper: (e: ProofEnvelopeV2): ProofEnvelopeV2 => ({ ...e, proofHash: 'd'.repeat(64) }),
  },
] as const;

for (const tc of TAMPER_CASES) {
  test(`diff code: 篡改 ${tc.name} → ${tc.code}`, () => {
    const expected = baseEnvelope();
    const actual = tc.tamper(expected);
    const codes = diffCodes(expected, actual);
    assert.ok(codes.includes(tc.code), `篡改 ${tc.name} 须报 ${tc.code}，实际 codes=${codes.join(',')}`);
    assert.equal(hasTamper(compareEnvelopes(expected, actual)), true);
  });
}

test('compareEnvelopes: 多字段同时篡改 → 多 code 并报（非短路）', () => {
  const expected = baseEnvelope();
  const actual: ProofEnvelopeV2 = {
    ...expected,
    fecHash: '0'.repeat(64),
    ledgerRoot: '1'.repeat(64),
    proofHash: '2'.repeat(64),
  };
  const codes = diffCodes(expected, actual);
  assert.ok(codes.includes('FEC_HASH_MISMATCH'));
  assert.ok(codes.includes('LEDGER_ROOT_MISMATCH'));
  assert.ok(codes.includes('PROOF_HASH_MISMATCH'));
  assert.ok(codes.length >= 3, '多字段篡改须并报所有 mismatch（非短路）');
});
