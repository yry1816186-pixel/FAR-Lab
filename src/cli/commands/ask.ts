// src/cli/commands/ask.ts
// far ask "<question>" —— 一次性跑完整 6-stage FSM，产出裁决 + 证据链。
//
// 复用 executeLoop（runAgentLoop 适配层·src/api/internal/loop_runner.ts）。
// 默认 offline_replay profile（零密钥·fixture 回放），真实推理需 --profile competition_aliyun_qwen +
// FAR_DASHSCOPE_API_KEY（qwen_vl_adapter·真实 HTTP）。
//
// 诚实边界：offline_replay 下 verdict 由 fixture 驱动（非真实科学裁决）；本命令证明的是
// 「6-stage FSM 端到端跑通 + 证据链完整性 + 确定性裁决内核接线」，绝非「AI 证明科学结论为真」。
// 红线：LLM 不作最终裁决者——裁决由 R0-R9 确定性内核给出（verdictNode.verdictTrace）。

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';

import { executeLoop } from '../../api/internal/loop_runner.ts';
import type { LoopRunnerResult } from '../../api/internal/loop_runner.ts';
import type { StageArtifact } from '../../agent_loop/types.ts';
import { openFarDb } from '../../db/open.ts';
import type { LlmGateway } from '../../llm_gateway/gateway.ts';
import { createCompetitionQwenGateway } from '../../llm_gateway/competition_gateway.ts';
import {
  computeEnvHash,
  machineSealableConclusion,
  DEMO_MODEL_SNAPSHOT,
} from '../../far_proof/demo_chain.ts';
import { sealProofEnvelope } from '../../proof_envelope/index.ts';
import { GENESIS_PROOF_HASH } from '../../proof_envelope/types.ts';
import { resolveGitCommitSha } from '../git_commit_sha.ts';
import { runExportFarProof } from './export_far_proof.ts';

export interface AskArgs {
  readonly question: string;
  readonly mode: 'full' | 'quick';
  readonly dbPath: string;
  readonly json: boolean;
  readonly exportDir: string | null;
  readonly profile: string;
}

export function parseAskArgs(argv: readonly string[]): AskArgs {
  let question = '';
  let mode: 'full' | 'quick' = 'full';
  let dbPath = ':memory:';
  let json = false;
  let exportDir: string | null = null;
  let profile = 'offline_replay';

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a === '--mode') {
      const v = argv[++i];
      if (v !== 'full' && v !== 'quick') {
        throw new Error(`far ask: --mode must be full|quick (got: ${v ?? '<missing>'})`);
      }
      mode = v;
      continue;
    }
    if (a === '--db') {
      dbPath = argv[++i] ?? dbPath;
      continue;
    }
    if (a === '--json') {
      json = true;
      continue;
    }
    if (a === '--export') {
      exportDir = argv[++i] ?? '';
      continue;
    }
    if (a === '--profile') {
      profile = argv[++i] ?? profile;
      continue;
    }
    if (a.startsWith('--')) {
      throw new Error(`far ask: unknown argument "${a}"`);
    }
    if (question === '') {
      question = a;
    } else {
      question += ' ' + a;
    }
  }

  return { question, mode, dbPath, json, exportDir, profile };
}

export interface AskRender {
  readonly question: string;
  readonly runId: string;
  readonly iterationsCompleted: number;
  readonly terminationReason: string;
  readonly stageCount: number;
  readonly verdict: string | null;
  readonly decisiveRuleId: string | null;
  readonly reasonCodes: readonly string[];
  readonly chainHeadHash: string | null;
  readonly error: { readonly code: string; readonly message: string } | null;
  readonly profile: string;
  readonly honestNote: string;
  readonly traceGrade: { readonly score: number; readonly gradedBy: string; readonly failureCodes: readonly string[] };
}

export function buildRender(result: Awaited<ReturnType<typeof executeLoop>>, profile: string, question: string): AskRender {
  const ls = result.loopState;
  const vn = ls.verdictNode;
  return {
    question,
    runId: result.runId,
    iterationsCompleted: ls.iterationsCompleted,
    terminationReason: ls.terminationReason,
    stageCount: ls.artifacts.length,
    verdict: vn === null ? null : vn.verdict,
    decisiveRuleId: vn === null ? null : vn.verdictTrace.decisiveRuleId,
    reasonCodes: vn === null ? [] : vn.verdictTrace.reasonCodes,
    chainHeadHash: result.reproHash,
    error: ls.error === null ? null : { code: ls.error.code, message: ls.error.message },
    profile,
    honestNote:
      profile === 'offline_replay'
        ? 'offline_replay fixture driven (not a real scientific verdict) — real inference needs --profile competition_aliyun_qwen + FAR_DASHSCOPE_API_KEY'
        : `profile=${profile}`,
    traceGrade: {
      score: result.traceGrade.score,
      gradedBy: result.traceGrade.gradedBy,
      failureCodes: result.traceGrade.failureCodes,
    },
  };
}

/**
 * executeAskRun —— run 6-stage FSM + ASK-9 降级密封（ask/stream/repl 共享）。
 *
 * runAgentLoop 不密封——sealing 是调用方职责（与 buildDemoChain 同模式）。
 * 密封须在 db 关闭前写 proof_envelopes 表。onArtifact 可选（流式输出）。
 */
export async function executeAskRun(
  db: Database.Database,
  question: string,
  mode: 'full' | 'quick',
  gitCommitSha: string,
  onArtifact?: (artifact: StageArtifact) => void,
  gateway?: LlmGateway,
): Promise<LoopRunnerResult> {
  const result = await executeLoop({
    researchInput: question,
    mode,
    evidenceLogDb: db,
    gitCommitSha,
    ...(onArtifact === undefined ? {} : { onArtifact }),
    ...(gateway === undefined ? {} : { gateway }),
  });

  if (result.loopState.verdictNode !== null) {
    const vn = result.loopState.verdictNode;
    const { conclusion, needsHumanEndorsement } = machineSealableConclusion(vn.verdict);
    sealProofEnvelope(db, {
      claimId: result.runId,
      verdictNodeId: vn.verdictId,
      conclusion,
      prevProofHash: GENESIS_PROOF_HASH,
      checks: [],
      knownFailures: needsHumanEndorsement
        ? [`machine verdict was ${vn.verdict} but downgraded to INCONCLUSIVE for sealing (ASK-9: CONFIRMED requires human endorsement)`]
        : [],
      falsificationSpec: vn.falsificationSpec,
      sourceAnchor: vn.sourceAnchor,
      reproHash: result.reproHash,
      sealedAt: new Date().toISOString(),
    });
  }
  return result;
}

function renderHuman(args: AskArgs, render: AskRender): void {
  const lines = [
    '',
    '  FAR-Chain · far ask',
    '  ─────────────────────────────────────────────────',
    `  question : ${args.question}`,
    `  profile  : ${render.profile}`,
    `  run      : ${render.runId}  ·  ${render.stageCount} stages  ·  ${render.iterationsCompleted} iter`,
    `  stop     : ${render.terminationReason}`,
    '  ─────────────────────────────────────────────────',
  ];
  if (render.verdict !== null) {
    lines.push(`  verdict  : ${render.verdict}`);
    lines.push(`  rule     : ${render.decisiveRuleId}  (${render.reasonCodes.join(', ')})`);
  } else {
    lines.push('  verdict  : <verdict stage not reached>');
  }
  lines.push(`  chain    : ${render.chainHeadHash ?? '<empty chain>'}`);
  if (render.error !== null) {
    lines.push(`  error    : ${render.error.code} — ${render.error.message}`);
  }
  lines.push('');
  lines.push(`  ⚠ honest : ${render.honestNote}`);
  lines.push('');
  lines.push('  red line: the verdict is produced by the deterministic R0-R9 kernel (the LLM is not the adjudicator). The offline verdict is for workflow display only.');
  lines.push('');
  process.stdout.write(lines.join('\n'));
}

export async function runAsk(argv: readonly string[]): Promise<number> {
  const args = parseAskArgs(argv);

  if (args.question.trim().length === 0) {
    process.stderr.write(
      'far ask: missing question.\n  usage: far ask "<question>" [--mode full|quick] [--json] [--export <dir>] [--profile offline_replay]\n',
    );
    return 2;
  }

  if (args.profile !== 'offline_replay') {
    const apiKey = process.env.FAR_DASHSCOPE_API_KEY;
    if (apiKey === undefined || apiKey === '') {
      process.stderr.write(
        `far ask: profile "${args.profile}" needs real LLM credentials.\n` +
          '  set FAR_DASHSCOPE_API_KEY=sk-xxx and retry (qwen_adapter real HTTP).\n' +
          '  default offline_replay needs no credentials (fixture replay).\n',
      );
      return 2;
    }
    // DIGEST G1 闭合：生产代码构造真实 competition adapter 网关（先前 bail「CLI supports offline_replay only」
    // → adapter 从未被生产构造·「Entire system dead in production」）。registeredProfiles 断言使构造可观测（非死代码）。
    const gateway = createCompetitionQwenGateway({ apiKey });
    if (!gateway.registeredProfiles().includes('competition_aliyun_qwen')) {
      throw new Error(
        'far ask: competition gateway failed to register competition_aliyun_qwen adapter (G1 wiring broken)',
      );
    }
    // G3（repro bridge / calc_bridge）仍是 CLI loop 执行硬阻塞：calc_bridge.compute_repro_hash 需七分量 ReproContext
    // （sandbox P1-6 产出·CLI loop 无此上下文）→ executeLoop 会抛 REPRO_BRIDGE_NOT_CONFIGURED。故 loop 暂不可跑；
    // fallback chain（429/5xx/timeout → degraded_from）由 tests/llm_gateway/*_fallback.test.ts 验证。
    process.stderr.write(
      `far ask: profile "${args.profile}" gateway constructed (DIGEST G1 ✓; registered: ${gateway.registeredProfiles().join(', ')}),\n` +
        '  but the CLI loop requires the reproducibility bridge (calc_bridge · DIGEST G3), which is not yet wired\n' +
        '  for the CLI loop (blocked on sandbox P1-6: calc_bridge needs the 7-factor ReproContext from a real sandbox run).\n' +
        '  the fallback chain is verified via tests/llm_gateway/*_fallback.test.ts.\n' +
        '  use --profile offline_replay for the runnable demo (zero credentials).\n',
    );
    return 2;
  }

  // run.db 放 exportDir 旁（避免 force rmSync 冲突 + 不污染产物目录）。
  const exportDir = args.exportDir;
  const rundbPath = exportDir !== null ? `${exportDir}.rundb` : args.dbPath;
  if (exportDir !== null) {
    mkdirSync(exportDir, { recursive: true });
  }
  const db = openFarDb(rundbPath);
  let result: Awaited<ReturnType<typeof executeLoop>> | undefined;
  try {
    const gitCommitSha = resolveGitCommitSha();
    result = await executeAskRun(db, args.question, args.mode, gitCommitSha);

    const render = buildRender(result, args.profile, args.question);

    if (args.json) {
      process.stdout.write(`${JSON.stringify(render, null, 2)}\n`);
    } else {
      renderHuman(args, render);
    }
  } finally {
    db.close();
  }

  // finally 无 catch 吞异常 → try 抛出时不会到达此行；能到这必是 try 正常完成、result 已赋值。
  if (result === undefined) {
    throw new Error('far ask: unreachable — executeAskRun returned without assigning result');
  }

  // db 已关闭，安全导出（force rmSync exportDir 不会撞到打开的句柄）。
  if (exportDir !== null) {
    const gitCommitSha = resolveGitCommitSha();
    const exp = runExportFarProof({
      source: {
        kind: 'db',
        dbPath: rundbPath,
        runId: result.runId,
        modelSnapshot: DEMO_MODEL_SNAPSHOT,
        gitCommitSha,
        envHash: computeEnvHash({
          schemaVersion: 11,
          nodeVersion: process.version,
          providerProfile: 'offline_replay',
        }),
      },
      outputDir: exportDir,
      packageBundle: false,
      force: true,
      json: args.json,
    });
    if (exp !== 0) {
      process.stderr.write(`far ask: --export failed (exit ${exp})\n`);
      return exp;
    }
    if (!args.json) {
      process.stdout.write(
        `  export   : ${exportDir}  (far verify --bundle ${exportDir} recomputes to verify)\n\n`,
      );
    }
  }

  return result.loopState.terminationReason === 'error' ? 1 : 0;
}
