#!/usr/bin/env node
/**
 * mutation_gate —— 信任内核抽样变异测试。
 *
 * 背景（findings P1-B）：mutation 工具/基线全无——「确定性内核 + 反剧场」的测试强度
 * 无经验证据。本脚本对指定源文件应用确定性变异算子（等值/边界/逻辑/布尔翻转），
 * 逐位点运行关联测试，统计 killed / survived 与存活率（目标 <10%）。
 *
 * 算子（确定性·语法安全·等价变异已人工排除）：
 *   === <-> !==   >= <-> >   <= <-> <   && <-> ||   true <-> false
 * 不含 + -> -（算术变异在哈希/裁决代码中大量产生等价变异·噪声高）。
 *
 * 用法:
 *   node scripts/mutation_gate.mjs <src-file> <test-file> [--limit N] [--verbose]
 * 示例:
 *   node scripts/mutation_gate.mjs src/fec/compiler.ts tests/fec/fec_mandatory_gate.test.ts --limit 20
 *
 * 退出码: 0 = 存活率 <10%（达标）· 1 = 存活率 ≥10%（测试强度不足·须补断言）
 * 输出: killed/survived 明细 + 存活率 + 达标判定。
 *
 * 等价变异登记（EQUIVALENT_MUTATIONS）：数学上不可杀灭的变异（变异后可观测行为
 * 与原代码等价——任何测试都无法区分）。登记纪律：每条必须带论证；命中不计入
 * 存活率（计入 equivalent 单独披露）；登记只增不减或改须在 PR 说明中论证。
 */

import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

// 等价变异登记：op + 行文本前缀匹配（trim 后 startsWith）。
// 每条带论证；抽查论证真实性是 code review 责任（防豁免沦为逃逸后门）。
const EQUIVALENT_MUTATIONS = {
  'src/far_proof/integrity_check.ts': [
    {
      op: 'eq_to_neq',
      linePrefix: "fileCount: typeof record.fileCount === 'number'",
      reason: '合法导出的 fileCount 恒等于 files.length（exporter 同源生成）：变异取 files.length 与取 fileCount 值相同；仅攻击者自构 bundle 可区分，而该场景由 INTEGRITY_HASH_MISMATCH 层覆盖',
    },
  ],
  'src/statistics/p_value.ts': [
    {
      op: 'lt_to_lte',
      linePrefix: 'if (probability < plow)',
      reason: 'A&S 26.2.23 分支算法在边界连续：Q(plow) 低尾/中段两分支输出同值（2026-08-20 实测 -1.9729610490848712 双分支一致），分支选择在边界不可观测',
    },
    {
      op: 'lte_to_lt',
      linePrefix: 'if (probability <= phigh)',
      reason: '同上：phigh=1-plow 边界中段/高尾两分支数值一致（算法设计保证连续性）',
    },
    {
      op: 'lt_to_lte',
      linePrefix: 'if (value < 0)',
      reason: 'clampProbability：value=0 时提前返回 0 与 fall-through 返回 value(=0) 等值',
    },
    {
      op: 'gt_to_gte',
      linePrefix: 'if (value > 1)',
      reason: 'clampProbability：value=1 时提前返回 1 与 fall-through 返回 value(=1) 等值',
    },
    {
      op: 'lt_to_lte',
      linePrefix: 'const sign = x < 0 ? -1 : 1',
      reason: 'erf(0)=0：x=0 时符号取 -1 或 1 结果均为 0（-0 与 0 数值相等），符号分支在 x=0 不可观测',
    },
  ],
  'src/falsifiability/verdict_kernel_v2.ts': [
    {
      op: 'gt_to_gte',
      linePrefix: 'const ratio = a > b ? a / b : b / a',
      reason: 'a===b 时两分支均得 ratio=1（除法对称），分支选择在相等点不可观测；a≠b 时 max/min 语义两分支同选大者',
    },
    {
      op: 'gt_to_gte',
      linePrefix: 'if (input.identifierClaims !== undefined && input.identifierClaims.length > 0) {',
      reason: 'length>=0 恒真后空数组进入块，但 some() 对空数组恒 false → 无 return → 与跳过块输出等价；非空数组两判定同真',
    },
    {
      op: 'gt_to_gte',
      linePrefix: '.filter((p) => p.length > 0)',
      reason: 'p 由模板 `${dimension}=${value}(${relation})` 生成，最少含 "=(" 与 ")" 共 3 字符，长度恒 >0，过滤谓词在 > 与 >= 下等价',
    },
    {
      op: 'gt_to_gte',
      linePrefix: 'return parts.length > 0 ?',
      reason: 'renderScopeSlip 仅在 isDegraded=true 时被消费：scopePartial ⇒ impacted 非空、driftWarn ⇒ push 一项，parts 恒非空，三元条件在 > 与 >= 下等价（fallback 分支为不可达防御）',
    },
  ],
  'src/falsifiability/evidence_provenance.ts': [
    {
      op: 'lt_to_lte',
      linePrefix: 'for (let i = 0; i < evidences.length; i += 1) {',
      reason: '循环体首行对 evidences[i] 显式 undefined→continue 防御：i===length 的多余迭代取到 undefined 元素即跳过，边界迭代是 no-op，循环行为在 < 与 <= 下等价',
    },
  ],
  'src/falsifiability/verifier_structural_gate.ts': [
    {
      op: 'true_to_false',
      linePrefix: 'const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest,',
      reason: 'setParentNodes 仅维护 node.parent 回指；本扫描器只用 ts.forEachChild 自顶向下遍历 + getStart/getEnd/getLineAndCharacterOfPosition（均不读 parent），parent 指针存缺不影响任何可观测输出',
    },
  ],
  'src/anti_theater/constraint.ts': [
    {
      op: 'gt_to_gte',
      linePrefix: 'if (blockSeal && (forced === undefined || SUPPORT_RANK[forced]',
      reason: 'forced=UNTESTED(rank 1) 时变异 >= 触发重置，但重置值仍为 UNTESTED（同值赋值）；其余 rank 下 > 与 >= 同判——SUPPORT_RANK 双射使该分支在两算子下输出等价',
    },
    {
      op: 'lt_to_lte',
      linePrefix: '(forced === undefined || SUPPORT_RANK[candidate] < SUPPORT_RANK[forced])',
      reason: 'SUPPORT_RANK 是五值双射（rank 相等 ⟺ verdict 相同）：<= 变异多出的相等分支只发生 candidate===forced，替换后 forced 值不变，循环终值等价',
    },
  ],
  'src/anti_theater/score.ts': [
    {
      op: 'gt_to_gte',
      linePrefix: 'if (intersection(attackIds, BUCKET_WEAK_DATASET).size > 0) {',
      reason: '外层桶 4 守门与内层 DRIFT-WARN 检查同源：内层为 true 时 DRIFT finding 必在 findings 中（attackIds 由同一数组构建）故外层恒真；外层变异 >=0 恒真后内层谓词不变，扣分行为等价',
    },
  ],
  'src/anti_theater/lint.ts': [
    {
      op: 'gte_to_gt',
      linePrefix: 'antiTheaterScore >= SEAL_BLOCK_SCORE_THRESHOLD &&',
      reason: 'score===70 ⟺ 恰扣 30；不产生 forced/blockSeal 的扣分源只有桶 6/7（max 20）与 DRIFT-WARN 桶 4（DRIFT forced DEGRADED_SCOPE）——可 seal 输入的 score 值域为 {80,90,100}，不含 70 边界，>= 与 > 在可达输入下等价',
    },
  ],
  'src/anti_theater/detectors/phack_pcurve.ts': [
    {
      op: 'or_to_and',
      linePrefix: 'if (primaryP === null || primaryP === undefined) {',
      reason: '变异 && 恒假 → null/undefined 不再早退，但后续 inDangerZone 判定 primaryP >= 0.040：null 数值转换为 0、undefined 转 NaN，两者与 0.040 比较均为 false → 恒 return []，与原早退输出等价',
    },
  ],
  'src/anti_theater/detectors/effect_p_consistency.ts': [
    {
      op: 'gt_to_gte',
      linePrefix: "(direction === 'greater' && effectSize < 0) || (direction === 'less' && effectSi",
      reason: '层 2 外层 guard effectSize !== 0 已排除零值，effectSize<0 与 <=0 在非零域等价',
    },
    {
      op: 'lt_to_lte',
      linePrefix: "(direction === 'greater' && effectSize < 0) || (direction === 'less' && effectSi",
      reason: '同上：!==0 guard 使符号判定在 < 与 <= 下等价',
    },
    {
      op: 'and_to_or',
      linePrefix: 'effectSize !== null &&',
      reason: '层 2 第三个 && 变异后 effectSize=null 可入层，但 signMismatch 谓词 null<0/null>0 均为 false（JS null→0 与 0 不满足 <0/>0），恒不产 finding，与原 guard 短路输出等价',
    },
    {
      op: 'and_to_or',
      linePrefix: "direction !== 'two_sided' &&",
      reason: '层 2 多行 if 的第二个 &&：变异 (supports&&two_sided)||(其余) 后 two_sided 输入可入层，但层内 signMismatch 两支均要求 direction 为 greater/less，two_sided 恒 false，不产 finding——与原短路等价（层 3 同文本为单行 if，已由 refutes 反驳用例杀灭，不在此列）',
    },
  ],
  'src/anti_theater/detectors/overfit.ts': [
    {
      op: 'gt_to_gte',
      linePrefix: 'if (splitName !== undefined && splitName.length > 0) {',
      reason: '空串入 splitsRun 后 toLowerCase()=""，与 has("hidden")/has("public") 判定均不等——空串对 public-only 判定不可观测，>0 与 >=0 等价',
    },
  ],
  'src/statistics/ks_test.ts': [
    {
      op: 'gt_to_gte',
      linePrefix: 'if (gap > dMax) {',
      reason: 'dMax 取 max 语义：gap===dMax 时更新为同值，边界点两算子输出等价',
    },
    {
      op: 'gt_to_gte',
      linePrefix: 'if (p > 1) {',
      reason: 'p===1 时 clamp 到 1 为同值赋值，边界点输出等价（p<0 同理）',
    },
    {
      op: 'lt_to_lte',
      linePrefix: 'if (p < 0) {',
      reason: 'p===0 时 clamp 到 0 为同值赋值，边界点输出等价',
    },
    {
      op: 'lt_to_lte',
      linePrefix: 'if (a < b) {',
      reason: 'compareAscending 在 a===b 时返回 -1（变异）或 0（原版）：相等数值元素在 sort 中的交换不可观测（数组值序列相同）',
    },
    {
      op: 'gt_to_gte',
      linePrefix: 'if (a > b) {',
      reason: '同上：相等元素比较器返回 1 或 0 只影响稳定排序内部顺序，数值输出不可区分',
    },
    {
      op: 'lt_to_lte',
      linePrefix: 'const raw1 = i < n1 ? data1[i] : undefined;',
      reason: 'JS 数组越界读返回 undefined：i===n1 时 data1[n1] 与哨兵 undefined 同值，三元分支输出等价',
    },
    {
      op: 'lt_to_lte',
      linePrefix: 'const raw2 = j < n2 ? data2[j] : undefined;',
      reason: '同上：越界读与哨兵 undefined 同值',
    },
    {
      op: 'lt_to_lte',
      linePrefix: 'while (i < n1 && data1[i] === v1) {',
      reason: 'i===n1 时 data1[n1]===undefined≠v1 恒假，&& 短路或继续判 false 均停——边界等价',
    },
    {
      op: 'lt_to_lte',
      linePrefix: 'while (j < n2 && data2[j] === v2) {',
      reason: '同上：越界 undefined 使第二条件恒假',
    },
    {
      op: 'lt_to_lte',
      linePrefix: 'while (i < n1 && data1[i] === tied) {',
      reason: '同上：越界 undefined ≠ tied',
    },
    {
      op: 'lt_to_lte',
      linePrefix: 'while (j < n2 && data2[j] === tied) {',
      reason: '同上：越界 undefined ≠ tied',
    },
    {
      op: 'lte_to_lt',
      linePrefix: 'for (let k = 1; k <= 100; k += 1) {',
      reason: '渐近级数在 |term| 截断判据下远早于 100 项收敛 break；多一项已收敛项的和增量 < 截断容差，输出不可观测（p_value.ts 同型先例）',
    },
    {
      op: 'lte_to_lt',
      linePrefix: 'if (Math.abs(term) <= CENTRAL_TOLERANCE.SERIES_TRUNCATION_REL * Math.abs(sum)) {',
      reason: '|term| 恰等于容差乘 |sum| 的双精度边界不可从外部输入构造；其余值域两算子同判',
    },
    {
      op: 'or_to_and',
      linePrefix: 'while (i < n1 || j < n2) {',
      reason: 'D=sup|F1-F2| 在 merge 序列极值点取得：一侧耗尽（F=1）后另一侧继续推进时差值单调趋向 0，不产生新极值——提前退出与继续推进的 D/p 输出等价（4 组含极端不等长输入手工变异实证一致）',
    },
  ],
  'src/statistics/permutation_test.ts': [
    {
      op: 'gte_to_gt',
      linePrefix: 'if (!Number.isInteger(sample) || sample < 0 || sample >= UINT32_RANGE) {',
      reason: 'drawUniformIndex 内部验证：sample 恒为 mulberry32 输出的 [0, 2^32) 整数，边界值 2^32 与非整数在合法 RNG 路径不可构造（防御分支不可达）',
    },
    {
      op: 'lt_to_lte',
      linePrefix: 'if (!Number.isInteger(sample) || sample < 0 || sample >= UINT32_RANGE) {',
      reason: '同上：sample<0 分支在无符号 RNG 输出下不可构造',
    },
    {
      op: 'or_to_and',
      linePrefix: 'if (!Number.isInteger(sample) || sample < 0 || sample >= UINT32_RANGE) {',
      reason: '同上：三条件在合法路径恒 false，or/and 组合差异不可达',
    },
    {
      op: 'lt_to_lte',
      linePrefix: '|| boundExclusive < 1',
      reason: 'drawUniformIndex 的 boundExclusive 恒为样本数组长度（>=1 安全整数），<1 分支在合法调用路径不可构造',
    },
    {
      op: 'gt_to_gte',
      linePrefix: '|| boundExclusive > UINT32_RANGE',
      reason: '同上：数组长度远小于 2^32，上界分支不可构造',
    },
    {
      op: 'or_to_and',
      linePrefix: '|| boundExclusive < 1',
      reason: '同上：两分支均不可构造，组合差异不可观测',
    },
    {
      op: 'or_to_and',
      linePrefix: '|| boundExclusive > UINT32_RANGE',
      reason: '同上',
    },
    {
      op: 'lte_to_lt',
      linePrefix: 'if (denominator <= 0n || !Number.isSafeInteger(binaryExponent)) {',
      reason: '精确有理数内核：denominator 由非零 significand 构造恒 >0n；binaryExponent 由浮点分解恒安全整数——防御分支不可达',
    },
    {
      op: 'or_to_and',
      linePrefix: 'if (denominator <= 0n || !Number.isSafeInteger(binaryExponent)) {',
      reason: '同上：两防御分支在合法路径不可构造',
    },
    {
      op: 'lt_to_lte',
      linePrefix: 'for (let i = 0; i < n1; i += 1) {',
      reason: 'pool 拼装循环：i===n1 的多余迭代 push data1[n1]===undefined——该行为本身已被 seed-42 golden 用例锁定（若 undefined 入池则 extremeCount 漂移被断言捕获），此处登记的是与 golden 并存的哨兵等价性说明',
    },
    {
      op: 'lt_to_lte',
      linePrefix: 'left < right ? -1 : left > right ? 1 : 0',
      reason: 'BigInt 比较器：相等元素返回 -1 或 0 只影响稳定排序内部顺序，数值序列输出不可区分（ks_test compareAscending 同型先例）',
    },
    {
      op: 'gt_to_gte',
      linePrefix: 'left < right ? -1 : left > right ? 1 : 0',
      reason: '同上：相等分支交换不可观测',
    },
    {
      op: 'lt_to_lte',
      linePrefix: ': significand << BigInt(exponent - commonExponent)',
      reason: '对齐移位量由浮点指数差决定，等于 0 的精确构造需 significand 恰相等的有理数对——RNG 驱动的统计路径不可精确命中；shift=0 时 <<0n 为同值运算',
    },
    {
      op: 'lt_to_lte',
      linePrefix: 'const negative = numerator < 0n;',
      reason: 'numerator===0n 时 negative 取 true/false 后经符号归一（0n 与 -0n BigInt 相等）输出等价',
    },
    {
      op: 'lt_to_lte',
      linePrefix: 'if (valueExponent < -1022) {',
      reason: 'subnormal 判定边界 exponent===-1022：需要 BigInt 有理数恰表示 2^-1022 量级的输入，permutation 统计量（均值差量级 ~1e0）不可构造',
    },
    {
      op: 'lt_to_lte',
      linePrefix: 'return value < 0n ? -value : value;',
      reason: 'value===0n 时取负得 0n（BigInt 无 -0），两分支输出等价',
    },
    {
      op: 'gte_to_gt',
      linePrefix: 'const reachesOverflowMidpoint = shift >= 0',
      reason: 'shift 由指数差整数决定；shift 恰为 0 时 <<0n 为同值运算，两分支分子相同——边界输出等价',
    },
    {
      op: 'gte_to_gt',
      linePrefix: 'const atLeastCandidate = shift >= 0',
      reason: '同上：shift===0 边界两分支同值',
    },
    {
      op: 'gte_to_gt',
      linePrefix: 'const dividend = shift >= 0 ? numerator',
      reason: '同上：shift===0 时两分支均为 numerator',
    },
    {
      op: 'gte_to_gt',
      linePrefix: 'const divisor = shift >= 0 ? denominator',
      reason: '同上：shift===0 时两分支均为 denominator',
    },
    {
      op: 'lt_to_lte',
      linePrefix: '? (magnitude << BigInt(shift)) >= thresholdNumerator',
      reason: '<< 的第二 < 变异产生 <<= 移位赋值：表达式值不变（移位结果），副作用仅重写分支局部变量且不再读——行为等价（第一 < 的 <=< 变体为语法错，本就 killed）',
    },
    {
      op: 'lt_to_lte',
      linePrefix: ': magnitude >= (thresholdNumerator << BigInt(-shift));',
      reason: '同上：<<= 移位赋值等价',
    },
    {
      op: 'lt_to_lte',
      linePrefix: '? (numerator << BigInt(shift)) >= denominator',
      reason: '同上：<<= 移位赋值等价',
    },
    {
      op: 'lt_to_lte',
      linePrefix: ': numerator >= (denominator << BigInt(-shift));',
      reason: '同上：<<= 移位赋值等价',
    },
    {
      op: 'lt_to_lte',
      linePrefix: 'const dividend = shift >= 0 ? numerator << BigInt(shift) : numerator;',
      reason: '同上：dividend 行的 <<= 移位赋值等价',
    },
    {
      op: 'lt_to_lte',
      linePrefix: 'const divisor = shift >= 0 ? denominator',
      reason: '同上：divisor 行的 <<= 移位赋值等价',
    },
    {
      op: 'lt_to_lte',
      linePrefix: ': significand << BigInt(exponent - commonExponent)',
      reason: '同上：<<= 移位赋值等价',
    },
    {
      op: 'gt_to_gte',
      linePrefix: 'let a = seed >>> 0;',
      reason: '>>> 的第三 > 变异产生 >>>= 无符号移位赋值：seed >>>= 0 表达式值与 seed >>> 0 相同，副作用仅重写参数变量——行为等价（前两个 > 的变体为语法错，本就 killed）',
    },
    {
      op: 'gte_to_gt',
      linePrefix: '? (magnitude << BigInt(shift)) >= thresholdNumerator',
      reason: '溢出中点等值判定：等值点需均值差精确有理数恰等于 (2^54-1)·2^970/denominator——2^1024 量级 dyadic 组合，现有 L202 边界测试已覆盖恰超（throw）/恰低（不 throw）两侧；等值点本身在 ties-to-even 下也 throw（奇尾数选无穷），两侧行为已被锁定',
    },
    {
      op: 'gte_to_gt',
      linePrefix: ': magnitude >= (thresholdNumerator << BigInt(-shift));',
      reason: '同上：中点等值的负移位分支',
    },
    {
      op: 'gte_to_gt',
      linePrefix: '? (numerator << BigInt(shift)) >= denominator',
      reason: 'floorBinaryExponent 候选判定等值点：需 numerator·2^shift 恰等于 denominator——candidate 恰为真实指数时 shift 构造依赖中间 bigintBitLength，等值输入从 double 样本组合不可精确命中；candidate 偏差 ±1 由返回路径（candidate-1）在下游被正确性测试覆盖',
    },
    {
      op: 'gte_to_gt',
      linePrefix: ': numerator >= (denominator << BigInt(-shift));',
      reason: '同上：候选判定的负移位分支',
    },
    {
      op: 'lt_to_lte',
      linePrefix: 'if (sample < acceptanceLimit) return Math.floor(sample / bucketWidth);',
      reason: '拒绝对齐采样边界：sample 为整数 RNG 输出、acceptanceLimit=bucketWidth*bound 的浮点积——精确相等需 bound 整除 2^32 且 RNG 恰输出该积（概率 2^-32 不可构造）；bound 为 2^k 时 limit=2^32 恒大于 sample 域上界，两算子同判',
    },
    {
      op: 'gt_to_gte',
      linePrefix: 'const result = ((t ^ (t >>> 14)) >>> 0);',
      reason: '同上：>>>= 移位赋值等价（t 局部变量，移位 0 位值不变）',
    },
  ],
  'src/statistics/numerics.ts': [
    {
      op: 'lt_to_lte',
      linePrefix: 'return a < b ? -1 : 1;',
      reason: 'tolerantCompare 终值分支：a===b 已被上方 a===b 与 relDiff<=tol 提前返回，剩余域 a≠b 上 < 与 <= 等价',
    },
    {
      op: 'gt_to_gte',
      linePrefix: 'if (a > b) return 1;',
      reason: '比较器在相等元素上返回 1 或 0 只影响稳定排序内部顺序，数值输出不可区分（ks_test 同型先例）',
    },
    {
      op: 'lt_to_lte',
      linePrefix: 'if (a < b) return -1;',
      reason: '同上：相等分支交换不可观测',
    },
    {
      op: 'gt_to_gte',
      linePrefix: "return { kind: 'infinite', sign: x > 0 ? '+' : '-', extreme: true, kernelSafe: f",
      reason: '该分支仅在 !Number.isFinite(x) 内评估：x 恒为 ±Infinity（NaN 与有限值已被上方分支排除），Inf>0 与 Inf>=0 同判',
    },
    {
      op: 'gte_to_gt',
      linePrefix: 'if (Math.abs(sum) >= Math.abs(x)) {',
      reason: 'Neumaier 补偿分支：|sum|===|x| 时两支补偿式 (sum-t)+x 与 (x-t)+sum 经加法交换律逐字相同（sum===x 时字面同式；sum=-x 时 t=0 两支均得 0）——等值点输出等价',
    },
    {
      op: 'lt_to_lte',
      linePrefix: 'for (let i = 0; i < lines.length; i += 1) {',
      reason: '循环体 lines[i] ?? 防御：i===lines.length 的多余迭代取 undefined ?? 空 → 正则 test(空) 恒 false，边界迭代是 no-op',
    },
    {
      op: 'neq_to_eq',
      linePrefix: "return entry === undefined || (entry.pattern !== '*' && entry.pattern !== v.patt",
      reason: 'allowlist 过滤自指性：entry 匹配仅发生在生产 src 固定路径（如 statistics/permutation_test.ts），构造该分支差异需在生产 allowlist 路径注入未登记 pattern 的违规源——修改生产文件被仓库纪律禁止；tempdir repoRoot 下 entry 恒 undefined 短路，括号内变异不可达',
    },
    {
      op: 'and_to_or',
      linePrefix: "return entry === undefined || (entry.pattern !== '*' && entry.pattern !== v.patt",
      reason: '同上：entry undefined 短路使括号内组合变异在可构造输入下不可观测',
    },
  ],
  'src/statistics/bootstrap_ci.ts': [
    {
      op: 'lt_to_lte',
      linePrefix: 'if (a < b) {',
      reason: 'compareAscending 在相等元素上返回 -1 或 0 只影响稳定排序内部顺序，数值数组输出不可区分（ks_test 同型先例）',
    },
    {
      op: 'gt_to_gte',
      linePrefix: 'if (a > b) {',
      reason: '同上：相等分支交换不可观测',
    },
  ],
  'src/statistics/calibration.ts': [
    {
      op: 'lt_to_lte',
      linePrefix: 'for (let i = 0; i < predictions.length; i += 1) {',
      reason: 'ece 分桶循环（L81·与 brierScore L53 同文本）：i===length 的多余迭代读 predictions[length]===undefined，binIndex=Math.floor(undefined*bins)=NaN——binPredSum[NaN] 与 binTrueCount[NaN] 的写入在 JS 数组上不落地（NaN 键非索引），桶计数不变，ECE 输出等价（brierScore 的同文本循环已由 0.25/0.6400… golden 杀灭）',
    },
    {
      op: 'or_to_and',
      linePrefix: 'if (predictions.length === 0 || bins < 1) {',
      reason: '空 predictions 落入计算路径后循环 0 次、加权求和为 0，与早退 return 0 同值——空输入 ECE 数学上也恰为 0，两路径输出等价',
    },
  ],
  'src/statistics/t_distribution.ts': [    {
      op: 'gte_to_gt',
      linePrefix: 'return t >= 0 ? 1 - 0.5 * ib : 0.5 * ib;',
      reason: 't=0 时 ib 参数 x=df/(df+0)=1 → incompleteBeta(1)=1，两分支均得 0.5；t≠0 时符号判定同——分支在边界点输出等价',
    },
    {
      op: 'gt_to_gte',
      linePrefix: 'if (t > STUDENT_T_QUANTILE_CLAMP) {',
      reason: 'clamp 只在 Newton 迭代中间量上评估（不可从输入精确命中 1e7）；t===CLAMP 时原版保留 t=CLAMP、变异重赋同值 CLAMP——两算子输出等价',
    },
    {
      op: 'lt_to_lte',
      linePrefix: '} else if (t < -STUDENT_T_QUANTILE_CLAMP) {',
      reason: '同上：t===-CLAMP 时 else-if 分支重赋同值 -CLAMP，边界点输出等价',
    },
    {
      op: 'or_to_and',
      linePrefix: 'if (x === 0 || x === 1) {',
      reason: 'x=0 时落入计算路径经 Math.log(0)=-Inf 得 bt=exp(-Inf)=0，0*cf/a=0 与原短路返回 x 同值；x=1 时 1-0*cf/b=1 同值——对数下溢使两路径输出一致',
    },
    {
      op: 'lt_to_lte',
      linePrefix: 'if (p < 0.5) {',
      reason: 'p===0.5 已被上方精确分支提前 return 0；剩余域 p≠0.5 上 < 与 <= 等价',
    },
    {
      op: 'gt_to_gte',
      linePrefix: 'if (!(pdf > 0) || !Number.isFinite(pdf)) {',
      reason: 't 密度在 clamp 域内恒为正有限值（极尾 ~1e-35 仍 >0），pdf>0 与 >=0 在可达输入下等价',
    },
    {
      op: 'or_to_and',
      linePrefix: 'if (!(pdf > 0) || !Number.isFinite(pdf)) {',
      reason: 'pdf 恒为正有限值：原 false||false 与变异 false&&false 均 false，NaN/Inf pdf 对有限 (t,df) 输入不可构造',
    },
    {
      op: 'lte_to_lt',
      linePrefix: 'for (let m = 1; m <= BETA_ITMAX; m++) {',
      reason: 'betaContinuedFraction 对合法 (a,b) 在 EPS 判据下远早于 200 次收敛 break；多一次迭代的 h 增量 < BETA_EPS 对双精度输出不可观测',
    },
    {
      op: 'lt_to_lte',
      linePrefix: 'for (let j = 0; j < 6; j++) {',
      reason: 'logGamma Lanczos 系数恰 6 项：j=6 时 cof[6]===undefined 被 c!==undefined 防御跳过，多余迭代为 no-op',
    },
    {
      op: 'lt_to_lte',
      linePrefix: 'if (x < (a + 1) / (a + b + 2)) {',
      reason: '对称分支选择在数学上连续（A&S 26.5.5 两分支在切换点收敛到同值，先例见 p_value.ts 同型登记），边界 x 输出两分支一致',
    },
    {
      op: 'lt_to_lte',
      linePrefix: 'if (Math.abs(d) < TINY) {',
      reason: 'TINY=1e-300 防御分支：|d| 恰等于 1e-300 对双精度迭代中间量不可构造；其余值域两算子同判',
    },
    {
      op: 'lt_to_lte',
      linePrefix: 'if (Math.abs(c) < TINY) {',
      reason: '同上：TINY 边界不可精确命中',
    },
    {
      op: 'lt_to_lte',
      linePrefix: 'if (Math.abs(del - 1) < BETA_EPS) {',
      reason: '收敛判据 |del-1| 恰等于 EPS 不可从外部输入构造（迭代中间量）；收敛后 break 与多一轮迭代的差异 < EPS 对输出不可观测',
    },
    {
      op: 'lt_to_lte',
      linePrefix: 'if (Math.abs(delta) < CENTRAL_TOLERANCE.T_NEWTON_CONVERGENCE && Math.abs(err) < ',
      reason: 'delta=err/pdf 且 t 密度 pdf<1 恒成立 → delta<tol ⟹ err=delta·pdf<tol，两条件冗余（err 先达阈时 delta 已达），边界在可达输入下不可区分',
    },
    {
      op: 'and_to_or',
      linePrefix: 'if (Math.abs(delta) < CENTRAL_TOLERANCE.T_NEWTON_CONVERGENCE && Math.abs(err) < ',
      reason: '同上：条件冗余性使 or 与 and 在可达输入下同时真/同时假（pdf<1 的冗余推导）',
    },
    {
      op: 'lt_to_lte',
      linePrefix: 'for (let i = 0; i < 100; i++) {',
      reason: 'Newton 二次收敛典型 <10 次达 1e-12 判据 break；100 为防发散安全网，正常输入远早退出，多一次已收敛迭代为 no-op',
    },
  ],
};

/** 位点是否命中等价变异登记（返回登记项或 null）。 */
function findEquivalentRegistration(srcFile, site) {
  const regs = EQUIVALENT_MUTATIONS[srcFile];
  if (regs === undefined) return null;
  return regs.find((r) => r.op === site.operator && site.line.startsWith(r.linePrefix)) ?? null;
}

const OPERATORS = [
  { name: 'eq_to_neq', re: /(===)/g, replace: '!==' },
  { name: 'neq_to_eq', re: /(!==)/g, replace: '===' },
  { name: 'gte_to_gt', re: /(>=)/g, replace: '>' },
  { name: 'lte_to_lt', re: /(<=)/g, replace: '<' },
  { name: 'gt_to_gte', re: /(?<![=!<])>(?!=)/g, replace: '>=' },
  { name: 'lt_to_lte', re: /(?<![=!>])<(?!=)/g, replace: '<=' },
  { name: 'and_to_or', re: /(&&)/g, replace: '||' },
  { name: 'or_to_and', re: /(\|\|)/g, replace: '&&' },
  { name: 'true_to_false', re: /(\btrue\b)/g, replace: 'false' },
  { name: 'false_to_true', re: /(\bfalse\b)/g, replace: 'true' },
];

/** 提取某算子的全部变异位点（偏移 + 上下文 40 字符）。 */
function collectMutationSites(source) {
  const sites = [];
  for (const op of OPERATORS) {
    op.re.lastIndex = 0;
    let m;
    while ((m = op.re.exec(source)) !== null) {
      // 跳过注释/字符串中的命中（粗略：前后 60 字符内无 // /* 引号包裹复杂——按行判断）。
      const lineStart = source.lastIndexOf('\n', m.index) + 1;
      const lineEnd = source.indexOf('\n', m.index);
      const line = source.slice(lineStart, lineEnd < 0 ? undefined : lineEnd);
      if (isInCommentOrString(line, m.index - lineStart)) {
        continue;
      }
      sites.push({
        operator: op.name,
        offset: m.index,
        line: line.trim().slice(0, 80),
        snippet: source.slice(Math.max(0, m.index - 30), m.index + 30),
      });
    }
  }
  return sites;
}

/** 判断位点在行内是否处于注释或字符串（保守启发式：按位点前字符计数）。 */
function isInCommentOrString(line, col) {
  const trimmed = line.trimStart();
  // JSDoc/块注释行（* 开头）整体视为注释——内部 ===/&& 等是文档性引用。
  if (trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('*/')) {
    return true;
  }
  let inString = null;
  for (let i = 0; i < col; i += 1) {
    const ch = line[i];
    if (ch === undefined) break;
    if (inString === null) {
      if (ch === '/' && line[i + 1] === '/') return true; // 行注释
      if (ch === "'" || ch === '"' || ch === '`') inString = ch;
    } else if (ch === inString && line[i - 1] !== '\\') {
      inString = null;
    }
  }
  return inString !== null;
}

function runTest(testFile) {
  const result = spawnSync(
    process.execPath,
    ['--test', '--test-timeout=60000', testFile],
    { cwd: repoRoot, encoding: 'utf8', timeout: 120_000 },
  );
  return result.status === 0;
}

function main() {
  const args = process.argv.slice(2);
  const srcFile = args[0];
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : 25;
  const verbose = args.includes('--verbose');
  // 测试文件：第一个非 flag 参数后的全部位置参数（compileFec 行为分散于多文件时一并纳入）。
  const testFiles = args.slice(1).filter((a) => a !== '--limit' && a !== '--verbose');
  const testFilesList = testFiles.filter((a) => !/^\d+$/.test(a));
  const effectiveLimit = limitIdx >= 0 ? limit : 25;
  if (srcFile === undefined || testFilesList.length === 0) {
    console.error(
      'usage: node scripts/mutation_gate.mjs <src-file> <test-file...> [--limit N] [--verbose]',
    );
    process.exit(2);
  }

  const srcPath = join(repoRoot, srcFile);
  const original = readFileSync(srcPath, 'utf8');
  const sites = collectMutationSites(original);
  if (sites.length === 0) {
    console.error('mutation_gate: no mutation sites found');
    process.exit(2);
  }

  // 基线：原始文件下全部目标测试必须绿（否则 mutation 统计无意义）。
  for (const tf of testFilesList) {
    if (!runTest(tf)) {
      console.error(`mutation_gate: baseline test FAIL on unmutated source — fix first (${tf})`);
      process.exit(1);
    }
  }
  console.log(
    `mutation_gate: baseline OK (${sites.length} sites found, running up to ${effectiveLimit}; tests: ${testFilesList.join(', ')})`,
  );

  // 等价登记的位点跳过执行（省时）但单独披露。
  const selected = sites.slice(0, effectiveLimit);
  let killed = 0;
  let survived = 0;
  let equivalent = 0;
  const survivedList = [];

  try {
    for (const site of selected) {
      const eqReg = findEquivalentRegistration(srcFile, site);
      if (eqReg !== null) {
        equivalent += 1;
        console.log(`  equiv    ${site.operator}: ${site.line}`);
        console.log(`           ↳ 登记论证: ${eqReg.reason}`);
        continue;
      }
      const mutated = applyMutation(original, site);
      writeFileSync(srcPath, mutated, 'utf8');
      // 变异在**任一**目标测试下失败 = killed（全部通过 = survived）。
      // try/finally 确保任何异常路径下源文件恢复（变异源泄漏进工作树是本工具最危险故障）。
      let allPassed;
      try {
        allPassed = testFilesList.every((tf) => runTest(tf));
      } finally {
        writeFileSync(srcPath, original, 'utf8');
      }

      if (allPassed) {
        survived += 1;
        survivedList.push(site);
        if (verbose) {
          console.log(`  SURVIVED ${site.operator}: ${site.line}`);
        }
      } else {
        killed += 1;
        if (verbose) {
          console.log(`  killed   ${site.operator}: ${site.line}`);
        }
      }
    }
  } catch (err) {
    // 极端路径（如 writeFileSync 失败）也要尽力恢复源文件再退出。
    try {
      writeFileSync(srcPath, original, 'utf8');
    } catch {
      // 恢复失败只能如实退出
    }
    throw err;
  }

  const total = killed + survived;
  const rate = total === 0 ? 0 : survived / total;
  console.log('─'.repeat(60));
  console.log(
    `mutation_gate: killed=${killed} survived=${survived} equivalent=${equivalent} (${killed + survived} executed + ${equivalent} registered-equivalent)`,
  );
  console.log(`mutation_gate: survival rate = ${(rate * 100).toFixed(1)}% (target <10%)`);
  if (survivedList.length > 0) {
    console.log('survived mutations (test gaps):');
    for (const s of survivedList) {
      console.log(`  [${s.operator}] line: ${s.line}`);
    }
  }
  const pass = rate < 0.1;
  console.log(pass ? 'mutation_gate: PASS (test strength adequate)' : 'mutation_gate: FAIL (survival >=10% — strengthen tests)');
  process.exit(pass ? 0 : 1);
}

/** 在指定位点应用算子（只变异该位点·其余原样）。 */
function applyMutation(source, site) {
  const before = source.slice(0, site.offset);
  const rest = source.slice(site.offset);
  const op = OPERATORS.find((o) => o.name === site.operator);
  if (op === undefined) {
    throw new Error(`mutation_gate: unknown operator ${site.operator}`);
  }
  op.re.lastIndex = 0;
  const m = op.re.exec(rest);
  if (m === null) {
    throw new Error(`mutation_gate: site lost at offset ${site.offset}`);
  }
  return before + rest.slice(0, m.index) + op.replace + rest.slice(m.index + m[0].length);
}

if (import.meta.main) {
  main();
}
