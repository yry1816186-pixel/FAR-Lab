/**
 * markdown_renderer.ts —— 将 ReportData 渲染为可复现的 Markdown 报告字符串。
 *
 * Authority: FAR_CHAIN_DEV_SPEC/17_最终设计审计与开发任务包_FINAL_AUDIT.md Epic K-05b.
 *
 * 模型中立：纯字符串拼接，无 LLM 调用。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch。
 */

import type { ReportData, ReportRenderOptions } from './types.ts';

// ---------------------------------------------------------------------------
// 裁决中文标签与符号
// ---------------------------------------------------------------------------

const VERDICT_LABEL: Record<string, string> = {
  CONFIRMED: '已确认',
  REFUTED: '已证伪',
  INCONCLUSIVE: '不确定',
  DEGRADED_SCOPE: '降级范围',
  UNTESTED: '未测试',
};

const VERDICT_ICON: Record<string, string> = {
  CONFIRMED: '✅',
  REFUTED: '❌',
  INCONCLUSIVE: '❓',
  DEGRADED_SCOPE: '⚠️',
  UNTESTED: '⬜',
};

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function escapeMarkdown(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/`/g, '\\`')
    .replace(/~/g, '\\~');
}

function codeBlockInline(text: string): string {
  return `\`${escapeMarkdown(text)}\``;
}

function horizontalRule(): string {
  return '\n---\n';
}

// ---------------------------------------------------------------------------
// 主渲染函数
// ---------------------------------------------------------------------------

/**
 * renderMarkdown —— 将 ReportData 渲染为完整的 Markdown 报告字符串。
 *
 * 渲染内容：
 *   1. 报告头（标题 + 元信息）
 *   2. 执行摘要
 *   3. 六阶段输出摘要
 *   4. 裁决节点
 *   5. 证据图拓扑
 *   6. 哈希链校验结果
 *   7. 限制声明
 *   8. 页脚（生成时间 + FAR-Chain 签名）
 *
 * 完全确定性：相同输入 → 相同输出（时间戳来自 ReportData.generatedAt）。
 */
export function renderMarkdown(
  data: ReportData,
  options: ReportRenderOptions,
): string {
  if (options.format !== 'markdown') {
    throw new Error(
      `renderMarkdown: unsupported format "${options.format}", expected "markdown"`,
    );
  }

  const lines: string[] = [];

  // ---- 报告头 ----
  lines.push(`# FAR-Chain 研究报告`);
  lines.push('');
  lines.push(`**Run ID**: ${codeBlockInline(data.runId)}`);
  lines.push(`**生成时间**: ${data.generatedAt}`);
  lines.push(`**源锚点计数**: ${data.sourceAnchorCount}`);
  if (data.reproHash.length > 0) {
    lines.push(`**复现哈希**: ${codeBlockInline(data.reproHash)}`);
  }
  lines.push('');

  // ---- 裁决摘要统计 ----
  lines.push('## 裁决统计');
  lines.push('');
  lines.push('| 裁决 | 数量 |');
  lines.push('|------|------|');
  for (const [verdict, count] of Object.entries(data.verdictSummary)) {
    const icon = VERDICT_ICON[verdict] ?? '❓';
    const label = VERDICT_LABEL[verdict] ?? verdict;
    lines.push(`| ${icon} ${label} | ${count} |`);
  }
  lines.push('');

  // ---- 各段落 ----
  for (const section of data.sections) {
    lines.push(horizontalRule());
    lines.push(`## ${section.title}`);
    lines.push('');

    // Evidence refs
    if (options.includeEvidenceLinks && section.evidenceRefs.length > 0) {
      const refs = section.evidenceRefs
        .map((ref) => codeBlockInline(ref))
        .join(', ');
      lines.push(`> 证据引用: ${refs}`);
      lines.push('');
    }

    lines.push(section.body);
    lines.push('');
  }

  // ---- 页脚 ----
  lines.push(horizontalRule());
  lines.push('');
  lines.push(`*报告由 FAR-Chain Report Generator 于 ${data.generatedAt} 自动生成*`);
  lines.push('');
  lines.push('*模型中立 · 哈希可复现 · 不含 LLM 自评*');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// HTML 渲染（轻量·无外部依赖）
// ---------------------------------------------------------------------------

/**
 * renderHtml —— 将 ReportData 渲染为自包含的 HTML 报告字符串。
 *
 * 注意：本函数仅用于 basic HTML 渲染，不依赖任何模板引擎或 LLM。
 * 生成的 HTML 使用内联样式，可在沙箱 iframe 中安全渲染。
 */
export function renderHtml(
  data: ReportData,
  _options: ReportRenderOptions,
): string {
  const verdictStats = Object.entries(data.verdictSummary)
    .map(([verdict, count]) => {
      const icon = VERDICT_ICON[verdict] ?? '❓';
      const label = VERDICT_LABEL[verdict] ?? verdict;
      return `<tr><td>${icon} ${label}</td><td>${count}</td></tr>`;
    })
    .join('\n');

  const sectionsHtml = data.sections
    .map((section) => {
      const bodyHtml = section.body
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');

      return `
    <section>
      <h2>${escapeHtml(section.title)}</h2>
      <div>${bodyHtml}</div>
    </section>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>FAR-Chain Report · ${escapeHtml(data.runId)}</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem;
      color: hsl(215, 16%, 20%);
      background: hsl(0, 0%, 100%);
      line-height: 1.6;
    }
    h1 { color: hsl(217, 91%, 60%); border-bottom: 2px solid hsl(217, 91%, 85%); padding-bottom: 0.5rem; }
    h2 { color: hsl(215, 16%, 30%); margin-top: 2rem; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid hsl(215, 16%, 85%); padding: 0.5rem 0.75rem; text-align: left; }
    th { background: hsl(215, 16%, 95%); font-weight: 600; }
    code { background: hsl(215, 16%, 95%); padding: 0.125rem 0.375rem; border-radius: 3px; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 0.875em; }
    strong { color: hsl(215, 16%, 20%); }
    footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid hsl(215, 16%, 85%); color: hsl(215, 16%, 50%); font-size: 0.875rem; }
    section { margin: 1.5rem 0; }
  </style>
</head>
<body>
  <h1>FAR-Chain 研究报告</h1>
  <p><strong>Run ID:</strong> <code>${escapeHtml(data.runId)}</code></p>
  <p><strong>生成时间:</strong> ${escapeHtml(data.generatedAt)}</p>
  <p><strong>源锚点计数:</strong> ${data.sourceAnchorCount}</p>
  ${data.reproHash.length > 0 ? `<p><strong>复现哈希:</strong> <code>${escapeHtml(data.reproHash)}</code></p>` : ''}

  <h2>裁决统计</h2>
  <table>
    <thead><tr><th>裁决</th><th>数量</th></tr></thead>
    <tbody>${verdictStats}</tbody>
  </table>

  ${sectionsHtml}

  <footer>
    <p>报告由 FAR-Chain Report Generator 于 ${escapeHtml(data.generatedAt)} 自动生成</p>
    <p>模型中立 · 哈希可复现 · 不含 LLM 自评</p>
  </footer>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
