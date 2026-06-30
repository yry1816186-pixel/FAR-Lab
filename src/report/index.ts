/**
 * report 模块桶文件 —— 报告生成 + Markdown/HTML 渲染。
 *
 * Authority: FAR_CHAIN_DEV_SPEC/17_最终设计审计与开发任务包_FINAL_AUDIT.md Epic K-05a/K-05b.
 */

export { generateReport } from './generator.ts';
export type { GenerateReportInput } from './generator.ts';
export { renderMarkdown, renderHtml } from './markdown_renderer.ts';
export type {
  ReportData,
  ReportRenderOptions,
  ReportSection,
} from './types.ts';
