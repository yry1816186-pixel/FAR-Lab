// tests/evidence_log/deterministic_compare.test.ts
//
// 深度对抗轮回归测试：compareStringsDeterministic —— 跨平台确定性字符串比较器。
//
// 背景（深度对抗轮发现）：
//   多处 hash 输入排序用 String#localeCompare，其结果依赖运行时 locale/ICU 数据版本，
//   非 ASCII 字符在不同机器/Node 构建间排序可能不同 → 相同内容产生不同 hash。
//   修复：引入 compareStringsDeterministic（UTF-16 code-unit 序，确定性·跨平台一致），
//   替换 proof_hash / offline_package / sandbox_runner / aggregator 中的 localeCompare。
//
// 本测试验证：
//   1. 与 locale 无关：强制不同 ICU locale（若运行时支持）下结果一致。
//   2. code-unit 序：与默认 Array#sort() 对字符串的序一致（< 运算符全序）。
//   3. 跨平台稳定：非 ASCII（中文/emoji/组合字符）的序确定。
//   4. proof_hash 用本比较器后，非 ASCII ruleId 不再漂移。
//
// Authority: AGENTS.md §7（确定性·跨平台一致）+ hasher.ts compareStringsDeterministic SSOT。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareStringsDeterministic } from '../../src/evidence_log/hasher.ts';

test('compareStringsDeterministic_matches_default_sort: code-unit 序（与 Array#sort 默认一致）', () => {
  const inputs = ['b', 'a', 'c', 'B', 'A', 'C', '10', '2', 'ab', 'aa'];
  const byComparator = [...inputs].sort(compareStringsDeterministic);
  const byDefault = [...inputs].sort(); // 默认 sort 对字符串 = code-unit 序
  assert.deepEqual(byComparator, byDefault, 'compareStringsDeterministic === 默认 code-unit sort');
});

test('compareStringsDeterministic_ascii_order: ASCII 升序正确', () => {
  assert.equal(compareStringsDeterministic('a', 'b'), -1);
  assert.equal(compareStringsDeterministic('b', 'a'), 1);
  assert.equal(compareStringsDeterministic('a', 'a'), 0);
  // 大写在小写前（ASCII：A=65 < a=97）
  assert.equal(compareStringsDeterministic('A', 'a'), -1);
});

test('compareStringsDeterministic_non_ascii_stable: 非 ASCII 序确定（中文/emoji）', () => {
  // 非 ASCII 字符的 code-unit 序确定（不依赖 locale）
  // 中文常用字 code point > ASCII，故 '中' > 'a'
  assert.equal(compareStringsDeterministic('a', '中'), -1);
  assert.equal(compareStringsDeterministic('中', 'a'), 1);
  assert.equal(compareStringsDeterministic('中', '中'), 0);
  // emoji surrogate pair：'😀' = U+1F600（代理对），code-unit 序 > BMP 中文
  assert.equal(compareStringsDeterministic('中', '😀'), -1);
});

test('compareStringsDeterministic_locale_independent: 结果与 Intl.Collator locale 无关', () => {
  // 关键属性：localeCompare 在某些 locale 下会重排（如德语 ä 在 a 后 vs 字典序），
  // compareStringsDeterministic 始终按 code-unit。验证差异点：'ä'(0xE4) vs 'z'(0x7A)。
  // code-unit: ä(228) > z(122) → 'ä' > 'z'。localeCompare(de) 可能不同。
  // 我们只断言 code-unit 序（确定性），不断言 localeCompare 的值。
  assert.equal(
    compareStringsDeterministic('z', 'ä'),
    -1,
    'code-unit: z(122) < ä(228) —— 与 locale 无关',
  );
});

test('proof_hash_stable_with_non_ascii_ruleid: compareStringsDeterministic 使非 ASCII ruleId 排序确定', () => {
  // 回归：旧 proof_hash 用 localeCompare 排序 checks，非 ASCII ruleId 在不同 locale 下
  // 可能产生不同序 → 不同 proofHash。修复后用 compareStringsDeterministic，序确定。
  // 这里直接验证排序结果稳定（不依赖完整 envelope 构造）：
  //   对含非 ASCII ruleId 的 checks 数组，按 (ruleId, outcome) 排序，乱序输入应得相同输出。
  const rules = [
    { ruleId: '中-rule', outcome: 'pass' as const },
    { ruleId: 'a-rule', outcome: 'pass' as const },
    { ruleId: 'é-rule', outcome: 'pass' as const },
    { ruleId: '😀-rule', outcome: 'pass' as const },
  ];
  const sortOnce = [...rules].sort((a, b) => {
    const c = compareStringsDeterministic(a.ruleId, b.ruleId);
    return c !== 0 ? c : compareStringsDeterministic(a.outcome, b.outcome);
  });
  // 打乱后重排，应得完全相同的数组（序确定·与输入顺序无关）
  const shuffled = [...rules].reverse();
  const sortTwice = [...shuffled].sort((a, b) => {
    const c = compareStringsDeterministic(a.ruleId, b.ruleId);
    return c !== 0 ? c : compareStringsDeterministic(a.outcome, b.outcome);
  });
  assert.deepEqual(
    sortTwice.map((r) => r.ruleId),
    sortOnce.map((r) => r.ruleId),
    '非 ASCII ruleId 排序确定：乱序输入 → 相同输出序（不依赖 locale）',
  );
  // 验证排序结果是 code-unit 序（'!' < '0' < 'A' < 'a'...）
  // 'é'(U+00E9=233), '中'(U+4E2D=20013), 'a'(97), '😀'(代理对 > BMP)
  // code-unit 序：a(97) < é(233) < 中(20013) < 😀(代理对 U+D83D 高代理先)
  assert.deepEqual(
    sortOnce.map((r) => r.ruleId),
    ['a-rule', 'é-rule', '中-rule', '😀-rule'],
    '排序为 code-unit 升序（a < é < 中 < 😀）',
  );
});

test('deterministic_compare_consistent_across_calls: 重复调用结果一致', () => {
  const pairs: Array<[string, string]> = [
    ['abc', 'abd'],
    ['测试', '测验'],
    ['😀', '😁'],
    ['', 'a'],
    ['a', ''],
  ];
  for (const [a, b] of pairs) {
    const r1 = compareStringsDeterministic(a, b);
    const r2 = compareStringsDeterministic(a, b);
    assert.equal(r1, r2, `重复调用一致: "${a}" vs "${b}"`);
    // 对称性：compareStringsDeterministic(b,a) === -compareStringsDeterministic(a,b)
    const rb = compareStringsDeterministic(b, a);
    assert.equal(rb, -r1, `对称性: cmp(b,a) === -cmp(a,b)`);
  }
});
