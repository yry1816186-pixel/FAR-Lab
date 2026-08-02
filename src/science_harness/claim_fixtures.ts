/**
 * V1 claim fixture roadmap（诚实清单 · spec 22 T-W2-06 三 claimType · evo-03）。
 *
 * 三 claimType 全交付（任务 #12 · 22 T-W2-06 + 21 §8）：
 *   - C-ASTRO-0001 existence（tess_harness.ts）。
 *   - hero-A-001 quantitative（hero_a_harness.ts·MMLU-physics·设计 INCONCLUSIVE via mixed）。
 *   - hero-B-002 causal（hero_b_harness.ts·CoT 幻觉率·经 confounding_integration F6 降级 DEGRADED_SCOPE）。
 *
 * 诚实边界（DO_NOT_CLAIM hazard · 33 FP3-ENG-GPU-005 honesty_risk）:
 *   本清单 = 机器可验证的诚实声明：测试断言 V1 三 claimType 全交付（3 delivered），
 *   防止「声称 N 交付 M<N」的过度声称，亦防「偷渡第 4 claimType」。
 *   fixture v1Status 随实现落地翻转（not_implemented → delivered·reason → null）。
 *
 *   注：claimType 措辞 'quantitative' 来自 22 T-W2-06·是 ConfoundingGate 粗粒度三值分类轴
 *   （existence/quantitative/causal·为混淆分析设计），与 08 SciIR 细粒度 9 值科学分类枚举
 *   （causal/correlational/mechanistic/predictive/existence/optimization/methodological/
 *    measurement/reproducibility）是**不同轴·非冲突**——'quantitative' 映射 SciIR 的
 *   {measurement, correlational, predictive, optimization}。详见 src/confounding_gate/types.ts:22-29
 *   （同名 claimType 为历史命名·ConfoundingGate 专用粗粒度子集·'causal' 触发 F6）。
 *
 * 模型中立。零容忍合规：无 any / @ts-ignore / 空 catch / 双重断言。
 */

/** 单个 claim fixture roadmap 条目。 */
export interface ClaimFixtureRoadmapEntry {
  /** fixture id（22 T-W2-06）。 */
  readonly fixtureId: string;
  /** claimType 措辞（22 T-W2-06；见模块头 08↔22 TODO）。 */
  readonly claimType: string;
  /** 科学域。 */
  readonly domain: string;
  /** V1 交付状态。 */
  readonly v1Status: 'delivered' | 'not_implemented';
  /** 未实现原因（v1Status='not_implemented' 时非 null）。 */
  readonly reason: string | null;
}

/**
 * V1 claim fixture roadmap（22 T-W2-06 三 claimType）。
 * SSOT：V1 交付清单 + 未实现 fixture 的诚实标注。
 */
export const V1_CLAIM_FIXTURE_ROADMAP: readonly ClaimFixtureRoadmapEntry[] = [
  {
    fixtureId: 'C-ASTRO-0001',
    claimType: 'existence',
    domain: 'astronomy (TESS)',
    v1Status: 'delivered',
    reason: null,
  },
  {
    fixtureId: 'hero-A-001',
    claimType: 'quantitative',
    domain: 'ml (MMLU-physics)',
    v1Status: 'delivered',
    reason: null,
  },
  {
    fixtureId: 'hero-B-002',
    claimType: 'causal',
    domain: 'llm (CoT hallucination)',
    v1Status: 'delivered',
    reason: null,
  },
];

/**
 * V1 实际交付的 claim fixture 数（断言用）。
 * 当前 = 3（C-ASTRO-0001 existence + hero-A-001 quantitative + hero-B-002 causal·任务 #12 三覆盖）。
 */
export function countDeliveredV1ClaimFixtures(): number {
  return V1_CLAIM_FIXTURE_ROADMAP.filter((e) => e.v1Status === 'delivered').length;
}
