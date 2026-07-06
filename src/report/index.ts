/**
 * report 模块桶文件 —— 报告生成 + Markdown/HTML 渲染。
 *
 */

export { generateReport } from './generator.ts';
export type { GenerateReportInput } from './generator.ts';
export { renderMarkdown, renderHtml } from './markdown_renderer.ts';
export type {
  ReportData,
  ReportRenderOptions,
  ReportSection,
} from './types.ts';
