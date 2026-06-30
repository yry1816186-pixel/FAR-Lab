/**
 * V1 claim fixture roadmap（诚实清单 · spec 22 T-W2-06 三 claimType · evo-03）。
 *
 * 诚实边界（DO_NOT_CLAIM hazard · 33 FP3-ENG-GPU-005 honesty_risk）:
 *   spec 22 T-W2-06 round11 扩展为「三 claimType 覆盖」（existence/quantitative/causal），
 *   「用户裁决 V1 三 claim 都跑」。但 V1 实际交付仅 C-ASTRO-0001 existence（tess_harness）：
 *     - hero-A-001（quantitative·MMLU-physics）：需 ML 域 harness（非 TESS），V1 未实现。
 *     - hero-B-002（causal·CoT 幻觉率）：依赖 T-W2-07 L7-L3 ConfoundingGate（F6 门控），V1 未实现。
 *   21 §8 V1 优先级裁剪：保「C-ASTRO-0001 一条可信链跑通」，多域/因果扩展属 V2+。
 *
 *   本清单 = 机器可验证的诚实声明：测试断言 V1 只交付 existence，
 *   防止「声称 3 claimType 交付 1」的过度声称。新增 fixture 实现时更新本清单 status。
 *
 *   注：claimType 措辞 'quantitative' 来自 22 T-W2-06；08 SciIR claimType 9 值枚举
 *   （causal/correlational/mechanistic/predictive/existence/optimization/methodological/
 *    measurement/reproducibility）未含 'quantitative'（22↔08 待统一·记 TODO·不在本任务 scope）。
 *
 * Authority: 22 T-W2-06（line 130-138）+ 21 §8 V1 裁剪 + 33 FP3-ENG-GPU-005。
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
    v1Status: 'not_implemented',
    reason: 'V1 未实现 ML 域 harness（22 T-W2-06·非 TESS·21 §8 V1 裁剪保单链）',
  },
  {
    fixtureId: 'hero-B-002',
    claimType: 'causal',
    domain: 'llm (CoT hallucination)',
    v1Status: 'not_implemented',
    reason: 'V1 依赖 T-W2-07 L7-L3 ConfoundingGate（F6 门控）未实现（22 T-W2-06/07·21 §8）',
  },
];

/**
 * V1 实际交付的 claim fixture 数（断言用）。
 * 当前 = 1（仅 C-ASTRO-0001 existence）。新增 fixture 实现时此值递增。
 */
export function countDeliveredV1ClaimFixtures(): number {
  return V1_CLAIM_FIXTURE_ROADMAP.filter((e) => e.v1Status === 'delivered').length;
}
