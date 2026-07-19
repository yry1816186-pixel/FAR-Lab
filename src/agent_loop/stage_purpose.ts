/**
 * API-1 · stage→PurposeTag 映射 SSOT。
 *
 * 每阶段的 purpose_tag 由 06 §2 表唯一决定，落 call_records.purpose_tag
 * （NOT NULL·02 §3.1）。本文件是 stage→PurposeTag 的全仓唯一映射源。
 *
 * 任何 stage 执行器（stages/*）在调 llm_gateway.callLlm 时，必须从本文件
 * 取 purposeTag 传给 evidence_log.appendRecord——禁止执行器内硬编码。
 */

import type { PurposeTag } from '../schema/enums.ts';
import type { StageId } from './types.ts';

/**
 * 六阶段主路径的 purpose_tag 映射（SSOT = 本表 + 06 §2 阶段表·两处须一致·CI 断言）。
 *
 * 含 stage0_dialogue（add-research-dialogue-layer spec 扩展）。
 */
export const STAGE_TO_PURPOSE_TAG: Readonly<Record<StageId, PurposeTag>> = {
  stage0_dialogue: 'dialogue',
  stage1_understanding: 'narrative',
  stage2_integration: 'narrative',
  stage3_hypothesis: 'hypothesis',
  stage4_evidence: 'narrative',
  stage5_plan: 'narrative',
  stage6_feedback: 'narrative',
} as const;


