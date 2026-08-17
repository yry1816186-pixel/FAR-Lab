/**
 * 报告模块类型定义（T8 报告生成器）。
 *
 * 模型中立：无 Qwen / 百炼 / DashScope 字面量。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch。
 */

import type { TrapSummary } from '../anti_theater/trap_taxonomy.ts';
import type { ReportClaimCategory } from '../schema/enums.ts';

/**
 * 报告单段内容。evidenceRefs 指向 evidence_log.evidence_id 列表，
 * 供 HTML/Markdown 模板渲染为可回链锚点。
 */
export interface ReportSection {
  readonly title: string;
  readonly body: string;
  readonly evidenceRefs: readonly string[];
  /**
   * CORE-REPORT-001 · 声明分类（必填）：FACT=已验证结构化记录 / INFERENCE=聚合推断 /
   * UNCOMPLETED=边界与未完成声明。构建器漏分类 = 类型错误（编译期 fail-closed）；
   * 运行期由 assertEverySectionCategorized 二次校验（防绕过构造器直接拼对象）。
   */
  readonly category: ReportClaimCategory;
}

/**
 * 聚合后的完整报告数据。
 *
 * 字段说明：
 *   - runId：本次 run 标识（schema 暂无 run_id 列，作为逻辑标签使用）。
 *   - generatedAt：聚合时间 ISO8601。
 *   - sections：报告段落（摘要 / 假设 / 证据链 / 判定节点 / 复现验证 / 限制声明）。
 *   - reproHash：从 repro_runs 表读取的最新 repro_hash；无记录时为空串。
 *   - verdictSummary：判定 5 值枚举计数（CONFIRMED/REFUTED/INCONCLUSIVE/DEGRADED_SCOPE/UNTESTED）。
 *   - sourceAnchorCount：evidence_log 行数（源锚点计数）。
 */
export interface ReportData {
  readonly runId: string;
  readonly generatedAt: string;
  readonly sections: readonly ReportSection[];
  readonly reproHash: string;
  readonly verdictSummary: Readonly<Record<string, number>>;
  readonly sourceAnchorCount: number;
  /** 统计陷阱审计摘要（统计陷阱目录）。调用方注入·可选。 */
  readonly trapSummary?: TrapSummary;
}

/**
 * 报告渲染选项。
 *
 * format：'html' | 'markdown'（决定链接渲染形态）。
 * includeEvidenceLinks：true 时数字/证据 ID 渲染为可点击回链。
 */
export interface ReportRenderOptions {
  readonly format: 'html' | 'markdown';
  readonly includeEvidenceLinks: boolean;
}

/** 未分类段落体（builder 产物）；分类由 buildSections 中央挂接（CORE-REPORT-001 单点映射）。 */
export type SectionBody = Omit<ReportSection, 'category'>;
