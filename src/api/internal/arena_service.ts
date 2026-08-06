// src/api/internal/arena_service.ts
// 对抗科学竞技场核心服务（CLI far arena + API /arena 共用）。
//
// 一个 hypothesis 由确定性内核裁决（原始 verdict），N 个 refuter 各自尝试反驳，
// deterministic arbiter（detectRefuterAttack）判定每个 refuter 是否「着陆」（verdict 与原始分歧 = 有效攻击）。
// 诚实边界：offline_replay 下 refuter 回放同一套 fixture，verdict 必然与原始相同 → 无有效攻击
// （展示「稳健」是 fixture 一致的结果，非真实抗攻击）。真实对抗须注入真实 gateway
// （凭据门 + G3 环境锚·2026-08-06 闭合）——options.gateway/modelSnapshot 提供时走真实 provider。
// 红线：refuter 的 verdict 仍由 R0-R9 确定性内核给出（LLM 非裁决者）；arbiter 是确定性规则，非 LLM 仲裁。

import { ulid } from 'ulid';

import { createLlmGateway } from '../../llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../llm_gateway/adapters/offline_replay/client.ts';
import { openFarDb } from '../../db/open.ts';
import { executeAskRun } from './ask_runner.ts';
import type { LlmGateway } from '../../llm_gateway/gateway.ts';

/** 单次反驳尝试。 */
export interface RefuteAttempt {
  readonly refuter: string;
  readonly verdict: string | null;
  readonly attackLanded: boolean;
  readonly error: string | null;
}

/**
 * 竞技场会话选项（2026-08-06·G3 闭合后真实对抗接线）。
 *
 * 缺省（全 undefined）→ offline_replay fixture 回放（零凭据·展示框架）。
 * gateway+modelSnapshot 提供 → 真实 provider 对抗（凭据门由 CLI/API 调用方执行·
 * 环境锚由 loop_runner 按 modelSnapshot 自动构造·repro_anchor.ts）。
 */
export interface ArenaSessionOptions {
  /** 真实 provider 网关（由调用方凭据门后构造·CLI 层注入·本文件禁模型字面量）。 */
  readonly gateway?: LlmGateway;
  /** 模型快照（G3 环境锚分量·competition 必需·snapshot.ts 常量）。 */
  readonly modelSnapshot?: string;
  /** 真实 provider profile 名（executeLoop profile 路由·如 'competition_aliyun_qwen'·CLI 层注入）。 */
  readonly providerProfile?: string;
  /** 真实 provider 标签（honestNote 展示·如 'competition_aliyun_qwen'）。 */
  readonly providerLabel?: string;
}

/** 竞技场会话结果。 */
export interface ArenaResult {
  readonly arenaId: string;
  readonly hypothesis: string;
  readonly originalVerdict: string | null;
  readonly originalRule: string | null;
  readonly attempts: readonly RefuteAttempt[];
  readonly landedCount: number;
  readonly robust: boolean;
  readonly honestNote: string;
  /** IC-11:数据来源标注(replay=fixture 回放·real=真实 provider;前端只呈现不推断) */
  readonly datasetSource: 'replay' | 'real';
}

/**
 * deterministic arbiter：refuter verdict 与原始分歧 → 有效攻击（landed）。
 * 任一为 null（无裁决/错误）→ fail-safe 不算 landed（禁误判攻击成功）。
 */
export function detectRefuterAttack(originalVerdict: string | null, refuterVerdict: string | null): boolean {
  return originalVerdict !== null && refuterVerdict !== null && refuterVerdict !== originalVerdict;
}

async function runOne(
  question: string,
  modelId: string,
  gitCommitSha: string,
  gateway?: LlmGateway,
  modelSnapshot?: string,
  providerProfile?: string,
): Promise<{ verdict: string | null; rule: string | null; error: string | null }> {
  const db = openFarDb(':memory:');
  try {
    const resolvedGateway =
      gateway ?? createLlmGateway([createOfflineReplayAdapter({ modelId })]);
    const result = await executeAskRun(
      db,
      question,
      'quick',
      gitCommitSha,
      undefined,
      resolvedGateway,
      undefined,
      undefined,
      modelSnapshot,
      // 模型中立红线（24§0.1）：本文件禁 Qwen 字面量——providerProfile 由 CLI 调用方经
      // options 注入；缺省 offline_replay（fixture 回放）。
      gateway === undefined ? 'offline_replay' : providerProfile,
    );
    const vn = result.loopState.verdictNode;
    return {
      verdict: vn === null ? null : vn.verdict,
      rule: vn === null ? null : vn.verdictTrace.decisiveRuleId,
      error: result.loopState.error === null ? null : result.loopState.error.message,
    };
  } catch (err) {
    return { verdict: null, rule: null, error: err instanceof Error ? err.message : String(err) };
  } finally {
    db.close();
  }
}

/**
 * 运行对抗竞技场会话：proponent 裁决原始 verdict + N refuter 反驳 + arbiter 判定着陆。
 *
 * @param hypothesis 待检验的科学假设。
 * @param refuters refuter 标签列表。
 * @param gitCommitSha 链头锚定 commit sha。
 * @param options 真实 provider 选项（2026-08-06·缺省 offline_replay 回放）。
 */
export async function runArenaSession(
  hypothesis: string,
  refuters: readonly string[],
  gitCommitSha: string,
  options: ArenaSessionOptions = {},
): Promise<ArenaResult> {
  const orig = await runOne(
    hypothesis,
    'arena-proponent',
    gitCommitSha,
    options.gateway,
    options.modelSnapshot,
    options.providerProfile,
  );
  const originalVerdict = orig.verdict;

  const attempts: RefuteAttempt[] = [];
  for (const refuter of refuters) {
    const r = await runOne(
      `${hypothesis} [refute: ${refuter}]`,
      `arena-refuter-${refuter}`,
      gitCommitSha,
      options.gateway,
      options.modelSnapshot,
      options.providerProfile,
    );
    const attackLanded = detectRefuterAttack(originalVerdict, r.verdict);
    attempts.push({ refuter, verdict: r.verdict, attackLanded, error: r.error });
  }

  const landedCount = attempts.filter((a) => a.attackLanded).length;

  return {
    arenaId: ulid(),
    hypothesis,
    originalVerdict,
    originalRule: orig.rule,
    attempts,
    landedCount,
    robust: landedCount === 0,
    datasetSource: options.gateway === undefined ? 'replay' : 'real',
    honestNote:
      options.gateway === undefined
        ? 'under offline_replay the refuter replays the same fixture, so its verdict necessarily matches the original => no effective attacks; real adversarial testing requires a real provider (credential gate)'
        : `real provider adversarial arena (${options.providerLabel ?? 'real gateway'}) — refuter verdicts are computed by the deterministic R0-R9 kernel over real LLM evidence (credential-gated, billing applies)`,
  };
}
