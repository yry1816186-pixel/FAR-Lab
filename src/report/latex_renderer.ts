/**
 * report/latex_renderer — 战役/研究报告 LaTeX 渲染器（2.md §12 后 R10 T1·night-r4）。
 *
 * 研究者的实际工作流是 LaTeX/引用管理器：报告导出为可编译 .tex 源，
 * 与 markdown/html 渲染器同源（同一 ReportData，零二次事实源）。
 *
 * 编译目标：标准 article 类 + booktabs + hyperref + longtable（CI 用 tectonic
 * 类引擎验证——见 workflows 的 latex_compile 步）。
 *
 * Cannot-prove：渲染器保证语法结构（转义/环境配对/宏包声明）的正确性并经
 * CI 编译验证；不保证排版美学（那需要人工调整模板）。
 */

import type { ReportData, ReportSection } from './types.ts';

/** LaTeX 特殊字符转义（占位符法：反斜杠的替换文本含 {}，不能被后续花括号转义污染）。 */
const BACKSLASH_PLACEHOLDER = '\u0000FARBS\u0000';
export function escapeLatex(text: string): string {
  return text
    .replaceAll('\\', BACKSLASH_PLACEHOLDER)
    .replaceAll('&', '\\&')
    .replaceAll('%', '\\%')
    .replaceAll('$', '\\$')
    .replaceAll('#', '\\#')
    .replaceAll('_', '\\_')
    .replaceAll('{', '\\{')
    .replaceAll('}', '\\}')
    .replaceAll('~', '\\textasciitilde{}')
    .replaceAll('^', '\\textasciicircum{}')
    .replaceAll(BACKSLASH_PLACEHOLDER, '\\textbackslash{}');
}

function latexVerbatim(body: string): string {
  // 正文代码/结构化片段保守用 verbatim*（保留空格；禁内嵌 \end{verbatim*} 防注入）
  const sanitized = body.replaceAll('\\end{verbatim*}', '\\\\end{verbatim*}');
  return `\\begin{verbatim*}\n${sanitized}\n\\end{verbatim*}`;
}

function renderSection(section: ReportSection): string {
  const title = escapeLatex(section.title);
  // 正文含多行结构化内容（证据 ID 列表/数字表）时用 verbatim 保真；
  // 短散文段直接排版。判据：含换行或明显块结构（列表/表格线）。
  const isBlocky = section.body.includes('\n') || /\n|^\s*[-*|]/m.test(section.body);
  const body = isBlocky ? latexVerbatim(section.body) : escapeLatex(section.body);
  const refs =
    section.evidenceRefs.length > 0
      ? `\n\n\\paragraph{Evidence refs} ${section.evidenceRefs.map((r) => escapeLatex(r)).join(', ')}`
      : '';
  return `\\section{${title}}\n${body}${refs}`;
}

function renderVerdictTable(verdictSummary: Readonly<Record<string, number>>): string {
  const entries = Object.entries(verdictSummary).sort(([a], [b]) => (a < b ? -1 : 1));
  if (entries.length === 0) return '';
  const header = `\\begin{tabular}{lr}\n\\toprule\n\\textbf{Verdict} & \\textbf{Count} \\\\\n\\midrule\n`;
  const rows = entries.map(([v, n]) => `${escapeLatex(v)} & ${n} \\\\`).join('\n');
  return `${header}${rows}\n\\bottomrule\n\\end{tabular}\n`;
}

/** 渲染完整可编译 .tex 文档（纯函数·确定性：同 ReportData 字节恒等）。 */
export function renderLatex(data: ReportData): string {
  const sections = data.sections.map((s) => renderSection(s)).join('\n\n');
  const table = renderVerdictTable(data.verdictSummary);
  return `\\documentclass[11pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{booktabs}
\\usepackage{longtable}
\\usepackage[hidelinks]{hyperref}
\\title{FAR-Lab Research Report\\\\\\large run ${escapeLatex(data.runId)}}
\\date{${escapeLatex(data.generatedAt)}}
\\begin{document}
\\maketitle
${table ? `\\section*{Verdict summary}\n${table}\n` : ''}${data.reproHash ? `\\paragraph{Repro hash} \\texttt{${escapeLatex(data.reproHash)}}\n\n` : ''}${sections}
\\end{document}
`;
}
