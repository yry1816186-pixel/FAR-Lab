// src/api/internal/ask_runner.ts
// 共享 domain 层：run 6-stage FSM + ASK-9 降级密封（CLI ask/repl/stream 与 API arena/court 共用）。
//
// 分层修复（审计 P1-1）：executeAskRun 原定义于 src/cli/commands/ask.ts，导致 API 层
// （arena_service/court_service）反向依赖 CLI 层（分层倒置）。本模块上提该核心逻辑至
// domain 层（与 loop_runner 同目录），CLI 端 ask.ts re-export 保持调用面零回归，
// API 端改 import 本模块——CLI 命令签名变更不再引发 API 行为漂移。
//
// runAgentLoop 不密封——sealing 是调用方职责（与 buildDemoChain 同模式）。
// 密封须在 db 关闭前写 proof_envelopes 表。onArtifact 可选（流式输出）。

import Database from 'better-sqlite3';

import { executeLoop } from './loop_runner.ts';
import type { LoopRunnerResult } from './loop_runner.ts';
import type { StageArtifact } from '../../agent_loop/types.ts';
import type { LlmGateway } from '../../llm_gateway/gateway.ts';
import { machineSealableConclusion } from '../../far_proof/demo_chain.ts';
import { sealProofEnvelope } from '../../proof_envelope/index.ts';
import { GENESIS_PROOF_HASH } from '../../proof_envelope/types.ts';

/**
 * executeAskRun —— run 6-stage FSM + ASK-9 降级密封（ask/stream/repl + arena/court 共享）。
 *
 * @param db 打开的 evidence log DB（调用方负责关闭）。
 * @param question 研究问题（researchInput）。
 * @param mode 'full' | 'quick'（stage 裁剪）。
 * @param gitCommitSha 链头锚定 commit sha。
 * @param onArtifact 可选 artifact 流式回调。
 * @param onEvent P0-3 可选运行时事件流回调（透传 executeLoop.onEvent·SSE/CLI 实时显示）。
 * @param gateway 可选真实 provider 网关（缺省 offline_replay fixture）。
 * @param resumeStorePath 可选 resume 存储路径。
 * @param verdictDrivenFeedback 可选 V2 裁决驱动反馈边（循环内中间裁决终止/regen 软建议）。
 * @param modelSnapshot 可选 G3 环境锚 model snapshot（真实 provider 路径必需）。
 * @param profile 可选 executeLoop profile 路由（CLI 层注入·本文件禁模型字面量）。
 */
export async function executeAskRun(
  db: Database.Database,
  question: string,
  mode: 'full' | 'quick',
  gitCommitSha: string,
  onArtifact?: (artifact: StageArtifact) => void,
  onEvent?: (evt: import('../../agent_loop/events.ts').AgentLoopEvent) => void,
  gateway?: LlmGateway,
  resumeStorePath?: string,
  verdictDrivenFeedback?: boolean,
  modelSnapshot?: string,
  profile?: string,
): Promise<LoopRunnerResult> {
  const result = await executeLoop({
    researchInput: question,
    mode,
    evidenceLogDb: db,
    gitCommitSha,
    ...(profile === undefined ? {} : { profile }),
    ...(resumeStorePath === undefined ? {} : { resumeStorePath }),
    ...(onArtifact === undefined ? {} : { onArtifact }),
    ...(onEvent === undefined ? {} : { onEvent }),
    ...(gateway === undefined ? {} : { gateway }),
    ...(verdictDrivenFeedback === undefined ? {} : { verdictDrivenFeedback }),
    ...(modelSnapshot === undefined ? {} : { modelSnapshot }),
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
