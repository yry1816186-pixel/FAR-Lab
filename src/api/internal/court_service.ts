// src/api/internal/court_service.ts
// 跨模型可靠性法庭核心服务（CLI far court + API /court 共用）。
//
// 同一 claim 跑多个模型（每个独立 modelId 的 offline_replay adapter），收集各自的机器裁决，
// 结构化检测一致/分歧，颁发 ReliabilityCertificate。
// 诚实边界：offline_replay 下所有模型回放同一套 fixture（按 stageId），verdict 必然相同——
// 展示的是「多模型法庭框架 + 一致性检测」，真实模型分歧须接真实 provider（凭据门 +
// G3 环境锚·2026-08-06 闭合）——options.gateway/modelSnapshot 提供时走真实 provider。
// 红线：LLM 不作裁决者——每个模型的 verdict 仍由 R0-R9 确定性内核给出（fixture 只驱动 stage 文本）。

import { ulid } from 'ulid';

import { createLlmGateway } from '../../llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../llm_gateway/adapters/offline_replay/client.ts';
import { openFarDb } from '../../db/open.ts';
import { executeAskRun } from './ask_runner.ts';
import type { LlmGateway } from '../../llm_gateway/gateway.ts';

/** 单模型裁决条目。 */
export interface ModelVerdict {
  readonly model: string;
  readonly verdict: string | null;
  readonly decisiveRuleId: string | null;
  readonly chainHead: string | null;
  readonly error: string | null;
}

/** 跨模型可靠性证书。 */
export interface ReliabilityCertificate {
  readonly certificateId: string;
  readonly claim: string;
  readonly modelCount: number;
  readonly verdicts: readonly ModelVerdict[];
  readonly distinctVerdicts: readonly string[];
  readonly agreement: 'unanimous' | 'majority' | 'split';
  readonly honestNote: string;
  /** IC-11:数据来源标注(replay=fixture 回放·real=真实 provider;前端只呈现不推断) */
  readonly datasetSource: 'replay' | 'real';
}

/** 一致性分类：全相同 unanimous / 两种 majority / 三种以上 split。 */
export function computeAgreement(verdicts: readonly (string | null)[]): 'unanimous' | 'majority' | 'split' {
  const distinct = new Set(verdicts);
  if (distinct.size <= 1) return 'unanimous';
  if (distinct.size === 2) return 'majority';
  return 'split';
}

/**
 * 法庭会话选项（2026-08-06·G3 闭合后真实模型分歧接线）。
 *
 * 缺省（全 undefined）→ offline_replay fixture 回放（零凭据·展示框架）。
 * gateway+modelSnapshot 提供 → 真实 provider 多模型分歧（凭据门由 CLI/API 调用方执行·
 * 环境锚由 loop_runner 按 modelSnapshot 自动构造·repro_anchor.ts）。
 */
export interface CourtSessionOptions {
  /** 真实 provider 网关（由调用方凭据门后构造·CLI 层注入·本文件禁模型字面量）。 */
  readonly gateway?: LlmGateway;
  /** 模型快照（G3 环境锚分量·competition 必需·snapshot.ts 常量）。 */
  readonly modelSnapshot?: string;
  /** 真实 provider profile 名（executeLoop profile 路由·CLI 层注入）。 */
  readonly providerProfile?: string;
  /** 真实 provider 标签（honestNote 展示·如 'competition_aliyun_qwen'）。 */
  readonly providerLabel?: string;
}

/**
 * 运行跨模型法庭会话：对同一 claim 跑多个模型，收集裁决，颁发证书。
 *
 * @param claim 待裁决的科学声明文本。
 * @param models 模型 id 列表（offline_replay 时每个独立 modelId 的 adapter）。
 * @param gitCommitSha 链头锚定的 commit sha。
 * @param options 真实 provider 选项（2026-08-06·缺省 offline_replay 回放）。
 */
export async function runCourtSession(
  claim: string,
  models: readonly string[],
  gitCommitSha: string,
  options: CourtSessionOptions = {},
): Promise<ReliabilityCertificate> {
  const verdicts: ModelVerdict[] = [];
  for (const model of models) {
    const db = openFarDb(':memory:');
    try {
      const gateway =
        options.gateway ?? createLlmGateway([createOfflineReplayAdapter({ modelId: model })]);
      const result = await executeAskRun(
        db,
        claim,
        'quick',
        gitCommitSha,
        undefined,
        undefined,
        gateway,
        undefined,
        undefined,
        options.modelSnapshot,
        options.gateway === undefined ? 'offline_replay' : options.providerProfile, // 模型中立红线：providerProfile 由 CLI 层注入·本文件禁 Qwen 字面量
      );
      const vn = result.loopState.verdictNode;
      verdicts.push({
        model,
        verdict: vn === null ? null : vn.verdict,
        decisiveRuleId: vn === null ? null : vn.verdictTrace.decisiveRuleId,
        chainHead: result.reproHash,
        error: result.loopState.error === null ? null : result.loopState.error.message,
      });
    } catch (err) {
      verdicts.push({
        model,
        verdict: null,
        decisiveRuleId: null,
        chainHead: null,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      db.close();
    }
  }

  const verdictList = verdicts.map((v) => v.verdict);
  const agreement = computeAgreement(verdictList);
  const distinctVerdicts = Array.from(new Set(verdictList)).map((v) => v ?? '<null>');

  return {
    certificateId: ulid(),
    claim,
    modelCount: models.length,
    verdicts,
    distinctVerdicts,
    agreement,
    datasetSource: options.gateway === undefined ? 'replay' : 'real',
    honestNote:
      options.gateway === undefined
        ? 'under offline_replay all models replay the same fixture, so verdicts are necessarily identical; real model disagreement requires a real provider (credential gate)'
        : `real provider cross-model court (${options.providerLabel ?? 'real gateway'}) — each model verdict is computed by the deterministic R0-R9 kernel over real LLM evidence (credential-gated, billing applies)`,
  };
}

