/**
 * manifest_draft.ts —— 对话层 manifest 草稿占位类型。
 *
 * Authority: FAR_CHAIN_DEV_SPEC/39 §6（ResearchThoughtFramework 是 stage1 可选参考输入）。
 *
 * 设计理由：ThoughtStructureSynthesizer 产出的 ResearchThoughtFramework 在传入 stage1
 * 之前，需要一个轻量的 manifest 草稿包装类型，用于携带 framework + 降级标记 + provenance。
 * 本类型是对话层内部的传输容器，不持久化为表（与 ResearchThoughtFramework 同纪律·非表）。
 *
 * 占位说明：本类型当前只含最小字段集，后续 stage0_dialogue 接入时可能扩展。
 * 不引入新依赖，不进 canonicalHash，不产判定节点。
 *
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch。
 */

import type { ResearchThoughtFramework } from './dialogue_types.ts';

export const MANIFEST_DRAFT_VERSION = 1 as const;

/**
 * 对话层 manifest 草稿——包装 ResearchThoughtFramework + 降级元数据。
 *
 * @field framework —— 思维结构框架（12 字段·39 §6）
 * @field degraded —— 是否触发降级（turn<3 或 all confidence<0.5 时为 true）
 * @field degradationReason —— 降级原因（degraded=true 时必填·反 theater 标记）
 * @field sourceSessionId —— 产生该草稿的 session（provenance·禁编造）
 * @field draftVersion —— 草稿版本号（当前固定 1·后续扩展时递增）
 */
export interface ManifestDraft {
  readonly framework: ResearchThoughtFramework;
  readonly degraded: boolean;
  readonly degradationReason: string | null;
  readonly sourceSessionId: string;
  readonly draftVersion: typeof MANIFEST_DRAFT_VERSION;
}

/**
 * 构造 manifest 草稿（带降级标记）。
 *
 * degraded=true 时 degradationReason 必填（禁空·反 theater）。
 */
export function createManifestDraft(input: {
  readonly framework: ResearchThoughtFramework;
  readonly degraded: boolean;
  readonly degradationReason: string | null;
  readonly sourceSessionId: string;
}): ManifestDraft {
  if (input.degraded && (input.degradationReason === null || input.degradationReason === '')) {
    throw new Error('createManifestDraft: degraded=true requires non-empty degradationReason');
  }
  return {
    framework: input.framework,
    degraded: input.degraded,
    degradationReason: input.degraded ? input.degradationReason : null,
    sourceSessionId: input.sourceSessionId,
    draftVersion: MANIFEST_DRAFT_VERSION,
  };
}
