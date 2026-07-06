/**
 * anti_theater constraint —— 取严后的 verdict 约束（APPENDIX_E §3.2 + 03 §6.1）。
 *
 *            §6.1（优先级原则·REFUTED 不被洗白 + UNTESTED 优先 INCONCLUSIVE）+ §8.2（只降级）。
 *
 * ┌─ 支持度降级模型（D17·本实现核心）─────────────────────────────────────────────┐
 * │ 支持度 = claim 友好度（高=支持 claim / 低=否定 claim）：                       │
 * │   CONFIRMED(4) > DEGRADED_SCOPE(3) > INCONCLUSIVE(2) > UNTESTED(1) > REFUTED(0) │
 * │ 规则：                                                                        │
 * │   1. anti-theater **只降级**：forced 支持度 < current 支持度时才约束。          │
 * │      → 防"升级"（UNTESTED→DEGRADED_SCOPE 是支持度上升，不约束）。              │
 * │      → 防"洗白"（current=REFUTED 时任何 forced 支持度≥0，不约束）。            │
 * │   2. 多 forced 取支持度最低者（最否定 claim = 对 theater 最严）。              │
 * │   3. blockSeal → forced 至少 UNTESTED（支持度≤1）。                            │
 * └──────────────────────────────────────────────────────────────────────────────┘
 *
 * 裁决 D17（§3.2 priorities vs §6.1 原则）：§3.2 伪代码 priorities（DEGRADED_SCOPE=3>UNTESTED=2>
 *   INCONCLUSIVE=1）用于 attackId→forced **映射依据**（哪个 attack 产哪个 forced，本实现沿用不变）；
 *   但"多 forced 取严 + 与 current 比较"用支持度模型。理由：§3.2 priorities 把 DEGRADED_SCOPE 排在
 *   UNTESTED 之上会导致"UNTESTED→DEGRADED_SCOPE 升级"的反语义；支持度模型符合 §6.1 原则 1
 *   （UNTESTED 优先 INCONCLUSIVE = UNTESTED 更否定）+ 原则 2（REFUTED 不被洗白）+ §8.2（只降级）。
 *   多 forced 取严顺序在 P0 golden vectors（单攻击·forced 唯一）不被直接验证。
 *
 * 裁决 D16（REFUTED forced·揭示隐藏反证）：§8.2 称 anti-theater 不"主动产"REFUTED，但
 *   REFUTATION_HIDDEN_BY_SCOPE finding（AT-FAKE-DEGRADED / AT-SCOPE-LAUNDER 产）揭示的是已被
 *   scopeReport.hasSameScopeRefutation 证明的同 scope 反证（被 DEGRADED_SCOPE 掩盖），执行 §6.1 原则 2
 *   "REFUTED 不得被隐藏"。此 reasonCode → forced REFUTED，是"揭示"而非"主动产"，故 forcedVerdict
 *   类型含 REFUTED（唯一 REFUTED forced 来源·跨两个 detector 故用 reasonCode 而非 attackId 映射）。
 *
 * 模型中立（F3/C1）。零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。纯函数（不 mutate 输入）。
 */

import type { Verdict } from '../schema/enums.ts';
import type { AntiTheaterVerdictConstraint, DetectorFinding } from './types.ts';

/** anti-theater 可强制的 verdict（含 REFUTED·D16 揭示隐藏反证）。ForcedVerdict ⊆ Verdict。 */
type ForcedVerdict = 'REFUTED' | 'DEGRADED_SCOPE' | 'UNTESTED' | 'INCONCLUSIVE';

/**
 * 支持度（claim 友好度·高=支持 / 低=否定·D17）。anti-theater 只降级（支持度递减）。
 * 依据 03 §6.1 原则 1（UNTESTED 支持度 1 < INCONCLUSIVE 2·UNTESTED 更否定）+ 原则 2（REFUTED 支持度
 * 最低 0·不被洗白）+ R0-R9 决策树（UNTESTED R0-R3 先判=最严）。
 */
const SUPPORT_RANK: Readonly<Record<Verdict, number>> = {
  CONFIRMED: 4,
  DEGRADED_SCOPE: 3,
  INCONCLUSIVE: 2,
  UNTESTED: 1,
  REFUTED: 0,
};

/**
 * reasonCode → forced 映射（优先于 attackId·D16 揭示隐藏反证）。
 * REFUTATION_HIDDEN_BY_SCOPE 是唯一可 force REFUTED 的 reasonCode（跨 AT-FAKE-DEGRADED / AT-SCOPE-LAUNDER）。
 */
const REASON_CODE_TO_FORCED: Readonly<Record<string, ForcedVerdict | undefined>> = {
  REFUTATION_HIDDEN_BY_SCOPE: 'REFUTED',
};

/**
 * attackId → forcedVerdict 映射（§3.2 SEVERITY_TO_FORCED·20 项·逐字对齐伪代码 958-979）。
 * undefined = 该 attack 不直接约束 verdict：
 *   - BLOCK 类（AT-FAKE-PASS/JUDGE-OVERRIDE/DATA-HASH-FAKE/WORKFLOW-DIGEST/DEP-FLOAT-DRIFT）由 blockSeal 处理；
 *   - AT-FAKE-DEGRADED 由 reasonCode 映射（REFUTATION_HIDDEN_BY_SCOPE→REFUTED / NULL_RESULT_LAUNDERED 不 force）；
 *   - AT-REPORT-MISMATCH structured wins（report 回退，不降级 verdict）。
 */
const SEVERITY_TO_FORCED: Readonly<Record<string, ForcedVerdict | undefined>> = {
  'AT-DATA-DRIFT': 'DEGRADED_SCOPE', // 数据漂移 → 范围收窄
  'AT-SCOPE-LAUNDER': 'DEGRADED_SCOPE',
  'AT-OVERFIT': 'DEGRADED_SCOPE',
  'AT-FAKE-PASS': undefined, // BLOCK，由 blockSeal 处理
  'AT-LABEL-ONLY': 'UNTESTED',
  'AT-MISSING-RAW': 'UNTESTED',
  'AT-POSTHOC-THRESHOLD': 'UNTESTED',
  'AT-METRIC-SWAP': 'UNTESTED',
  'AT-HARK': 'UNTESTED',
  'AT-STOPPING-RULE': 'UNTESTED',
  'AT-PHACK-ALPHA': 'UNTESTED',
  'AT-FAKE-DEGRADED': undefined, // 由 reasonCode 映射（REFUTATION_HIDDEN_BY_SCOPE→REFUTED）
  'AT-SEED-CHERRY': 'INCONCLUSIVE',
  'AT-PHACK-CORRECTION': 'INCONCLUSIVE',
  'AT-OPTIONAL-STOPPING': 'INCONCLUSIVE',
  'AT-JUDGE-OVERRIDE': undefined, // BLOCK（CI 阻断）
  'AT-DATA-HASH-FAKE': undefined, // BLOCK
  'AT-WORKFLOW-DIGEST': undefined, // BLOCK
  'AT-DEP-FLOAT-DRIFT': undefined, // BLOCK（部分子项 WARN）
  'AT-REPORT-MISMATCH': undefined, // 不降级（structured wins，report 回退）
};

/**
 * 取严后的 verdict 约束（§3.2 apply_verdict_constraint·支持度降级模型 D17 + D16 REFUTED 揭示）。
 *
 * @param findings detector 聚合产出（用 ext.reasonCode / ext.attackId 判 forced / ext.severity 判 BLOCK）。
 * @param currentVerdict 先于 anti-theater 的初步 verdict（降级基准·kernel 产出）。
 * @returns AntiTheaterVerdictConstraint（forcedVerdict 可选 / blockSeal / reasonCodes 去重并集）。
 */
export function applyVerdictConstraint(
  findings: readonly DetectorFinding[],
  currentVerdict: Verdict,
): AntiTheaterVerdictConstraint {
  // 1. 取支持度最低（最严）的 forced。reasonCode 映射优先于 attackId（D16·REFUTATION_HIDDEN_BY_SCOPE→REFUTED）。
  let forced: ForcedVerdict | undefined = undefined;
  for (const f of findings) {
    const fromReason =
      f.ext.reasonCode !== undefined ? REASON_CODE_TO_FORCED[f.ext.reasonCode] : undefined;
    const candidate = fromReason ?? SEVERITY_TO_FORCED[f.ext.attackId];
    if (
      candidate !== undefined &&
      (forced === undefined || SUPPORT_RANK[candidate] < SUPPORT_RANK[forced])
    ) {
      forced = candidate;
    }
  }

  // 2. 任一 BLOCK finding → blockSeal=true → forced 至少 UNTESTED（支持度≤1·若未取到更否定）。
  const blockSeal = findings.some((f) => f.ext.severity === 'BLOCK');
  if (blockSeal && (forced === undefined || SUPPORT_RANK[forced] > SUPPORT_RANK.UNTESTED)) {
    forced = 'UNTESTED';
  }

  // 3. 只降级（D17）：forced 支持度 >= current 支持度 → 不约束。
  //    防"升级"（UNTESTED→DEGRADED_SCOPE 等支持度上升）+ 防"洗白"（current=REFUTED 时 forced 支持度≥0 恒不约束）。
  let final: ForcedVerdict | undefined = forced;
  if (forced !== undefined && SUPPORT_RANK[forced] >= SUPPORT_RANK[currentVerdict]) {
    final = undefined;
  }

  // 4. reasonCodes 去重并集（保持首次出现顺序·确定性）。
  const reasonCodes: string[] = [];
  const seen = new Set<string>();
  for (const f of findings) {
    const code = f.ext.reasonCode;
    if (code !== undefined && !seen.has(code)) {
      seen.add(code);
      reasonCodes.push(code);
    }
  }

  return {
    ...(final !== undefined ? { forcedVerdict: final } : {}),
    blockSeal,
    reasonCodes,
  };
}
