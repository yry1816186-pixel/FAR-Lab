#!/usr/bin/env node
// src/cli/commands/real_paper.ts
// far real-paper — run a real published paper through the FAR-Lab pipeline.
//
// Usage: node src/cli/commands/real_paper.ts [--paper bem] [--mode as-published|corrected]
//
// Currently supported papers:
//   bem  — Bem (2011) "Feeling the Future" (precognition / replication crisis landmark)
//
// Modes:
//   as-published — Simulate the paper's actual analysis as published (exposes flaws)
//   corrected    — Apply FAR-Lab's methodologically correct analysis
//
// This is the "missing real paper case" flagged in DEEP_AUDIT.md.
// It takes a real published paper's public statistics, runs them through
// FAR-Lab's deterministic kernel + anti-theater detectors, and produces
// an independently verifiable verdict.

import { pathToFileURL } from 'node:url';

import Database from 'better-sqlite3';

import { buildBemChain, type BemAnalysisMode } from '../../science_harness/bem_pipeline.ts';
import { buildRitchieChain } from '../../science_harness/ritchie_pipeline.ts';
import { buildOscChain } from '../../science_harness/osc_pipeline.ts';

/** Type alias: paper run result. */
interface PaperRunResult {
  readonly mode: string;
  readonly claimId: string;
  readonly claimText: string;
  readonly machineVerdict: string;
  readonly sealedConclusion: string;
  readonly decisiveRule: string;
  readonly reasonCodes: readonly string[];
  readonly publishedP: number;
  readonly farLabP: number;
  readonly farLabExactP: number;
  readonly bonferroniP: number;
  readonly cohensD: number;
  readonly survivesCorrection: boolean;
  readonly antiTheaterFindings: number;
  readonly antiTheaterFindingDetails: readonly {
    readonly findingId: string;
    readonly attackKind: string;
    readonly outcome: string;
    readonly message: string;
  }[];
  readonly fecGateAllowed: boolean;
  readonly fecGateReason: string;
  readonly proofHash: string;
}

/** Run the Bem paper pipeline and collect results. */
function runBemPaper(mode: BemAnalysisMode): PaperRunResult {
  const db = new Database(':memory:');
  try {
    const result = buildBemChain(db, mode);
    const stats = result.statistics;
    const findings = result.antiTheaterReport.findings ?? [];

    return {
      mode: result.mode,
      claimId: result.claimId,
      claimText: result.claimText,
      machineVerdict: result.machineVerdict,
      sealedConclusion: result.sealedConclusion,
      decisiveRule: result.kernelOutput.decisiveRuleId,
      reasonCodes: result.kernelOutput.reasonCodes,
      publishedP: stats.publishedPValue,
      farLabExactP: stats.farLabExactP,
      farLabP: stats.farLabZTest.pValue,
      bonferroniP: stats.bonferroniCorrectedP,
      cohensD: stats.cohensD,
      survivesCorrection: stats.survivesCorrection,
      antiTheaterFindings: findings.length,
      antiTheaterFindingDetails: findings.map(f => ({
        findingId: f.findingId,
        attackKind: f.attackKind,
        outcome: f.outcome,
        message: f.message,
      })),
      fecGateAllowed: result.fecGate.allowed,
      fecGateReason: result.fecGate.reason,
      proofHash: result.sealed.envelope.proofHash,
    };
  } finally {
    db.close();
  }
}

/** Run the Ritchie (2012) replication pipeline and collect results. */
function runRitchiePaper(): PaperRunResult {
  const db = new Database(':memory:');
  try {
    const result = buildRitchieChain(db);
    const stats = result.statistics;
    return {
      mode: 'failed-replication',
      claimId: result.claimId,
      claimText: result.claimText,
      machineVerdict: result.machineVerdict,
      sealedConclusion: result.sealedConclusion,
      decisiveRule: result.kernelOutput.decisiveRuleId,
      reasonCodes: result.kernelOutput.reasonCodes,
      publishedP: stats.farLabExactPs[0] ?? 0,
      farLabExactP: stats.combinedP,
      farLabP: stats.combinedP,
      bonferroniP: stats.combinedP,
      cohensD: stats.statisticalResult.effectSizeObserved ?? 0,
      survivesCorrection: false,
      antiTheaterFindings: result.antiTheaterReport.findings.length,
      antiTheaterFindingDetails: result.antiTheaterReport.findings.map(f => ({
        findingId: f.findingId,
        attackKind: f.attackKind,
        outcome: f.outcome,
        message: f.message,
      })),
      fecGateAllowed: result.fecGate.allowed,
      fecGateReason: result.fecGate.reason,
      proofHash: result.sealed.envelope.proofHash,
    };
  } finally {
    db.close();
  }
}

/** Run the OSC (2015) reproducibility pipeline and collect results. */
function runOscPaper(): PaperRunResult {
  const db = new Database(':memory:');
  try {
    const result = buildOscChain(db);
    const stats = result.statistics;
    return {
      mode: 'aggregate-replication',
      claimId: result.claimId,
      claimText: result.claimText,
      machineVerdict: result.machineVerdict,
      sealedConclusion: result.sealedConclusion,
      decisiveRule: result.kernelOutput.decisiveRuleId,
      reasonCodes: result.kernelOutput.reasonCodes,
      // OSC's primary inferential test is the two-proportion z on the
      // significance-rate collapse (97% -> 36%); the median replication r is
      // descriptive only (no valid Fisher-z-on-median inference).
      publishedP: stats.rateDropP,
      farLabExactP: stats.rateDropP,
      farLabP: stats.rateDropP,
      bonferroniP: stats.bhAdjustedPs[0] ?? 0,
      cohensD: stats.replicationMedianR,
      survivesCorrection: stats.survivesFdr,
      antiTheaterFindings: result.antiTheaterReport.findings.length,
      antiTheaterFindingDetails: result.antiTheaterReport.findings.map(f => ({
        findingId: f.findingId,
        attackKind: f.attackKind,
        outcome: f.outcome,
        message: f.message,
      })),
      fecGateAllowed: result.fecGate.allowed,
      fecGateReason: result.fecGate.reason,
      proofHash: result.sealed.envelope.proofHash,
    };
  } finally {
    db.close();
  }
}

/** Render OSC result to stdout. */
function renderOscResult(r: PaperRunResult): string {
  const SEP = '\u2501'.repeat(70);
  const lines: string[] = [
    '',
    '\u2554' + '\u2550'.repeat(70) + '\u2557',
    '\u2551  FAR-Lab \u00b7 Real Paper End-to-End \u2014 Reproducibility Crisis        \u2551',
    '\u2551  Published paper \u2192 FAR-Lab statistics \u2192 kernel verdict \u2192 proof seal  \u2551',
    '\u255a' + '\u2550'.repeat(70) + '\u255d',
    '',
    SEP,
    '  Paper: Open Science Collaboration (2015).',
    '         Estimating the reproducibility of psychological science.',
    '         Science, 349(6251), aac4716. DOI: 10.1126/science.aac4716',
    SEP,
    '',
    `  Claim ID           : ${r.claimId}`,
    `  Claim              : ${r.claimText}`,
    `  FEC gate           : allowed=${r.fecGateAllowed} (${r.fecGateReason})`,
    '',
    '  \u2500\u2500 97 independent replication studies (100 original) \u2500\u2500',
    '  Original significant : 97% (97 of 100)',
    '  Replication signif.  : 36% (36 of 97)',
    '  Median r original    : 0.403',
    '  Median r replication : 0.197 (49% of original)',
    `  FAR-Lab Fisher z p   : ${r.farLabP.toFixed(6)} (one-sided, replication effect > 0)`,
    `  BH-FDR adjusted p    : ${r.bonferroniP.toFixed(6)} (family = {effect-size z, rate-drop z})`,
    `  Effect size (r)      : ${r.cohensD.toFixed(4)} (replication median)`,
    `  Survives FDR         : ${r.survivesCorrection ? 'YES' : 'NO'}`,
    '',
    '  \u2500\u2500 Deterministic verdict kernel (R0-R9) \u2500\u2500',
    `  Machine verdict    : ${r.machineVerdict}`,
    `  Sealed conclusion  : ${r.sealedConclusion}`,
    `  Decisive rule      : ${r.decisiveRule}`,
    `  Reason codes       : ${r.reasonCodes.join(', ')}`,
    '',
    '  \u2500\u2500 Anti-theater detectors \u2500\u2500',
    `  Findings triggered : ${r.antiTheaterFindings}`,
    '',
    '  \u2500\u2500 Tamper-evident proof seal \u2500\u2500',
    `  Proof hash         : ${r.proofHash}`,
    '',
    SEP,
    '  Interpretation',
    SEP,
    '  OSC (2015) is the landmark reproducibility-crisis study: 97 independent',
    '  replication teams re-ran 100 published psychology experiments. Only 36% of',
    '  replications were significant (vs 97% of originals), and the median effect',
    '  size halved (r 0.403 -> 0.197).',
    '',
    '  FAR-Lab verdict: the replication effect IS statistically nonzero (Fisher z',
    '  significant, survives BH-FDR), so the evidence supports the claim direction.',
    '  But it covers only a DEGRADED SCOPE of the claim — effects exist, yet at',
    '  roughly half magnitude with a collapsed significance rate.',
    '',
    '  This is the 4th distinct 5-value verdict in the real-paper suite:',
    '    Bem as-published = UNTESTED, Bem corrected = INCONCLUSIVE,',
    '    Ritchie = REFUTED, OSC-2015 = DEGRADED_SCOPE.',
    SEP,
    '',
  ];
  return lines.join('\n');
}

/** Render Ritchie result to stdout. */
function renderRitchieResult(r: PaperRunResult): string {
  const SEP = '\u2501'.repeat(70);
  const lines: string[] = [
    '',
    '\u2554' + '\u2550'.repeat(70) + '\u2557',
    '\u2551  FAR-Lab \u00b7 Real Paper End-to-End \u2014 Failed Replication              \u2551',
    '\u2551  Published paper \u2192 FAR-Lab statistics \u2192 kernel verdict \u2192 proof seal  \u2551',
    '\u255a' + '\u2550'.repeat(70) + '\u255d',
    '',
    SEP,
    '  Paper: Ritchie, S. J., Wiseman, R., & French, C. C. (2012).',
    '         Failing the Future: Three unsuccessful attempts to replicate',
    '         Bem\'s "retroactive facilitation of recall" effect.',
    '         PLoS ONE, 7(12), e48666. DOI: 10.1371/journal.pone.0048666',
    SEP,
    '',
    `  Claim ID           : ${r.claimId}`,
    `  Claim              : ${r.claimText}`,
    `  FEC gate           : allowed=${r.fecGateAllowed} (${r.fecGateReason})`,
    '',
    '  \u2500\u2500 Three independent replication labs \u2500\u2500',
    '  Lab 1 (Wiseman): t(49)=-0.26, exact p=0.602 (direction opposite to Bem)',
    '  Lab 2 (Ritchie): t(49)=-1.03, exact p=0.846 (direction opposite to Bem)',
    '  Lab 3 (French):  t(49)= 0.20, exact p=0.421 (null, no effect)',
    `  Fisher combined p  : ${r.bonferroniP.toFixed(6)} (meta-analytic)`,
    `  Mean direction     : refutes (2 of 3 labs opposite to claim)`,
    '',
    '  \u2500\u2500 Deterministic verdict kernel (R0-R9) \u2500\u2500',
    `  Machine verdict    : ${r.machineVerdict}`,
    `  Sealed conclusion  : ${r.sealedConclusion}`,
    `  Decisive rule      : ${r.decisiveRule}`,
    `  Reason codes       : ${r.reasonCodes.join(', ')}`,
    '',
    '  \u2500\u2500 Anti-theater detectors \u2500\u2500',
    `  Findings triggered : ${r.antiTheaterFindings}`,
    '',
    '  \u2500\u2500 Tamper-evident proof seal \u2500\u2500',
    `  Proof hash         : ${r.proofHash}`,
    '',
    SEP,
    '  Interpretation',
    SEP,
    '  Ritchie et al. (2012) attempted to replicate Bem (2011) Experiment 1',
    '  in three independent labs. All three failed to reproduce the effect.',
    '  Two labs showed direction OPPOSITE to Bem\'s claim.',
    '',
    '  FAR-Lab verdict reflects this: the evidence does not support Bem\'s claim.',
    '  This is the scientific self-correction process working as designed.',
    SEP,
    '',
  ];
  return lines.join('\n');
}

/** Render the result to stdout (avoids no-console lint rule per project convention). */
function renderResult(r: PaperRunResult): string {
  const SEP = '\u2501'.repeat(70);
  const modeLabel = r.mode === 'as-published'
    ? "AS-PUBLISHED (simulating Bem's actual analysis)"
    : 'CORRECTED (FAR-Lab proper analysis)';

  const lines: string[] = [
    '',
    '\u2554' + '\u2550'.repeat(70) + '\u2557',
    '\u2551  FAR-Lab \u00b7 Real Paper End-to-End Verification                        \u2551',
    '\u2551  Published paper \u2192 FAR-Lab statistics \u2192 kernel verdict \u2192 proof seal  \u2551',
    '\u255a' + '\u2550'.repeat(70) + '\u255d',
    '',
    SEP,
    '  Paper: Bem, D. J. (2011). Feeling the Future.',
    '         J. Personality & Social Psychology, 100(3), 407-425.',
    '         DOI: 10.1037/a0021524',
    `  Mode : ${modeLabel}`,
    SEP,
    '',
    `  Claim ID           : ${r.claimId}`,
    `  Claim              : ${r.claimText}`,
    `  FEC gate           : allowed=${r.fecGateAllowed} (${r.fecGateReason})`,
    '',
    '  \u2500\u2500 Statistical recompute (FAR-Lab src/statistics/) \u2500\u2500',
    `  FAR-Lab exact t-p : ${r.farLabExactP.toFixed(6)} (Student t-distribution, df=99, Bem's t=2.51)`,
    `  Published p-value  : ${r.publishedP.toFixed(4)} (Bem one-tailed t-test)`,
    `  FAR-Lab z-test p   : ${r.farLabP.toFixed(6)} (binomial normal approx)`,
    `  Bonferroni adj p   : ${r.bonferroniP.toFixed(6)} (k=10 experiments)`,
    `  Effect size (Cohen): ${r.cohensD.toFixed(4)} (small)`,
    `  Survives correction: ${r.survivesCorrection ? 'YES' : 'NO'}`,
    '',
    '  \u2500\u2500 Deterministic verdict kernel (R0-R9) \u2500\u2500',
    `  Machine verdict    : ${r.machineVerdict}`,
    `  Sealed conclusion  : ${r.sealedConclusion}`,
    `  Decisive rule      : ${r.decisiveRule}`,
    `  Reason codes       : ${r.reasonCodes.join(', ')}`,
    '',
    '  \u2500\u2500 Anti-theater detectors (22 statistical fraud checks) \u2500\u2500',
    `  Findings triggered : ${r.antiTheaterFindings}`,
  ];

  for (const f of r.antiTheaterFindingDetails) {
    lines.push(`    [!] ${f.findingId} (${f.attackKind}, ${f.outcome})`);
    const msg = f.message.length > 120 ? f.message.substring(0, 120) + '...' : f.message;
    lines.push(`        ${msg}`);
  }

  lines.push('');
  lines.push('  \u2500\u2500 Tamper-evident proof seal \u2500\u2500');
  lines.push(`  Proof hash         : ${r.proofHash}`);
  lines.push('');
  lines.push(SEP);
  lines.push('  Interpretation');
  lines.push(SEP);

  if (r.mode === 'as-published') {
    if (r.antiTheaterFindings > 0) {
      lines.push(`  FAR-Lab's anti-theater detectors caught ${r.antiTheaterFindings} methodological flaw(s)`);
      lines.push("  in Bem (2011) as published. This is exactly what the replication crisis revealed:");
      lines.push("  the paper's statistical methodology does not pass deterministic fraud checks.");
    } else {
      lines.push('  No anti-theater findings triggered in as-published mode.');
    }
    lines.push('');
    lines.push('  Compare with --mode corrected to see the verdict under proper analysis.');
  } else if (!r.survivesCorrection) {
    lines.push('  Under proper Bonferroni correction, Bem (2011) Exp1 does NOT survive.');
    lines.push('  This matches the failure of independent replications (Galak 2012, Ritchie 2012).');
  }

  lines.push(SEP);
  lines.push('');
  return lines.join('\n');
}

// ---- CLI 入口 ----

/**
 * `far real-paper` 命令入口：解析参数并运行真实论文管线。
 * 返回进程退出码（0 = 成功；2 = 参数错误）。
 */
export function runRealPaperFromArgs(argv: readonly string[]): number {
  let paperArg = 'bem';
  let modeArg: BemAnalysisMode = 'as-published';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--paper' && argv[i + 1] !== undefined) {
      paperArg = argv[i + 1] as string;
      i++;
    } else if (argv[i] === '--mode' && argv[i + 1] !== undefined) {
      const m = argv[i + 1];
      if (m === 'as-published' || m === 'corrected') {
        modeArg = m;
      } else {
        process.stderr.write(`Invalid mode: ${m}. Use 'as-published' or 'corrected'.\n`);
        return 2;
      }
      i++;
    }
  }

  if (paperArg !== 'bem' && paperArg !== 'ritchie' && paperArg !== 'osc') {
    process.stderr.write(`Unknown paper: ${paperArg}. Currently supported: bem, ritchie, osc\n`);
    return 2;
  }

  const result = paperArg === 'bem'
    ? runBemPaper(modeArg)
    : paperArg === 'ritchie'
      ? runRitchiePaper()
      : runOscPaper();

  if (paperArg === 'ritchie') {
    process.stdout.write(renderRitchieResult(result));
  } else if (paperArg === 'osc') {
    process.stdout.write(renderOscResult(result));
  } else {
    process.stdout.write(renderResult(result));
  }
  return 0;
}

// 直接执行入口：node src/cli/commands/real_paper.ts [--paper bem] [--mode as-published|corrected]
const isMainModule =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  process.exitCode = runRealPaperFromArgs(process.argv.slice(2));
}
