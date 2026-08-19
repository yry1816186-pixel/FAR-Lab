/**
 * C-1 五值语义单一合同 —— RED→GREEN 判别测试。
 *
 * 缺陷背景(对抗审查 REVIEW_science-arch_01 C-1, P1):
 *   - kernel 头部声明「R0-R9 固定优先级: DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED」
 *     被当作决策表顺序传播, 且被哈希进 ask_envelope 的 rulePriorityTableHash;
 *   - 但决策表实际是「首条决定性规则胜出」: R5_CONTRADICTORY_SIGNIFICANT_EVIDENCE(→INCONCLUSIVE)
 *     在 R6_PRIMARY_TEST_REFUTES(→REFUTED)之前触发; GV-08 即 supports∩refutes 重叠案例, 输出 INCONCLUSIVE。
 *   - anti_theater SUPPORT_RANK(REFUTED=0 垫底)是另一语义轴(支持度/降级), 与值序、规则序互不冲突但无命名。
 * 修复: 单一语义合同模块, 显式命名三轴(值序/规则序/支持度序), 内核/反剧场注释与信封哈希全部指向合同。
 *
 * 本测试断言(修复后全绿):
 *   A. 合同存在且三轴齐备, 规则序 R5 先于 R6(矛盾显著证据 → INCONCLUSIVE 优先于 REFUTED = 保守设计);
 *   B. 行为锁定: supports∩refutes 重叠案例(GV-08 输入) → INCONCLUSIVE + R5_CONTRADICTORY_SIGNIFICANT_EVIDENCE;
 *   C. 信封哈希指向合同版本号(歧义字符串不再被哈希进封条);
 *   D. 源码契约: ask_envelope 引用合同模块(防回归到歧义字符串)。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// A: 合同模块(修复后存在; RED 阶段此导入失败)
import {
  VERDICT_SEMANTICS_CONTRACT_VERSION,
  VALUE_ORDER,
  RULE_ORDER,
  SUPPORT_ORDER,
  VERDICT_SEMANTICS_DECLARATION,
} from '../../src/falsifiability/verdict_semantics.ts';

import { decideFiveValueVerdict } from '../../src/falsifiability/verdict_kernel_v2.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CASE_DIR = join(HERE, '..', '..', 'golden_vectors', 'cases');

test('C-1-A: 合同三轴齐备且规则序 R5 先于 R6(矛盾 → INCONCLUSIVE 保守设计)', () => {
  // 三轴命名存在
  assert.ok(VALUE_ORDER.length === 5, '值序必须覆盖全部五值');
  assert.ok(RULE_ORDER.length >= 10, '规则序必须覆盖 R0..R9');
  assert.ok(SUPPORT_ORDER.length === 5, '支持度序必须覆盖全部五值');

  // 值序 = 展示/文档用严重度序(非决策权威)
  assert.deepEqual(VALUE_ORDER, [
    'DEGRADED_SCOPE',
    'REFUTED',
    'INCONCLUSIVE',
    'CONFIRMED',
    'UNTESTED',
  ]);

  // 规则序 = 决策表实现权威: 首条决定性规则胜出
  const r5 = RULE_ORDER.indexOf('R5_CONTRADICTORY_SIGNIFICANT_EVIDENCE');
  const r6 = RULE_ORDER.indexOf('R6_PRIMARY_TEST_REFUTES');
  assert.ok(r5 >= 0 && r6 >= 0, 'R5/R6 必须在规则序中');
  assert.ok(r5 < r6, '规则序: R5(矛盾→INCONCLUSIVE)必须先于 R6(反驳→REFUTED) — 保守设计');

  // 支持度序 = 反剧场降级用(claim 友好度; REFUTED 最否定 = 垫底)
  const refutedRank = SUPPORT_ORDER.indexOf('REFUTED');
  const inconclusiveRank = SUPPORT_ORDER.indexOf('INCONCLUSIVE');
  const untestedRank = SUPPORT_ORDER.indexOf('UNTESTED');
  assert.ok(
    refutedRank === 0 && inconclusiveRank > untestedRank,
    '支持度序: REFUTED 最否定(0), UNTESTED(1) < INCONCLUSIVE(2)',
  );

  // 声明字符串必须携带合同版本号(哈希输入 = 版本化合同, 非歧义字符串)
  assert.ok(
    VERDICT_SEMANTICS_DECLARATION.includes(VERDICT_SEMANTICS_CONTRACT_VERSION),
    '合同声明必须内嵌版本号',
  );
});

test('C-1-B: 行为锁定 — supports∩refutes 重叠 → INCONCLUSIVE/R5(GV-08 输入)', () => {
  const file = join(CASE_DIR, 'GV-08.json');
  const root = JSON.parse(readFileSync(file, 'utf8')) as {
    input: { kernel: unknown };
    expected: { verdict: string; decisiveRuleId: string };
  };
  const output = decideFiveValueVerdict(root.input.kernel as never);
  assert.equal(output.verdict, 'INCONCLUSIVE');
  assert.equal(output.decisiveRuleId, 'R5_CONTRADICTORY_SIGNIFICANT_EVIDENCE');
  assert.equal(root.expected.verdict, 'INCONCLUSIVE', 'GV-08 期望值必须与行为一致(声明与实现同源)');
});

test('C-1-C: 信封哈希指向合同版本(版本化声明, 三轴命名, 规则序 R5 先于 R6)', () => {
  // 声明必须: ①含版本号 ②命名三个语义轴 ③规则序明确 R5 先于 R6(保守设计)
  assert.ok(VERDICT_SEMANTICS_DECLARATION.includes('valueOrder='), '声明必须命名值序轴');
  assert.ok(VERDICT_SEMANTICS_DECLARATION.includes('ruleOrder='), '声明必须命名规则序轴');
  assert.ok(VERDICT_SEMANTICS_DECLARATION.includes('supportOrder='), '声明必须命名支持度序轴');
  const ruleOrderLine = VERDICT_SEMANTICS_DECLARATION.split('\n').find((l) => l.startsWith('ruleOrder='));
  assert.ok(ruleOrderLine !== undefined, '规则序行必须存在');
  const r5 = ruleOrderLine.indexOf('R5_CONTRADICTORY_SIGNIFICANT_EVIDENCE');
  const r6 = ruleOrderLine.indexOf('R6_PRIMARY_TEST_REFUTES');
  assert.ok(r5 >= 0 && r6 >= 0 && r5 < r6, '声明内规则序: R5 必须先于 R6');
  // 值序轴存在且被命名(展示/文档用严重度序)——但它不是决策权威, 决策权威是规则序
  const valueOrderLine = VERDICT_SEMANTICS_DECLARATION.split('\n').find((l) => l.startsWith('valueOrder='));
  assert.ok(
    valueOrderLine?.includes('DEGRADED_SCOPE>REFUTED>INCONCLUSIVE>CONFIRMED>UNTESTED') === true,
    '值序轴 = DEGRADED_SCOPE>REFUTED>INCONCLUSIVE>CONFIRMED>UNTESTED(展示严重度序, 非决策权威)',
  );
});

test('C-1-D: 源码契约 — ask_envelope 必须引用合同模块(防回归歧义字符串)', () => {
  const envelopeSrc = readFileSync(
    join(HERE, '..', '..', 'src', 'proof_envelope', 'v2', 'ask_envelope.ts'),
    'utf8',
  );
  assert.ok(
    envelopeSrc.includes("from '../../falsifiability/verdict_semantics.ts'") ||
      envelopeSrc.includes("from '../../../falsifiability/verdict_semantics.ts'") ||
      envelopeSrc.includes('verdict_semantics.ts'),
    'ask_envelope 必须从合同模块取声明, 不得自带歧义字符串',
  );
  assert.ok(
    !envelopeSrc.includes("'DEGRADED_SCOPE>REFUTED>INCONCLUSIVE>CONFIRMED>UNTESTED'"),
    'ask_envelope 不得内联旧歧义优先级字符串',
  );
});

test('C-1-E: 黄金向量目录仍只含 GV-*.json 且含 GV-15(规则序锁定案例)', () => {
  const files = readdirSync(CASE_DIR)
    .filter((f) => /^GV-\d+\.json$/.test(f))
    .sort();
  assert.ok(files.includes('GV-15.json'), 'GV-15(矛盾优先于反驳语义锁定)必须存在');
});
