// src/cli/commands/demo.ts
// far demo —— 一键展示 FAR-Lab 核心能力。
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
import { probeEnvironment, retryGoldenOnce } from './demo_probe.ts';
import { runVerifyGolden } from './verify_golden.ts';

// English prose is roughly twice as wide as the CJK it replaces, so the box banner is
// padded programmatically to keep the right border aligned instead of hardcoding spaces.
const BANNER_WIDTH = 80;
const bannerLine = (text: string): string => `║  ${text.padEnd(BANNER_WIDTH - 2)}║`;

const BANNER = `
╔${'═'.repeat(BANNER_WIDTH)}╗
${bannerLine('FAR-Lab · Falsification-Anchored Research Chain — one-click demo')}
${bannerLine('Claim-level AI4S verification (R0-R9 kernel · tamper-evident · anti-theater)')}
╚${'═'.repeat(BANNER_WIDTH)}╝
`;

const PHASE1 = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ① Deterministic verdict kernel — 14 Golden Vectors via the real R0-R9 rule tree
     (no LLM in the loop; five values: CONFIRMED/REFUTED/INCONCLUSIVE/DEGRADED_SCOPE/UNTESTED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

const PHASE2 = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ② End-to-end demo claim — FEC orchestration → kernel verdict → fail-closed sealing
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

function renderDemoClaim(c: DemoChainResult): string {
  const k = c.kernelOutput;
  return `
  claim               : ${c.claimId} — ${c.claimText}
  FEC gate            : allowed=${c.fecGate.allowed} (${c.fecGate.reason})
  Machine verdict     : ${c.machineVerdict}
  Decisive rule       : ${k.decisiveRuleId}
  reasonCodes         : ${k.reasonCodes.join(', ')}
  Statistical signal  : effectSize=${k.statisticalReport.primaryEffectSize} · p=${k.statisticalReport.primaryAdjustedPValue}
  Evidence sufficiency: ${k.evidenceSufficiency.status} (power=${k.evidenceSufficiency.powerStatus})
  Sealed conclusion   : ${c.sealed.envelope.conclusion}
`;
}

function renderHeroClaim(h: HeroAPipelineResult): string {
  const k = h.kernelOutput;
  const s = h.statistics.statisticalResult;
  return `
  claim               : ${h.claimId} — ${h.claimText}
  Real statistics     : oneSampleZTest → p=${s.pValue?.toExponential(3)} · adjustedP=${s.adjustedPValue?.toExponential(3)} · effectSize=${s.effectSizeObserved} · ${s.effectDirection}
  FEC gate            : allowed=${h.fecGate.allowed} (${h.fecGate.reason})
  Machine verdict     : ${h.machineVerdict}
  Decisive rule       : ${k.decisiveRuleId}
  reasonCodes         : ${k.reasonCodes.join(', ')}
  Sealed conclusion   : ${h.sealedConclusion}   ← CONFIRMED downgraded via ASK-9 (machine sealing cannot be CONFIRMED · requires human endorsement)
`;
}

const PHASE3 = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ③ Real-statistics-driven verdict (C-MMLU-A-0001) — src/statistics · oneSampleZTest → R7 → fail-closed sealing
     (p / effectSize / CI are computed live by src/statistics · not hardcoded; contrast with ②'s UNTESTED: once statistics are injected the kernel can reach CONFIRMED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

const NEXT_STEPS = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Next steps
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  · Full-stack web dashboard: pnpm api  +  cd frontend && npm run dev
  · Export an independently recomputable proof bundle: far export far-proof --demo-chain              (default output ./.far-proof/, override with --out <dir>)
  · Third-party recompute verification: far verify --bundle .far-proof                                (independently recomputes the bundle exported above)
  · Run the Science-125 benchmark: far bench run
`;
const TESS_OFFLINE_NOTE = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  tess-offline mode: focuses on the TESS (C-ASTRO-0001 pulsar) offline verdict demo.
  Honesty boundary: this sub-mode yields UNTESTED (NO_DECISION_PATH) by design —
  the demo seed injects no statistics, so rule R6 cannot fire. It demonstrates
  FEC orchestration + fail-closed sealing, NOT a scientific verdict.
  Full demo (incl. MMLU hero pipeline · real-statistics-driven CONFIRMED): far demo

  Verify the persisted fixture (two-step; T-002 fix · no death loop):
    1. far export far-proof --demo-chain --out ./tess-offline.far-proof
    2. far verify --bundle ./tess-offline.far-proof     (exit 0 = clean · exit 7 = tampered/missing)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

/**
 * Runs the far demo command: one-shot 6-stage FSM demo with offline replay.
 *
 * @param subcommand - Optional demo subcommand (e.g. tess-offline).
 * @returns Exit code: 0 on success, 1 on failure, 2 on unknown subcommand.
 */
export function runDemo(subcommand: string | undefined = undefined): number {
  if (subcommand !== undefined && subcommand !== 'tess-offline') {
    process.stderr.write(`far demo: unknown subcommand '${subcommand}' (supported: 'tess-offline', or run the full demo with no argument)\n`);
    return 2;
  }
  const tessOnly = subcommand === 'tess-offline';

  // P0-3（S1-69.2 修复）：启动前置环境探测——Node <24 / better-sqlite3 native
  // 不可用时立即 fail-fast（≤5s 退出非 0 + 可读错误 + Docker 后备指引），杜绝用户面前
  // 无限挂起（同步阻塞无法被 timer 中断·探测是唯一可靠防线）。
  const probe = probeEnvironment();
  if (!probe.ok) {
    process.stderr.write(`${probe.error}\n`);
    return 1;
  }

  process.stdout.write(BANNER);

  process.stdout.write(PHASE1);
  // P0-3（S1-69.3 修复）：GV 失败有界重试 1 次（瞬时波动容错·持续失败仍 exit 7 不掩盖）。
  const gvExit = retryGoldenOnce(() => runVerifyGolden({ backend: 'node' }));
  if (gvExit !== 0) {
    process.stderr.write(`\nfar demo: golden vector stage failed (exit ${gvExit})\n`);
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
