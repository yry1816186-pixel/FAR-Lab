/**
 * verdict_decisiveness.test.ts — 裁决理由层（R10 §8.9 后 T1·night-r3）：
 * decisiveEvidence 反事实翻转 + marginToAdjacent 票距。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { analyzeVerdictDecisiveness, makeVerdict } from '../../src/falsifiability/verdict.ts';
import type { EvidenceRecord } from '../../src/falsifiability/types.ts';

function ev(claim: string, supports: boolean, narrower = false): EvidenceRecord {
  return {
    claim,
    sourceAnchor: {
      gitCommitSha: 'a'.repeat(40),
      dashscopeRequestId: null,
      isoTimestamp: '2026-08-16T00:00:00.000Z',
      rawResponseHash: 'b'.repeat(64),
    },
    supportsClaim: supports,
    refutesClaim: !supports,
    scopeNarrowerThanClaim: narrower,
  };
}

const SPEC = {
  prediction: 'p',
  metric: 'm',
  falsificationThreshold: 1,
  thresholdSemantics: 'gt',
} as const;
// 字段名为 value（ThresholdSpec 契约）——旧 fixture 误写 threshold，因历史用例均无
// metricValue 从未触发 evaluateThreshold 而潜伏；2026-08-20 mutation 补杀用例暴露后修正。
const TH = { semantics: 'gt', value: 1 } as const;

test('unanimous CONFIRMED: every evidence is single-flip decisive, margin 1', () => {
  const d = analyzeVerdictDecisiveness('CONFIRMED', [ev('a', true), ev('b', true), ev('c', true)]);
  assert.deepEqual(d?.decisiveEvidenceClaims, ['a', 'b', 'c']);
  assert.equal(d?.marginToAdjacent, 1);
  assert.match(d?.note ?? '', /hangs on each piece/);
});

test('unanimous N=1: the single evidence flips verdict to the opposite, margin 1', () => {
  const d = analyzeVerdictDecisiveness('REFUTED', [ev('only', false)]);
  assert.deepEqual(d?.decisiveEvidenceClaims, ['only']);
  assert.equal(d?.marginToAdjacent, 1);
});

test('INCONCLUSIVE: minority side is decisive; margin = minority count', () => {
  const d = analyzeVerdictDecisiveness('INCONCLUSIVE', [
    ev('s1', true), ev('s2', true), ev('s3', true), ev('s4', true), ev('s5', true), ev('r1', false),
  ]);
  assert.deepEqual(d?.decisiveEvidenceClaims, ['r1']);
  assert.equal(d?.marginToAdjacent, 1);
  // 2:2 tie — either side counts as minority (<=), margin 2
  const tie = analyzeVerdictDecisiveness('INCONCLUSIVE', [ev('a', true), ev('b', true), ev('c', false), ev('d', false)]);
  assert.equal(tie?.marginToAdjacent, 2);
  assert.equal(tie?.decisiveEvidenceClaims.length, 2);
});

test('DEGRADED_SCOPE: scope-flagged evidence is decisive, margin 1', () => {
  const d = analyzeVerdictDecisiveness('DEGRADED_SCOPE', [ev('narrow', true, true), ev('wide', true)]);
  assert.deepEqual(d?.decisiveEvidenceClaims, ['narrow']);
  assert.equal(d?.marginToAdjacent, 1);
  // defensive: degraded verdict with no narrow evidence → null (semantic inconsistency guard)
  assert.equal(analyzeVerdictDecisiveness('DEGRADED_SCOPE', [ev('a', true)]), null);
});

test('UNTESTED (empty evidence) → null (no adjacency concept)', () => {
  assert.equal(analyzeVerdictDecisiveness('UNTESTED', []), null);
});

test('counterfactual claims are true: flipping a decisive evidence actually changes the verdict', () => {
  // 3 supporting → CONFIRMED; flipping one → INCONCLUSIVE (conflict) — verified
  // through the real kernel, not just the arithmetic claim.
  const base = makeVerdict({
    claim: 'c',
    evidences: [ev('a', true), ev('b', true), ev('c', true)],
    falsificationSpec: SPEC,
    thresholdSpec: TH,
  });
  assert.equal(base.verdict, 'CONFIRMED');
  assert.equal(base.decisiveness?.marginToAdjacent, 1);
  const flipped = makeVerdict({
    claim: 'c',
    evidences: [ev('a', false), ev('b', true), ev('c', true)],
    falsificationSpec: SPEC,
    thresholdSpec: TH,
  });
  assert.equal(flipped.verdict, 'INCONCLUSIVE', 'single flip of a decisive evidence must change the verdict');
});

test('makeVerdict threads decisiveness; V2 projection sites carry documented null', () => {
  const r = makeVerdict({
    claim: 'c',
    evidences: [ev('x', true), ev('y', false)],
    falsificationSpec: SPEC,
    thresholdSpec: TH,
  });
  assert.equal(r.verdict, 'INCONCLUSIVE');
  assert.equal(r.decisiveness?.marginToAdjacent, 1);
  assert.ok(r.decisiveness !== null);
});

test('determinism: same inputs → deep-equal decisiveness', () => {
  const evidences = [ev('a', true), ev('b', true)];
  const a = analyzeVerdictDecisiveness('CONFIRMED', evidences);
  const b = analyzeVerdictDecisiveness('CONFIRMED', evidences);
  assert.deepEqual(a, b);
});

test('note is human-readable and mentions the mechanism', () => {
  const d = analyzeVerdictDecisiveness('INCONCLUSIVE', [ev('a', true), ev('b', false)]);
  assert.match(d?.note ?? '', /conflict 1:1/);
});

// ── 2026-08-20 mutation 补杀（firstMetricValue 两向 + minority 平局选择）──

test('mutation 补杀: 平局冲突（1:1）minority 取 supports 侧（<= 含等号·平局取前侧）', () => {
  const d = analyzeVerdictDecisiveness('INCONCLUSIVE', [ev('sup-1', true), ev('ref-1', false)]);
  assert.deepEqual(d?.decisiveEvidenceClaims, ['sup-1'],
    'supports.length <= refutes.length 含等号：1:1 平局时 minority=supports 侧（< 变异会误取 refutes 侧）');
  assert.equal(d?.marginToAdjacent, 1);
});

test('mutation 补杀: makeVerdict 的 metricValue 取第一条含 metric 的证据（跳过缺省）', () => {
  const noMetric = ev('no-metric-first', true);
  const withMetric: EvidenceRecord = { ...ev('has-metric-second', true), metricValue: 2.5 };
  const result = makeVerdict({
    claim: 'first metric value surfaces',
    evidences: [noMetric, withMetric],
    falsificationSpec: SPEC,
    thresholdSpec: TH,
  });
  assert.equal(result.metricValue, 2.5,
    'firstMetricValue 须跳过无 metric 证据取第一条有值者（find !== undefined 位点）');
});

test('mutation 补杀: 全部证据无 metricValue → metricValue=null（不抛 TypeError）', () => {
  const result = makeVerdict({
    claim: 'no metric anywhere',
    evidences: [ev('bare-1', true), ev('bare-2', true)],
    falsificationSpec: SPEC,
    thresholdSpec: TH,
  });
  assert.equal(result.metricValue, null,
    '无任何 metric 证据须优雅返回 null（evidence === undefined 短路位点——!== 变异会读 undefined.metricValue 抛 TypeError）');
});
