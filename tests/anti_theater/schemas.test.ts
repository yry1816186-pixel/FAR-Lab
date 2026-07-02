// tests/anti_theater/schemas.test.ts
// 测试 parseAntiTheaterLintInput（#11b · untrusted JSON → AntiTheaterLintInput 骨架校验）。
//
// Authority: PROJECT_PLAN/APPENDIX_E_ANTI_THEATER.md §1（7 字段）+ 04 §5.3（L5 verifier --lint-input）。
//
// 策略（镜像 verify.test.ts 的 parseProofEnvelopeV2 测试风格）：
//   - happy：clean base + gv 攻击向量的 JSON roundtrip 均 ok（结构完整·仅值变）。
//   - 每条结构错误路径：cloneRaw 后做最小 mutation → ok:false + error 匹配字段名。
//   - 深层语义（hash/enum/fec 子结构）不在此测（由 runAntiTheaterLint + verifyAntiTheaterLint 安全网覆盖·
//     见 verify.test.ts「verifyAntiTheaterLint: 深层损坏 input → 重算中止」）。
//
// 零容忍合规：无 any 注解 / @ts-ignore / 双重断言。cloneRaw 用 JSON.parse 显式标注 Record（不引入 any）；
// 嵌套 mutation 用单层 as Record<string, unknown>（测试夹具构造·配注释依据）。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { parseAntiTheaterLintInput } from '../../src/anti_theater/schemas.ts';
import { getGoldenVector, makeCleanBaseInput } from '../fixtures/anti_theater/golden_vectors.ts';

// ===== 辅助 =====

/**
 * JSON roundtrip clone 为 mutable Record（供测试局部 mutation）。
 * JSON.parse 返回 any → 显式标注 Record<string, unknown>（不引入 any 注解·测试夹具构造）。
 */
function cloneRaw(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(makeCleanBaseInput()));
}

/** 断言 ok:false 并匹配 error 正则（收窄 ok 后访问 error）。 */
function assertReject(parsed: ReturnType<typeof parseAntiTheaterLintInput>, pattern: RegExp): void {
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.match(parsed.error, pattern, `error 须匹配 ${pattern}: ${parsed.error}`);
  }
}

// ===== happy path =====

test('parseAntiTheaterLintInput: clean base JSON roundtrip → ok', () => {
  const raw: unknown = JSON.parse(JSON.stringify(makeCleanBaseInput()));
  const parsed = parseAntiTheaterLintInput(raw);
  assert.equal(parsed.ok, true);
});

test('parseAntiTheaterLintInput: gv-posthoc-threshold-01 build roundtrip → ok（结构完整·仅值变）', () => {
  const raw: unknown = JSON.parse(JSON.stringify(getGoldenVector('gv-posthoc-threshold-01').build()));
  const parsed = parseAntiTheaterLintInput(raw);
  assert.equal(parsed.ok, true);
});

// ===== 根节点 =====

test('parseAntiTheaterLintInput: 根非对象 → ok:false', () => {
  assertReject(parseAntiTheaterLintInput([1, 2, 3]), /根节点须为 JSON 对象/);
});

test('parseAntiTheaterLintInput: 根为字符串 → ok:false', () => {
  assertReject(parseAntiTheaterLintInput('not-an-object'), /根节点须为 JSON 对象/);
});

// ===== fec（对象 + contractVersion literal-const）=====

test('parseAntiTheaterLintInput: 缺 fec → ok:false', () => {
  const raw = cloneRaw();
  delete raw.fec;
  assertReject(parseAntiTheaterLintInput(raw), /fec 须为对象/);
});

test('parseAntiTheaterLintInput: fec 非对象 → ok:false', () => {
  const raw = cloneRaw();
  raw.fec = 123;
  assertReject(parseAntiTheaterLintInput(raw), /fec 须为对象/);
});

test('parseAntiTheaterLintInput: fec.contractVersion ≠ FEC/2.0 → ok:false（literal-const 守卫）', () => {
  const raw = cloneRaw();
  const fec = raw.fec as Record<string, unknown>; // 单层 as（测试·局部 mutation fec 子字段）
  fec.contractVersion = 'FEC/1.0';
  assertReject(parseAntiTheaterLintInput(raw), /contractVersion/);
});

// ===== bindings（数组 + 元素 kind discriminant）=====

test('parseAntiTheaterLintInput: bindings 非数组 → ok:false', () => {
  const raw = cloneRaw();
  raw.bindings = 'x';
  assertReject(parseAntiTheaterLintInput(raw), /bindings 须为数组/);
});

test('parseAntiTheaterLintInput: bindings 元素非对象 → ok:false', () => {
  const raw = cloneRaw();
  raw.bindings = [123];
  assertReject(parseAntiTheaterLintInput(raw), /bindings\[0\] 须为对象/);
});

test('parseAntiTheaterLintInput: bindings 元素 kind 非 discriminator → ok:false', () => {
  const raw = cloneRaw();
  raw.bindings = [{ kind: 'unknown' }];
  assertReject(parseAntiTheaterLintInput(raw), /kind 须为 'dataset' 或 'workflow'/);
});

// ===== executionTrace（对象 + measurements/runs 数组 + metricValue:number）=====

test('parseAntiTheaterLintInput: 缺 executionTrace → ok:false', () => {
  const raw = cloneRaw();
  delete raw.executionTrace;
  assertReject(parseAntiTheaterLintInput(raw), /executionTrace 须为对象/);
});

test('parseAntiTheaterLintInput: measurements 非数组 → ok:false', () => {
  const raw = cloneRaw();
  raw.executionTrace = { measurements: 'x', runs: [] };
  assertReject(parseAntiTheaterLintInput(raw), /measurements 须为数组/);
});

test('parseAntiTheaterLintInput: measurements 元素非对象 → ok:false', () => {
  const raw = cloneRaw();
  raw.executionTrace = { measurements: [123], runs: [] };
  assertReject(parseAntiTheaterLintInput(raw), /measurements\[0\] 须为对象/);
});

test('parseAntiTheaterLintInput: measurements.metricValue 非 number → ok:false', () => {
  const raw = cloneRaw();
  raw.executionTrace = { measurements: [{ metricValue: 'x' }], runs: [] };
  assertReject(parseAntiTheaterLintInput(raw), /metricValue 须为 number/);
});

test('parseAntiTheaterLintInput: runs 非数组 → ok:false', () => {
  const raw = cloneRaw();
  raw.executionTrace = { measurements: [], runs: 'x' };
  assertReject(parseAntiTheaterLintInput(raw), /runs 须为数组/);
});

// ===== verdict（对象 + verdict:string + scopeReport 对象）=====

test('parseAntiTheaterLintInput: 缺 verdict → ok:false', () => {
  const raw = cloneRaw();
  delete raw.verdict;
  assertReject(parseAntiTheaterLintInput(raw), /verdict 须为对象/);
});

test('parseAntiTheaterLintInput: verdict.verdict 非 string → ok:false', () => {
  const raw = cloneRaw();
  raw.verdict = { verdict: 123, scopeReport: {} };
  assertReject(parseAntiTheaterLintInput(raw), /verdict\.verdict 须为 string/);
});

test('parseAntiTheaterLintInput: verdict.scopeReport 非对象 → ok:false', () => {
  const raw = cloneRaw();
  raw.verdict = { verdict: 'CONFIRMED', scopeReport: 'x' };
  assertReject(parseAntiTheaterLintInput(raw), /scopeReport 须为对象/);
});

// ===== envelopeDraft（对象 + humanSummary:string + nullResults 数组）=====

test('parseAntiTheaterLintInput: 缺 envelopeDraft → ok:false', () => {
  const raw = cloneRaw();
  delete raw.envelopeDraft;
  assertReject(parseAntiTheaterLintInput(raw), /envelopeDraft 须为对象/);
});

test('parseAntiTheaterLintInput: envelopeDraft.humanSummary 非 string → ok:false', () => {
  const raw = cloneRaw();
  raw.envelopeDraft = { humanSummary: 123, nullResults: [] };
  assertReject(parseAntiTheaterLintInput(raw), /humanSummary 须为 string/);
});

test('parseAntiTheaterLintInput: envelopeDraft.nullResults 非数组 → ok:false', () => {
  const raw = cloneRaw();
  raw.envelopeDraft = { humanSummary: 'x', nullResults: 'x' };
  assertReject(parseAntiTheaterLintInput(raw), /nullResults 须为数组/);
});

// ===== preregistrationRecord（对象 + alpha:number + toleranceFrozen:boolean）=====

test('parseAntiTheaterLintInput: 缺 preregistrationRecord → ok:false', () => {
  const raw = cloneRaw();
  delete raw.preregistrationRecord;
  assertReject(parseAntiTheaterLintInput(raw), /preregistrationRecord 须为对象/);
});

test('parseAntiTheaterLintInput: preregistrationRecord.alpha 非 number → ok:false', () => {
  const raw = cloneRaw();
  raw.preregistrationRecord = { alpha: 'x', toleranceFrozen: true };
  assertReject(parseAntiTheaterLintInput(raw), /alpha 须为 number/);
});

test('parseAntiTheaterLintInput: preregistrationRecord.toleranceFrozen 非 boolean → ok:false', () => {
  const raw = cloneRaw();
  raw.preregistrationRecord = { alpha: 0.01, toleranceFrozen: 'x' };
  assertReject(parseAntiTheaterLintInput(raw), /toleranceFrozen 须为 boolean/);
});

// ===== runRegistry（对象 + runs/declaredNullResults 数组）=====

test('parseAntiTheaterLintInput: 缺 runRegistry → ok:false', () => {
  const raw = cloneRaw();
  delete raw.runRegistry;
  assertReject(parseAntiTheaterLintInput(raw), /runRegistry 须为对象/);
});

test('parseAntiTheaterLintInput: runRegistry.runs 非数组 → ok:false', () => {
  const raw = cloneRaw();
  raw.runRegistry = { runs: 'x', declaredNullResults: [] };
  assertReject(parseAntiTheaterLintInput(raw), /runs 须为数组/);
});
