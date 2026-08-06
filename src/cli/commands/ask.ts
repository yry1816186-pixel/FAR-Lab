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

import { mkdirSync } from 'node:fs';

// 审计 P1-1 分层修复：executeAskRun 核心逻辑上提至共享 domain 层
// （src/api/internal/ask_runner.ts），本文件 import + re-export 保持 CLI 调用面零回归。
import { executeAskRun } from '../../api/internal/ask_runner.ts';
export { executeAskRun } from '../../api/internal/ask_runner.ts';
import { executeLoop } from '../../api/internal/loop_runner.ts';
import { openFarDb } from '../../db/open.ts';
import type { LlmGateway } from '../../llm_gateway/gateway.ts';
import { createCompetitionQwenGateway } from '../../llm_gateway/competition_gateway.ts';
import { COMPETITION_MODEL_SNAPSHOT } from '../../llm_gateway/adapters/aliyun_qwen/snapshot.ts';
import {
  computeEnvHash,
  DEMO_MODEL_SNAPSHOT,
} from '../../far_proof/demo_chain.ts';
import { resolveGitCommitSha } from '../git_commit_sha.ts';
import { runExportFarProof } from './export_far_proof.ts';

/** Input parameters for operations involving ask args. */
export interface AskArgs {
  readonly question: string;
  readonly mode: 'full' | 'quick';
  readonly dbPath: string;
  readonly json: boolean;
  readonly exportDir: string | null;
  readonly resumePath: string | null;
  readonly profile: string;
  /** V2 裁决驱动反馈边（--verdict-driven·循环内中间裁决驱动终止 + regen 方向软建议）。 */
  readonly verdictDriven: boolean;
}

/**
 * parse ask args.
 */
export function parseAskArgs(argv: readonly string[]): AskArgs {
  let question = '';
  let mode: 'full' | 'quick' = 'full';
  let dbPath = ':memory:';
  let json = false;
  let exportDir: string | null = null;
  let resumePath: string | null = null;
  let profile = 'offline_replay';
  let verdictDriven = false;

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
    if (a === '--resume') {
      resumePath = argv[++i] ?? '';
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
    if (a === '--verdict-driven') {
      verdictDriven = true;
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

  return { question, mode, dbPath, json, exportDir, resumePath, profile, verdictDriven };
}

/** Interface defining ask render. */
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
  /** 循环内中间裁决序列（verdictDrivenFeedback 开启时·审计显示）。 */
  readonly intermediateVerdicts: readonly string[];
}

/**
 * build render.
 */
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
    intermediateVerdicts: ls.intermediateVerdicts.map(
      (iv) => `${iv.iteration}:${iv.verdict}`,
    ),
    traceGrade: {
      score: result.traceGrade.score,
      gradedBy: result.traceGrade.gradedBy,
      failureCodes: result.traceGrade.failureCodes,
    },
  };
}

/**
 * executeAskRun —— 已上提至 src/api/internal/ask_runner.ts（审计 P1-1 分层修复），
 * 本文件顶部 re-export 保持 CLI 调用面零回归。
 */

function renderHuman(args: AskArgs, render: AskRender): void {
  const lines = [
    '',
    '  FAR-Lab · far ask',
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
  const ls = render.intermediateVerdicts.length > 0 ? render.intermediateVerdicts.join(' → ') : '';
  if (ls !== '') {
    lines.push(`  iter verdicts : ${ls}  (deterministic kernel per iteration)`);
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

/**
 * run ask.
 */
export async function runAsk(argv: readonly string[]): Promise<number> {
  const args = parseAskArgs(argv);

  if (args.question.trim().length === 0) {
    process.stderr.write(
      'far ask: missing question.\n  usage: far ask "<question>" [--mode full|quick] [--json] [--export <dir>] [--profile offline_replay] [--verdict-driven]\n',
    );
    return 2;
  }

  // competition 路径的可选注入（G3 闭合后：真实 gateway + 环境锚 modelSnapshot）
  let competitionGateway: LlmGateway | undefined;
  let competitionModelSnapshot: string | undefined;
  if (args.profile !== 'offline_replay') {
    // 凭据门：FAR_DASHSCOPE_API_KEY 优先（历史 CLI 变量名）·回退 DASHSCOPE_API_KEY（adapter 层 SSOT 变量名）。
    // 修复 2026-08-06：此前只读 FAR_DASHSCOPE_API_KEY，而 .env/.env.example 与 qwen_adapter 均用
    // DASHSCOPE_API_KEY——已配置 .env 的用户会被凭据门误拒（真实 bug·变量名不一致）。
    const apiKey = process.env.FAR_DASHSCOPE_API_KEY ?? process.env.DASHSCOPE_API_KEY;
    if (apiKey === undefined || apiKey === '') {
      process.stderr.write(
        `far ask: profile "${args.profile}" needs real LLM credentials.\n` +
          '  set FAR_DASHSCOPE_API_KEY=sk-xxx or DASHSCOPE_API_KEY=sk-xxx (in .env) and retry (qwen_adapter real HTTP).\n' +
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
    // G3 闭合（2026-08-06）：CLI loop 此前被 repro bridge 硬阻塞——七分量 calc_bridge 是实验路径
    // 语义（agent_loop 无实验可哈希），现以 LLM 调用环境锚（modelSnapshot+活跃模型+环境版本·repro_anchor.ts）
    // 作为 cred.reproHash 的真实确定性指纹（非占位非伪造·文档化裁决见 repro_anchor.ts 头注释）。
    competitionGateway = gateway;
    competitionModelSnapshot = COMPETITION_MODEL_SNAPSHOT;
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
    result = await executeAskRun(
      db,
      args.question,
      args.mode,
      gitCommitSha,
      undefined,
      competitionGateway,
      args.resumePath ?? undefined,
      args.verdictDriven || undefined,
      competitionModelSnapshot,
    );

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
