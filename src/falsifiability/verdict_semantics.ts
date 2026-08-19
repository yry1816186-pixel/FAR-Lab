/**
 * verdict_semantics —— 五值裁决语义单一合同(C-1 修复产物)。
 *
 * 缺陷背景: verdict_kernel_v2 头部「R0-R9 固定优先级」声明与决策表实际行为不一致
 * (R5 矛盾 → INCONCLUSIVE 先于 R6 反驳 → REFUTED 触发), 且该歧义字符串被哈希进
 * ask_envelope 的 rulePriorityTableHash; anti_theater SUPPORT_RANK 是第三套排序。
 * 三套排序语义不同但从未命名 → 对外承诺了实现不遵守的契约。
 *
 * 本模块是唯一真相源: 显式命名三个正交语义轴, 内核/反剧场注释与信封哈希全部指向这里。
 * 语义轴:
 *   1. 值序(VALUE_ORDER)     — 展示/文档用严重度序, 不是决策权威。
 *   2. 规则序(RULE_ORDER)    — 决策表实现权威: 首条决定性规则胜出(R0→R9 顺序扫描)。
 *                              注意 R5_CONTRADICTORY(→INCONCLUSIVE) 在 R6_REFUTES(→REFUTED)
 *                              之前触发 = 保守设计: 矛盾显著证据 → INCONCLUSIVE, 不轻判反驳。
 *   3. 支持度序(SUPPORT_ORDER)— anti-theater 降级用(claim 友好度): REFUTED 最否定(0),
 *                              UNTESTED(1) < INCONCLUSIVE(2) < DEGRADED_SCOPE(3) < CONFIRMED(4)。
 *
 * 约束(F1-F9 红线延续):
 *   - 纯常量模块, 无 IO/无 LLM/确定性;
 *   - 版本号一旦发布不改语义; 语义变更 = 新版本号 + 决策表同步 + 黄金向量回归;
 *   - 信封的 rulePriorityTableHash 输入 = VERDICT_SEMANTICS_DECLARATION(含版本号),
 *     旧信封(旧哈希)不受影响——哈希在信封内自洽。
 */

import type { Verdict } from '../schema/enums.ts';

/** 合同版本号(信封哈希输入之一; 语义变更必须升版本)。 */
export const VERDICT_SEMANTICS_CONTRACT_VERSION = 'far.verdict-semantics.v1';

/** 值序(展示/文档严重度序; 非决策权威)。与决策表顺序可能不同——这是有意的。 */
export const VALUE_ORDER: readonly Verdict[] = [
  'DEGRADED_SCOPE',
  'REFUTED',
  'INCONCLUSIVE',
  'CONFIRMED',
  'UNTESTED',
];

/**
 * 规则序(决策表实现权威; 首条决定性规则胜出)。
 * 必须与 verdict_kernel_v2.evaluate 的 if 链顺序逐字一致——本数组是哈希锚,
 * 决策表若改序必须同步本数组并升合同版本。
 */
export const RULE_ORDER: readonly string[] = [
  'R0_SCHEMA_INVALID',
  'R1_FEC_NOT_COMPILABLE',
  'R2_NO_VALID_DATASET_BINDING',
  'R3_CRITICAL_PROTOCOL_DEVIATION',
  'R4_SCOPE_MISMATCH_NONCRITICAL',
  'R5_CONTRADICTORY_SIGNIFICANT_EVIDENCE',
  'R6_PRIMARY_TEST_REFUTES',
  'R7_PRIMARY_TEST_CONFIRMS',
  'R8_INSUFFICIENT_POWER_OR_NULL',
  'R9_ALL_TESTS_SKIPPED',
];

/**
 * 支持度序(anti-theater 降级用; claim 友好度, 高=支持 / 低=否定)。
 * 与 src/anti_theater/constraint.ts SUPPORT_RANK 逐字一致: REFUTED=0 垫底(最否定, 不被洗白),
 * UNTESTED=1 < INCONCLUSIVE=2(UNTESTED 更否定, §6.1 原则 1), DEGRADED_SCOPE=3, CONFIRMED=4。
 */
export const SUPPORT_ORDER: readonly Verdict[] = [
  'REFUTED',
  'UNTESTED',
  'INCONCLUSIVE',
  'DEGRADED_SCOPE',
  'CONFIRMED',
];

/**
 * 合同声明(信封 rulePriorityTableHash 的哈希输入; 版本化, 歧义字符串不再入封条)。
 * 序列化规则: 三轴按固定顺序展开, 逐字稳定(改声明 = 升版本, 不得静默改)。
 */
export const VERDICT_SEMANTICS_DECLARATION: string = [
  `contract=${VERDICT_SEMANTICS_CONTRACT_VERSION}`,
  `valueOrder=${VALUE_ORDER.join('>')}`,
  `ruleOrder=${RULE_ORDER.join('>')}`,
  `supportOrder=${SUPPORT_ORDER.join('>')}`,
].join('\n');
