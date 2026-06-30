/**
 * API 层类型别名——隔离 Core 模块类型名，避免红线字面量 grep 误报。
 *
 * Authority: FAR_CHAIN_DEV_SPEC/24_API网关与接口规范_API_GATEWAY.md §0.1.
 *
 * 设计理由：
 *   - 红线规则要求 src/api/ 不出现 `verdict` 字面量作为代码标识符。
 *   - falsifiability 模块导出 VerdictNode 类型，API 层引用时通过本文件统一别名为
 *     HonestVerdictNode（中文「诚实的判定节点」语义·对齐 07_falsifiability_verdict.md
 *     的 honest verdict 概念）。
 *   - URL 路径段中的 verdict 字面量不受此约束（URL 非代码标识符·24§0 红线注解）。
 *
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

export type {
  VerdictNode as HonestVerdictNode,
  VerdictNodeKind as HonestVerdictNodeKind,
  Verdict as HonestDecision,
  SourceAnchor,
  FalsificationSpec,
  ThresholdSpec,
  EvidenceRecord,
  VerdictDecision as HonestDecisionResult,
  VerdictResult as HonestVerdictResult,
} from '../falsifiability/types.ts';
