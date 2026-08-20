// src/research/domain_gates.ts
// 领域门禁注册表 —— 把「run 是否落入某科学领域的适配器管辖」泛化为可注册判定。
//
// 模式来源：exoplanet 适配器的适用性判定（2026-08-14 缺陷修复：糖尿病 run 曾被
// 嫁接 exoplanet 相关性分析——单一宽松词命中不足，须 ≥2 个不同词项或领域提示）。
// 泛化后：新领域 = 在 DOMAIN_GATES 注册一行（领域名 + 词项 + 提示 + 最小命中数），
// 适配器路由与门禁语义不变；判定保持确定性（无 LLM 参与）。
//
// 诚实边界：本注册表证明「领域判定是确定性规则」；不证明分析适配器本身正确——
// 那是各领域 adapter + 测试的职责。

/** 一个科学领域的适用性门禁。 */
export interface DomainGate {
  /** 领域名（adapter 路由键）。 */
  readonly domain: string;
  /** 适用性词项（小写；run 文本命中 ≥minTermHits 个不同词项 → 适用）。 */
  readonly terms: readonly string[];
  /** 领域提示词（gateReport.scope.domain 包含任一提示 → 直接适用）。 */
  readonly hints: readonly string[];
  /** 所需不同词项命中数（exoplanet=2：单一宽松命中不足，防跨领域嫁接）。 */
  readonly minTermHits: number;
}

/** 领域门禁注册表（当前 2 个领域；新领域在此追加一行 + 对应分析适配器）。 */
export const DOMAIN_GATES: readonly DomainGate[] = [
  {
    domain: 'exoplanet',
    terms: [
      'exoplanet',
      'transit',
      'hot jupiter',
      'planetary radius',
      'planet radius',
      'insolation',
      'light curve',
      'orbital period',
      'starspot',
      'photometric',
      'radial velocity',
      'planetary system',
    ],
    hints: ['astro', 'exoplanet', 'astronom', 'planetary science', 'stellar'],
    minTermHits: 2,
  },
  {
    domain: 'climate',
    terms: [
      'global warming',
      'climate change',
      'surface temperature',
      'temperature anomaly',
      'greenhouse',
      'gistemp',
      'giss',
      'global mean temperature',
      'climate trend',
    ],
    hints: ['climate', 'climatolog', 'atmospheric science', 'earth science'],
    minTermHits: 2,
  },
];

/**
 * run 的科学文本（question + hypotheses + plan）是否落入某领域门禁。
 * 返回第一个命中的领域名；无命中返回 null（→ 走领域通用文献景观分析）。
 */
export function matchingDomain(
  scopeDomain: string | null | undefined,
  text: string,
): string | null {
  const lower = text.toLowerCase();
  for (const gate of DOMAIN_GATES) {
    if (scopeDomain !== null && scopeDomain !== undefined) {
      const domain = scopeDomain.toLowerCase();
      if (gate.hints.some((h) => domain.includes(h))) return gate.domain;
    }
    const hits = new Set(gate.terms.filter((term) => lower.includes(term)));
    if (hits.size >= gate.minTermHits) return gate.domain;
  }
  return null;
}
