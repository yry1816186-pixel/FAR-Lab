// src/cli/commands/demo.ts
// far demo —— 一键展示 FAR-Chain 核心能力。
//
// 评审 / 新用户一条命令看到系统运转（全程 offline，无需凭据）：
//   1. 确定性裁决内核 —— 14 Golden Vectors 经真实 R0-R9 kernel
//   2. 端到端 demo claim（C-ASTRO-0001）—— FEC 编排 → kernel 裁决 → fail-closed 密封
//   3. 指引下一步（far api 全栈 / far export / far verify）
//
// 诚实边界：demo verdict 由 offline fixture 产出（非真实科学裁决）；本命令展示的是
// 「证据链工程完整性 + 确定性裁决内核 + 防篡改密封」，绝非「证明科学结论为真」。

import Database from 'better-sqlite3';
import { buildDemoChain, type DemoChainResult } from '../../far_proof/demo_chain.ts';
import { buildHeroAChain, type HeroAPipelineResult } from '../../science_harness/hero_a_pipeline.ts';
import { runVerifyGolden } from './verify_golden.ts';

const BANNER = `
╔══════════════════════════════════════════════════════════════════════╗
║  FAR-Chain · Falsification-Anchored Research Chain — 一键演示        ║
║  AI4S 科学声明的声明级验证层（确定性 R0-R9 内核·篡改可检测·反剧场）  ║
╚══════════════════════════════════════════════════════════════════════╝
`;

const PHASE1 = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ① 确定性裁决内核 —— 14 Golden Vectors 经真实 R0-R9 规则树
     （无 LLM 介入；CONFIRMED/REFUTED/INCONCLUSIVE/DEGRADED_SCOPE/UNTESTED 五值）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

const PHASE2 = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ② 端到端 demo claim —— FEC 编排 → 内核裁决 → fail-closed 密封
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

function renderDemoClaim(c: DemoChainResult): string {
  const k = c.kernelOutput;
  return `
  claim       : ${c.claimId} — ${c.claimText}
  FEC gate    : allowed=${c.fecGate.allowed}（${c.fecGate.reason}）
  机器裁决     : ${c.machineVerdict}
  决定性规则   : ${k.decisiveRuleId}
  reasonCodes : ${k.reasonCodes.join(', ')}
  统计信号     : effectSize=${k.statisticalReport.primaryEffectSize} · p=${k.statisticalReport.primaryAdjustedPValue}
  证据充分性   : ${k.evidenceSufficiency.status}（power=${k.evidenceSufficiency.powerStatus}）
  密封结论     : ${c.sealed.envelope.conclusion}
`;
}

function renderHeroClaim(h: HeroAPipelineResult): string {
  const k = h.kernelOutput;
  const s = h.statistics.statisticalResult;
  return `
  claim       : ${h.claimId} — ${h.claimText}
  真实统计     : oneSampleZTest → p=${s.pValue?.toExponential(3)} · adjustedP=${s.adjustedPValue?.toExponential(3)} · effectSize=${s.effectSizeObserved} · ${s.effectDirection}
  FEC gate    : allowed=${h.fecGate.allowed}（${h.fecGate.reason}）
  机器裁决     : ${h.machineVerdict}
  决定性规则   : ${k.decisiveRuleId}
  reasonCodes : ${k.reasonCodes.join(', ')}
  密封结论     : ${h.sealedConclusion}   ← CONFIRMED 经 ASK-9 降级（机器密封不得 CONFIRMED·需人类背书）
`;
}

const PHASE3 = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ③ 真实统计驱动裁决（C-MMLU-A-0001）—— src/statistics·oneSampleZTest → R7 → fail-closed 密封
     （p/effectSize/CI 由 src/statistics 实时算出·非硬编码；与 ② 的 UNTESTED 对比：注入统计后内核能达 CONFIRMED）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

const NEXT_STEPS = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  下一步
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  · 全栈 Web 仪表盘：pnpm api  +  cd frontend && npm run dev
  · 导出可独立复算证明包：far export far-proof --demo-chain              （默认输出到 ./.far-proof/，可加 --out <dir> 覆盖）
  · 第三方重算验证：far verify --bundle .far-proof                       （对上一条导出的目录独立重算）
  · 跑 Science-125 基准：far bench run
  · 深度接线门：node scripts/depth_gate.mjs
`;
const TESS_OFFLINE_NOTE = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  tess-offline 模式：聚焦 TESS（C-ASTRO-0001 脉冲星）offline 裁决演示。
  完整 demo（含 MMLU hero pipeline · 真实统计驱动 CONFIRMED）：far demo
  验证持久化 fixture：far verify examples/tess-offline/output/demo.far-proof
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

export function runDemo(subcommand: string | undefined = undefined): number {
  if (subcommand !== undefined && subcommand !== 'tess-offline') {
    process.stderr.write(`far demo: 未知子命令 '${subcommand}'（当前支持 'tess-offline'，或不带参数跑完整演示）\n`);
    return 2;
  }
  const tessOnly = subcommand === 'tess-offline';
  process.stdout.write(BANNER);

  process.stdout.write(PHASE1);
  const gvExit = runVerifyGolden({ backend: 'node' });
  if (gvExit !== 0) {
    process.stderr.write(`\nfar demo: golden vector 阶段失败 (exit ${gvExit})\n`);
    return gvExit;
  }

  process.stdout.write(PHASE2);
  const db = new Database(':memory:');
  try {
    const chain = buildDemoChain(db);
    process.stdout.write(renderDemoClaim(chain));
  } finally {
    db.close();
  }

  if (tessOnly) {
    process.stdout.write(TESS_OFFLINE_NOTE);
  } else {
    process.stdout.write(PHASE3);
    const heroDb = new Database(':memory:');
    try {
      const hero = buildHeroAChain(heroDb);
        process.stdout.write(renderHeroClaim(hero));
    } finally {
      heroDb.close();
    }
  }

  process.stdout.write(NEXT_STEPS);
  return 0;
}
