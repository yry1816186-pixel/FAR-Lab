// src/api/internal/court_service.ts
// 跨模型可靠性法庭核心服务（CLI far court + API /court 共用）。
//
// 同一 claim 跑多个模型（每个独立 modelId 的 offline_replay adapter），收集各自的机器裁决，
// 结构化检测一致/分歧，颁发 ReliabilityCertificate。
// 诚实边界：offline_replay 下所有模型回放同一套 fixture（按 stageId），verdict 必然相同——
// 展示的是「多模型法庭框架 + 一致性检测」，真实模型分歧须接真实 provider（凭据门）。
// 红线：LLM 不作裁决者——每个模型的 verdict 仍由 R0-R9 确定性内核给出（fixture 只驱动 stage 文本）。

import { ulid } from 'ulid';

import { createLlmGateway } from '../../llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../llm_gateway/adapters/offline_replay/client.ts';
import { openFarDb } from '../../db/open.ts';
import { executeAskRun } from '../../cli/commands/ask.ts';

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
  /** IC-11:数据来源标注(offline_replay=replay;前端只呈现不推断) */
  readonly datasetSource: 'replay';
}

/** 一致性分类：全相同 unanimous / 两种 majority / 三种以上 split。 */
export function computeAgreement(verdicts: readonly (string | null)[]): 'unanimous' | 'majority' | 'split' {
  const distinct = new Set(verdicts);
  if (distinct.size <= 1) return 'unanimous';
  if (distinct.size === 2) return 'majority';
  return 'split';
}

/**
 * 运行跨模型法庭会话：对同一 claim 跑多个 offline_replay 模型，收集裁决，颁发证书。
 *
 * @param claim 待裁决的科学声明文本。
 * @param models 模型 id 列表（每个独立 modelId 的 offline_replay adapter）。
 * @param gitCommitSha 链头锚定的 commit sha。
 */
export async function runCourtSession(
  claim: string,
  models: readonly string[],
  gitCommitSha: string,
): Promise<ReliabilityCertificate> {
  const verdicts: ModelVerdict[] = [];
  for (const model of models) {
    const db = openFarDb(':memory:');
    try {
      const gateway = createLlmGateway([createOfflineReplayAdapter({ modelId: model })]);
      const result = await executeAskRun(db, claim, 'quick', gitCommitSha, undefined, gateway);
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
    datasetSource: 'replay',
    honestNote:
      'under offline_replay all models replay the same fixture, so verdicts are necessarily identical; real model disagreement requires a real provider (credential gate)',
  };
}
