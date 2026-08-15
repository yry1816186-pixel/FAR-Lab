import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideVerdict, makeVerdict } from '../../src/falsifiability/index.ts';
import type {
  EvidenceRecord,
  FalsificationSpec,
  SourceAnchor,
  ThresholdSpec,
} from '../../src/falsifiability/index.ts';

/**
 * 发表偏倚感知（2.md §8.9 R10 补遗·T0·night-r2 S1）测试向量。
 *
 * 契约要点（与 src/falsifiability/verdict.ts 模块 docstring 互为镜像）：
 *   - 裁决值（5 值枚举）永不因偏倚注记改变——本测试组同时钉住"裁决值不变"与
 *     "注记在/不在"两侧，防止未来把标注级机制误升级为裁决降级（replay 稳定性）。
 *   - 偏斜证据基向量（2.md 原文：支持:反证 = 50:1 量级时 CONFIRMED 必须标注）。
 *   - 本机制不能证明发表偏倚存在——note 字段必须自声明为失衡 SIGNAL 而非证明。
 */

const SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'b'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'c'.repeat(64),
};

const BASE_SPEC: FalsificationSpec = {
  prediction: 'accuracy should be at least 0.85',
  metric: 'accuracy',
  falsificationThreshold: 0.85,
  thresholdSemantics: 'gt',
};

const BASE_THRESHOLD: ThresholdSpec = {
  semantics: 'gt',
  value: 0.85,
};

function makeEvidences(
  count: number,
  stance: 'supports' | 'refutes' | 'supports-narrow',
): EvidenceRecord[] {
  return Array.from({ length: count }, (_, index): EvidenceRecord => {
    const supports = stance !== 'refutes';
    return {
      claim: `evidence #${index + 1} (${stance})`,
      supportsClaim: supports,
      refutesClaim: !supports,
      scopeNarrowerThanClaim: stance === 'supports-narrow',
      sourceAnchor: SOURCE_ANCHOR,
    };
  });
}

// ---------------------------------------------------------------------------
// 1. no_negative_evidence：全支持且 ≥10 条（2.md 50:1 测试向量）
// ---------------------------------------------------------------------------

test('50 supporting / 0 refuting → CONFIRMED + evidenceBaseBias(no_negative_evidence) + tempered（2.md 向量）', () => {
  const decision = decideVerdict({
    claim: 'all-support skewed base',
    evidences: makeEvidences(50, 'supports'),
  });

  assert.equal(decision.verdict, 'CONFIRMED', '裁决值保持 CONFIRMED（标注级·非降级）');
  assert.notEqual(decision.evidenceBaseBias, null);
  assert.equal(decision.evidenceBaseBias!.kind, 'no_negative_evidence');
  assert.equal(decision.evidenceBaseBias!.supportCount, 50);
  assert.equal(decision.evidenceBaseBias!.refuteCount, 0);
  assert.equal(decision.evidenceBaseBias!.ratio, 50, '无反证时 ratio = supportCount / 1（约定分母）');
  assert.equal(decision.evidenceBaseBias!.tempered, true, 'CONFIRMED 强度折减标记');
});

test('9 supporting / 0 refuting → CONFIRMED 且 bias 为 null（阈值下边界·早期正常证据不标注）', () => {
  const decision = decideVerdict({
    claim: 'small all-support base',
    evidences: makeEvidences(9, 'supports'),
  });

  assert.equal(decision.verdict, 'CONFIRMED');
  assert.equal(decision.evidenceBaseBias, null);
});

test('10 supporting / 0 refuting → 边界恰开启（supportCount >= 10 为闭区间）', () => {
  const decision = decideVerdict({
    claim: 'boundary all-support base',
    evidences: makeEvidences(10, 'supports'),
  });

  assert.equal(decision.verdict, 'CONFIRMED');
  assert.equal(decision.evidenceBaseBias!.kind, 'no_negative_evidence');
  assert.equal(decision.evidenceBaseBias!.ratio, 10);
  assert.equal(decision.evidenceBaseBias!.tempered, true);
});

// ---------------------------------------------------------------------------
// 2. skewed_base：反证存在但悬殊（ratio ≥ 10）
// ---------------------------------------------------------------------------

test('50 supporting / 5 refuting (10:1) → INCONCLUSIVE + evidenceBaseBias(skewed_base)（信息性·不折减）', () => {
  const decision = decideVerdict({
    claim: 'skewed mixed base',
    evidences: [...makeEvidences(50, 'supports'), ...makeEvidences(5, 'refutes')],
  });

  assert.equal(decision.verdict, 'INCONCLUSIVE', '混合证据 → 冲突裁决值不变');
  assert.equal(decision.conflictingEvidenceCount, 5);
  assert.equal(decision.evidenceBaseBias!.kind, 'skewed_base');
  assert.equal(decision.evidenceBaseBias!.supportCount, 50);
  assert.equal(decision.evidenceBaseBias!.refuteCount, 5);
  assert.equal(decision.evidenceBaseBias!.ratio, 10, 'ratio = 50 / 5 恰为边界');
  assert.equal(
    decision.evidenceBaseBias!.tempered,
    false,
    '非 CONFIRMED 裁决上的注记是信息性的，不携带折减标记',
  );
});

test('10 supporting / 1 refuting (10:1 整比) → skewed_base 边界开启', () => {
  const decision = decideVerdict({
    claim: 'integer boundary ratio',
    evidences: [...makeEvidences(10, 'supports'), ...makeEvidences(1, 'refutes')],
  });

  assert.equal(decision.verdict, 'INCONCLUSIVE');
  assert.equal(decision.evidenceBaseBias!.kind, 'skewed_base');
  assert.equal(decision.evidenceBaseBias!.ratio, 10);
});

test('9 supporting / 1 refuting (9:1) → INCONCLUSIVE 且 bias 为 null（阈值下）', () => {
  const decision = decideVerdict({
    claim: 'below ratio threshold',
    evidences: [...makeEvidences(9, 'supports'), ...makeEvidences(1, 'refutes')],
  });

  assert.equal(decision.verdict, 'INCONCLUSIVE');
  assert.equal(decision.evidenceBaseBias, null);
});

test('20 supporting / 3 refuting (<10:1) → INCONCLUSIVE 且 bias 为 null', () => {
  const decision = decideVerdict({
    claim: 'moderate mixed base',
    evidences: [...makeEvidences(20, 'supports'), ...makeEvidences(3, 'refutes')],
  });

  assert.equal(decision.verdict, 'INCONCLUSIVE');
  assert.equal(decision.evidenceBaseBias, null, '20/3 ≈ 6.67 < 10，正常争论区不标注');
});

// ---------------------------------------------------------------------------
// 3. 负向偏斜不对称性：R10 条款只针对 CONFIRMED 过度自信
// ---------------------------------------------------------------------------

test('0 supporting / 50 refuting → REFUTED 且 bias 为 null（负向偏斜不折减·不对称性显式钉住）', () => {
  const decision = decideVerdict({
    claim: 'negative skewed base',
    evidences: makeEvidences(50, 'refutes'),
  });

  assert.equal(decision.verdict, 'REFUTED');
  assert.equal(
    decision.evidenceBaseBias,
    null,
    'supportCount=0 → 任何比值规则均不触发；R10 条款目标是 CONFIRMED 过度自信，非 REFUTED',
  );
});

// ---------------------------------------------------------------------------
// 4. 早退路径：UNTESTED / DEGRADED_SCOPE 恒 null
// ---------------------------------------------------------------------------

test('空证据 → UNTESTED 且 bias 为 null', () => {
  const decision = decideVerdict({ claim: 'untested claim', evidences: [] });

  assert.equal(decision.verdict, 'UNTESTED');
  assert.equal(decision.evidenceBaseBias, null);
});

test('DEGRADED_SCOPE 早退 → bias 为 null（scope-slip 优先级高于偏倚注记）', () => {
  const decision = decideVerdict({
    claim: 'scope slip with skewed base',
    evidences: makeEvidences(50, 'supports-narrow'),
  });

  assert.equal(decision.verdict, 'DEGRADED_SCOPE');
  assert.notEqual(decision.scopeSlipText, null);
  assert.equal(decision.evidenceBaseBias, null);
});

// ---------------------------------------------------------------------------
// 5. note 契约：必须自声明为失衡信号而非发表偏倚证明（cannot-prove 入带内）
// ---------------------------------------------------------------------------

test('两种 kind 的 note 均声明为失衡 SIGNAL、非发表偏倚证明', () => {
  const noNegative = decideVerdict({
    claim: 'note contract all-support',
    evidences: makeEvidences(50, 'supports'),
  }).evidenceBaseBias!;

  const skewed = decideVerdict({
    claim: 'note contract skewed',
    evidences: [...makeEvidences(50, 'supports'), ...makeEvidences(4, 'refutes')],
  }).evidenceBaseBias!;

  for (const bias of [noNegative, skewed]) {
    assert.match(bias.note, /signal/i, 'note 须含 signal 字样');
    assert.match(bias.note, /not proof/i, 'note 须显式否认证明力');
  }
  assert.match(noNegative.note, /no refuting/);
  assert.match(skewed.note, /12[.]5|50/);
});

// ---------------------------------------------------------------------------
// 6. 确定性与顺序无关性（§7：无迭代顺序依赖）
// ---------------------------------------------------------------------------

test('确定性：同输入两次运行 → deepEqual 输出', () => {
  const input = {
    claim: 'determinism probe',
    evidences: [...makeEvidences(30, 'supports'), ...makeEvidences(2, 'refutes')],
  };
  assert.deepEqual(decideVerdict(input), decideVerdict(input));
});

test('顺序无关性：证据数组重排 → 偏倚注记 deepEqual（计数不依赖迭代顺序）', () => {
  const straight = decideVerdict({
    claim: 'order probe',
    evidences: [...makeEvidences(50, 'supports'), ...makeEvidences(5, 'refutes')],
  });
  const reversed = decideVerdict({
    claim: 'order probe',
    evidences: [...makeEvidences(5, 'refutes'), ...makeEvidences(50, 'supports')],
  });
  assert.deepEqual(straight.evidenceBaseBias, reversed.evidenceBaseBias);
  assert.equal(straight.verdict, reversed.verdict);
});

// ---------------------------------------------------------------------------
// 7. makeVerdict 线程化：VerdictResult 携带 evidenceBaseBias
// ---------------------------------------------------------------------------

test('makeVerdict 将 evidenceBaseBias 线程化进 VerdictResult', () => {
  const result = makeVerdict({
    claim: 'threading probe',
    evidences: makeEvidences(50, 'supports'),
    falsificationSpec: BASE_SPEC,
    thresholdSpec: BASE_THRESHOLD,
  });

  assert.equal(result.verdict, 'CONFIRMED');
  assert.equal(result.metricValue, null, '无 metricValue 的文献投票证据 → null');
  assert.equal(result.evidenceBaseBias!.kind, 'no_negative_evidence');
  assert.equal(result.evidenceBaseBias!.tempered, true);
});

test('makeVerdict 干净小证据基 → VerdictResult.evidenceBaseBias 为 null', () => {
  const result = makeVerdict({
    claim: 'clean base probe',
    evidences: makeEvidences(3, 'supports'),
    falsificationSpec: BASE_SPEC,
    thresholdSpec: BASE_THRESHOLD,
  });

  assert.equal(result.verdict, 'CONFIRMED');
  assert.equal(result.evidenceBaseBias, null);
});
