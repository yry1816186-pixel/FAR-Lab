/**
 * canonical_json_guard.test.ts — canonicalJson 非有限数 fail-closed 守卫(确定性不变量)。
 *
 * canonicalHash 是整个证据链/proof envelope 的确定性根基:若允许 NaN/Infinity,
 * JSON.stringify 在不同运行时/语言产生不同字节→链断裂/跨语言分歧。hasher.ts:44
 * assertNoNonFiniteNumber 对 NaN/±Infinity(含嵌套)fail-closed 抛错。此前零测覆盖
 * (cross_lang_consistency 测的是 TS↔Python 数值分歧红基线,非本守卫)。
 *
 * 零容忍合规：无 any / @ts-ignore / 空 catch / 桩。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalHash, canonicalJson, hashCanonicalJson, compareStringsDeterministic } from '../../src/evidence_log/hasher.ts';

test('canonicalJson: 顶层 NaN → fail-closed(确定性不变量)', () => {
  assert.throws(
    () => canonicalJson({ x: NaN }),
    /NaN and Infinity are not allowed in canonical JSON/,
    'NaN 须 fail-closed 抛错(防 JSON.stringify 不确定性)',
  );
});

test('canonicalJson: ±Infinity → fail-closed', () => {
  assert.throws(() => canonicalJson({ x: Infinity }), /NaN and Infinity are not allowed/);
  assert.throws(() => canonicalJson({ x: -Infinity }), /NaN and Infinity are not allowed/);
});

test('canonicalJson: 嵌套/数组内 NaN → fail-closed(递归检测)', () => {
  assert.throws(() => canonicalJson({ a: { b: NaN } }), /NaN and Infinity are not allowed/);
  assert.throws(() => canonicalJson({ list: [1, NaN, 3] }), /NaN and Infinity are not allowed/);
});

test('canonicalJson: 有限数正常序列化(回归基线)', () => {
  assert.equal(canonicalJson({ x: 1, y: 2.5 }), '{"x":1,"y":2.5}');
  assert.equal(canonicalJson({ x: 0 }), '{"x":0}');
  assert.equal(canonicalJson({ x: -1.5e10 }), '{"x":-15000000000}');
});

test('hashCanonicalJson: NaN 输入 → fail-closed(canonicalHash 链守卫一致)', () => {
  assert.throws(
    () => hashCanonicalJson({ x: NaN }),
    /NaN and Infinity are not allowed/,
    'hashCanonicalJson 经 canonicalJson,NaN 输入须同样 fail-closed',
  );
});

test('canonicalHash: empty-string prevHash is rejected (P1-B-1 mutation 缺口修复)', () => {
  // mutation_gate 存活位点：`prevHash === undefined || input.prevHash === ''`（or_to_and 变异后空串被放行）。
  // 契约：空串 prevHash 必须 fail-closed（空串 prevHash 会伪造链根/断链）。
  const cred = {
    modelId: 'offline-replay-fixture',
    dashscopeRequestId: null,
    reproHash: 'a'.repeat(64),
    gitCommitSha: 'b'.repeat(40),
    isoTimestamp: '2026-06-30T00:00:00.000Z',
  };
  assert.throws(
    () =>
      canonicalHash({
        stageId: 'stage3_hypothesis',
        cred,
        payloadKind: 'hypothesis',
        purposeTag: 'hypothesis',
        prevHash: '',
      }),
    /prevHash is required/,
    'empty-string prevHash must be rejected',
  );
});

test('canonicalHash: 合法 prevHash 成功返回 64-hex（=== undefined 位点的正向杀灭）', () => {
  // mutation_gate 存活位点：`input.prevHash === undefined` 的 eq_to_neq 变异——
  // 变异后合法值触发 throw。空串用例只杀 `=== ''` 位点；本正向用例保证合法
  // prevHash 必须成功（不抛）且返回 sha256 hex，恰好击杀该变异。类型上无法
  // 显式传 undefined（exactOptionalPropertyTypes），正向断言是等价且更严的杀法。
  const cred = {
    modelId: 'offline-replay-fixture',
    dashscopeRequestId: null,
    reproHash: 'a'.repeat(64),
    gitCommitSha: 'b'.repeat(40),
    isoTimestamp: '2026-06-30T00:00:00.000Z',
  };
  const hash = canonicalHash({
    stageId: 'stage3_hypothesis',
    cred,
    payloadKind: 'hypothesis',
    purposeTag: 'hypothesis',
    prevHash: 'c'.repeat(64),
  });
  assert.match(hash, /^[0-9a-f]{64}$/, '合法 prevHash 必须产出 sha256 hex 且不抛');
  // 确定性：同输入重算逐字节一致
  assert.equal(
    canonicalHash({
      stageId: 'stage3_hypothesis',
      cred,
      payloadKind: 'hypothesis',
      purposeTag: 'hypothesis',
      prevHash: 'c'.repeat(64),
    }),
    hash,
  );
});

test('canonicalJson: null 值正常序列化为 "null"（assertNoNonFiniteNumber 的 null 防护）', () => {
  // mutation_gate 存活位点：`typeof value === 'object' && value !== null` 的 and_to_or 变异——
  // 变异后 null 进入 Object.entries(null) 抛 TypeError。契约：null 是合法 JSON 值，直接序列化。
  assert.equal(canonicalJson({ a: null, b: 1 }), '{"a":null,"b":1}');
  assert.equal(canonicalJson([null, 'x']), '[null,"x"]');
  assert.equal(canonicalJson(null), 'null');
});

test('compareStringsDeterministic: 相等输入必须返回 0（比较器契约·code-unit 序）', () => {
  // mutation_gate 存活位点：`if (a > b) return 1` / `if (a < b) return -1` 的边界变异——
  // 契约明示返回值语义同 Array#sort 比较器（负/零/正）；相等时返回 0 是文档化行为。
  assert.equal(compareStringsDeterministic('abc', 'abc'), 0);
  assert.equal(compareStringsDeterministic('', ''), 0);
  assert.ok(compareStringsDeterministic('a', 'b') < 0);
  assert.ok(compareStringsDeterministic('b', 'a') > 0);
  // code-unit 序而非 locale 序：'Z'(90) < 'a'(97)，无论运行环境 locale。
  assert.ok(compareStringsDeterministic('Z', 'a') < 0);
});